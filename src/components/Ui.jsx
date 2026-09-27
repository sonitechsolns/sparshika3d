import React from 'react';

export function Field({ id, label, hint, children, ...input }) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children || <input id={id} name={id} {...input} />}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  return <div className={`alert alert--${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>;
}

const STATUS_LABEL = { active: 'Active', pending: 'Pending approval', rejected: 'Not approved', suspended: 'Suspended' };
export function StatusPill({ status }) {
  return <span className={`pill pill--${status}`}>{STATUS_LABEL[status] || status}</span>;
}

export function Seats({ used, limit }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));
  return (
    <div className="seats" title={`${used} of ${limit} seats used (members + pending invitations)`}>
      <div className="seats__bar"><div className={`seats__fill${used >= limit ? ' seats__fill--full' : ''}`} style={{ width: `${pct}%` }} /></div>
      <span><b>{used}</b> of {limit} seats used</span>
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return <div className="empty" role="status">{label}</div>;
}
