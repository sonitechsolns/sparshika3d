// walk.js — the street-view graph for Walk mode: standing points along the
// two cold aisles, the hot aisle and the two end corridors, at eye height.
// Pure data; WalkControls moves the camera between these points.

import { ROW_Z } from '../data/layout';

export const EYE = 1.6;
const XS = [-4.5, -3.6, -2.4, -1.2, 0, 1.2, 2.4, 3.3];
const AISLES = [
  { id: 'A', z: -(ROW_Z + 1.3), label: 'Cold aisle A' },
  { id: 'H', z: 0, label: 'Hot aisle' },
  { id: 'B', z: ROW_Z + 1.3, label: 'Cold aisle B' },
];
const END_X = [XS[0], XS[XS.length - 1]];

export const NODES = [];
const at = new Map();
const key = (x, z) => `${x.toFixed(2)},${z.toFixed(2)}`;
function node(x, z, label) {
  const k = key(x, z);
  if (at.has(k)) return at.get(k);
  const n = { i: NODES.length, x, z, label, links: [] };
  NODES.push(n);
  at.set(k, n.i);
  return n.i;
}
const link = (a, b) => {
  if (!NODES[a].links.includes(b)) NODES[a].links.push(b);
  if (!NODES[b].links.includes(a)) NODES[b].links.push(a);
};

// Along each aisle.
for (const a of AISLES) {
  let prev = null;
  for (const x of XS) {
    const i = node(x, a.z, END_X.includes(x) ? (x < 0 ? 'Door end' : 'Cooling end') : a.label);
    if (prev != null) link(prev, i);
    prev = i;
  }
}
// End corridors join the aisles (in front of the door and in front of the CRACs).
for (const x of END_X) {
  const ids = [];
  for (const a of AISLES) {
    ids.push(node(x, a.z, x < 0 ? 'Door end' : 'Cooling end'));
  }
  const mids = [node(x, (AISLES[0].z + AISLES[1].z) / 2, x < 0 ? 'Door end' : 'Cooling end'),
    node(x, (AISLES[1].z + AISLES[2].z) / 2, x < 0 ? 'Door end' : 'Cooling end')];
  link(ids[0], mids[0]); link(mids[0], ids[1]); link(ids[1], mids[1]); link(mids[1], ids[2]);
}

/** Where Walk mode starts: the door end of cold aisle A, looking down the aisle. */
export const START = { node: at.get(key(XS[0], AISLES[0].z)), yaw: -Math.PI / 2 };

/** yaw 0 looks toward -Z; positive yaw turns left (toward -X). */
export const dirOf = (yaw) => ({ x: -Math.sin(yaw), z: -Math.cos(yaw) });
export const yawTo = (from, to) => Math.atan2(-(to.x - from.x), -(to.z - from.z));

/** Neighbour of `i` best matching a heading (radians), within ±60°. */
export function neighbourToward(i, yaw) {
  const n = NODES[i];
  let best = null, bestDot = Math.cos(Math.PI / 3);
  const d = dirOf(yaw);
  for (const j of n.links) {
    const m = NODES[j];
    const len = Math.hypot(m.x - n.x, m.z - n.z) || 1;
    const dot = ((m.x - n.x) * d.x + (m.z - n.z) * d.z) / len;
    if (dot > bestDot) { bestDot = dot; best = j; }
  }
  return best;
}

export function nearestNode(x, z) {
  let best = 0, bd = Infinity;
  NODES.forEach((n) => { const d = (n.x - x) ** 2 + (n.z - z) ** 2; if (d < bd) { bd = d; best = n.i; } });
  return best;
}

/** Shared pose for the minimap (written by WalkControls every frame). */
export const walkPose = { x: 0, z: 0, yaw: 0 };
