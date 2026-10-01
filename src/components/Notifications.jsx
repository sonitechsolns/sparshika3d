import React, { useEffect, useRef, useState } from 'react';
import { Bell, X } from 'lucide-react';
import { CATEGORIES, getIssues, getNotes, useHealthVersion } from '../data/health';

/** Header bell: unread count; failed-part count on the Alerts button. */
export function AlertButtons({ onOpen }) {
  useHealthVersion();
  const unread = getNotes().filter((n) => !n.read).length;
  const issues = getIssues();
  const failed = issues.filter((i) => i.category === 'failed').length;
  const risk = issues.filter((i) => i.category === 'risk').length;
  return (
    <>
      <button type="button" className={`toggle-btn alerts-btn${failed ? ' alerts-btn--bad' : risk ? ' alerts-btn--warn' : ''}`}
        onClick={() => onOpen('alerts')} title="Failed and at-risk parts">
        <span className="toggle-dot" /> Alerts
        <span className="pill-count">{failed + risk}</span>
      </button>
      <button type="button" className="icon-btn" onClick={() => onOpen('activity')}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} title="Notifications">
        <Bell size={18} aria-hidden="true" />
        {unread > 0 && <span className="icon-btn__badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
    </>
  );
}

const TOAST_MS = 9000;

/** Pop-up notifications for new failures / warnings / clears, top-right. */
export function Toasts({ onFocus, onOpen }) {
  const version = useHealthVersion();
  const notes = getNotes();
  const seen = useRef(new Set());
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    const fresh = notes.filter((n) => !seen.current.has(n.id));
    if (!fresh.length) return;
    fresh.forEach((n) => seen.current.add(n.id));
    setToasts((t) => [...fresh.reverse().map((n) => ({ ...n, until: Date.now() + TOAST_MS })), ...t].slice(0, 3));
  }, [version, notes]);

  useEffect(() => {
    if (!toasts.length) return undefined;
    const id = setInterval(() => setToasts((t) => t.filter((x) => x.until > Date.now())), 1000);
    return () => clearInterval(id);
  }, [toasts.length]);

  const close = (id) => setToasts((t) => t.filter((x) => x.id !== id));
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((n) => {
        const tone = n.kind === 'resolved' ? 'ok' : CATEGORIES[n.issue.category]?.tone || 'info';
        const go = () => { close(n.id); if (n.kind === 'summary') onOpen('alerts'); else if (n.issue.partId) onFocus(n.issue.partId); };
        return (
          <div key={n.id} className={`toast toast--${tone}`} role="status">
            <button type="button" className="toast__main" onClick={go}>
              <span className="toast__kicker">
                {n.kind === 'resolved' ? 'Cleared' : n.kind === 'summary' ? 'Hall status' : CATEGORIES[n.issue.category]?.label}
              </span>
              <span className="toast__title">{n.issue.title}</span>
              {n.kind !== 'resolved' && <span className="toast__detail">{n.issue.downtime ? `Downtime risk. ${n.issue.downtimeReason || ''}` : n.issue.detail}</span>}
              <span className="toast__cta">{n.kind === 'summary' ? 'Open alerts' : n.kind === 'resolved' ? 'Show part' : 'Show in 3D'}</span>
            </button>
            <button type="button" className="toast__x" onClick={() => close(n.id)} aria-label="Dismiss"><X size={14} /></button>
          </div>
        );
      })}
    </div>
  );
}
