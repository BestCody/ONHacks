import { Toaster } from "@/components/ui/toaster"
import { BrowserRouter as Router, Navigate, Route, Routes } from 'react-router-dom';
import ScrollToTop from '@/components/ScrollToTop';
import Home from '@/pages/Home';
import Apply from '@/pages/Apply';

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
    <Router>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/apply" element={<Apply />} />
        <Route path="/dashboard" element={<Navigate to="/apply" replace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Toaster />
    </Router>
  )
}

export default App
