import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ExternalLink, LogOut } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { EVENT_DETAILS } from '@/eventDetails';

export default function Participant() {
  const { signOut } = useAuth();
  const [participant, setParticipant] = useState(null);
  const [qrImage, setQrImage] = useState('');
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let currentQrValue = '';
    async function refresh() {
      if (!active || inFlight) return;
      inFlight = true;
      try {
        const response = await fetch('/api/participant/me', { credentials: 'include' });
        const data = await response.json();
        if (!response.ok) {
          if (active && (response.status === 401 || response.status === 403)) {
            setParticipant(null);
            setQrImage('');
            currentQrValue = '';
          }
          throw new Error(data.error || 'Participant details are unavailable.');
        }
        if (data.participant.qrValue !== currentQrValue) {
          const { default: QRCode } = await import('qrcode');
          const image = await QRCode.toDataURL(data.participant.qrValue, {
            errorCorrectionLevel: 'M', margin: 4, width: 700,
          });
          if (active) setQrImage(image);
          currentQrValue = data.participant.qrValue;
        }
        if (active) {
          setParticipant(data.participant);
          setError('');
        }
      } catch (failure) {
        if (active) setError(failure.message);
      } finally {
        inFlight = false;
      }
    }
    function refreshIfVisible() {
      if (document.visibilityState === 'visible') refresh();
    }
    refresh();
    const timer = window.setInterval(refreshIfVisible, 30_000);
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [refreshKey]);

  return (
    <main className="min-h-screen bg-[#0d2243] px-4 py-8 text-white sm:py-12">
      <div className="mx-auto max-w-3xl">
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <Link to="/dashboard" className="flex items-center gap-2 text-sm text-cyan-100 hover:text-white">
            <ArrowLeft size={17} /> Dashboard
          </Link>
          <button type="button" onClick={signOut} className="flex items-center gap-2 text-sm text-cyan-100 hover:text-white">
            <LogOut size={17} /> Sign out
          </button>
        </div>
        <p className="font-tech text-xs uppercase tracking-[0.25em] text-cyan-200">ONHacks // Participant</p>
        <h1 className="mt-3 font-bubbly text-4xl sm:text-5xl">Your event pass</h1>
        {error && <p role="alert" className="mt-8 rounded-xl bg-red-100 p-5 text-red-900">{error} <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="ml-2 underline">Retry</button></p>}
        {!participant && !error && <p className="mt-8 text-cyan-100">Loading your pass…</p>}
        {participant && (
          <div className="mt-8 space-y-5">
            <section className="rounded-3xl border border-white/15 bg-white p-6 text-[#0d2243] sm:p-8">
              <p className="font-tech text-xs uppercase tracking-widest text-[#e53232]">{EVENT_DETAILS.dateLabel} · {EVENT_DETAILS.venue}</p>
              <h2 className="mt-3 break-words font-bungee text-2xl sm:text-3xl">{participant.name}</h2>
              <p className="mt-2 text-sm text-slate-600">Show this QR code to an organizer for meals. It is also on your badge.</p>
              {qrImage && <img src={qrImage} alt="Your ONHacks meal QR code" className="mx-auto mt-6 aspect-square w-full max-w-64 rounded-xl border border-slate-200" />}
              <p className="mt-5 text-center font-tech text-sm">Meals received: {participant.mealCount}</p>
               <button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="mx-auto mt-2 block text-sm text-slate-600 underline hover:text-[#0d2243]">Refresh pass</button>
            </section>

            <section className="rounded-3xl border border-cyan-200/30 bg-[#14365d] p-6 sm:p-8">
              <p className="font-tech text-xs uppercase tracking-widest text-cyan-200">Judging</p>
              {participant.project?.room ? (
                <>
                  <h2 className="mt-3 break-words font-bungee text-xl sm:text-2xl">{participant.project.title}</h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase text-cyan-200">Room</p><p className="mt-1 text-2xl font-semibold">{participant.project.room}</p></div>
                    <div className="rounded-xl bg-white/10 p-4"><p className="text-xs uppercase text-cyan-200">Pitch time</p><p className="mt-1 text-2xl font-semibold">{participant.project.pitchTime}</p></div>
                  </div>
                  <a href={participant.project.url} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 text-cyan-200 underline">
                    View on Devpost <ExternalLink size={16} />
                  </a>
                </>
              ) : (
                <p className="mt-3 text-cyan-50">{participant.project
                  ? 'Your project is imported. Your room and pitch time will appear after organizers assign judging.'
                  : 'Your room and pitch time will appear after organizers import and assign projects.'}</p>
              )}
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
