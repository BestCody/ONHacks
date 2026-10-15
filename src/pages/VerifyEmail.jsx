import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const BG = '/assets/apply-bg.webp';

export default function VerifyEmail() {
  const navigate = useNavigate();
  const { verifyEmail } = useAuth();
  const [token, setToken] = useState(() => {
    const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
    return /^[a-f0-9]{64}$/.test(value) ? value : '';
  });
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const readAndClearToken = () => {
      if (!window.location.hash) return;
      const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
      setToken(/^[a-f0-9]{64}$/.test(value) ? value : '');
      setError('');
      setPassword('');
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    };

    readAndClearToken();
    window.addEventListener('hashchange', readAndClearToken);
    return () => window.removeEventListener('hashchange', readAndClearToken);
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(token, password);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
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
      <section className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-10">
        <p className="font-tech text-xs uppercase tracking-[0.25em] text-[#FF2E2E] mb-4">
          ONHacks // Account
        </p>
        <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-3">Verify your email</h1>
        {token ? (
          <>
            <p className="text-black/70 mb-7">
              Enter the password you chose when creating your account to confirm your email.
            </p>
            {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="verification-password">Password</Label>
                <Input
                  id="verification-password"
                  type="password"
                  autoComplete="current-password"
                  minLength={8}
                  maxLength={128}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-md bg-[#FF2E2E] text-white font-bungee hover:bg-[#FF2E2E]/90 disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-5 h-5 animate-spin" />}
                {loading ? 'Verifying...' : 'Verify email'}
              </button>
            </form>
          </>
        ) : (
          <p className="text-black/70">This verification link is missing or invalid. Sign in to request a new one.</p>
        )}
        <Link to="/signin" className="mt-6 inline-block text-sm font-semibold text-[#0A1A2A] underline underline-offset-2">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
