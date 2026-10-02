// catalog.js
// Real rack hardware the twin can draw. Each model defines:
//   - identity (vendor, name, part number, logo) for hover cards / panel
//   - physical size (rack units, chassis depth)
//   - a FRONT PANEL made of simple boxes (drawn instanced across the room)
//   - status + activity LED positions (the "working" lights)
//   - internals shown when a unit is pulled out and opened
//   - a simulation envelope (thermal, power, fan) used when no agent reports it
//
// Unit-local frame: x across the rack (0 = centre), y up (0 = unit centre),
// z = 0 at the front mounting plane, NEGATIVE z = out toward the cold aisle,
// positive z = into the rack.

import { U } from '../scene/rackGeometry';

export const UNIT_W = 0.54; // usable width between the rack's front rails (m)

// Shared materials, keyed by name. The room renderer makes one instanced
// batch per key, so every new key is one more draw call — reuse where you can.
export const MATS = {
  chassis:     { color: '#1b1f25', metalness: 0.5, roughness: 0.55 },
  bezel:       { color: '#262b33', metalness: 0.45, roughness: 0.5 },
  bezelLight:  { color: '#8c939c', metalness: 0.55, roughness: 0.42 },
  ear:         { color: '#3a4049', metalness: 0.6, roughness: 0.45 },
  carrier:     { color: '#15181d', metalness: 0.35, roughness: 0.6 },
  carrierEdge: { color: '#7d848e', metalness: 0.7, roughness: 0.35 },
  carrierHpe:  { color: '#9aa1aa', metalness: 0.5, roughness: 0.45 },
  grille:      { color: '#07080a', metalness: 0.2, roughness: 0.9 },
  gold:        { color: '#b58f55', metalness: 0.9, roughness: 0.32 },
  goldDark:    { color: '#4a3a22', metalness: 0.7, roughness: 0.5 },
  port:        { color: '#030405', metalness: 0.1, roughness: 0.9 },
  cage:        { color: '#9ba2ab', metalness: 0.8, roughness: 0.3 },
  keystone:    { color: '#d8dde3', metalness: 0.1, roughness: 0.6 },
  cableBlue:   { color: '#1f6fd6', metalness: 0.0, roughness: 0.55 },
  cableYellow: { color: '#e0b21b', metalness: 0.0, roughness: 0.55 },
  cableGrey:   { color: '#9aa0a8', metalness: 0.0, roughness: 0.6 },
  brush:       { color: '#050505', metalness: 0.0, roughness: 1.0 },
  handle:      { color: '#c9ced4', metalness: 0.85, roughness: 0.28 },
  lcd:         { color: '#06210f', emissive: '#27e06c', emissiveIntensity: 0.55 },
  nvGreen:     { color: '#2a4a05', emissive: '#76b900', emissiveIntensity: 1.1 },
  hpeGreen:    { color: '#013a2c', emissive: '#01a982', emissiveIntensity: 1.1 },
  ciscoBlue:   { color: '#0a2a44', emissive: '#049fd9', emissiveIntensity: 0.9 },
  dellBlue:    { color: '#0a2340', emissive: '#0076ce', emissiveIntensity: 0.9 },
  label:       { color: '#e9ecef', metalness: 0.0, roughness: 0.7 },
};

const ACT = { green: '#39ff7a', blue: '#4da3ff', amber: '#ffb020', white: '#e8f1ff' };

// ---------------------------------------------------------------- builders ---
function box(x, y, z, w, h, d, m, role) {
  return { x, y, z, w, h, d, m, role };
}

/** Evenly spaced drive carriers across [x0, x1] with an activity LED each. */
function bays(out, { n, x0, x1, y = 0, h, gap = 0.0025, mat = 'carrier', edge = 'carrierEdge', act = ACT.green }) {
  const pitch = (x1 - x0) / n;
  const w = pitch - gap;
  for (let i = 0; i < n; i++) {
    const cx = x0 + pitch * (i + 0.5);
    out.prims.push(box(cx, y, -0.006, w, h, 0.008, mat));
    out.prims.push(box(cx, y - h / 2 + h * 0.08, -0.0105, w * 0.8, h * 0.05, 0.002, edge)); // latch
    out.acts.push({ x: cx, y: y + h / 2 - h * 0.08, z: -0.011, c: act });
  }
}

/** Grid of dark vent slits over a rectangle. */
function vents(out, { x0, x1, y0, y1, cols, rows, mat = 'grille', z = -0.004 }) {
  const cw = (x1 - x0) / cols, rh = (y1 - y0) / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      out.prims.push(box(x0 + cw * (c + 0.5), y0 + rh * (r + 0.5), z, cw * 0.72, rh * 0.62, 0.004, mat));
    }
  }
}

/** Network ports in a grid with a link/activity LED above each column. */
function ports(out, { x0, x1, y0, y1, cols, rows, pw, ph, act = ACT.green, cage = null }) {
  const cw = (x1 - x0) / cols, rh = (y1 - y0) / rows;
  if (cage) out.prims.push(box((x0 + x1) / 2, (y0 + y1) / 2, -0.004, x1 - x0, y1 - y0, 0.006, cage));
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = x0 + cw * (c + 0.5), cy = y0 + rh * (r + 0.5);
      out.prims.push(box(cx, cy, -0.008, pw, ph, 0.004, 'port'));
      if (r === rows - 1) out.acts.push({ x: cx, y: y1 + 0.0035, z: -0.009, c: act });
    }
  }
}

function ears(out, H, { mat = 'ear', handle = false } = {}) {
  const ex = UNIT_W / 2 - 0.012;
  out.prims.push(box(-ex, 0, -0.006, 0.024, H, 0.008, mat));
  out.prims.push(box(ex, 0, -0.006, 0.024, H, 0.008, mat));
  if (handle) {
    out.prims.push(box(-ex, 0, -0.017, 0.008, H * 0.7, 0.012, 'handle'));
    out.prims.push(box(ex, 0, -0.017, 0.008, H * 0.7, 0.012, 'handle'));
  }
}

function base(H, depth, faceMat = 'bezel') {
  return {
    prims: [
      box(0, 0, depth / 2, UNIT_W, H, depth, 'chassis', 'chassis'),
      box(0, 0, -0.002, UNIT_W, H, 0.004, faceMat, 'face'),
    ],
    acts: [],
    led: null,
  };
}

const H_OF = (u) => u * U - 0.004;

// ------------------------------------------------------------ front panels ---
function faceDellR760() {
  const H = H_OF(2), o = base(H, 0.75);
  ears(o, H);
  bays(o, { n: 24, x0: -0.235, x1: 0.235, h: H * 0.84 });
  o.prims.push(box(-0.256, H * 0.3, -0.011, 0.012, 0.006, 0.002, 'dellBlue')); // iDRAC indicator
  o.led = { x: 0.256, y: H * 0.3 };
  return o;
}

function faceDellR660() {
  const H = H_OF(1), o = base(H, 0.8);
  ears(o, H);
  bays(o, { n: 10, x0: -0.225, x1: 0.125, h: H * 0.8 });
  vents(o, { x0: 0.135, x1: 0.235, y0: -H * 0.35, y1: H * 0.35, cols: 8, rows: 3 });
  o.led = { x: 0.256, y: H * 0.22 };
  return o;
}

function faceHpeDl380() {
  const H = H_OF(2), o = base(H, 0.73, 'bezelLight');
  ears(o, H, { mat: 'bezel' });
  // three 8-bay SFF drive cages
  [[-0.235, -0.085], [-0.075, 0.075], [0.085, 0.235]].forEach(([a, b]) =>
    bays(o, { n: 8, x0: a, x1: b, h: H * 0.84, mat: 'carrierHpe', edge: 'carrier', act: ACT.green }));
  o.prims.push(box(-0.256, -H * 0.3, -0.011, 0.014, 0.008, 0.002, 'hpeGreen')); // HPE logo tab
  o.led = { x: 0.256, y: H * 0.3 };
  return o;
}

function faceSmcGpu4U() {
  const H = H_OF(4), o = base(H, 0.85);
  ears(o, H, { handle: true });
  vents(o, { x0: -0.23, x1: 0.23, y0: -H * 0.12, y1: H * 0.46, cols: 26, rows: 7 });
  bays(o, { n: 8, x0: -0.23, x1: 0.23, y: -H * 0.32, h: H * 0.26, act: ACT.blue });
  o.led = { x: 0.256, y: H * 0.42 };
  return o;
}

function faceDgxH100() {
  const H = H_OF(8), o = base(H, 0.9, 'gold');
  ears(o, H, { mat: 'goldDark', handle: true });
  // the signature gold metal-foam grille: a dense field of dark cells
  vents(o, { x0: -0.235, x1: 0.235, y0: -H * 0.2, y1: H * 0.47, cols: 22, rows: 12, mat: 'goldDark' });
  o.prims.push(box(0, -H * 0.3, -0.005, 0.47, H * 0.14, 0.006, 'grille'));
  bays(o, { n: 8, x0: -0.2, x1: 0.2, y: -H * 0.3, h: H * 0.1, act: ACT.green });
  o.prims.push(box(0, -H * 0.44, -0.007, 0.12, H * 0.012, 0.003, 'nvGreen'));
  o.led = { x: 0.256, y: H * 0.44 };
  return o;
}

function faceGpu2U() {
  const H = H_OF(2), o = base(H, 0.8);
  ears(o, H, { handle: true });
  vents(o, { x0: -0.23, x1: 0.23, y0: -H * 0.4, y1: H * 0.22, cols: 18, rows: 3 });
  o.prims.push(box(0, H * 0.36, -0.006, 0.46, H * 0.08, 0.004, 'nvGreen'));
  o.led = { x: 0.256, y: H * 0.3 };
  return o;
}

function faceMe5024() {
  const H = H_OF(2), o = base(H, 0.6, 'bezelLight');
  ears(o, H, { mat: 'bezel' });
  bays(o, { n: 24, x0: -0.235, x1: 0.235, h: H * 0.84, mat: 'carrier', edge: 'carrierEdge', act: ACT.blue });
  o.led = { x: -0.256, y: H * 0.3 };
  return o;
}

function faceS5248f() {
  const H = H_OF(1), o = base(H, 0.45);
  ears(o, H);
  ports(o, { x0: -0.235, x1: 0.105, y0: -H * 0.36, y1: H * 0.24, cols: 24, rows: 2, pw: 0.0115, ph: 0.0085 });
  ports(o, { x0: 0.115, x1: 0.235, y0: -H * 0.36, y1: H * 0.24, cols: 6, rows: 1, pw: 0.016, ph: 0.012, act: ACT.blue });
  o.led = { x: 0.256, y: H * 0.2 };
  return o;
}

function faceN9k9336() {
  const H = H_OF(1), o = base(H, 0.5);
  ears(o, H);
  ports(o, { x0: -0.225, x1: 0.225, y0: -H * 0.36, y1: H * 0.24, cols: 18, rows: 2, pw: 0.018, ph: 0.0105, act: ACT.green });
  o.prims.push(box(-0.256, H * 0.2, -0.011, 0.012, 0.006, 0.002, 'ciscoBlue'));
  o.led = { x: 0.256, y: H * 0.2 };
  return o;
}

function facePatch24() {
  const H = H_OF(1), o = base(H, 0.12);
  ears(o, H);
  const cols = 24, x0 = -0.22, x1 = 0.22, pitch = (x1 - x0) / cols;
  for (let i = 0; i < cols; i++) {
    const cx = x0 + pitch * (i + 0.5);
    o.prims.push(box(cx, 0, -0.006, pitch * 0.72, H * 0.42, 0.006, 'keystone'));
    // patch cords plugged into most ports, colour-coded by network
    if (i % 6 !== 5) {
      const cable = i < 12 ? 'cableBlue' : i < 20 ? 'cableYellow' : 'cableGrey';
      o.prims.push(box(cx, -H * 0.05, -0.03, pitch * 0.45, H * 0.3, 0.05, cable));
    }
  }
  return o;
}

function faceCableMgr() {
  const H = H_OF(1), o = base(H, 0.1);
  ears(o, H);
  o.prims.push(box(0, 0, -0.008, 0.46, H * 0.3, 0.006, 'brush'));
  return o;
}

function faceKvm() {
  const H = H_OF(1), o = base(H, 0.55);
  ears(o, H, { handle: true });
  o.prims.push(box(0, 0, -0.006, 0.3, H * 0.5, 0.004, 'grille'));
  o.led = { x: 0.2, y: 0 };
  return o;
}

function faceApcSrt() {
  const H = H_OF(3), o = base(H, 0.65);
  ears(o, H, { handle: true });
  o.prims.push(box(-0.13, H * 0.18, -0.006, 0.11, H * 0.3, 0.004, 'bezel'));
  o.prims.push(box(-0.13, H * 0.18, -0.009, 0.085, H * 0.2, 0.002, 'lcd'));
  vents(o, { x0: 0.0, x1: 0.23, y0: -H * 0.4, y1: H * 0.4, cols: 10, rows: 6 });
  o.acts.push({ x: -0.19, y: -H * 0.15, z: -0.009, c: ACT.green });
  o.acts.push({ x: -0.16, y: -H * 0.15, z: -0.009, c: ACT.green });
  o.led = { x: -0.07, y: -H * 0.15 };
  return o;
}

function faceApcBattery() {
  const H = H_OF(2), o = base(H, 0.6);
  ears(o, H, { handle: true });
  vents(o, { x0: -0.2, x1: 0.2, y0: -H * 0.35, y1: H * 0.35, cols: 14, rows: 4 });
  o.led = { x: 0.23, y: H * 0.3 };
  return o;
}

function faceBlank() {
  const H = H_OF(1);
  return { prims: [box(0, 0, 0.01, UNIT_W, H, 0.02, 'bezel', 'face')], acts: [], led: null };
}

// ------------------------------------------------------------------ models ---
// env: sim envelope. tempBase/tempSpan (°C at 0..100% load), power idle/max (W),
// fan RPM range, number of fans, and the temperature that counts as a warning.
export const MODELS = {
  'dell-r760': {
    vendor: 'Dell', name: 'PowerEdge R760', partNumber: '210-BDXV', logo: 'dell_logo.png',
    category: 'server', heightU: 2, depth: 0.75, face: faceDellR760,
    internals: { fans: 6, cpus: 2, dimms: 16, psus: 2 },
    env: { tempBase: 22, tempSpan: 40, powerIdle: 190, powerMax: 1100, fanMin: 3000, fanMax: 13000, warnTemp: 78 },
  },
  'dell-r660': {
    vendor: 'Dell', name: 'PowerEdge R660', partNumber: '210-BEQQ', logo: 'dell_logo.png',
    category: 'server', heightU: 1, depth: 0.8, face: faceDellR660,
    internals: { fans: 8, cpus: 2, dimms: 16, psus: 2 },
    env: { tempBase: 24, tempSpan: 42, powerIdle: 150, powerMax: 800, fanMin: 5000, fanMax: 21000, warnTemp: 80 },
  },
  'hpe-dl380g11': {
    vendor: 'HPE', name: 'ProLiant DL380 Gen11', partNumber: 'P52560-B21', logo: 'favicon.svg',
    category: 'server', heightU: 2, depth: 0.73, face: faceHpeDl380,
    internals: { fans: 6, cpus: 2, dimms: 16, psus: 2 },
    env: { tempBase: 22, tempSpan: 40, powerIdle: 200, powerMax: 1200, fanMin: 3500, fanMax: 14000, warnTemp: 78 },
  },
  'smc-sys421ge': {
    vendor: 'Supermicro', name: 'SYS-421GE-TNRT (8× GPU)', partNumber: 'SYS-421GE-TNRT', logo: 'favicon.svg',
    category: 'gpu', heightU: 4, depth: 0.85, face: faceSmcGpu4U,
    internals: { fans: 8, gpus: 8, cpus: 2, psus: 4 },
    env: { tempBase: 30, tempSpan: 48, powerIdle: 900, powerMax: 6000, fanMin: 4000, fanMax: 16000, warnTemp: 83 },
  },
  'nvidia-dgx-h100': {
    vendor: 'NVIDIA', name: 'DGX H100', partNumber: '920-24387-2540-000', logo: 'nvidia_logo.svg',
    category: 'gpu', heightU: 8, depth: 0.9, face: faceDgxH100,
    internals: { fans: 12, gpus: 8, cpus: 2, psus: 6 },
    env: { tempBase: 32, tempSpan: 50, powerIdle: 2600, powerMax: 10200, fanMin: 3500, fanMax: 15000, warnTemp: 85 },
  },
  'gpu-2u': {
    vendor: 'Supermicro', name: 'SYS-221GE-NR (4× GPU)', partNumber: 'SYS-221GE-NR', logo: 'favicon.svg',
    category: 'gpu', heightU: 2, depth: 0.8, face: faceGpu2U,
    internals: { fans: 6, gpus: 4, cpus: 2, psus: 2 },
    env: { tempBase: 34, tempSpan: 52, powerIdle: 300, powerMax: 3000, fanMin: 1400, fanMax: 3400, warnTemp: 83 },
  },
  'dell-me5024': {
    vendor: 'Dell', name: 'PowerVault ME5024', partNumber: '210-AZBV', logo: 'dell_logo.png',
    category: 'storage', heightU: 2, depth: 0.6, face: faceMe5024,
    internals: { fans: 4, controllers: 2, psus: 2 },
    env: { tempBase: 24, tempSpan: 20, powerIdle: 260, powerMax: 580, fanMin: 3000, fanMax: 9000, warnTemp: 60 },
  },
  'dell-s5248f': {
    vendor: 'Dell', name: 'PowerSwitch S5248F-ON (25/100GbE)', partNumber: '210-APXX', logo: 'dell_logo.png',
    category: 'switch', heightU: 1, depth: 0.45, face: faceS5248f,
    internals: { fans: 4, psus: 2 },
    env: { tempBase: 28, tempSpan: 25, powerIdle: 180, powerMax: 420, fanMin: 6000, fanMax: 17000, warnTemp: 70 },
  },
  'cisco-n9k-9336c': {
    vendor: 'Cisco', name: 'Nexus 9336C-FX2 (spine)', partNumber: 'N9K-C9336C-FX2', logo: 'favicon.svg',
    category: 'switch', heightU: 1, depth: 0.5, face: faceN9k9336,
    internals: { fans: 6, psus: 2 },
    env: { tempBase: 30, tempSpan: 25, powerIdle: 250, powerMax: 650, fanMin: 7000, fanMax: 18000, warnTemp: 70 },
  },
  'apc-srt5k': {
    vendor: 'APC', name: 'Smart-UPS SRT 5000VA', partNumber: 'SRT5KRMXLI', logo: 'favicon.svg',
    category: 'ups', heightU: 3, depth: 0.65, face: faceApcSrt,
    internals: { fans: 2, batteries: 8 },
    env: { tempBase: 25, tempSpan: 12, powerIdle: 900, powerMax: 4500, fanMin: 1800, fanMax: 4200, warnTemp: 45 },
  },
  'apc-srt-bp': {
    vendor: 'APC', name: 'SRT 192V Battery Pack', partNumber: 'SRT192RMBP', logo: 'favicon.svg',
    category: 'ups', heightU: 2, depth: 0.6, face: faceApcBattery,
    internals: { fans: 0, batteries: 8 },
    env: { tempBase: 24, tempSpan: 8, powerIdle: 0, powerMax: 0, fanMin: 0, fanMax: 0, warnTemp: 40, noFans: true },
  },
  // Room cooling (floor-standing, not rack-mounted). env.tempBase = supply air.
  'vertiv-pdx': {
    vendor: 'Vertiv', name: 'Liebert PDX perimeter cooling unit', partNumber: 'PX035', logo: 'favicon.svg',
    category: 'cooling', internals: { fans: 3 },
    env: { tempBase: 16.5, tempSpan: 4.5, powerIdle: 4000, powerMax: 14000, fanMin: 900, fanMax: 1750, warnTemp: 22 },
  },
  // passive / unmonitored equipment — drawn, not selectable
  'patch-24': {
    vendor: 'Panduit', name: '24-port Cat6A patch panel', partNumber: 'CPPL24WBLY', logo: 'favicon.svg',
    category: 'passive', heightU: 1, depth: 0.12, face: facePatch24,
  },
  'cable-mgr': {
    vendor: 'Panduit', name: '1U horizontal cable manager', partNumber: 'NMF1', logo: 'favicon.svg',
    category: 'passive', heightU: 1, depth: 0.1, face: faceCableMgr,
  },
  'kvm-1u': {
    vendor: 'Vertiv', name: 'Avocent 1U KVM console', partNumber: 'LRA185KMM', logo: 'favicon.svg',
    category: 'passive', heightU: 1, depth: 0.55, face: faceKvm,
  },
  blank: {
    vendor: '', name: 'Blanking panel', category: 'passive', heightU: 1, depth: 0.02, face: faceBlank,
  },
};

// Faces are pure functions of the model; build each once.
const _faces = new Map();
export function faceOf(modelId) {
  if (!_faces.has(modelId)) _faces.set(modelId, MODELS[modelId].face());
  return _faces.get(modelId);
}

/** Default model for a live agent part that only reports its kind. */
export function modelForKind(kind, heightU) {
  switch (kind) {
    case 'gpu': return heightU >= 8 ? 'nvidia-dgx-h100' : heightU >= 4 ? 'smc-sys421ge' : 'gpu-2u';
    case 'switch': return 'dell-s5248f';
    case 'storage': return 'dell-me5024';
    case 'pdu': return 'apc-srt5k';
    default: return heightU === 1 ? 'dell-r660' : 'dell-r760';
  }
}

export const isSelectable = (modelId) => MODELS[modelId]?.category !== 'passive';
