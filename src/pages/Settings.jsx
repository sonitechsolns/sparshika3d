import React, { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, useParams, useSearchParams } from 'react-router-dom';
import SiteShell from '../components/SiteShell';
import { Alert, Field, Seats, Spinner, StatusPill } from '../components/Ui';
import { api } from '../lib/api';
import { MANAGE, ROLE_HELP, ROLE_LABEL, pickOrg, useAuth } from '../lib/session';
import { ago, fmtDate } from '../utils/format';

export default function Settings() {
  const { me } = useAuth();
  const { tab = 'team' } = useParams();
  const [params] = useSearchParams();
  const org = pickOrg(me, params.get('org'));
  if (!org) return <SiteShell><main className="page wrap"><Spinner label="You’re not part of an organisation yet." /></main></SiteShell>;
  const q = `?org=${org.id}`;
  const tabCls = ({ isActive }) => `tab${isActive ? ' active' : ''}`;
  return (
    <SiteShell>
      <main className="page wrap">
        <div className="page__head">
          <div>
            <h1>Settings</h1>
            <p>{org.name} · <StatusPill status={org.status} /> · you are {ROLE_LABEL[org.role] || org.role}</p>
          </div>
          <Link className="btn btn--ghost" to={`/app${q}`}>{org.status === 'active' ? 'Open the twin' : 'Back to setup'}</Link>
        </div>
        <nav className="tabs" aria-label="Settings sections">
          <NavLink className={tabCls} to={`/app/settings/team${q}`}>Team</NavLink>
          {org.role !== 'viewer' && <NavLink className={tabCls} to={`/app/settings/agents${q}`}>Sites & agents</NavLink>}
          <NavLink className={tabCls} to={`/app/settings/organisation${q}`}>Organisation</NavLink>
        </nav>
        {tab === 'agents' && org.role !== 'viewer' ? <Agents org={org} />
          : tab === 'organisation' ? <Organisation org={org} />
            : <Team org={org} />}
      </main>
    </SiteShell>
  );
}

function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    try { setData(await api(path)); setError(''); } catch (e) { setError(e.message); }
  }, [path]);
  useEffect(() => { load(); }, [load]);
  return { data, error, reload: load };
}

// ------------------------------------------------------------------- team
function Team({ org }) {
  const { me, refresh } = useAuth();
  const { data, error, reload } = useLoad(`/api/v1/orgs/${org.id}/members`);
  const [inv, setInv] = useState({ email: '', role: 'viewer' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [busy, setBusy] = useState(false);
  const manage = MANAGE.has(org.role) || me.user.is_sts_admin;
  const isOwner = org.role === 'owner' || me.user.is_sts_admin;

  const act = async (fn, ok) => {
    setBusy(true);
    setMsg({ kind: '', text: '' });
    try { await fn(); if (ok) setMsg({ kind: 'ok', text: ok }); await reload(); await refresh(); } catch (e) { setMsg({ kind: 'error', text: e.message }); } finally { setBusy(false); }
  };
  const invite = (e) => {
    e.preventDefault();
    act(async () => {
      await api(`/api/v1/orgs/${org.id}/invites`, { method: 'POST', body: inv });
      setInv({ email: '', role: inv.role });
    }, `Invitation sent to ${inv.email}. It expires in 7 days.`);
  };
  if (error) return <Alert>{error}</Alert>;
  if (!data) return <Spinner />;
  const full = data.seats_used >= data.seat_limit;
  return (
    <div className="grid2">
      <div className="panel">
        <div className="panel__head">
          <div><h2>Members</h2><p>People who can open {org.name}’s twin.</p></div>
          <Seats used={data.seats_used} limit={data.seat_limit} />
        </div>
        {msg.text && <div style={{ marginBottom: 12 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Person</th><th>Role</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.members.map((m) => {
                const self = m.id === me.user.id;
                const editable = manage && m.role !== 'owner' && !self && (isOwner || m.role !== 'admin');
                return (
                  <tr key={m.id}>
                    <td className="who"><b>{m.name}{self && ' (you)'}</b><span>{m.email}</span></td>
                    <td>
                      {editable ? (
                        <select className="site-select" aria-label={`Role for ${m.name}`} value={m.role} disabled={busy}
                          onChange={(e) => act(() => api(`/api/v1/orgs/${org.id}/members/${m.id}`, { method: 'PATCH', body: { role: e.target.value } }), `${m.name} is now ${ROLE_LABEL[e.target.value]}.`)}>
                          {isOwner && <option value="admin">Admin</option>}
                          <option value="operator">Operator</option>
                          <option value="viewer">Viewer</option>
                        </select>
                      ) : <span className="pill pill--role">{ROLE_LABEL[m.role]}</span>}
                    </td>
                    <td>
                      <div className="row-actions">
                        {editable && (
                          <button className="btn btn--danger btn--small" disabled={busy}
                            onClick={() => act(() => api(`/api/v1/orgs/${org.id}/members/${m.id}`, { method: 'DELETE' }), `${m.name} was removed.`)}>
                            Remove
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {data.invites.map((i) => (
                <tr key={i.id}>
                  <td className="who"><b>{i.email}</b><span>Invited · expires {fmtDate(i.expires_at)}</span></td>
                  <td><span className="pill pill--pending">{ROLE_LABEL[i.role]} · pending</span></td>
                  <td>
                    <div className="row-actions">
                      <button className="btn btn--ghost btn--small" disabled={busy}
                        onClick={() => act(() => api(`/api/v1/orgs/${org.id}/invites/${i.id}`, { method: 'DELETE' }), 'Invitation cancelled.')}>
                        Cancel
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel">
        <h2>Invite someone</h2>
        {!manage ? (
          <p className="empty">Only owners and admins can invite people.</p>
        ) : org.status === 'suspended' || org.status === 'rejected' ? (
          <p className="empty">Invitations are paused while the organisation is {org.status}.</p>
        ) : (
          <form className="form" onSubmit={invite} noValidate>
            <Field id="invite-email" label="Email" type="email" autoComplete="off" value={inv.email}
              onChange={(e) => setInv({ ...inv, email: e.target.value })} />
            <Field id="invite-role" label="Role" hint={ROLE_HELP[inv.role]}>
              <select id="invite-role" value={inv.role} onChange={(e) => setInv({ ...inv, role: e.target.value })}>
                <option value="viewer">Viewer</option>
                <option value="operator">Operator</option>
                {isOwner && <option value="admin">Admin</option>}
              </select>
            </Field>
            {full && <Alert kind="info">All {data.seat_limit} seats are in use. Remove someone or ask STS for more seats.</Alert>}
            <button className="btn btn--primary" disabled={busy || full || !inv.email}>Send invitation</button>
          </form>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------- agents
function Agents({ org }) {
  const { me, refresh } = useAuth();
  const manage = MANAGE.has(org.role) || me.user.is_sts_admin;
  const [siteForm, setSiteForm] = useState({ name: '', city: '' });
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const addSite = async (e) => {
    e.preventDefault();
    try {
      await api(`/api/v1/orgs/${org.id}/sites`, { method: 'POST', body: siteForm });
      setMsg({ kind: 'ok', text: `Site “${siteForm.name}” added.` });
      setSiteForm({ name: '', city: '' });
      await refresh();
    } catch (err) { setMsg({ kind: 'error', text: err.message }); }
  };
  if (org.status !== 'active') {
    return <div className="panel"><Alert kind="info">You can connect agents once STS has activated {org.name}. <Link to={`/app?org=${org.id}`}>See your setup steps</Link>.</Alert></div>;
  }
  return (
    <>
      {org.sites.map((s) => <SiteAgents key={s.id} org={org} site={s} manage={manage} />)}
      {manage && (
        <div className="panel">
          <h2>Add a site</h2>
          {msg.text && <div style={{ marginTop: 10 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
          <form className="inline-form" onSubmit={addSite} style={{ marginTop: 12 }}>
            <Field id="site-name" label="Site name" placeholder="e.g. Pune Hall B" value={siteForm.name} onChange={(e) => setSiteForm({ ...siteForm, name: e.target.value })} />
            <Field id="site-city" label="City" value={siteForm.city} onChange={(e) => setSiteForm({ ...siteForm, city: e.target.value })} />
            <button className="btn btn--ghost" disabled={!siteForm.name}>Add site</button>
          </form>
        </div>
      )}
    </>
  );
}

function SiteAgents({ org, site, manage }) {
  const { data, error, reload } = useLoad(`/api/v1/orgs/${org.id}/sites/${site.id}/agents`);
  const [code, setCode] = useState(null);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [copied, setCopied] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    if (!code) return undefined;
    const id = setInterval(() => { tick((t) => t + 1); reload(); }, 5000);
    return () => clearInterval(id);
  }, [code, reload]);

  const newCode = async () => {
    setMsg({ kind: '', text: '' });
    try { setCode(await api(`/api/v1/orgs/${org.id}/sites/${site.id}/enrollment-codes`, { method: 'POST' })); setCopied(false); } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  const revoke = async (a) => {
    try {
      await api(`/api/v1/orgs/${org.id}/sites/${site.id}/agents/${a.id}`, { method: 'DELETE' });
      setMsg({ kind: 'ok', text: `“${a.label}” was disconnected. Its key no longer works.` });
      reload();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(code.command); setCopied(true); } catch { setCopied(false); }
  };
  const minsLeft = code ? Math.max(0, Math.ceil((Date.parse(code.expires_at) - Date.now()) / 60000)) : 0;
  const active = (data?.agents || []).filter((a) => !a.revoked_at);

  return (
    <div className="panel">
      <div className="panel__head">
        <div>
          <h2>{site.name}{site.city ? ` · ${site.city}` : ''}</h2>
          <p>Site ID <code style={{ fontFamily: 'var(--mono)' }}>{site.id}</code>
            {data?.last_reading ? ` · last reading ${ago(Date.parse(data.last_reading))}` : ' · no readings yet'}</p>
        </div>
        {manage && <button className="btn btn--primary btn--small" onClick={newCode}>Connect an agent</button>}
      </div>
      {msg.text && <div style={{ marginBottom: 12 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
      {code && (
        <div className="code-box" style={{ marginBottom: 14 }}>
          <div className="code-box__meta">One-time enrolment code. {minsLeft > 0 ? `Expires in ${minsLeft} min` : 'Expired: generate a new one'} · works once</div>
          <div className="code-box__code">{code.code}</div>
          <div className="code-box__cmd">
            <code>{code.command}</code>
            <button type="button" className="btn btn--ghost btn--small" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
          </div>
          <div className="code-box__meta">
            On a Linux or macOS server in the hall that can reach your management network, run this inside the
            <code style={{ fontFamily: 'var(--mono)' }}> sparshika-platform</code> folder. The agent installs as a background service and
            appears below within a minute.
          </div>
        </div>
      )}
      {error ? <Alert>{error}</Alert> : !data ? <Spinner /> : data.agents.length === 0 ? (
        <p className="empty">No agents connected to this site yet.</p>
      ) : (
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Agent</th><th>Connected</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {data.agents.map((a) => (
                <tr key={a.id}>
                  <td className="who"><b>{a.label}</b><span>key …{a.id.slice(-6)}</span></td>
                  <td className="num">{fmtDate(a.created_at)}</td>
                  <td>{a.revoked_at ? <span className="pill pill--revoked">Disconnected</span> : <span className="pill pill--ok">Connected</span>}</td>
                  <td><div className="row-actions">
                    {manage && !a.revoked_at && <button className="btn btn--danger btn--small" onClick={() => revoke(a)}>Disconnect</button>}
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {active.length > 0 && code && <p className="sub" style={{ marginTop: 10 }}>Tip: the twin shows parts as <b>Live</b> once readings arrive.</p>}
    </div>
  );
}

// ----------------------------------------------------------- organisation
function Organisation({ org }) {
  return (
    <div className="grid2">
      <div className="panel">
        <h2>Organisation</h2>
        <dl className="kv" style={{ marginTop: 14 }}>
          <dt>Name</dt><dd>{org.name}</dd>
          <dt>Status</dt><dd><StatusPill status={org.status} /></dd>
          <dt>Plan</dt><dd style={{ textTransform: 'capitalize' }}>{org.plan}</dd>
          <dt>Seats</dt><dd>{org.seats_used} of {org.seat_limit} used</dd>
          <dt>Location</dt><dd>{[org.city, org.country].filter(Boolean).join(', ') || '—'}</dd>
          <dt>Sites</dt><dd>{org.sites.map((s) => s.name).join(', ') || '—'}</dd>
        </dl>
      </div>
      <div className="panel">
        <h2>Need more seats or a change?</h2>
        <p className="sub" style={{ marginTop: 8 }}>
          Seat limits and plans are set by Soni Tech Solutions. Reply to any Sparshika email, or ask your STS contact,
          and we’ll update your organisation.
        </p>
      </div>
    </div>
  );
}

export function OrgSwitch() {
  const { me } = useAuth();
  return (
    <SiteShell>
      <main className="page wrap">
        <div className="page__head"><div><h1>Choose an organisation</h1></div></div>
        <div className="panel">
          <table className="t"><tbody>
            {me.orgs.map((o) => (
              <tr key={o.id}>
                <td className="who"><b>{o.name}</b><span>{ROLE_LABEL[o.role]}</span></td>
                <td><StatusPill status={o.status} /></td>
                <td><div className="row-actions"><Link className="btn btn--ghost btn--small" to={`/app?org=${o.id}`}>Open</Link></div></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </main>
    </SiteShell>
  );
}
