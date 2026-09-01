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
  if (value && value.startsWith('/') && !value.startsWith('//')) return value;
  return '/dashboard';
}

export default function AuthPage({ mode }) {
  const isSignUp = mode === 'signup';
  const navigate = useNavigate();
  const location = useLocation();
  const { user, loading: authLoading, signIn, signUp } = useAuth();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      } else {
        await signIn({ email: form.email, password: form.password });
      }
      navigate(safeReturnTo(location.search), { replace: true });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  };

  const switchPath = isSignUp ? '/signin' : '/signup';
  const switchLabel = isSignUp ? 'Sign in instead' : 'Create an account';

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
      <div className="w-full max-w-md mx-auto">
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
              to={`${switchPath}${location.search}`}
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
