import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Hexagon } from 'lucide-react';
import { useAuth } from '../lib/session';
import { MOCK } from '../lib/api';

function PreviewBar() {
  const [busy, setBusy] = useState(false);
  if (!MOCK) return null;
  const reset = async () => {
    setBusy(true);
    const m = await import('../lib/mockApi');
    m.resetPreview();
    window.location.hash = '#/';
    window.location.reload();
  };
  return (
    <div className="preview-bar">
      <div className="wrap">
        <span>Preview mode: no backend. Accounts and emails live in this browser only.</span>
        <span style={{ display: 'flex', gap: 14 }}>
          <Link to="/dev/outbox">Open email outbox</Link>
          <button type="button" className="linkish" onClick={reset} disabled={busy}>Reset preview data</button>
        </span>
      </div>
    </div>
  );
}

export function Brand() {
  return (
    <Link to="/" className="brand" aria-label="Sparshika home">
      <Hexagon size={24} aria-hidden="true" />
      <span>Sparshika <small>by Soni Tech Solutions</small></span>
    </Link>
  );
}

export default function SiteShell({ children }) {
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const signOut = async () => { await logout(); navigate('/'); };
  const nl = ({ isActive }) => `nav__link${isActive ? ' active' : ''}`;
  return (
    <div className="site">
      <PreviewBar />
      <header className="nav">
        <div className="wrap nav__inner">
          <Brand />
          <nav className="nav__links" aria-label="Main">
            <NavLink to="/demo" className={nl}>Demo hall</NavLink>
            {me ? (
              <>
                <NavLink to="/app" end className={nl}>My datacenter</NavLink>
                <NavLink to="/app/settings" className={nl}>Settings</NavLink>
                {me.user.is_sts_admin && <NavLink to="/admin" className={nl}>STS console</NavLink>}
                <button type="button" className="btn btn--ghost btn--small" onClick={signOut}>Sign out</button>
              </>
            ) : me === null ? (
              <>
                <NavLink to="/login" className={nl}>Sign in</NavLink>
                <Link to="/signup" className="btn btn--primary btn--small">Register your datacenter</Link>
              </>
            ) : null}
          </nav>
        </div>
      </header>
      {children}
      <footer className="footer">
        <div className="wrap">
          <span>© {new Date().getFullYear()} Soni Tech Solutions · Sparshika</span>
          <span>Live 3D digital twins for datacenters</span>
        </div>
      </footer>
    </div>
  );
}
