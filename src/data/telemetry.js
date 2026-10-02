// telemetry.js
// Single interface for all part telemetry, metadata and live topology.
//
// Telemetry comes from the Sparshika cloud (agent → cloud → here): a background
// poller pulls GET /api/v1/worldstate into an in-memory cache and
// getTelemetry() reads that cache synchronously.
//
// Every reading says where it came from (`source`):
//   'live'  — a fresh cloud record for this part
//   'stale' — the cloud has a record, but it's older than STALE_MS (agent down?)
//   'sim'   — no cloud record: browser-side simulation for demo/filler units
// The UI must always show which one it is — simulated numbers are never passed
// off as real ones.

import { useSyncExternalStore } from 'react';
import { MODELS } from './catalog';

// Public-folder asset URL that works at a domain root AND under a sub-path
// (Vite's `base`), e.g. asset('dell_logo.png').
export const asset = (name) => `${import.meta.env.BASE_URL}${name}`;

import { apiUrl, apiFetch } from '../lib/api';

const POLL_MS = 5000;
// A record older than this is shown as stale (default: 6 missed agent cycles).
export const STALE_MS = (Number(import.meta.env?.VITE_STALE_SECONDS) || 60) * 1000;

// part_id -> latest TelemetryRecord (canonical schema) from the cloud snapshot.
const _cache = new Map();

// Connection status for the header pill.
let _status = { state: 'connecting', lastOk: null, error: null };

// Subscribers (React components) notified after every poll.
const _subs = new Set();
let _version = 0;
function _emit() {
  _version++;
  _subs.forEach((fn) => fn());
}

// The site being viewed. null = demo (browser simulation only, no polling).
let _site = null;
let _timer = null;

async function _poll() {
  const site = _site;
  if (!site) return;
  try {
    const res = await apiFetch(apiUrl(`/api/v1/worldstate?site_id=${encodeURIComponent(site)}`));
    if (site !== _site) return;                       // switched sites mid-request
    if (res.status === 401 || res.status === 403) {
      _status = { ..._status, state: 'denied', error: res.status === 401 ? 'signed out' : 'no access' };
      _emit();
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const snap = await res.json();
    _cache.clear();
    for (const [partId, record] of Object.entries(snap.records || {})) {
      _cache.set(partId, record);
      _recordLive(partId, record);
    }
    _status = { state: 'online', lastOk: Date.now(), error: null };
  } catch (err) {
    // Keep the last cache (it will turn 'stale' by age); report the outage.
    _status = { ..._status, state: 'offline', error: String(err?.message || err) };
  }
  _emit();
}

/**
 * Start streaming a site's live telemetry (or pass null for the demo, which
 * runs purely on browser simulation). Returns a stop function.
 */
export function startLiveTelemetry(siteId) {
  if (_timer) clearInterval(_timer);
  _timer = null;
  _site = siteId || null;
  _cache.clear();
  _lastTs.clear();
  _history.clear();
  _status = _site ? { state: 'connecting', lastOk: null, error: null } : { state: 'demo', lastOk: null, error: null };
  _emit();
  if (_site && typeof window !== 'undefined') {
    _poll();
    _timer = setInterval(_poll, POLL_MS);
  }
  return () => {
    if (_site === siteId) {
      if (_timer) clearInterval(_timer);
      _timer = null;
      _site = null;
    }
  };
}

/** Subscribe to poll updates (for useSyncExternalStore). */
function subscribe(fn) {
  _subs.add(fn);
  return () => _subs.delete(fn);
}

/** Re-render on every poll; returns a version counter. */
export function useTelemetryVersion() {
  return useSyncExternalStore(subscribe, () => _version, () => 0);
}

/** Cloud connection status: { state: 'connecting'|'online'|'offline', lastOk, error, live, stale, newest }. */
export function getCloudStatus() {
  const now = Date.now();
  let live = 0, stale = 0, newest = null;
  for (const r of _cache.values()) {
    const ts = Date.parse(r.timestamp);
    if (now - ts > STALE_MS) stale++; else live++;
    if (newest == null || ts > newest) newest = ts;
  }
  return { ..._status, live, stale, newest, site: _site };
}

// --- Live topology ------------------------------------------------------------
// Parts the agent reported with a rack position (schema v1.1+). The scene
// places these itself; `fan` parts attach to the unit at the same rack slot.
let _topoKey = '';
let _topo = [];
function _computeTopology() {
  const parts = [];
  for (const [partId, r] of _cache) {
    const p = r.position;
    if (!p || !r.kind) continue;
    parts.push({ partId, kind: r.kind, rackId: p.rack_id, startU: p.start_u, heightU: p.height_u });
  }
  parts.sort((a, b) => a.partId.localeCompare(b.partId));
  const key = parts.map((p) => `${p.partId}|${p.kind}|${p.rackId}|${p.startU}|${p.heightU}`).join(';');
  if (key !== _topoKey) { _topoKey = key; _topo = parts; }
  return _topo;
}

/** Live parts with a known rack position. Stable identity until the layout changes. */
export function useLiveTopology() {
  return useSyncExternalStore(subscribe, _computeTopology, () => _topo);
}

// Per-part identity registry. This is the single swappable source of truth
// for branding metadata — replace this object with a real inventory/DB lookup
// later without changing getMetadata()'s signature or return shape.
// `logo` points at a locally-bundled asset (served from /public) so branding
// works offline and inside a packaged desktop app — never a remote URL.
const PART_IDENTITY = {
  'GPU-PILOT-01': {
    brand: 'NVIDIA',
    model: 'GeForce RTX 3080 Ti',
    logo: asset('nvidia_logo.svg'),
    partNumber: '900-1G133-2530-000',
    serialNumber: '3080TI-0042-A17'
  },
  'R760-A17': {
    brand: 'Dell',
    model: 'PowerEdge R760',
    logo: asset('dell_logo.png'),
    partNumber: '210-BDXV',
    serialNumber: 'R760-A17-7H2K'
  },
  'TOR-SW-03': {
    brand: 'Dell',
    model: 'PowerSwitch S5248F-ON (Top of Rack)',
    logo: asset('dell_logo.png'),
    partNumber: '210-APXX',
    serialNumber: 'TORSW03-5248-1C9D'
  },
  // Dell R760 internal components (revealed when the cover is opened).
  'CPU-R760-01': {
    brand: 'Intel',
    model: 'Xeon Platinum 8480+ (Socket 1)',
    logo: asset('favicon.svg'),
    partNumber: 'SRM7G-8480',
    serialNumber: 'CPU01-R760-8F2A'
  },
  'CPU-R760-02': {
    brand: 'Intel',
    model: 'Xeon Platinum 8480+ (Socket 2)',
    logo: asset('favicon.svg'),
    partNumber: 'SRM7G-8480',
    serialNumber: 'CPU02-R760-9B7C'
  },
  'RAM-R760-01': {
    brand: 'Micron',
    model: '64GB DDR5-4800 RDIMM',
    logo: asset('favicon.svg'),
    partNumber: 'MTC40F2046S1RC48',
    serialNumber: 'RAM01-R760-3E11'
  },
  'DRIVE-R760-01': {
    brand: 'Dell',
    model: '1.92TB NVMe SSD',
    logo: asset('dell_logo.png'),
    partNumber: '0M7X8N',
    serialNumber: 'DRV01-R760-7A44'
  },
  // GPU accelerator cards installed in the rear risers.
  'GPU-RISER-01': {
    brand: 'NVIDIA',
    model: 'A2 Tensor Core GPU (Riser 1)',
    logo: asset('nvidia_logo.svg'),
    partNumber: '900-2G179-0000-001',
    serialNumber: 'A2-R1-R760-5C2D'
  },
  'GPU-RISER-02': {
    brand: 'NVIDIA',
    model: 'A2 Tensor Core GPU (Riser 3)',
    logo: asset('nvidia_logo.svg'),
    partNumber: '900-2G179-0000-001',
    serialNumber: 'A2-R3-R760-6E8F'
  }
};

// Six identical Dell hot-swap fan modules (FAN-R760-01 … FAN-R760-06).
for (let i = 1; i <= 6; i++) {
  PART_IDENTITY[`FAN-R760-0${i}`] = {
    brand: 'Dell',
    model: 'Standard Fan Module 80mm',
    logo: asset('dell_logo.png'),
    partNumber: 'W8KYY',
    serialNumber: `FAN0${i}-R760-${4200 + i * 137}`
  };
}

// Fallback identity for any part not yet in the registry, so the UI never
// renders a broken image or an undefined brand.
const UNKNOWN_IDENTITY = {
  brand: 'Sparshika Enterprise',
  model: 'Generic Component',
  logo: asset('favicon.svg'),
  partNumber: 'PN-UNREGISTERED',
  serialNumber: 'SN-000000000'
};

/**
 * Returns branding/identity metadata for a given part (shown on hover).
 * Stable per part — does not change between renders.
 * @param {string} partId - The unique identifier of the part.
 */
export function getMetadata(partId) {
  if (PART_IDENTITY[partId]) return PART_IDENTITY[partId];
  const info = _parts.get(partId);
  const model = info && MODELS[info.modelId];
  if (model) {
    return {
      brand: model.vendor,
      model: model.name,
      logo: asset(model.logo || 'favicon.svg'),
      partNumber: model.partNumber || 'PN-UNREGISTERED',
      serialNumber: serialFor(partId)
    };
  }
  // A fan module inside a demo unit: "<host>-FAN-<n>".
  const fan = typeof partId === 'string' && partId.match(/^(.*)-FAN-(\d+)$/);
  if (fan) {
    const host = getMetadata(fan[1]);
    return { brand: host.brand, model: `Hot-swap fan module ${fan[2]} (${host.model})`, logo: host.logo,
      partNumber: 'FAN-MODULE', serialNumber: serialFor(partId) };
  }
  return {
    ...UNKNOWN_IDENTITY,
    partNumber: `PN-${String(partId).toUpperCase()}`
  };
}

// --- Part registry -------------------------------------------------------
// The scene registers every unit it draws (model + rack position) so metadata,
// simulation and the panel's location line all come from one place.
const _parts = new Map(); // partId -> { modelId, rackId, startU, heightU }

/** Register drawn parts: [{ partId, modelId, rackId?, startU?, heightU? }]. */
export function registerParts(list) {
  for (const p of list) if (p.partId) _parts.set(p.partId, p);
}

/** Where a part is: { modelId, rackId, startU, heightU } or undefined. */
export function getPartInfo(partId) {
  return _parts.get(partId);
}

// Physical cabling computed by the scene (src/scene/cabling.js):
// partId -> { power: [...], network: [...], uplinks: [...], trunk: [...] }
let _connections = new Map();

/** Replace the connection map (the scene calls this when the room changes). */
export function registerConnections(map) {
  _connections = map;
}

/** What a part is cabled to, or undefined. */
export function getConnections(partId) {
  return _connections.get(partId);
}

/** Stable 0..1 hash of a string (FNV-1a), so demo behaviour is repeatable. */
function hash01(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

function serialFor(partId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < 7; i++) out += chars[Math.floor(hash01(partId, i + 1) * chars.length)];
  return out;
}

/**
 * Condition → severity bucket, shared by LEDs, badges and the panel so a
 * condition is coloured the same everywhere.
 * @returns {'critical'|'warning'|'offline'|'optimal'}
 */
export function severity(condition, source) {
  if (source === 'stale') return 'offline';
  const c = String(condition || '').toLowerCase();
  if (c.includes('critical') || c.includes('fault')) return 'critical';
  if (c.includes('offline')) return 'offline';
  if (c.includes('warn') || c.includes('maintenance')) return 'warning';
  return 'optimal';
}

/**
 * Telemetry for one part. Shape:
 *   { condition, age, temp (string, 1dp), load, rpm, rpms[], power, voltage,
 *     forecast, anomaly (0..1 | null), source: 'live'|'stale'|'sim', timestamp (ms | null) }
 * @param {string} partId - The unique identifier of the part.
 */
export function getTelemetry(partId) {
  const record = _cache.get(partId);
  if (record) {
    const m = record.metrics;
    const rpms = Array.isArray(m.fan_rpm) ? m.fan_rpm : [];
    const ts = Date.parse(record.timestamp);
    return {
      condition: record.health.condition,
      age: record.age_days,
      temp: Number(m.temp_c).toFixed(1),
      load: m.load_pct,
      rpm: rpms.length ? rpms[0] : null,
      rpms,
      power: m.power_w ?? null,
      voltage: m.voltage_v ?? null,
      forecast: record.health.forecast ?? null,
      anomaly: record.health.anomaly_score ?? null,
      source: Date.now() - ts > STALE_MS ? 'stale' : 'live',
      timestamp: ts
    };
  }
  return simulatedTelemetry(partId);
}

// Coherent simulated fallback: a per-part random walk so repeated reads vary
// smoothly (which also makes the metric graphs look like real trends, not
// noise). Condition labels match the canonical schema's values.
const _sim = new Map();
const _step = (mag) => (Math.random() - 0.5) * 2 * mag;
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const DEFAULT_ENV = { tempBase: 25, tempSpan: 45, powerIdle: 150, powerMax: 800, fanMin: 3000, fanMax: 13000, warnTemp: 80 };

// Demo units get a stable "personality" from their id: most are healthy, a few
// run hot, a few have a failed fan, and some are old enough to need service —
// so the room looks like a real fleet (a handful of alerts, not a sea of them).
function _simState(partId) {
  let s = _sim.get(partId);
  if (!s) {
    const hIssue = hash01(partId, 11);
    s = {
      age: 60 + Math.floor(Math.pow(hash01(partId, 7), 3) * 1000),
      base: 20 + hash01(partId, 13) * 45,
      issue: hIssue < 0.012 ? 'fan' : hIssue < 0.03 ? 'hot' : null,
      deadFan: hash01(partId, 17),
      temp: 30,
      rpms: []
    };
    s.load = s.base;
    _sim.set(partId, s);
  }
  return s;
}

function simulatedTelemetry(partId) {
  const common = { voltage: null, source: 'sim', timestamp: null };

  // Fan module inside a unit: follows its host's fan speeds.
  const fanOf = typeof partId === 'string' && partId.match(/^(.*)-FAN-(\d+)$/);
  if (fanOf || (typeof partId === 'string' && partId.startsWith('FAN-'))) {
    const hostId = fanOf ? fanOf[1] : null;
    const host = hostId && _sim.get(hostId);
    const s = _simState(partId);
    let rpm, maxRpm;
    if (host && host.rpms.length) {
      const env = MODELS[_parts.get(hostId)?.modelId]?.env || DEFAULT_ENV;
      rpm = host.rpms[(Number(fanOf[2]) - 1) % host.rpms.length];
      maxRpm = env.fanMax || 18000;
      s.temp = _clamp(host.inlet ?? 24, 15, 50);
    } else {
      maxRpm = 18000;
      s.temp = _clamp(s.temp + 0.08 * (32 - s.temp) + _step(1.5), 20, 55);
      rpm = Math.round(4000 + ((s.temp - 20) / 35) * (maxRpm - 4000) + _step(200));
    }
    const load = Math.min(100, Math.round((rpm / maxRpm) * 100));
    let condition = 'Optimal';
    if (rpm > maxRpm * 0.9) condition = 'Warning';
    if (rpm < maxRpm * 0.12) condition = 'Critical';
    return {
      ...common, condition, age: s.age, temp: s.temp.toFixed(1), load, rpm, rpms: [rpm],
      power: Math.round(3 + load * 0.12), forecast: condition === 'Critical' ? 'predicted fan fault' : 'nominal airflow',
      anomaly: condition === 'Critical' ? 0.5 : Math.round((0.05 + load / 400) * 100) / 100
    };
  }

  const info = _parts.get(partId);
  const model = info && MODELS[info.modelId];
  const env = model?.env || DEFAULT_ENV;
  const s = _simState(partId);

  // Mean-reverting load so demo units don't drift to the rails.
  s.load = _clamp(s.load + 0.15 * (s.base - s.load) + _step(5), 3, 98);
  const frac = s.load / 100;
  const temp = env.tempBase + frac * env.tempSpan + (s.issue === 'hot' ? 16 : 0) + _step(1.2);
  s.inlet = 21 + frac * 3 + _step(0.4);
  const power = env.powerMax ? Math.round(env.powerIdle + frac * (env.powerMax - env.powerIdle) + _step(env.powerMax * 0.01)) : null;

  const nFans = env.noFans ? 0 : (model?.internals?.fans ?? 0);
  const tFrac = _clamp((temp - env.tempBase) / Math.max(1, env.tempSpan), 0, 1);
  s.rpms = Array.from({ length: nFans }, () =>
    Math.max(0, Math.round(env.fanMin + tFrac * (env.fanMax - env.fanMin) + _step(env.fanMax * 0.015))));
  let fanDead = false;
  if (s.issue === 'fan' && nFans) { s.rpms[Math.floor(s.deadFan * nFans)] = 0; fanDead = true; }

  let condition = 'Optimal';
  if (temp > env.warnTemp) condition = 'Warning';
  if (s.age > 900) condition = 'Maintenance Recommended';
  if ((s.load > 90 && temp > env.warnTemp) || fanDead) condition = 'Critical';
  const forecast = fanDead ? 'predicted fan fault'
    : temp > env.warnTemp ? 'temp rising'
      : s.age > 900 ? 'ageing hardware — schedule service' : 'stable';
  const anomaly = Math.round(_clamp(0.04 + Math.max(0, temp - env.warnTemp + 8) / 40 + (fanDead ? 0.45 : 0), 0, 1) * 100) / 100;

  return {
    ...common, condition, age: s.age, temp: temp.toFixed(1), load: Math.round(s.load),
    rpm: s.rpms.length ? s.rpms[0] : null, rpms: s.rpms, power,
    voltage: power != null ? 12.1 : null, forecast, anomaly
  };
}

// --- Metric history for the graph system ---------------------------------
// Live parts: one sample per NEW cloud reading (keyed by record timestamp), for
// every live part from page load — so graphs show real readings, not the same
// reading repeated. Simulated parts: sampled on a timer while watched.
const HISTORY_LEN = 40;
const _history = new Map();   // partId -> [{ t, temp, load, rpm, condition, age, source }]
const _lastTs = new Map();    // partId -> timestamp of the last live sample
const _watched = new Set();

function _push(partId, sample) {
  let arr = _history.get(partId);
  if (!arr) { arr = []; _history.set(partId, arr); }
  arr.push(sample);
  if (arr.length > HISTORY_LEN) arr.shift();
}

function _sampleOf(t) {
  return {
    t: t.timestamp ?? Date.now(),
    temp: Number(t.temp),
    load: Number(t.load),
    rpm: t.rpm != null ? Number(t.rpm) : null,
    condition: t.condition,
    age: t.age,
    source: t.source
  };
}

function _recordLive(partId, record) {
  if (_lastTs.get(partId) === record.timestamp) return;
  // A part that switches from sim to live starts a fresh, all-real history.
  if (!_lastTs.has(partId)) _history.delete(partId);
  _lastTs.set(partId, record.timestamp);
  _push(partId, _sampleOf(getTelemetry(partId)));
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    for (const pid of _watched) {
      if (!_cache.has(pid)) _push(pid, _sampleOf(simulatedTelemetry(pid)));
    }
  }, 2000);
}

/** Start recording a simulated part's history (idempotent). Live parts are always recorded. */
export function watchMetric(partId) {
  if (_watched.has(partId)) return;
  _watched.add(partId);
  if (!_cache.has(partId)) for (let i = 0; i < 12; i++) _push(partId, _sampleOf(simulatedTelemetry(partId)));
}

/** Recent samples for a part: [{ t, temp, load, rpm, condition, age, source }, ...]. */
export function getMetricHistory(partId) {
  return _history.get(partId) || [];
}
