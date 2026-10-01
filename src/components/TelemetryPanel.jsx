import React, { useEffect, useState } from 'react';
import { getTelemetry, getMetricHistory, watchMetric, severity, getMetadata, getPartInfo, getConnections } from '../data/telemetry';
import Sparkline from './Sparkline';
import { CATEGORIES, issuesFor, useHealthVersion } from '../data/health';
import { ago } from '../utils/format';

const SOURCE_LABEL = { live: 'Live', stale: 'Stale', sim: 'Simulated' };

/** Small pill saying where a reading came from — never let sim pass as live. */
export function SourceBadge({ source, timestamp }) {
  const title =
    source === 'live' ? `Live reading from the on-prem agent (${ago(timestamp)})`
      : source === 'stale' ? `No new reading for ${ago(timestamp).replace(' ago', '')} — agent or uplink may be down`
        : 'No agent reports this part — values are simulated in the browser';
  return (
    <span className={`source-badge source-badge--${source}`} title={title}>
      <span className="source-badge__dot" />
      {SOURCE_LABEL[source]}
      {source !== 'sim' && timestamp ? <span className="source-badge__ago"> · {ago(timestamp)}</span> : null}
    </span>
  );
}

/** Live telemetry panel with metric sparklines, keyed by part_id. */
export default function TelemetryPanel({ partId, onClose, large = false, side = false }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    watchMetric(partId);
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [partId]);

  const hist = getMetricHistory(partId);
  const cur = getTelemetry(partId);
  const sev = severity(cur.condition, cur.source);
  const isFan = /(^FAN-|-FAN-\d+$)/.test(String(partId));
  const meta = getMetadata(partId);
  const host = String(partId).match(/^(.*)-FAN-\d+$/);
  const info = getPartInfo(host ? host[1] : partId);
  const where = info?.rackId
    ? `${info.rackId} · U${info.startU}${info.heightU > 1 ? `–U${info.startU + info.heightU - 1}` : ''}`
    : null;

  return (
    <div className={`detail-panel${large ? ' detail-panel--large' : ''}${side ? ' detail-panel--side' : ''}`}>
      <div className="panel-header">
        <div className="panel-title">
          <h4>{partId}</h4>
          <span className="panel-sub">{meta.brand} {meta.model}{where ? ` · ${where}` : ''}</span>
        </div>
        <button className="close-btn" onClick={onClose} aria-label="Close">&times;</button>
      </div>
      <div className="panel-body">
        <div className="data-row">
          <span>Source</span>
          <SourceBadge source={cur.source} timestamp={cur.timestamp} />
        </div>
        <div className="data-row">
          <span>Condition</span>
          <span className={`status ${sev}`}>
            {cur.source === 'stale' ? `${cur.condition} (last known)` : cur.condition}
          </span>
        </div>
        <PartIssues partId={partId} />
        {cur.forecast && (
          <div className="data-row">
            <span>Forecast</span>
            <span className="forecast">{cur.forecast}</span>
          </div>
        )}
        {cur.anomaly != null && (
          <div className="data-row data-row--stack">
            <span>Anomaly score</span>
            <span className="anomaly">
              <span className="anomaly__bar">
                <span className={`anomaly__fill anomaly__fill--${cur.anomaly > 0.6 ? 'hi' : cur.anomaly > 0.3 ? 'mid' : 'lo'}`}
                  style={{ width: `${Math.round(cur.anomaly * 100)}%` }} />
              </span>
              <span className="anomaly__val">{cur.anomaly.toFixed(2)}</span>
            </span>
          </div>
        )}
        <div className="data-row">
          <span>Age</span>
          <span>{cur.age} days</span>
        </div>
        <div className="metric-row">
          <div className="metric-row__head">
            <span>{isFan ? 'Intake temperature' : 'Temperature'}</span>
            <span>{Number(cur.temp).toFixed(1)} &deg;C</span>
          </div>
          <Sparkline values={hist.map((s) => s.temp)} color="#ff8a4c" />
        </div>
        <div className="metric-row">
          <div className="metric-row__head">
            <span>{isFan ? 'Speed (% of max)' : 'Load'}</span>
            <span>{Math.round(Number(cur.load))}%</span>
          </div>
          <Sparkline values={hist.map((s) => s.load)} color="#4f46e5" />
        </div>
        {cur.rpm != null && (
          <div className="metric-row">
            <div className="metric-row__head">
              <span>{cur.rpms.length > 1 ? `Fan RPM (${cur.rpms.length} fans, lowest)` : 'Fan RPM'}</span>
              <span>{Number(cur.rpms.length > 1 ? Math.min(...cur.rpms) : cur.rpm).toLocaleString()}</span>
            </div>
            <Sparkline values={hist.map((s) => s.rpm)} color="#35e0c6" />
            {cur.rpms.length > 1 && (
              <div className="fan-grid">
                {cur.rpms.map((r, i) => (
                  <span key={i} className={`fan-chip${r === 0 ? ' fan-chip--dead' : ''}`}>
                    F{i + 1} {r.toLocaleString()}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        {(cur.power != null || cur.voltage != null) && (
          <div className="data-row">
            <span>Power</span>
            <span>
              {cur.power != null ? `${Math.round(cur.power)} W` : '—'}
              {cur.voltage != null ? ` · ${Number(cur.voltage).toFixed(2)} V` : ''}
            </span>
          </div>
        )}
        <Connections partId={host ? host[1] : partId} />
        {cur.source === 'sim' && (
          <p className="panel-note">
            No on-prem agent reports this part, so these values are simulated in the browser.
          </p>
        )}
      </div>
    </div>
  );
}

/** Open alerts / maintenance items for this part (or, for a unit, its components). */
function PartIssues({ partId }) {
  useHealthVersion();
  const list = issuesFor(partId);
  if (!list.length) return null;
  return (
    <ul className="part-issues">
      {list.map((i) => (
        <li key={i.key} className={`part-issue part-issue--${i.tone}`}>
          <b>{CATEGORIES[i.category].short}</b> {i.title}
          {i.downtime && <span className="tag tag--downtime">Downtime risk</span>}
          {i.action && <span className="part-issue__action">{i.action}</span>}
        </li>
      ))}
    </ul>
  );
}

const CONN_ROWS = [
  ['power', 'Power', 'conn-dot--power'],
  ['network', 'Data (copper)', 'conn-dot--copper'],
  ['uplinks', 'Fibre uplinks', 'conn-dot--fiber'],
];

/** What this unit is physically plugged into, from the twin's cabling model. */
function Connections({ partId }) {
  const c = getConnections(partId);
  if (!c) return null;
  const rows = CONN_ROWS.filter(([k]) => c[k]?.length);
  if (!rows.length) return null;
  return (
    <div className="conn">
      <div className="conn__title">Connections</div>
      {rows.map(([k, label, cls]) => (
        <div className="data-row" key={k}>
          <span><span className={`conn-dot ${cls}`} />{label}</span>
          <span className="conn__to" title={c[k].join(', ')}>
            {c[k].length > 4 ? `${c[k].slice(0, 3).join(', ')} +${c[k].length - 3} more` : c[k].join(', ')}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Hover metadata card for a part. */
export function HoverCard({ metadata, source }) {
  return (
    <div className="hover-popup">
      <div className="popup-header">
        <img src={metadata.logo} alt="" className="popup-logo" />
        <h4>{metadata.brand}</h4>
        {source && <SourceBadge source={source} />}
      </div>
      <div className="popup-body">
        <p><strong>Model:</strong> {metadata.model}</p>
        <p><strong>PN:</strong> {metadata.partNumber}</p>
        <p><strong>SN:</strong> {metadata.serialNumber}</p>
      </div>
    </div>
  );
}
