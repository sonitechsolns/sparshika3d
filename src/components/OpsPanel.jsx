import React, { useEffect, useState } from 'react';
import { TriangleAlert, Wrench, Activity, ChevronRight, CircleCheck } from 'lucide-react';
import { CATEGORIES, getIssues, getNotes, markAllRead, useHealthVersion } from '../data/health';
import { ago } from '../utils/format';

const TABS = [
  { id: 'alerts', label: 'Alerts', icon: TriangleAlert, cats: ['failed', 'risk'] },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench, cats: ['service', 'ageing'] },
  { id: 'activity', label: 'Activity', icon: Activity, cats: [] },
];

function IssueRow({ issue, onFocus }) {
  return (
    <li>
      <button type="button" className={`issue issue--${issue.tone}`} onClick={() => onFocus(issue.partId)}
        title="Show this part in 3D">
        <span className={`issue__dot issue__dot--${issue.tone}`} aria-hidden="true" />
        <span className="issue__body">
          <span className="issue__title">{issue.title}</span>
          <span className="issue__where">{[issue.where, issue.unitName].filter(Boolean).join(' · ')}</span>
          <span className="issue__detail">{issue.detail}</span>
          <span className="issue__tags">
            {issue.downtime && <span className="tag tag--downtime" title={issue.downtimeReason || ''}>Downtime risk</span>}
            {issue.etaDays != null && <span className="tag">~{issue.etaDays} days</span>}
            {issue.source === 'sim' && <span className="tag tag--muted">Simulated</span>}
            {issue.source === 'live' && <span className="tag tag--live">Live</span>}
          </span>
          {issue.downtime && issue.downtimeReason && <span className="issue__why">{issue.downtimeReason}</span>}
          {issue.action && <span className="issue__action">Suggested: {issue.action}</span>}
        </span>
        <ChevronRight size={16} className="issue__go" aria-hidden="true" />
      </button>
    </li>
  );
}

function Section({ cat, issues, onFocus }) {
  const list = issues.filter((i) => i.category === cat);
  const c = CATEGORIES[cat];
  return (
    <section className="ops-sec">
      <h3 className={`ops-sec__h ops-sec__h--${c.tone}`}>{c.label}<span className="ops-count">{list.length}</span></h3>
      {list.length ? (
        <ul className="issue-list">{list.map((i) => <IssueRow key={i.key} issue={i} onFocus={onFocus} />)}</ul>
      ) : (
        <p className="ops-empty"><CircleCheck size={15} aria-hidden="true" /> Nothing here right now.</p>
      )}
    </section>
  );
}

function ActivityList({ onFocus }) {
  const notes = getNotes();
  if (!notes.length) return <p className="ops-empty">No events yet. New failures and warnings appear here as they happen.</p>;
  return (
    <ul className="activity">
      {notes.map((n) => (
        <li key={n.id}>
          <button type="button" className={`act act--${n.kind}`} disabled={!n.issue.partId}
            onClick={() => n.issue.partId && onFocus(n.issue.partId)}>
            <span className={`issue__dot issue__dot--${n.kind === 'resolved' ? 'ok' : CATEGORIES[n.issue.category]?.tone}`} aria-hidden="true" />
            <span className="issue__body">
              <span className="issue__title">{n.kind === 'resolved' ? `Cleared: ${n.issue.title}` : n.issue.title}</span>
              <span className="issue__where">{n.issue.where || ''}{n.issue.where ? ' · ' : ''}{ago(n.at)}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Left drawer: what needs attention, what needs servicing, and what happened. */
export default function OpsPanel({ open, tab, setTab, onClose, onFocus }) {
  const version = useHealthVersion();
  const issues = getIssues();
  const [, tick] = useState(0);
  useEffect(() => {                    // keep "x min ago" fresh
    const id = setInterval(() => tick((t) => t + 1), 15000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { if (open && tab === 'activity') markAllRead(); }, [open, tab, version]);
  const count = (cats) => issues.filter((i) => cats.includes(i.category)).length;

  return (
    <aside className={`ops${open ? ' ops--open' : ''}`} aria-label="Operations" aria-hidden={!open}>
      <div className="ops__head">
        <h2>Hall health</h2>
        <button type="button" className="close-btn" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="ops__tabs" role="tablist">
        {TABS.map(({ id, label, icon: Icon, cats }) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            className={`ops-tab${tab === id ? ' ops-tab--on' : ''}`} onClick={() => setTab(id)}>
            <Icon size={15} aria-hidden="true" />{label}
            {cats.length > 0 && <span className="ops-count">{count(cats)}</span>}
          </button>
        ))}
      </div>
      <div className="ops__body">
        {tab === 'alerts' && (<>
          <Section cat="failed" issues={issues} onFocus={onFocus} />
          <Section cat="risk" issues={issues} onFocus={onFocus} />
        </>)}
        {tab === 'maintenance' && (<>
          <Section cat="service" issues={issues} onFocus={onFocus} />
          <Section cat="ageing" issues={issues} onFocus={onFocus} />
        </>)}
        {tab === 'activity' && <ActivityList onFocus={onFocus} />}
      </div>
      <p className="ops__foot">Click any item to fly to it in 3D.</p>
    </aside>
  );
}
