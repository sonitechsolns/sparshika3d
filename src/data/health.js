// health.js — turns raw telemetry into the operator's work list.
//
// Every few seconds each monitored unit is scored and sorted into:
//   failed   — a part has failed now (fan stopped, PSU dead, critical fault)
//   risk     — expected to fail soon, or running in a state where one more
//              fault takes the unit down (downtime risk)
//   service  — maintenance suggested (preventive service, airflow, firmware)
//   ageing   — near or past the end of warranty / service life
//
// Issues point at the most specific thing to look at: a fan or power-supply
// module inside a unit when there is one, else the unit itself. New issues
// raise notifications; the first pass raises one summary instead of a flood.

import { useSyncExternalStore } from 'react';
import { MODELS } from './catalog';
import { getTelemetry, getPartInfo, getMetadata, listParts, componentOf, severity } from './telemetry';

const EVAL_MS = 3000;
const WARRANTY_DAYS = 1095;          // 3-year hardware warranty
const SERVICE_DAYS = 900;            // preventive service window

export const CATEGORIES = {
  failed: { label: 'Failed', short: 'Failed', tone: 'critical' },
  risk: { label: 'At risk of downtime', short: 'At risk', tone: 'warning' },
  service: { label: 'Maintenance suggested', short: 'Service', tone: 'info' },
  ageing: { label: 'Ageing hardware', short: 'Ageing', tone: 'muted' },
};

let _issues = [];
let _byUnit = new Map();             // unitId -> worst category (for 3D beacons)
let _notes = [];                     // [{ id, at, issue, kind: 'new'|'resolved'|'summary', read }]
let _version = 0;
let _timer = null;
let _baseline = true;
let _known = new Map();              // issue key -> issue
const _subs = new Set();
const _emit = () => { _version++; _subs.forEach((fn) => fn()); };
const subscribe = (fn) => { _subs.add(fn); return () => _subs.delete(fn); };

function where(info) {
  if (!info?.rackId) return '';
  const hi = info.heightU > 1 ? `–U${info.startU + info.heightU - 1}` : '';
  return `${info.rackId} · U${info.startU}${hi}`;
}

const COMPONENT_NAME = { fan: 'Fan', psu: 'Power supply', drive: 'Drive' };

function issue(fields) {
  const info = getPartInfo(fields.unitId);
  const meta = getMetadata(fields.unitId);
  return {
    ...fields,
    key: `${fields.category}:${fields.partId}:${fields.code}`,
    where: where(info),
    unitName: `${meta.brand} ${meta.model}`.trim(),
    rackId: info?.rackId || null,
  };
}

/** Score one unit; returns its issues. */
function assess(unitId) {
  const info = getPartInfo(unitId);
  const model = info && MODELS[info.modelId];
  if (!model || model.category === 'passive') return [];
  const t = getTelemetry(unitId);
  const out = [];
  const sev = severity(t.condition, t.source);
  const env = model.env || {};
  const temp = Number(t.temp);
  const warnTemp = env.warnTemp || 80;
  const nPsu = model.internals?.psus || 0;
  const src = t.source;

  if (src === 'stale') {
    out.push(issue({ category: 'failed', code: 'stale', unitId, partId: unitId, source: src, tone: 'critical',
      title: `${unitId} stopped reporting`, detail: 'No reading from the on-prem agent. The unit, its management controller or the agent may be down.',
      action: 'Check the unit and the agent', downtime: true }));
    return out;
  }

  // Component faults the telemetry names explicitly (simulated units list them;
  // live units: a fan reporting 0 RPM).
  const faults = [...(t.faults || [])];
  if (!t.faults && Array.isArray(t.rpms)) {
    t.rpms.forEach((r, i) => {
      if (Number(r) === 0) {
        const fanId = listParts().find((p) => { const c = componentOf(p); return c?.hostId === unitId && c.index === i + 1; })
          || `${unitId}-FAN-${i + 1}`;
        faults.push({ id: fanId, component: 'fan', index: i + 1, state: 'failed', detail: `Fan ${i + 1} reports 0 RPM` });
      }
    });
  }

  for (const f of faults) {
    const name = `${COMPONENT_NAME[f.component] || 'Part'} ${f.index}`;
    if (f.state === 'failed') {
      const lastPsu = f.component === 'psu' && nPsu - 1 <= 1;
      const hotFan = f.component === 'fan' && temp > warnTemp - 5;
      out.push(issue({
        category: 'failed', code: `${f.component}${f.index}`, unitId, partId: f.id, component: f.component, source: src, tone: 'critical',
        title: `${name} failed in ${unitId}`, detail: f.detail,
        action: f.component === 'psu' ? 'Replace the power supply (hot-swap)' : 'Replace the fan module (hot-swap)',
        downtime: lastPsu || hotFan,
        downtimeReason: lastPsu ? 'Running on its last power supply: one more fault takes it offline'
          : hotFan ? 'Temperature is climbing without full airflow' : null,
      }));
    } else {
      out.push(issue({
        category: 'risk', code: `${f.component}${f.index}`, unitId, partId: f.id, component: f.component, source: src, tone: 'warning',
        title: `${name} in ${unitId} is expected to fail`, detail: f.detail, etaDays: f.etaDays,
        action: f.component === 'drive' ? 'Replace the drive before it fails; the array rebuilds from parity'
          : 'Order a spare and swap the fan at the next window',
        downtime: f.component === 'drive' || (f.etaDays ?? 99) <= 7,
        downtimeReason: f.component === 'drive' ? 'A second drive failure during rebuild would lose the volume'
          : 'If it stops, the unit will throttle and may shut down',
      }));
    }
  }

  // Unit-level conditions not explained by a component fault.
  if (!faults.length) {
    if (sev === 'critical') {
      out.push(issue({ category: 'failed', code: 'critical', unitId, partId: unitId, source: src, tone: 'critical',
        title: `${unitId} is in a critical state`, detail: t.forecast || t.condition,
        action: 'Inspect the unit now', downtime: true, downtimeReason: 'Critical condition reported' }));
    } else if (temp > warnTemp) {
      out.push(issue({ category: 'risk', code: 'thermal', unitId, partId: unitId, source: src, tone: 'warning',
        title: `${unitId} is running hot (${temp.toFixed(0)} °C)`,
        detail: `Above its ${warnTemp} °C warning level at ${Math.round(Number(t.load))}% load. Sustained heat triggers throttling and thermal shutdown.`,
        action: 'Check blanking panels and airflow; move load if it keeps rising',
        downtime: temp > warnTemp + 6, downtimeReason: 'Close to its thermal shutdown limit' }));
    } else if (src === 'live' && typeof t.forecast === 'string' && /predict|fail/i.test(t.forecast)) {
      out.push(issue({ category: 'risk', code: 'forecast', unitId, partId: unitId, source: src, tone: 'warning',
        title: `${unitId}: ${t.forecast}`, detail: `Anomaly score ${t.anomaly ?? '—'} from the on-site model.`,
        action: 'Plan a check at the next window', downtime: (t.anomaly ?? 0) > 0.6 }));
    }
  }

  // Maintenance and ageing (by age in service).
  const age = Number(t.age) || 0;
  if (age > SERVICE_DAYS || /maintenance/i.test(String(t.condition))) {
    out.push(issue({ category: 'service', code: 'pm', unitId, partId: unitId, source: src, tone: 'info',
      title: `Preventive service due: ${unitId}`,
      detail: `${age} days in service. Clean the filters and fans, reseat and check the power supplies, update firmware.`,
      action: 'Schedule a maintenance window', age }));
  }
  if (age > WARRANTY_DAYS - 120) {
    const left = WARRANTY_DAYS - age;
    out.push(issue({ category: 'ageing', code: 'warranty', unitId, partId: unitId, source: src, tone: 'muted',
      title: left > 0 ? `Warranty ends in ${left} days: ${unitId}` : `Out of warranty: ${unitId}`,
      detail: `${(age / 365).toFixed(1)} years in service. Extend support or plan the replacement.`,
      action: left > 0 ? 'Renew support or budget a refresh' : 'Plan the replacement', age }));
  }
  if (nPsu === 1) {
    out.push(issue({ category: 'service', code: 'single-psu', unitId, partId: unitId, source: src, tone: 'info',
      title: `${unitId} has a single power supply`, detail: 'No power redundancy.', action: 'Add a second supply' }));
  }
  return out;
}

const RANK = { failed: 0, risk: 1, service: 2, ageing: 3 };

function evaluate() {
  const units = listParts().filter((p) => !getPartInfo(p)?.hostId && !componentOf(p));
  const next = [];
  for (const id of units) next.push(...assess(id));
  next.sort((a, b) => RANK[a.category] - RANK[b.category]
    || Number(b.downtime) - Number(a.downtime)
    || (a.etaDays ?? 999) - (b.etaDays ?? 999)
    || (b.age ?? 0) - (a.age ?? 0)
    || a.partId.localeCompare(b.partId));

  const now = Date.now();
  const nextKeys = new Map(next.map((i) => [i.key, i]));
  if (_baseline) {
    const nFail = next.filter((i) => i.category === 'failed').length;
    const nRisk = next.filter((i) => i.category === 'risk').length;
    if (nFail || nRisk) {
      _notes.unshift({ id: `summary-${now}`, at: now, kind: 'summary', read: false,
        issue: { category: nFail ? 'failed' : 'risk', title: `${nFail} failed part${nFail === 1 ? '' : 's'}, ${nRisk} at risk`,
          detail: 'Open the alerts list to see each one and fly to it.' } });
    }
    _baseline = false;
  } else {
    for (const [k, i] of nextKeys) {
      if (!_known.has(k) && (i.category === 'failed' || i.category === 'risk')) {
        _notes.unshift({ id: `${k}@${now}`, at: now, kind: 'new', read: false, issue: i });
      }
    }
    for (const [k, i] of _known) {
      if (!nextKeys.has(k) && (i.category === 'failed' || i.category === 'risk')) {
        // An at-risk part that became a failure isn't "resolved".
        const escalated = next.some((n) => n.partId === i.partId && n.category === 'failed');
        if (!escalated) _notes.unshift({ id: `${k}-ok@${now}`, at: now, kind: 'resolved', read: false, issue: i });
      }
    }
  }
  if (_notes.length > 60) _notes.length = 60;
  _known = nextKeys;

  const byUnit = new Map();
  for (const i of next) {
    const cur = byUnit.get(i.unitId);
    if (!cur || RANK[i.category] < RANK[cur.category]) byUnit.set(i.unitId, i);
  }
  _byUnit = byUnit;
  _issues = next;
  _emit();
}

/** Start scoring the hall (call when the twin mounts / the site changes). */
export function startHealth() {
  stopHealth();
  _issues = []; _byUnit = new Map(); _notes = []; _known = new Map(); _baseline = true;
  _emit();
  const first = setTimeout(evaluate, 1500);
  _timer = setInterval(evaluate, EVAL_MS);
  return () => { clearTimeout(first); stopHealth(); };
}

export function stopHealth() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

const snap = () => _version;
/** Re-render when the issue list or notifications change. */
export function useHealthVersion() {
  return useSyncExternalStore(subscribe, snap, snap);
}
export const getIssues = () => _issues;
export const getNotes = () => _notes;
/** Worst open issue per unit (for 3D markers): Map unitId -> issue. */
export const getUnitIssues = () => _byUnit;
/** Open issues for one part (unit or component). */
export const issuesFor = (partId) => _issues.filter((i) => i.partId === partId || i.unitId === partId);

export function markAllRead() {
  let changed = false;
  _notes.forEach((n) => { if (!n.read) { n.read = true; changed = true; } });
  if (changed) _emit();
}
export function dismissNote(id) {
  const n = _notes.find((x) => x.id === id);
  if (n && !n.read) { n.read = true; _emit(); }
}
