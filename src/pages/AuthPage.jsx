import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, LogIn, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';

const BG = '/assets/apply-bg.webp';

function safeReturnTo(search) {
  const value = new URLSearchParams(search).get('returnTo');
  if (value && /^\/(?![\/\\])[^\\\u0000-\u001f]*$/.test(value)) return value;
  return '/dashboard';
}

export default function AuthPage({ mode }) {
  const isSignUp = mode === 'signup';
  const navigate = useNavigate();
  const location = useLocation();
  const { user, googleEnabled, loading: authLoading, signIn, signUp } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');
  const backgroundStyle = {
    backgroundImage: `linear-gradient(rgba(5, 26, 45, 0.55), rgba(5, 26, 45, 0.55)), url(${BG})`,
    backgroundRepeat: 'no-repeat',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundColor: '#163d6b',
  };

  useEffect(() => {
    const googleError = new URLSearchParams(location.search).get('error');
    if (googleError === 'google_unavailable') {
      setError('Google sign-in is not configured yet. Use your email and password for now.');
    } else if (googleError === 'google_auth_failed') {
      setError('Google sign-in was not completed. Please try again or use your email and password.');
    }
  }, [location.search]);

  useEffect(() => {
    if (!authLoading && user) {
      navigate(safeReturnTo(location.search), { replace: true });
    }
  }, [authLoading, location.search, navigate, user]);

  const setField = (field) => (event) => {
    setForm((previous) => ({ ...previous, [field]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');

    if (isSignUp && form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      if (isSignUp) {
        await signUp({
          name: form.name,
          email: form.email,
          password: form.password,
        });
        setVerificationEmail(form.email.trim());
        setForm((previous) => ({ ...previous, password: '', confirmPassword: '' }));
        return;
      }

      await signIn({ email: form.email, password: form.password });
      navigate(safeReturnTo(location.search), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const switchPath = isSignUp ? '/signin' : '/signup';
  const switchLabel = isSignUp ? 'Sign in instead' : 'Create an account';
  const switchSearch = new URLSearchParams(location.search).has('returnTo')
    ? `?returnTo=${encodeURIComponent(safeReturnTo(location.search))}`
    : '';

  if (verificationEmail) {
    return (
      <main className="min-h-screen py-12 px-4 flex items-center" style={backgroundStyle}>
        <section className="w-full max-w-md mx-auto bg-white rounded-2xl shadow-xl p-8 md:p-10">
          <p className="font-tech text-xs uppercase tracking-[0.25em] text-[#FF2E2E] mb-4">
            ONHacks // Account
          </p>
          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-3">Check your email</h1>
          <p className="text-black/70 leading-relaxed">
            We sent a verification link to <strong>{verificationEmail}</strong>. Open it and enter the password you chose to finish creating your account. The link expires in 24 hours.
          </p>
          <p className="text-sm text-black/60 mt-5">
            Didn&apos;t receive it? Check your spam folder, then try signing in to request a fresh link.
          </p>
          <Link
            to={`/signin${switchSearch}`}
            className="mt-7 flex h-12 items-center justify-center rounded-md bg-[#FF2E2E] text-white font-bungee hover:bg-[#FF2E2E]/90"
          >
            Back to sign in
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main
      className="min-h-screen py-12 px-4 flex items-center"
      style={backgroundStyle}
    >
      <div className="w-full max-w-md mx-auto">
        <button
          type="button"
          onClick={() => navigate(isSignUp ? `/signin${switchSearch}` : '/')}
          className="flex items-center gap-2 text-white/90 hover:text-white mb-6 text-sm font-medium drop-shadow"
        >
          <ArrowLeft size={16} />
          {isSignUp ? 'Back to sign in' : 'Back home'}
        </button>

        <section className="bg-white rounded-2xl shadow-xl p-8 md:p-10">
          <p className="font-tech text-xs uppercase tracking-[0.25em] text-[#FF2E2E] mb-4">
            ONHacks // Account
          </p>
          <h1 className="font-bubbly text-4xl text-[#0A1A2A] mb-2">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </h1>
          <p className="text-black/60 mb-8">
            {isSignUp
              ? 'Save your place in the ONHacks community.'
              : 'Sign in to access your ONHacks dashboard.'}
          </p>

          {error && (
            <div role="alert" className="mb-5 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
              {error}
            </div>
          )}

          {googleEnabled && (
            <>
              <a
                href={`/api/auth/google/start?returnTo=${encodeURIComponent(safeReturnTo(location.search))}`}
                className="w-full h-12 rounded-md border border-[#0A1A2A]/20 bg-white text-[#0A1A2A] hover:bg-[#0A1A2A]/5 transition-colors flex items-center justify-center gap-3 text-sm font-semibold"
              >
                <img
                  src="/assets/google-g-logo.png"
                  alt=""
                  width="20"
                  height="20"
                  className="h-5 w-5 object-contain"
                />
                Continue with Google
              </a>

              <div className="flex items-center gap-3 my-6 text-xs uppercase tracking-[0.18em] text-black/40">
                <span className="h-px bg-black/10 flex-1" />
                <span>or use email</span>
                <span className="h-px bg-black/10 flex-1" />
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={setField('name')}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  required
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={setField('email')}
                placeholder="ada@example.com"
                autoComplete="email"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={setField('password')}
                placeholder="At least 8 characters"
                autoComplete={isSignUp ? 'new-password' : 'current-password'}
                minLength={8}
                required
              />
            </div>

            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={form.confirmPassword}
                  onChange={setField('confirmPassword')}
                  placeholder="Repeat your password"
                  autoComplete="new-password"
                  minLength={8}
                  required
                />
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 text-base font-bungee bg-[#FF2E2E] hover:bg-[#FF2E2E]/90 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </>
              ) : (
                <>
                  {isSignUp ? <UserPlus className="w-5 h-5 mr-2" /> : <LogIn className="w-5 h-5 mr-2" />}
                  {isSignUp ? 'Create account' : 'Sign in'}
                </>
              )}
            </Button>
          </form>

          <p className="text-center text-sm text-black/60 mt-6">
            {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
            <Link
              to={`${switchPath}${switchSearch}`}
              className="font-semibold text-[#0A1A2A] underline underline-offset-2 hover:text-[#FF2E2E]"
            >
              {switchLabel}
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
