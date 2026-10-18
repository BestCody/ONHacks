import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, FileUp, LockKeyhole, LogOut, Waves } from 'lucide-react';
import { EVENT_DETAILS } from '@/eventDetails';

async function requestJson(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const actionButton = 'rounded-xl bg-[#ff473d] px-5 py-3 font-bungee text-sm text-white transition hover:bg-[#e72e2e] disabled:cursor-not-allowed disabled:opacity-[0.45]';

export default function Organizer() {
  const [session, setSession] = useState('checking');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [overview, setOverview] = useState(null);
  const [pageError, setPageError] = useState('');
  const [busy, setBusy] = useState('');
  const [roomCount, setRoomCount] = useState(1);
  const [startTime, setStartTime] = useState(EVENT_DETAILS.defaultJudgingStart);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [overtimeConfirmed, setOvertimeConfirmed] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [scanError, setScanError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const videoRef = useRef(null);
  const scannerControls = useRef(null);
  const scanLocked = useRef(false);

  async function organizerRequest(url, options) {
    try {
      return await requestJson(url, options);
    } catch (error) {
      if (error.status === 401) {
        scannerControls.current?.stop();
        setScanning(false);
        setOverview(null);
        setPreview(null);
        setSession('signed-out');
        setPageError('');
        setLoginError('Organizer session expired. Sign in again.');
      }
      throw error;
    }
  }

  async function loadOverview() {
    const data = await organizerRequest('/api/organizer/overview');
    setOverview(data);
    return data;
  }

  useEffect(() => {
    let active = true;
    requestJson('/api/organizer/session')
      .then(() => { if (active) setSession('signed-in'); })
      .catch(() => { if (active) setSession('signed-out'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (session !== 'signed-in') return;
    loadOverview().catch((error) => setPageError(error.message));
  }, [session]);

  useEffect(() => {
    if (session !== 'signed-in' || !overview || overview.settings) return;
    let active = true;
    const timer = window.setTimeout(() => {
      organizerRequest(`/api/organizer/schedule-preview?rooms=${encodeURIComponent(roomCount)}&start=${encodeURIComponent(startTime)}`)
        .then((data) => {
          if (active) { setPreview(data); setPreviewError(''); setOvertimeConfirmed(false); }
        })
        .catch((error) => {
          if (active) { setPreview(null); setPreviewError(error.message); }
        });
    }, 200);
    return () => { active = false; window.clearTimeout(timer); };
  }, [session, overview, roomCount, startTime]);

  useEffect(() => {
    if (!scanning || !videoRef.current) return;
    let cancelled = false;
    import('@zxing/browser').then(({ BrowserQRCodeReader }) => {
      if (cancelled) return;
      const reader = new BrowserQRCodeReader();
      return reader.decodeFromVideoDevice(undefined, videoRef.current,
      (result, _error, controls) => {
        if (!result || scanLocked.current || cancelled) return;
        scanLocked.current = true;
        controls.stop();
        scannerControls.current = null;
        setScanning(false);
        countMeal(result.getText());
      });
    })
      .then((controls) => {
        if (!controls) return;
        if (cancelled || scanLocked.current) controls.stop();
        else scannerControls.current = controls;
      })
      .catch((error) => {
        if (!cancelled) {
          setScanning(false);
          setScanError(error?.message || 'Camera unavailable. Check camera permission and HTTPS.');
        }
      });
    return () => {
      cancelled = true;
      scannerControls.current?.stop();
      scannerControls.current = null;
    };
  }, [scanning]);

  async function signIn(event) {
    event.preventDefault();
    setBusy('login');
    setLoginError('');
    try {
      await requestJson('/api/organizer/signin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      setPassword('');
      setPageError('');
      setSession('signed-in');
    } catch (error) {
      setLoginError(error.message);
    } finally {
      setBusy('');
    }
  }

  async function signOut() {
    scannerControls.current?.stop();
    try {
      await requestJson('/api/organizer/signout', { method: 'POST' });
      setSession('signed-out');
      setOverview(null);
      setPreview(null);
    } catch (error) { setPageError(error.message); }
  }

  async function countMeal(qrValue) {
    setBusy('scan');
    setScanError('');
    try {
      const result = await organizerRequest('/api/organizer/meals/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ qrValue }),
      });
      setScanResult(result);
    } catch (error) {
      setScanError(error.message);
    } finally {
      setBusy('');
    }
  }

  function startScanner() {
    setScanError('');
    setScanResult(null);
    scanLocked.current = false;
    setScanning(true);
  }

  function stopScanner() {
    scanLocked.current = true;
    scannerControls.current?.stop();
    scannerControls.current = null;
    setScanning(false);
  }

  async function importCsv(event) {
    event.preventDefault();
    const file = event.currentTarget.elements.csv.files[0];
    if (!file) return;
    setBusy('import');
    setPageError('');
    setImportResult(null);
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('Choose a CSV under 2 MB.');
      const data = await organizerRequest('/api/organizer/projects/import', {
        method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: await file.text(),
      });
      setImportResult(data);
      await loadOverview();
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusy('');
    }
  }

  async function assignProjects() {
    if (!preview?.assignments.length) return;
    if (!window.confirm(`Assign ${preview.assignments.length} projects across ${preview.roomCount} rooms starting ${preview.startTime}? This can only be done once.`)) return;
    setBusy('assign');
    setPageError('');
    try {
      await organizerRequest('/api/organizer/assign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: roomCount, start: startTime,
          fingerprint: preview.fingerprint, allowOvertime: preview.overtime && overtimeConfirmed }),
      });
      await loadOverview();
      setPreview(null);
    } catch (error) {
      setPageError(error.message);
      // A stale preview must be regenerated before a second attempt.
      setOverview(null);
      loadOverview().catch(() => {});
    } finally {
      setBusy('');
    }
  }

  if (session === 'checking') return <main className="min-h-screen bg-[#0d2243] p-8 text-white">Checking organizer access…</main>;

  return (
    <main className="min-h-screen bg-[#0d2243] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/" className="font-tech text-sm text-cyan-100 hover:text-white">← ONHacks home</Link>
          {session === 'signed-in' && <button type="button" onClick={signOut} className="flex items-center gap-2 text-sm text-cyan-100 hover:text-white"><LogOut size={16} /> Sign out</button>}
        </div>
        <p className="font-tech text-xs uppercase tracking-[0.25em] text-cyan-200">ONHacks // Organizer</p>
        <h1 className="mt-3 font-bubbly text-4xl sm:text-5xl">Event operations</h1>

        {session === 'signed-out' ? (
          <form onSubmit={signIn} className="mt-8 max-w-md rounded-3xl bg-white p-6 text-[#0d2243] sm:p-8">
            <LockKeyhole className="text-[#e53232]" size={28} />
            <h2 className="mt-3 font-bungee text-xl">Organizer sign in</h2>
            <label htmlFor="organizer-password" className="mt-5 block text-sm font-semibold">Password</label>
            <input id="organizer-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 px-4 py-3" />
            {loginError && <p role="alert" className="mt-3 text-sm text-red-700">{loginError}</p>}
            <button type="submit" disabled={busy === 'login'} className={`${actionButton} mt-5 w-full`}>Enter organizer page</button>
          </form>
        ) : (
          <div className="mt-8 space-y-6">
            {pageError && <p role="alert" className="rounded-xl bg-red-100 p-4 text-red-900">{pageError}</p>}
            {overview && <p className="text-sm text-cyan-100">{overview.acceptedCount} accepted participants · {overview.projects.length} imported projects · {overview.unprintedCount} badges not yet generated</p>}

            <section className="rounded-3xl border border-white/15 bg-[#14365d] p-6 sm:p-8">
              <div className="flex items-center gap-3"><Camera className="text-cyan-200" /><h2 className="font-bungee text-xl">Scan meal QR</h2></div>
              <p className="mt-2 text-sm text-cyan-100">Each successful scan adds one meal. Scanning pauses until you choose to scan again.</p>
              {scanning && <video ref={videoRef} muted playsInline className="mt-5 aspect-video w-full max-w-lg rounded-xl bg-black object-cover" />}
              <div className="mt-5">
                {scanning
                  ? <button type="button" onClick={stopScanner} className={actionButton}>Stop camera</button>
                  : <button type="button" onClick={startScanner} disabled={busy === 'scan'} className={actionButton}>{scanResult ? 'Scan next badge' : 'Open camera'}</button>}
              </div>
              {scanError && <p role="alert" className="mt-4 text-red-200">{scanError}</p>}
              {scanResult && <div role="status" className="mt-5 rounded-xl bg-cyan-100 p-5 text-[#0d2243]"><p className="font-semibold">{scanResult.name}</p><p>Meals: {scanResult.previousCount} → {scanResult.mealCount}</p></div>}
            </section>

            <section className="rounded-3xl border border-white/15 bg-[#14365d] p-6 sm:p-8">
              <div className="flex items-center gap-3"><FileUp className="text-cyan-200" /><h2 className="font-bungee text-xl">Import Devpost CSV</h2></div>
              {overview?.settings ? (
                <p className="mt-2 text-sm text-cyan-100">The project roster is locked with judging assignments. CSV imports are closed.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-cyan-100">Export the full Devpost Projects data report with personally identifiable information included. Drafts are skipped. Each import replaces the previous project roster, so correct any teammate email to their accepted application email in the CSV before re-importing.</p>
                  <form onSubmit={importCsv} className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="flex-1 text-sm">Devpost CSV
                      <input name="csv" type="file" accept=".csv,text/csv" required className="mt-2 block w-full min-w-0 rounded-xl border border-white/20 p-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-cyan-100 file:px-3 file:py-2 file:text-[#0d2243]" />
                    </label>
                    <button type="submit" disabled={busy === 'import'} className={actionButton}>Import projects</button>
                  </form>
                  {importResult && <p role="status" className="mt-4 text-cyan-100">Imported {importResult.imported} submitted projects; skipped {importResult.draftsSkipped} drafts; {importResult.unmatchedCount} unmatched team-member emails.</p>}
                </>
              )}
              {overview?.projects?.length > 0 && (
                <div className="mt-6 max-h-72 overflow-auto rounded-xl border border-white/20">
                  <table className="w-full min-w-[34rem] text-left text-sm">
                    <thead className="bg-white/10"><tr><th className="p-3">Project</th><th className="p-3">Matched</th><th className="p-3">Status</th></tr></thead>
                    <tbody>{overview.projects.map((project) => (
                      <tr key={project.id} className="border-t border-white/10">
                        <td className="p-3"><a href={project.url} target="_blank" rel="noopener noreferrer" className="break-words text-cyan-200 underline">{project.title}</a></td>
                        <td className="p-3">{project.memberCount}</td>
                        <td className="p-3">{project.room ? `Room ${project.room} · ${project.pitchTime}` : project.unmatchedEmails.length ? `Unmatched: ${project.unmatchedEmails.join(', ')}` : overview.settings ? 'No room assigned' : !project.eligible ? 'Participant belongs to multiple projects' : 'Ready to assign'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="rounded-3xl border border-white/15 bg-[#14365d] p-6 sm:p-8">
              <div className="flex items-center gap-3"><Waves className="text-cyan-200" /><h2 className="font-bungee text-xl">Assign projects to rooms</h2></div>
              {overview?.settings ? (
                <p className="mt-3 text-cyan-100">Assignments are locked: {overview.settings.room_count} rooms, starting {overview.settings.start_time}. This action cannot be repeated.</p>
              ) : (
                <>
                  <p className="mt-2 text-sm text-cyan-100">Preview as often as needed. Each room gets {EVENT_DETAILS.judgingWindowMinutes / (EVENT_DETAILS.pitchMinutes + EVENT_DETAILS.changeoverMinutes)} slots in the three-hour window: {EVENT_DETAILS.pitchMinutes} minutes to pitch and {EVENT_DETAILS.changeoverMinutes} minute to change over.</p>
                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <label className="text-sm">Number of rooms
                      <input type="number" min="1" max="100" value={roomCount} onChange={(event) => setRoomCount(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-[#0d2243]" />
                    </label>
                    <label className="text-sm">Start time (24-hour HH:MM)
                      <input type="text" inputMode="numeric" placeholder={EVENT_DETAILS.defaultJudgingStart} maxLength={5} pattern="([01][0-9]|2[0-3]):[0-5][0-9]" value={startTime} onChange={(event) => setStartTime(event.target.value)} className="mt-2 block w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-[#0d2243]" />
                    </label>
                  </div>
                  {previewError && <p role="alert" className="mt-4 text-red-200">{previewError}</p>}
                  {preview && (
                    <div className="mt-5">
                      <p className="text-cyan-100">Window: {preview.startTime}–{preview.endTime} · {preview.assignments.length} projects · {preview.capacity} slots</p>
                      <p className="mt-1 text-cyan-100">Projected finish: {preview.projectedFinish}</p>
                      {preview.overtime && <div className="mt-4 rounded-xl border border-amber-300/40 bg-amber-100/10 p-4 text-amber-100">
                        <p>Overflow: use at least {preview.minimumRooms} rooms to finish by {preview.endTime}, or confirm overtime to {preview.projectedFinish}.</p>
                        <label className="mt-3 flex items-start gap-2"><input type="checkbox" checked={overtimeConfirmed} onChange={(event) => setOvertimeConfirmed(event.target.checked)} className="mt-1" /> I confirm judging may run past the three-hour window.</label>
                      </div>}
                      {preview.excludedCount > 0 && <p role="alert" className="mt-4 rounded-xl bg-amber-100/10 p-4 text-amber-100">{preview.excludedCount} imported projects need matching or duplicate-member fixes before the one-time assignment can be locked.</p>}
                      {!!preview.assignments.length && <div className="mt-4 max-h-64 overflow-auto rounded-xl border border-white/20">
                        <table className="w-full min-w-[28rem] text-left text-sm"><thead className="bg-white/10"><tr><th className="p-3">Project</th><th className="p-3">Room</th><th className="p-3">Pitch</th></tr></thead>
                          <tbody>{preview.assignments.map((assignment) => <tr key={assignment.id} className="border-t border-white/10"><td className="p-3">{assignment.title}</td><td className="p-3">{assignment.room}</td><td className="p-3">{assignment.pitchTime}</td></tr>)}</tbody>
                        </table>
                      </div>}
                      <button type="button" onClick={assignProjects} disabled={!preview.assignments.length || preview.excludedCount > 0 || (preview.overtime && !overtimeConfirmed) || busy === 'assign'} className={`${actionButton} mt-5`}>Assign projects once</button>
                    </div>
                  )}
                </>
              )}
            </section>

          </div>
        )}
      </div>
    </main>
  );
}
