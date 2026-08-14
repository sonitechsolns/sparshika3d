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
  }
};

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
  return PART_IDENTITY[partId] || {
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
    return {
      condition: record.health.condition,      // display-ready label
      age: record.age_days,                     // days
      temp: Number(record.metrics.temp_c).toFixed(1), // Celsius
      load: record.metrics.load_pct             // percentage
    };
  }
  return simulatedTelemetry(partId);
}

/**
 * Original simulated generator — retained as the offline/no-data fallback so
 * the twin still animates without a live cloud connection.
 */
function simulatedTelemetry() {
  const load = Math.floor(Math.random() * 85) + 10;
  const temp = 35 + Math.floor((load / 100) * 50) + (Math.random() * 5 - 2.5);
  const age = Math.floor(Math.random() * 1000) + 100;

  let condition = 'Optimal';
  if (temp > 80) condition = 'Warning - High Temp';
  if (age > 900) condition = 'Maintenance Recommended';
  if (load > 90 && temp > 80) condition = 'Critical';

  return {
    condition,
    age,
    temp: temp.toFixed(1),
    load
  };
}
