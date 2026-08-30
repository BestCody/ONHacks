import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';

function AuthLoading() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-[#0A0A0A] text-white">
      <p className="font-tech text-xs uppercase tracking-[0.3em] text-white/60">
        Checking your account...
      </p>
    </main>
  );
}

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <AuthLoading />;
  if (user) return children;

  const returnTo = `${location.pathname}${location.search}`;
  return <Navigate to={`/signin?returnTo=${encodeURIComponent(returnTo)}`} replace />;
}
