import React, { Suspense, lazy } from 'react';
import { BrowserRouter, HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AuthProvider from './lib/AuthProvider';
import { useAuth } from './lib/session';
import { MOCK } from './lib/api';
import Landing from './pages/Landing';
import { AcceptInvite, Forgot, Login, Reset, Signup, Verify } from './pages/AuthPages';
import Settings, { OrgSwitch } from './pages/Settings';
import Admin from './pages/Admin';
import Outbox from './pages/Outbox';
import './index.css';
import './site.css';

// The 3D pages pull in three.js; load them only when someone opens a twin.
const AppHome = lazy(() => import('./pages/AppHome'));
const TwinView = lazy(() => import('./pages/TwinView'));

function Loading() {
  return <div className="site" style={{ display: 'grid', placeItems: 'center', color: 'var(--text-muted)' }}>Loading…</div>;
}

/** Signed-in only; remembers where you were going. */
function RequireAuth({ children, sts = false }) {
  const { me } = useAuth();
  const loc = useLocation();
  if (me === undefined) return <Loading />;
  if (me === null) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (sts && !me.user.is_sts_admin) return <Navigate to="/app" replace />;
  return children;
}

/** Signed-out only (sign in / sign up): signed-in users go to their datacenter. */
function GuestOnly({ children }) {
  const { me } = useAuth();
  if (me === undefined) return <Loading />;
  if (me) return <Navigate to="/app" replace />;
  return children;
}

// Preview builds are hosted at a fixed page URL, so they route by #hash.
const Router = MOCK ? HashRouter : BrowserRouter;

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/demo" element={<TwinView siteId={null} title="Sparshika demo hall" badge="Simulated" />} />
            <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
            <Route path="/signup" element={<GuestOnly><Signup /></GuestOnly>} />
            <Route path="/forgot" element={<Forgot />} />
            <Route path="/reset" element={<Reset />} />
            <Route path="/verify" element={<Verify />} />
            <Route path="/invite" element={<AcceptInvite />} />
            <Route path="/app" element={<RequireAuth><AppHome /></RequireAuth>} />
            <Route path="/app/switch" element={<RequireAuth><OrgSwitch /></RequireAuth>} />
            <Route path="/app/settings" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/app/settings/:tab" element={<RequireAuth><Settings /></RequireAuth>} />
            <Route path="/admin" element={<RequireAuth sts><Admin /></RequireAuth>} />
            {(MOCK || import.meta.env.DEV) && <Route path="/dev/outbox" element={<Outbox />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}
