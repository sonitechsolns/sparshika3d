// telemetry.js
// Single interface for all part telemetry and metadata.
//
// Telemetry now comes from the Sparshika cloud (the agent → cloud pipeline):
// a background poller pulls GET /api/v1/worldstate into an in-memory cache, and
// getTelemetry() reads that cache *synchronously* — keeping the exact same
// signature/return shape so nothing downstream changes. If the cloud is
// unreachable (offline dev, cold start) it transparently falls back to the
// original simulated generator.

const API_BASE = import.meta.env?.VITE_API_BASE || 'http://localhost:8010';
const SITE_ID = import.meta.env?.VITE_SITE_ID || 'dc-west-1';
const POLL_MS = 5000;

// part_id -> latest TelemetryRecord (canonical schema) from the cloud snapshot.
const _cache = new Map();
let _polling = false;

async function _poll() {
  try {
    const res = await fetch(
      `${API_BASE}/api/v1/worldstate?site_id=${encodeURIComponent(SITE_ID)}`
    );
    if (!res.ok) return;
    const snap = await res.json();
    _cache.clear();
    for (const [partId, record] of Object.entries(snap.records || {})) {
      _cache.set(partId, record);
    }
  } catch {
    // Cloud unreachable — keep the last cache; getTelemetry falls back to sim.
  }
}

function _startPolling() {
  if (_polling || typeof window === 'undefined') return;
  _polling = true;
  _poll(); // prime immediately
  setInterval(_poll, POLL_MS);
}
_startPolling();

// Per-part identity registry. This is the single swappable source of truth
// for branding metadata — replace this object with a real inventory/DB lookup
// later without changing getMetadata()'s signature or return shape.
// `logo` points at a locally-bundled asset (served from /public) so branding
// works offline and inside a packaged desktop app — never a remote URL.
const PART_IDENTITY = {
  'GPU-PILOT-01': {
    brand: 'NVIDIA',
    model: 'GeForce RTX 3080 Ti',
    logo: '/nvidia_logo.svg',
    partNumber: '900-1G133-2530-000',
    serialNumber: '3080TI-0042-A17'
  },
  // Dell R760 internal components (revealed when the cover is opened).
  'CPU-R760-01': {
    brand: 'Intel',
    model: 'Xeon Platinum 8480+ (Socket 1)',
    logo: '/favicon.svg',
    partNumber: 'SRM7G-8480',
    serialNumber: 'CPU01-R760-8F2A'
  },
  'CPU-R760-02': {
    brand: 'Intel',
    model: 'Xeon Platinum 8480+ (Socket 2)',
    logo: '/favicon.svg',
    partNumber: 'SRM7G-8480',
    serialNumber: 'CPU02-R760-9B7C'
  },
  'RAM-R760-01': {
    brand: 'Micron',
    model: '64GB DDR5-4800 RDIMM',
    logo: '/favicon.svg',
    partNumber: 'MTC40F2046S1RC48',
    serialNumber: 'RAM01-R760-3E11'
  },
  'DRIVE-R760-01': {
    brand: 'Dell',
    model: '1.92TB NVMe SSD',
    logo: '/dell_logo.png',
    partNumber: '0M7X8N',
    serialNumber: 'DRV01-R760-7A44'
  },
  // GPU accelerator cards installed in the rear risers.
  'GPU-RISER-01': {
    brand: 'NVIDIA',
    model: 'A2 Tensor Core GPU (Riser 1)',
    logo: '/nvidia_logo.svg',
    partNumber: '900-2G179-0000-001',
    serialNumber: 'A2-R1-R760-5C2D'
  },
  'GPU-RISER-02': {
    brand: 'NVIDIA',
    model: 'A2 Tensor Core GPU (Riser 3)',
    logo: '/nvidia_logo.svg',
    partNumber: '900-2G179-0000-001',
    serialNumber: 'A2-R3-R760-6E8F'
  }
};

// Six identical Dell hot-swap fan modules (FAN-R760-01 … FAN-R760-06).
for (let i = 1; i <= 6; i++) {
  PART_IDENTITY[`FAN-R760-0${i}`] = {
    brand: 'Dell',
    model: 'Standard Fan Module 80mm',
    logo: '/dell_logo.png',
    partNumber: 'W8KYY',
    serialNumber: `FAN0${i}-R760-${4200 + i * 137}`
  };
}

// Fallback identity for any part not yet in the registry, so the UI never
// renders a broken image or an undefined brand.
const UNKNOWN_IDENTITY = {
  brand: 'Sparshika Enterprise',
  model: 'Generic Component',
  logo: '/favicon.svg',
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
  // Rack-mounted equipment, keyed by rack (e.g. RACK-01-U39, RACK-03-U40).
  const m = typeof partId === 'string' && partId.match(/^RACK-(\d+)-U\d+$/);
  if (m) {
    const sn = `SN-${partId.replace(/-/g, '')}`;
    switch (m[1]) {
      case '03': return { brand: 'Dell', model: 'PowerSwitch S5248F-ON', logo: '/favicon.svg', partNumber: '210-APXX', serialNumber: sn };
      case '05': return { brand: 'Dell', model: 'PowerVault ME5024', logo: '/dell_logo.png', partNumber: '210-AZBV', serialNumber: sn };
      case '06': return { brand: 'APC', model: 'Smart-UPS SRT 5kVA', logo: '/favicon.svg', partNumber: 'SRT5KRMXLI', serialNumber: sn };
      default: return { brand: 'Dell', model: 'PowerEdge R760', logo: '/dell_logo.png', partNumber: '210-BDXV', serialNumber: sn };
    }
  }
  return {
    ...UNKNOWN_IDENTITY,
    partNumber: `PN-${String(partId).toUpperCase()}`
  };
}

/**
 * Returns telemetry data for a given part to display on the detail panel.
 * Reads the latest cloud reading for the part; falls back to simulated data
 * when the cloud has no record yet. Return shape is unchanged:
 *   { condition, age, temp (string, 1dp), load }
 * @param {string} partId - The unique identifier of the part.
 */
export function getTelemetry(partId) {
  const record = _cache.get(partId);
  if (record) {
    const rpm = Array.isArray(record.metrics.fan_rpm) && record.metrics.fan_rpm.length
      ? record.metrics.fan_rpm[0]
      : null;
    return {
      condition: record.health.condition,      // display-ready label
      age: record.age_days,                     // days
      temp: Number(record.metrics.temp_c).toFixed(1), // Celsius
      load: record.metrics.load_pct,            // percentage
      rpm                                        // fan RPM (null for non-fans)
    };
  }
  return simulatedTelemetry(partId);
}

// Coherent simulated fallback: a per-part random walk so repeated reads vary
// smoothly (which also makes the metric graphs look like real trends, not noise).
const _sim = new Map();
const _step = (mag) => (Math.random() - 0.5) * 2 * mag;
const _clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function simulatedTelemetry(partId) {
  const isFan = typeof partId === 'string' && partId.startsWith('FAN-');
  let s = _sim.get(partId);
  if (!s) {
    s = { age: Math.floor(Math.random() * 900) + 100, temp: 30, load: 40 };
    _sim.set(partId, s);
  }

  if (isFan) {
    // Intake air temp walk drives RPM (hotter → faster); load = % of max RPM.
    const MAX_RPM = 18000;
    s.temp = _clamp(s.temp + _step(1.5), 20, 55);
    const rpm = Math.round(4000 + ((s.temp - 20) / 35) * (MAX_RPM - 4000) + _step(200));
    const load = Math.min(100, Math.round((rpm / MAX_RPM) * 100));
    let condition = 'Optimal';
    if (rpm > MAX_RPM * 0.9) condition = 'Warning';
    if (rpm < 2500) condition = 'Critical';
    return { condition, age: s.age, temp: s.temp.toFixed(1), load, rpm };
  }

  s.load = _clamp(s.load + _step(5), 5, 98);
  const temp = 35 + (s.load / 100) * 45 + _step(1.5);
  let condition = 'Optimal';
  if (temp > 80) condition = 'Warning - High Temp';
  if (s.age > 900) condition = 'Maintenance Recommended';
  if (s.load > 90 && temp > 80) condition = 'Critical';
  return { condition, age: s.age, temp: temp.toFixed(1), load: Math.round(s.load), rpm: null };
}

// --- Metric history for the graph system ---------------------------------
// A rolling buffer of recent readings per part, sampled on a timer, so the
// telemetry panel can draw live sparklines for each metric.
const HISTORY_LEN = 30;
const _history = new Map();   // partId -> [{ temp, load, rpm, condition, age }]
const _watched = new Set();

function _record(partId) {
  const t = getTelemetry(partId);
  let arr = _history.get(partId);
  if (!arr) { arr = []; _history.set(partId, arr); }
  arr.push({
    temp: Number(t.temp),
    load: Number(t.load),
    rpm: t.rpm != null ? Number(t.rpm) : null,
    condition: t.condition,
    age: t.age
  });
  if (arr.length > HISTORY_LEN) arr.shift();
}

if (typeof window !== 'undefined') {
  setInterval(() => { for (const pid of _watched) _record(pid); }, 2000);
}

/** Start recording a part's metric history (idempotent); seeds a short trail. */
export function watchMetric(partId) {
  if (_watched.has(partId)) return;
  _watched.add(partId);
  for (let i = 0; i < 12; i++) _record(partId);
}

/** Recent samples for a part: [{ temp, load, rpm, condition, age }, ...]. */
export function getMetricHistory(partId) {
  return _history.get(partId) || [];
}
