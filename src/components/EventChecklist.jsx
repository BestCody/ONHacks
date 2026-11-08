import { useEffect, useRef, useState } from 'react';
import { CircleCheck, FileText, Lock, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EVENT_DETAILS } from '@/eventDetails';

const MAX_IMAGE_EDGE = 2200;
const MAX_FILE_LABEL = `${Math.round(EVENT_DETAILS.waiverMaxFileBytes / (1024 * 1024))} MB`;

async function readJson(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

// Phone photos are re-encoded as JPEGs no larger than MAX_IMAGE_EDGE, which keeps every
// page readable while staying well under the upload limit.
async function prepareFile(file) {
  if (file.type === 'application/pdf') {
    if (file.size > EVENT_DETAILS.waiverMaxFileBytes) throw new Error(`${file.name} is larger than ${MAX_FILE_LABEL}.`);
    return { blob: file, type: 'application/pdf', name: file.name };
  }
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} isn't a PDF or a photo.`);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`We couldn't read ${file.name}. Try a JPG, PNG, or PDF instead.`);
  }
  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
  if (!blob) throw new Error(`We couldn't process ${file.name}. Try a different photo.`);
  if (blob.size > EVENT_DETAILS.waiverMaxFileBytes) throw new Error(`${file.name} is larger than ${MAX_FILE_LABEL}.`);
  return { blob, type: 'image/jpeg', name: `${file.name.replace(/\.[^.]+$/, '') || 'waiver'}.jpg` };
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function formatWhen(value) {
  return new Date(value).toLocaleString('en-CA', {
    month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
  });
}

function DoneBadge({ children }) {
  return (
    <span className="font-tech text-xs uppercase tracking-widest rounded-full px-3 py-1.5 w-fit text-emerald-700 bg-emerald-50 inline-flex items-center gap-1.5">
      <CircleCheck className="w-3.5 h-3.5" /> {children}
    </span>
  );
}

export default function EventChecklist({ onChange }) {
  const [checklist, setChecklist] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (checklist) onChangeRef.current?.(checklist);
  }, [checklist]);

  useEffect(() => {
    let active = true;
    setLoadError(false);
    fetch('/api/participant/checklist', { credentials: 'include' })
      .then(readJson)
      .then((data) => { if (active) setChecklist(data); })
      .catch(() => { if (active) setLoadError(true); });
    return () => { active = false; };
  }, [retry]);

  async function run(action, task) {
    setBusy(action);
    setError('');
    try {
      await task();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy('');
    }
  }

  function uploadFiles(fileList) {
    const files = [...(fileList || [])];
    if (fileInput.current) fileInput.current.value = '';
    if (!files.length) return;
    run('upload', async () => {
      const room = EVENT_DETAILS.waiverMaxFiles - (checklist?.waiver.files.length || 0);
      if (files.length > room) {
        throw new Error(room > 0
          ? `You can add ${room} more file${room === 1 ? '' : 's'}. Remove one to add another.`
          : `You can upload up to ${EVENT_DETAILS.waiverMaxFiles} files. Remove one to add another.`);
      }
      for (const file of files) {
        const prepared = await prepareFile(file);
        const data = await readJson(await fetch('/api/participant/waiver/files', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': prepared.type, 'X-File-Name': encodeURIComponent(prepared.name) },
          body: prepared.blob,
        }));
        setChecklist(data);
      }
    });
  }

  function removeFile(fileId) {
    run(`remove-${fileId}`, async () => {
      setChecklist(await readJson(await fetch(`/api/participant/waiver/files/${fileId}`, {
        method: 'DELETE', credentials: 'include',
      })));
    });
  }

  function submitWaiver() {
    run('submit', async () => {
      setChecklist(await readJson(await fetch('/api/participant/waiver/submit', {
        method: 'POST', credentials: 'include',
      })));
    });
  }

  function confirmSpot() {
    run('rsvp', async () => {
      setChecklist(await readJson(await fetch('/api/participant/rsvp', {
        method: 'POST', credentials: 'include',
      })));
    });
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-black/10 bg-[#f8fafc] p-5 mb-6">
        <h2 className="font-bungee text-lg text-[#0A1A2A]">Before the event</h2>
        <p className="text-black/60 mt-2">We couldn&apos;t load your next steps. Please try again.</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => setRetry((value) => value + 1)}>Try again</Button>
      </div>
    );
  }
  if (!checklist) {
    return (
      <div className="rounded-xl border border-black/10 bg-[#f8fafc] p-5 mb-6">
        <h2 className="font-bungee text-lg text-[#0A1A2A]">Before the event</h2>
        <p className="text-black/60 mt-2">Loading your next steps...</p>
      </div>
    );
  }

  const { waiver, rsvpAt, rsvpClosed } = checklist;
  const submitted = Boolean(waiver.submittedAt);
  const files = waiver.files;

  return (
    <div className="rounded-xl border border-black/10 bg-[#f8fafc] p-5 mb-6">
      <h2 className="font-bungee text-lg text-[#0A1A2A]">Before the event</h2>
      {!rsvpAt && !rsvpClosed && (
        <p className="text-black/60 mt-1">Finish both steps by {EVENT_DETAILS.rsvpDeadlineLabel} at 11:59 PM to keep your spot.</p>
      )}

      <section className="mt-5" aria-labelledby="waiver-step">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 id="waiver-step" className="font-semibold text-[#0A1A2A]">1. Submit your signed waiver</h3>
          {submitted && <DoneBadge>Submitted</DoneBadge>}
        </div>

        {submitted ? (
          <>
            <p className="text-black/60 mt-2 leading-relaxed">Thanks! We received your waiver on {formatWhen(waiver.submittedAt)}</p>
            <p className="text-black/60 mt-1 leading-relaxed">Need to change it? Email hello@onhacks.ca.</p>
          </>
        ) : (
          <>
            <ol className="list-decimal pl-5 mt-2 space-y-1 text-black/70 leading-relaxed">
              <li>
                <a href={EVENT_DETAILS.waiverUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-[#FF2E2E] underline underline-offset-4">
                  Download the waiver
                </a>{' '}and print it.
              </li>
              <li>Sign it. If you&apos;re under 18, a parent or guardian must sign it too.</li>
              <li>Upload the signed waiver (PDF, JPG, or PNG).</li>
            </ol>
            <p className="mt-2 text-sm text-black/50">
              Only the ONHacks organizing team can view your waiver, and it&apos;s deleted automatically {EVENT_DETAILS.waiverRetentionDays} days after upload. See our{' '}
              <a href="/privacy" className="underline underline-offset-2">Privacy Notice</a>.
            </p>

            {files.length > 0 && (
              <ul className="mt-4 space-y-2">
                {files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 bg-white px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2 text-sm text-[#0A1A2A]">
                      <FileText className="w-4 h-4 shrink-0 text-black/50" />
                      <span className="truncate">{file.name}</span>
                      <span className="shrink-0 text-black/40">{formatSize(file.size)}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(file.id)}
                      disabled={Boolean(busy)}
                      className="shrink-0 rounded-md p-1.5 text-black/50 hover:bg-black/5 hover:text-red-700 disabled:opacity-50"
                      aria-label={`Remove ${file.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <input
              ref={fileInput}
              type="file"
              multiple
              accept="application/pdf,image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => uploadFiles(event.target.files)}
            />
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInput.current?.click()}
                disabled={Boolean(busy) || files.length >= EVENT_DETAILS.waiverMaxFiles}
                className="h-11 border-black/20 text-[#0A1A2A] hover:bg-black/5"
              >
                <Upload className="w-5 h-5" />
                {busy === 'upload' ? 'Uploading...' : files.length ? 'Add more pages' : 'Upload waiver'}
              </Button>
              <Button
                type="button"
                onClick={submitWaiver}
                disabled={!files.length || Boolean(busy)}
                className="h-11 font-bungee bg-[#0A1A2A] hover:bg-[#0A1A2A]/90 text-white"
              >
                {busy === 'submit' ? 'Submitting...' : 'Submit waiver'}
              </Button>
            </div>
            {files.length > 0 && (
              <p className="mt-2 text-sm text-black/50">Check that every page is signed and readable, then submit.</p>
            )}
          </>
        )}
      </section>

      <section className="mt-6 border-t border-black/10 pt-5" aria-labelledby="rsvp-step">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h3 id="rsvp-step" className="font-semibold text-[#0A1A2A]">2. Confirm your spot</h3>
          {rsvpAt && <DoneBadge>Confirmed</DoneBadge>}
        </div>
        {rsvpAt ? (
          <p className="text-black/60 mt-2">You&apos;re confirmed! Your event pass is ready below. See you on {EVENT_DETAILS.dateLabel.toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}!</p>
        ) : rsvpClosed ? (
          <p className="text-black/60 mt-2">RSVPs closed on {EVENT_DETAILS.rsvpDeadlineLabel}. Email hello@onhacks.ca if you still plan to attend.</p>
        ) : (
          <>
            <p className="text-black/60 mt-2">
              {submitted
                ? `Let us know you're coming by ${EVENT_DETAILS.rsvpDeadlineLabel} at 11:59 PM.`
                : 'Submit your signed waiver first to unlock this step.'}
            </p>
            <Button
              type="button"
              onClick={confirmSpot}
              disabled={!submitted || Boolean(busy)}
              className="mt-3 h-12 w-full sm:w-auto px-8 font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white"
            >
              {!submitted && <Lock className="w-5 h-5" />}
              {busy === 'rsvp' ? 'Confirming...' : 'RSVP'}
            </Button>
          </>
        )}
      </section>

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </div>
  );
}
