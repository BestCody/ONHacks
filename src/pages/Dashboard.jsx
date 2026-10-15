import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LogOut, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';

const BG = '/assets/apply-bg.webp';

export default function Dashboard() {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [loading, setLoading] = useState(false);
  const [applicationLoading, setApplicationLoading] = useState(true);
  const [application, setApplication] = useState(null);
  const [applicationError, setApplicationError] = useState(false);
  const [statusRetry, setStatusRetry] = useState(0);
  const [signOutError, setSignOutError] = useState('');

  useEffect(() => {
    let active = true;
    setApplicationLoading(true);
    setApplicationError(false);

    fetch('/api/event-applications/me', { credentials: 'include' })
      .then((response) => {
        if (!response.ok) throw new Error('Application status unavailable');
        return response.json();
      })
      .then((data) => {
        if (active) setApplication(data.application || null);
      })
      .catch(() => {
        if (active) setApplicationError(true);
      })
      .finally(() => {
        if (active) setApplicationLoading(false);
      });

    return () => {
      active = false;
    };
  }, [statusRetry]);

  const handleSignOut = async () => {
    setLoading(true);
    setSignOutError('');
    try {
      await signOut();
    } catch {
      setSignOutError('Could not sign out. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main
      className="min-h-screen py-12 px-4 flex items-center"
      style={{
        backgroundImage: `linear-gradient(rgba(5, 26, 45, 0.55), rgba(5, 26, 45, 0.55)), url(${BG})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundColor: '#163d6b',
      }}
    >
      <div className="w-full max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow"
        >
          <ArrowLeft size={16} />
          Back home
        </button>

        <section className="bg-white rounded-2xl shadow-xl p-8 md:p-10">
          <p className="font-tech text-xs uppercase tracking-[0.25em] text-[#FF2E2E] mb-4">
            ONHacks // Dashboard
          </p>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
            <div>
              <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">
                Hey, {user?.name}!
              </h1>
              <p className="text-black/60">{user?.email}</p>
            </div>
          </div>

          <div className="rounded-xl border border-black/10 bg-[#f8fafc] p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h2 className="font-bungee text-lg text-[#0A1A2A]">Application</h2>
              <span className={`font-tech text-xs uppercase tracking-widest rounded-full px-3 py-1.5 w-fit ${applicationError ? 'text-red-700 bg-red-50' : application ? 'text-emerald-700 bg-emerald-50' : 'text-black/50 bg-black/5'}`}>
                {applicationLoading ? 'Checking' : applicationError ? 'Unavailable' : application ? 'Received' : 'Not submitted'}
              </span>
            </div>
            <p className="text-black/60 leading-relaxed">
              {applicationLoading
                ? 'Checking your application status...'
                : applicationError
                ? "We couldn't check your application status. Please try again."
                : application
                ? `Thanks, ${application.full_name}. Your application was received and is being reviewed.`
                : 'Complete the hackathon application when you are ready to join the event.'}
            </p>
            {applicationError && !applicationLoading && (
              <Button type="button" variant="outline" className="mt-3" onClick={() => setStatusRetry((value) => value + 1)}>
                Try again
              </Button>
            )}
          </div>

          {signOutError && <p role="alert" className="mb-4 text-sm text-red-700">{signOutError}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            {!applicationLoading && !applicationError && !application && (
              <Button
                onClick={() => navigate('/apply')}
                className="flex-1 h-12 font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white"
              >
                <Send className="w-5 h-5 mr-2" />
                Apply to ONHacks
              </Button>
            )}
            <Button
              onClick={handleSignOut}
              disabled={loading}
              variant="outline"
              className="h-12 border-black/20 text-[#0A1A2A] hover:bg-black/5"
            >
              <LogOut className="w-5 h-5 mr-2" />
              {loading ? 'Signing out...' : 'Sign out'}
            </Button>
          </div>
        </section>
      </div>
    </main>
  );
}
