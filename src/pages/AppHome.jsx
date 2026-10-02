import React, { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import SiteShell from '../components/SiteShell';
import { Alert, StatusPill } from '../components/Ui';
import TwinView from './TwinView';
import { api } from '../lib/api';
import { pickOrg, useAuth } from '../lib/session';

/** Signed-in home: the live twin once the organisation is active; until then,
 *  the onboarding checklist. */
export default function AppHome() {
  const { me } = useAuth();
  const [params] = useSearchParams();
  const org = pickOrg(me, params.get('org'));
  if (!org) return me?.user?.is_sts_admin ? <Navigate to="/admin" replace /> : <NoOrg />;
  if (org.status !== 'active') return <Onboarding org={org} />;
  return <LiveTwin org={org} />;
}

function NoOrg() {
  return (
    <SiteShell>
      <main className="page wrap">
        <div className="panel">
          <h2>You’re not part of any organisation yet</h2>
          <p className="sub" style={{ marginTop: 8 }}>Ask your datacenter’s admin to invite you, or <Link className="muted-link" to="/signup">register a new datacenter</Link>.</p>
        </div>
      </main>
    </SiteShell>
  );
}

function LiveTwin({ org }) {
  const { me, logout } = useAuth();
  const [params, setParams] = useSearchParams();
  const nav = useNavigate();
  const site = org.sites.find((s) => s.id === params.get('site')) || org.sites[0];
  const choose = (e) => setParams((p) => { const n = new URLSearchParams(p); n.set('site', e.target.value); n.delete('part'); return n; });
  return (
    <TwinView
      siteId={site?.id}
      title={org.name}
      badge={site?.name || 'No site'}
      nav={(
        <>
          {org.sites.length > 1 && (
            <select className="site-select" value={site.id} onChange={choose} aria-label="Site">
              {org.sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          {me.orgs.length > 1 && <Link className="twin-link" to="/app/switch">Switch organisation</Link>}
          <Link className="twin-link" to={`/app/settings?org=${org.id}`}>Settings</Link>
          {me.user.is_sts_admin && <Link className="twin-link" to="/admin">STS console</Link>}
          <button type="button" className="twin-link" onClick={async () => { await logout(); nav('/'); }}>Sign out</button>
        </>
      )}
    />
  );
}

function Step({ n, state, title, children, actions }) {
  return (
    <li className={`check check--${state}`}>
      <span className="check__mark" aria-hidden="true">{state === 'done' ? '✓' : n}</span>
      <div>
        <h3>{title}{state === 'done' && <span className="sr-only"> (done)</span>}</h3>
        {children && <p>{children}</p>}
        {actions && <div className="actions">{actions}</div>}
      </div>
    </li>
  );
}

function Onboarding({ org }) {
  const { me, refresh } = useAuth();
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const verified = me.user.email_verified;
  const requested = !!org.activation_requested_at && org.status === 'pending';
  const isOwner = org.role === 'owner';

  const run = async (fn, ok) => {
    setBusy(true);
    setMsg({ kind: '', text: '' });
    try { await fn(); setMsg({ kind: 'ok', text: ok }); await refresh(); } catch (e) { setMsg({ kind: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const resend = () => run(() => api('/api/v1/auth/resend-verification', { method: 'POST' }), `We sent a new link to ${me.user.email}.`);
  const request = () => run(() => api(`/api/v1/orgs/${org.id}/request-activation`, { method: 'POST' }), 'Request sent. STS will review your organisation shortly.');

  const stepState = (done, now) => (done ? 'done' : now ? 'now' : 'todo');
  return (
    <SiteShell>
      <main className="page wrap">
        <div className="page__head">
          <div>
            <h1>{org.name}</h1>
            <p>Finish these steps to connect your hall. <StatusPill status={org.status} /></p>
          </div>
          <Link className="btn btn--ghost" to="/demo">Explore the demo hall</Link>
        </div>
        {msg.text && <div style={{ marginBottom: 14 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        {org.status === 'rejected' && (
          <div style={{ marginBottom: 14 }}>
            <Alert>STS couldn’t activate {org.name} yet{org.decision_note ? `: ${org.decision_note}` : '.'} Reply to the email we sent, then request activation again.</Alert>
          </div>
        )}
        {org.status === 'suspended' && (
          <div style={{ marginBottom: 14 }}><Alert>{org.name} is suspended{org.decision_note ? `: ${org.decision_note}` : '.'} Contact Soni Tech Solutions to restore access.</Alert></div>
        )}
        <ol className="checklist">
          <Step n={1} state="done" title="Account and organisation created">
            {org.sites[0] ? `First site: ${org.sites[0].name}${org.sites[0].city ? `, ${org.sites[0].city}` : ''}.` : ''}
          </Step>
          <Step n={2} state={stepState(verified, !verified)} title="Confirm your email address"
            actions={!verified && <button className="btn btn--ghost btn--small" onClick={resend} disabled={busy}>Send the link again</button>}>
            {verified ? `Confirmed: ${me.user.email}.` : `We sent a link to ${me.user.email}. Open it to confirm your address.`}
          </Step>
          <Step n={3} state={stepState(requested, verified && !requested)} title="Request activation from STS"
            actions={verified && !requested && isOwner && org.status !== 'suspended' && (
              <button className="btn btn--primary btn--small" onClick={request} disabled={busy}>Request activation</button>)}>
            {requested ? 'Requested. STS has been notified.'
              : !isOwner ? 'Your organisation’s owner requests activation.'
                : 'STS verifies every organisation before any data flows. You may get a call on the number you gave.'}
          </Step>
          <Step n={4} state={stepState(false, requested)} title="STS reviews and approves">
            {requested ? 'You’ll get an email as soon as it’s done.' : 'Starts once you request activation.'}
          </Step>
          <Step n={5} state="todo" title="Connect your hall and invite your team">
            After approval you’ll get a one-time code for the on-prem agent, and you can invite admins, operators and viewers.
          </Step>
        </ol>
      </main>
    </SiteShell>
  );
}
