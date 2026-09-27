import React, { useCallback, useEffect, useState } from 'react';
import SiteShell from '../components/SiteShell';
import { Alert, Spinner, StatusPill } from '../components/Ui';
import { api } from '../lib/api';
import { fmtDate } from '../utils/format';

const FILTERS = [
  { id: 'pending', label: 'Awaiting review' },
  { id: 'active', label: 'Active' },
  { id: 'suspended', label: 'Suspended' },
  { id: 'rejected', label: 'Not approved' },
  { id: '', label: 'All' },
];

/** STS console: review new organisations, approve / reject / suspend, set seats. */
export default function Admin() {
  const [filter, setFilter] = useState('pending');
  const [orgs, setOrgs] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState({ kind: '', text: '' });

  const load = useCallback(async () => {
    try {
      const d = await api(`/api/v1/admin/orgs${filter ? `?status=${filter}` : ''}`);
      setOrgs(d.orgs);
      setError('');
    } catch (e) { setError(e.message); }
  }, [filter]);
  useEffect(() => { setOrgs(null); load(); }, [load]);

  const decide = async (org, action, extra = {}) => {
    setMsg({ kind: '', text: '' });
    try {
      await api(`/api/v1/admin/orgs/${org.id}/decision`, { method: 'POST', body: { action, ...extra } });
      const verb = { approve: 'approved', reject: 'marked not approved', suspend: 'suspended', reactivate: 'reactivated' }[action];
      setMsg({ kind: 'ok', text: `${org.name} ${verb}.${action === 'approve' || action === 'reject' ? ' The owner has been emailed.' : ''}` });
      load();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };
  const setSeats = async (org, seat_limit) => {
    try {
      await api(`/api/v1/admin/orgs/${org.id}`, { method: 'PATCH', body: { seat_limit } });
      setMsg({ kind: 'ok', text: `${org.name} now has ${seat_limit} seats.` });
      load();
    } catch (e) { setMsg({ kind: 'error', text: e.message }); }
  };

  return (
    <SiteShell>
      <main className="page wrap">
        <div className="page__head">
          <div><h1>STS console</h1><p>Verify organisations before their data flows, and manage their seats.</p></div>
        </div>
        <nav className="tabs" aria-label="Filter organisations">
          {FILTERS.map((f) => (
            <button key={f.id || 'all'} type="button" className={`tab${filter === f.id ? ' active' : ''}`}
              style={{ background: 'none', border: 0, cursor: 'pointer', borderBottom: filter === f.id ? '2px solid var(--accent)' : '2px solid transparent' }}
              onClick={() => setFilter(f.id)}>{f.label}</button>
          ))}
        </nav>
        {msg.text && <div style={{ marginBottom: 14 }}><Alert kind={msg.kind}>{msg.text}</Alert></div>}
        {error ? <Alert>{error}</Alert> : !orgs ? <Spinner /> : orgs.length === 0 ? (
          <div className="panel"><p className="empty">{filter === 'pending' ? 'Nothing waiting for review.' : 'No organisations here.'}</p></div>
        ) : (
          <div className="panel">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Organisation</th><th>Owner</th><th>Requested</th><th>Seats</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>{orgs.map((o) => <OrgRow key={o.id} org={o} onDecide={decide} onSeats={setSeats} />)}</tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </SiteShell>
  );
}

function OrgRow({ org, onDecide, onSeats }) {
  const [seats, setSeats] = useState(org.seat_limit);
  const [note, setNote] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const waiting = org.status === 'pending' && org.activation_requested_at;
  return (
    <tr>
      <td className="who">
        <b>{org.name}</b>
        <span>{org.sites.map((s) => s.name).join(', ')}{org.city ? ` · ${org.city}` : ''}{org.country ? `, ${org.country}` : ''}</span>
      </td>
      <td className="who"><b>{org.owner?.name || '—'}</b><span>{org.owner?.email}{org.phone ? ` · ${org.phone}` : ''}</span></td>
      <td className="num">{org.activation_requested_at ? fmtDate(org.activation_requested_at) : <span style={{ color: 'var(--text-muted)' }}>Not yet</span>}</td>
      <td>
        <input type="number" min={1} max={500} value={seats} aria-label={`Seats for ${org.name}`}
          onChange={(e) => setSeats(Number(e.target.value))}
          style={{ width: 64, background: '#0c0e14', color: '#fff', border: '1px solid var(--line-strong)', borderRadius: 8, padding: '6px 8px' }} />
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: 6 }}>{org.seats_used} used</span>
      </td>
      <td><StatusPill status={org.status} /></td>
      <td>
        <div className="row-actions">
          {org.status === 'pending' && !rejecting && (
            <>
              <button className="btn btn--primary btn--small" disabled={!waiting} title={waiting ? '' : 'The owner hasn’t requested activation yet'}
                onClick={() => onDecide(org, 'approve', { seat_limit: seats })}>Approve</button>
              <button className="btn btn--danger btn--small" onClick={() => setRejecting(true)}>Reject…</button>
            </>
          )}
          {rejecting && (
            <>
              <input placeholder="Reason (emailed to the owner)" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Reason"
                style={{ minWidth: 180, background: '#0c0e14', color: '#fff', border: '1px solid var(--line-strong)', borderRadius: 8, padding: '6px 8px' }} />
              <button className="btn btn--danger btn--small" onClick={() => onDecide(org, 'reject', { note })}>Send</button>
              <button className="btn btn--ghost btn--small" onClick={() => setRejecting(false)}>Cancel</button>
            </>
          )}
          {org.status === 'rejected' && <button className="btn btn--primary btn--small" onClick={() => onDecide(org, 'approve', { seat_limit: seats })}>Approve</button>}
          {org.status === 'active' && <button className="btn btn--danger btn--small" onClick={() => onDecide(org, 'suspend')}>Suspend</button>}
          {org.status === 'suspended' && <button className="btn btn--primary btn--small" onClick={() => onDecide(org, 'reactivate')}>Reactivate</button>}
          {seats !== org.seat_limit && org.status !== 'pending' && (
            <button className="btn btn--ghost btn--small" onClick={() => onSeats(org, seats)}>Save seats</button>
          )}
        </div>
      </td>
    </tr>
  );
}
