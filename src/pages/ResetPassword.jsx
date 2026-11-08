import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { useScreenScale } from '@/hooks/useScreenScale';

const BG = '/assets/apply-bg.webp';

const readToken = () => {
  const value = new URLSearchParams(window.location.hash.slice(1)).get('token') || '';
  return /^[a-f0-9]{64}$/.test(value) ? value : '';
};

// Two steps on one page: without a token it asks for the email and sends a reset link; opened
// from that link (token in the URL fragment, never sent to the server in logs) it sets a new password.
export default function ResetPassword() {
  useScreenScale();
  const navigate = useNavigate();
  const { requestPasswordReset, resetPassword } = useAuth();
  const [token, setToken] = useState(readToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sentTo, setSentTo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const readAndClearToken = () => {
      if (!window.location.hash) return;
      setToken(readToken());
      setError('');
      window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}`);
    };
    readAndClearToken();
    window.addEventListener('hashchange', readAndClearToken);
    return () => window.removeEventListener('hashchange', readAndClearToken);
  }, []);

  async function requestLink(event) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email.trim());
      setSentTo(email.trim());
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function chooseNewPassword(event) {
    event.preventDefault();
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(token, password);
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  const button = 'w-full h-12 rounded-md bg-[#FF2E2E] text-white font-bungee hover:bg-[#FF2E2E]/90 disabled:opacity-60 flex items-center justify-center gap-2';
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
        <p className="font-tech text-xs uppercase tracking-[0.25em] text-[#FF2E2E] mb-4">ONHacks // Account</p>
        <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-3">{token ? 'Choose a new password' : 'Reset your password'}</h1>
        {error && <p role="alert" className="mb-5 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {token ? (
          <form onSubmit={chooseNewPassword} className="space-y-5">
            <p className="text-black/70">Pick a new password for your ONHacks account. You&apos;ll be signed in right after.</p>
            <div className="space-y-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required
                placeholder="At least 8 characters" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-new-password">Confirm new password</Label>
              <Input id="confirm-new-password" type="password" autoComplete="new-password" minLength={8} maxLength={128} required
                placeholder="Repeat your new password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
            </div>
            <button type="submit" disabled={loading} className={button}>
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? 'Saving...' : 'Save new password'}
            </button>
          </form>
        ) : sentTo ? (
          <p className="text-black/70" role="status">
            If an account exists for <strong>{sentTo}</strong>, we&apos;ve sent a link to reset your password. It expires in 1 hour. Check your spam folder if you don&apos;t see it.
          </p>
        ) : (
          <form onSubmit={requestLink} className="space-y-5">
            <p className="text-black/70">Enter the email you signed up with and we&apos;ll send you a link to choose a new password. If you signed up with Google, use Continue with Google on the sign-in page instead.</p>
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email address</Label>
              <Input id="reset-email" type="email" autoComplete="email" required maxLength={254}
                placeholder="ada@example.com" value={email} onChange={(event) => setEmail(event.target.value)} />
            </div>
            <button type="submit" disabled={loading} className={button}>
              {loading && <Loader2 className="w-5 h-5 animate-spin" />}
              {loading ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <Link to="/signin" className="mt-6 inline-block text-sm font-semibold text-[#0A1A2A] underline underline-offset-2">
          Back to sign in
        </Link>
      </section>
    </main>
  );
}
