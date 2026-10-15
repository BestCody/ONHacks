import { Toaster } from "@/components/ui/toaster"
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import { AuthProvider } from '@/context/AuthContext';
import Home from '@/pages/Home';
import Apply from '@/pages/Apply';
import AuthPage from '@/pages/AuthPage';
import VerifyEmail from '@/pages/VerifyEmail';
import Dashboard from '@/pages/Dashboard';
import LegalPage from '@/pages/LegalPage';
import { APP_PATHS } from '@/routes';

const NotFound = () => (
  <main className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
    <div className="text-center">
      <p className="text-7xl font-light text-slate-300">404</p>
      <h1 className="mt-4 text-2xl font-semibold text-slate-800">Page not found</h1>
      <a className="mt-6 inline-block text-blue-700 underline" href="/">Back home</a>
    </div>
  </main>
);

function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          <Route path={APP_PATHS.home} element={<Home />} />
          <Route path={APP_PATHS.apply} element={<ProtectedRoute><Apply /></ProtectedRoute>} />
          <Route path={APP_PATHS.privacy} element={<LegalPage document="privacy" />} />
          <Route path={APP_PATHS.participantTerms} element={<LegalPage document="terms" />} />
          <Route path={APP_PATHS.codeOfConduct} element={<LegalPage document="conduct" />} />
          <Route path={APP_PATHS.signIn} element={<AuthPage key="signin" mode="signin" />} />
          <Route path={APP_PATHS.signUp} element={<AuthPage key="signup" mode="signup" />} />
          <Route path={APP_PATHS.verifyEmail} element={<VerifyEmail />} />
          <Route path={APP_PATHS.login} element={<Navigate to={APP_PATHS.signIn} replace />} />
          <Route path={APP_PATHS.register} element={<Navigate to={APP_PATHS.signUp} replace />} />
          <Route
            path={APP_PATHS.dashboard}
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <Toaster />
      </Router>
    </AuthProvider>
  )
}

export default App
