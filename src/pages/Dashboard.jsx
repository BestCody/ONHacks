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
  const [application, setApplication] = useState(null);

  useEffect(() => {
    let active = true;

    fetch('/api/event-applications/me', { credentials: 'include' })
      .then((response) => (response.ok ? response.json() : { application: null }))
      .then((data) => {
        if (active) setApplication(data.application || null);
      })
      .catch(() => {
        if (active) setApplication(null);
      });

    return () => {
      active = false;
    };
  }, []);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
      navigate('/', { replace: true });
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
            <span className="font-tech text-xs uppercase tracking-widest text-emerald-700 bg-emerald-50 rounded-full px-3 py-2">
              Account active
            </span>
          </div>

          <div className="rounded-xl border border-black/10 bg-[#f8fafc] p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
              <h2 className="font-bungee text-lg text-[#0A1A2A]">Application</h2>
              <span className={`font-tech text-xs uppercase tracking-widest rounded-full px-3 py-1.5 w-fit ${application ? 'text-emerald-700 bg-emerald-50' : 'text-black/50 bg-black/5'}`}>
                {application ? 'Received' : 'Not submitted'}
              </span>
            </div>
            <p className="text-black/60 leading-relaxed">
              {application
                ? `Thanks, ${application.full_name}. Your application was received and is being reviewed.`
                : 'Complete the hackathon application when you are ready to join the event.'}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={() => navigate('/apply')}
              className="flex-1 h-12 font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white"
            >
              <Send className="w-5 h-5 mr-2" />
              Apply to ONHacks
            </Button>
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
