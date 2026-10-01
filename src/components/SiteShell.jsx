import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import Logo from './Logo';
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
      <Logo size={30} sub />
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
        <div className="wrap footer__inner">
          <div className="footer__brand">
            <Logo size={26} />
            <p>Live 3D twins for datacenters. Sparshika is a product of Soni Tech Solutions (STS).</p>
          </div>
          <nav className="footer__links" aria-label="Footer">
            <Link to="/demo">Demo hall</Link>
            {me ? <Link to="/app">My datacenter</Link> : <><Link to="/login">Sign in</Link><Link to="/signup">Register</Link></>}
          </nav>
          <p className="footer__copy">© {new Date().getFullYear()} Soni Tech Solutions</p>
        </div>
      </footer>
    </div>
  );
}
