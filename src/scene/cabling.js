// cabling.js — computes the hall's physical cabling from the room model.
//
// Every cable has a real origin and destination, so the twin can also answer
// "what is this plugged into?" (see getConnections in telemetry.js):
//
//   POWER   (thick black)  UPS rack ─► overhead busway A (red) / B (blue)
//                          ─► tap-off box above each rack ─► vertical PDU-A / PDU-B
//                          ─► one cord per PSU (odd PSUs → A, even → B)
//   COPPER  (blue Cat6A)   each server's NICs ─► rack's vertical cable manager
//                          ─► both top-of-rack switches (U41/U42)
//                          patch panel trunks ─► wire-basket tray ─► network rack
//   FIBER   (thin yellow)  each TOR ─► front riser ─► yellow fiber raceway
//                          ─► crossover above the hot aisle ─► spine switches
//
// Segregation, as in a real hall: overhead, power runs lowest and over the
// rear (hot aisle side), copper in its own basket tray over the rack centre,
// fibre highest over the front. Inside a rack, power cords go outward to the
// PDUs on the rear corners; data leads go to a separate vertical manager.

import * as THREE from 'three';
import { MODELS, UNIT_W } from '../data/catalog';
import { U, RW, RACK_H, FRONT_FACE, uY } from './rackGeometry';

export const OVERHEAD = { powerY: 2.2, copperY: 2.42, fiberY: 2.62, ceiling: 3 };
// rack-local z lanes (front = -0.5, rear = +0.5)
const LANE = { busA: 0.22, busB: 0.36, copper: 0.02, fiber: -0.43 };
const PDU = { x: 0.262, z: 0.452, y0: 0.14, y1: 1.86, w: 0.045, d: 0.05 };
const MGR = { x: 0.165, z: 0.4 };                 // vertical data cable manager (rear)
const RISER_X = 0.268;                            // front-right fibre riser
const RADIUS = { cord: 0.0034, whip: 0.009, feeder: 0.013, lead: 0.0021, bundle: 0.011, trunk: 0.0055, fiber: 0.0017, uplink: 0.005 };

const v = (x, y, z) => new THREE.Vector3(x, y, z);

function rackMatrix(rack) {
  return new THREE.Matrix4().compose(v(...rack.pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rack.rot, 0)), v(1, 1, 1));
}
const W = (m, x, y, z) => v(x, y, z).applyMatrix4(m);

/** Polyline with rounded corners: straight runs + bezier bends, like a dressed cable. */
function routed(points, bend = 0.06) {
  const path = new THREE.CurvePath();
  const pts = points.filter((p, i) => i === 0 || p.distanceTo(points[i - 1]) > 1e-4);
  if (pts.length < 2) return null;
  let start = pts[0].clone();
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1], cur = pts[i], next = pts[i + 1];
    const r = Math.min(bend, cur.distanceTo(prev) / 2, cur.distanceTo(next) / 2);
    const a = cur.clone().add(prev.clone().sub(cur).normalize().multiplyScalar(r));
    const b = cur.clone().add(next.clone().sub(cur).normalize().multiplyScalar(r));
    if (start.distanceTo(a) > 1e-4) path.add(new THREE.LineCurve3(start, a));
    path.add(new THREE.QuadraticBezierCurve3(a, cur.clone(), b));
    start = b;
  }
  path.add(new THREE.LineCurve3(start, pts[pts.length - 1].clone()));
  return path;
}

/** A short cord that sags between two points (catenary-ish). */
function drooped(points, tension = 0.4) {
  return new THREE.CatmullRomCurve3(points, false, 'catmullrom', tension);
}

function trs(pos, size) {
  return new THREE.Matrix4().compose(pos, new THREE.Quaternion(), size);
}

const psuCount = (model) => {
  if (!model || ['passive', 'cooling', 'ups'].includes(model.category)) return 0;
  return model.internals?.psus || 2;
};

/**
 * Build all cabling for the room.
 * @returns {{ cables: Record<string, {curve, r}[]>, boxes: Record<string, THREE.Matrix4[]>, connections: Map }}
 */
export function buildCabling(room, racks) {
  const cables = { power: [], copper: [], fiber: [] };
  const boxes = { pdu: [], pduA: [], pduB: [], psu: [], busway: [], busA: [], busB: [], tap: [], tray: [], raceway: [], rod: [], grommet: [] };
  const connections = new Map();
  const add = (cls, curve, r) => { if (curve) cables[cls].push({ curve, r }); };
  const box = (key, pos, size) => boxes[key].push(trs(pos, size));
  const link = (partId, kind, target) => {
    if (!partId) return;
    const c = connections.get(partId) || { power: [], network: [], uplinks: [], trunk: [] };
    if (!c[kind].includes(target)) c[kind].push(target);
    connections.set(partId, c);
  };

  const unitsByRack = new Map();
  for (const u of room.units) {
    if (!unitsByRack.has(u.rackId)) unitsByRack.set(u.rackId, []);
    unitsByRack.get(u.rackId).push(u);
  }
  const mats = new Map(racks.map((r) => [r.id, rackMatrix(r)]));
  const netRack = racks.find((r) => r.role === 'network');
  const rows = [...new Set(racks.map((r) => r.row))];
  const laneZ = (row, lane) => {
    const r = racks.find((x) => x.row === row);
    return W(mats.get(r.id), 0, 0, lane).z;
  };

  // ------------------------------------------------ overhead containment
  for (const row of rows) {
    const rr = racks.filter((r) => r.row === row);
    const xs = rr.map((r) => r.pos[0]);
    const x0 = Math.min(...xs) - RW / 2, x1 = Math.max(...xs) + RW / 2;
    const len = x1 - x0, xm = (x0 + x1) / 2;
    // power busways A and B (housing + colour stripe on the aisle side)
    for (const [lane, stripe] of [[LANE.busA, 'busA'], [LANE.busB, 'busB']]) {
      const z = laneZ(row, lane);
      box('busway', v(xm, OVERHEAD.powerY, z), v(len, 0.09, 0.07));
      box(stripe, v(xm, OVERHEAD.powerY + 0.025, z), v(len, 0.022, 0.074));
    }
    // copper wire-basket tray: floor + two low walls
    const zc = laneZ(row, LANE.copper);
    box('tray', v(xm, OVERHEAD.copperY - 0.035, zc), v(len, 0.006, 0.2));
    box('tray', v(xm, OVERHEAD.copperY - 0.005, zc - 0.1), v(len, 0.06, 0.006));
    box('tray', v(xm, OVERHEAD.copperY - 0.005, zc + 0.1), v(len, 0.06, 0.006));
    // yellow fibre raceway: open-top channel
    const zf = laneZ(row, LANE.fiber);
    box('raceway', v(xm, OVERHEAD.fiberY - 0.03, zf), v(len, 0.008, 0.13));
    box('raceway', v(xm, OVERHEAD.fiberY, zf - 0.065), v(len, 0.07, 0.008));
    box('raceway', v(xm, OVERHEAD.fiberY, zf + 0.065), v(len, 0.07, 0.008));
    // threaded-rod hangers from the slab every ~1.2 m
    for (let x = x0 + 0.3; x <= x1; x += 1.2) {
      for (const [y, z] of [[OVERHEAD.powerY, laneZ(row, (LANE.busA + LANE.busB) / 2)], [OVERHEAD.copperY - 0.035, zc], [OVERHEAD.fiberY - 0.03, zf]]) {
        box('rod', v(x, (OVERHEAD.ceiling + y) / 2, z), v(0.008, OVERHEAD.ceiling - y, 0.008));
      }
    }
  }
  // crossovers above the hot aisle at the network rack, so row B reaches the core
  if (netRack && rows.length > 1) {
    const x = netRack.pos[0];
    const zA = laneZ('A', LANE.fiber), zB = laneZ('B', LANE.fiber);
    box('raceway', v(x, OVERHEAD.fiberY - 0.03, (zA + zB) / 2), v(0.13, 0.008, Math.abs(zB - zA)));
    box('raceway', v(x - 0.065, OVERHEAD.fiberY, (zA + zB) / 2), v(0.008, 0.07, Math.abs(zB - zA)));
    box('raceway', v(x + 0.065, OVERHEAD.fiberY, (zA + zB) / 2), v(0.008, 0.07, Math.abs(zB - zA)));
    const cA = laneZ('A', LANE.copper), cB = laneZ('B', LANE.copper);
    box('tray', v(x + 0.35, OVERHEAD.copperY - 0.035, (cA + cB) / 2), v(0.2, 0.006, Math.abs(cB - cA)));
  }

  // ------------------------------------------------------------ per rack
  let fiberIdx = 0, trunkIdx = 0;
  const netUnits = netRack ? (unitsByRack.get(netRack.id) || []) : [];
  const spines = netUnits.filter((u) => u.modelId === 'cisco-n9k-9336c').sort((a, b) => b.startU - a.startU);
  const netPatches = netUnits.filter((u) => u.modelId === 'patch-24').sort((a, b) => b.startU - a.startU);

  for (const rack of racks) {
    const m = mats.get(rack.id);
    const units = unitsByRack.get(rack.id) || [];
    const L = (x, y, z) => W(m, x, y, z);

    if (rack.role === 'power') {
      // UPS outputs feed the row's busways from this end of the row
      const upss = units.filter((u) => u.modelId === 'apc-srt5k');
      upss.forEach((u, i) => {
        const y = uY(u.startU, u.heightU);
        const rear = FRONT_FACE + MODELS[u.modelId].depth;
        for (const [sx, lane] of [[-1, LANE.busA], [1, LANE.busB]]) {
          const x = sx * (0.08 + i * 0.03);
          add('power', routed([L(x, y, rear + 0.01), L(x, y, 0.43), L(sx * 0.2, RACK_H - 0.05, 0.43),
            L(sx * 0.2, RACK_H + 0.02, 0.43), L(sx * 0.2, OVERHEAD.powerY - 0.05, lane),
            L(sx * 0.2, OVERHEAD.powerY - 0.045, lane)], 0.08), RADIUS.feeder);
        }
        box('grommet', L(0, RACK_H + 0.004, 0.42), v(0.46, 0.008, 0.05));
      });
      continue;
    }

    // vertical PDUs on the rear corners, fed from the busway tap-offs
    for (const [sx, lane, stripe, feed] of [[-1, LANE.busA, 'pduA', 'A'], [1, LANE.busB, 'pduB', 'B']]) {
      const px = sx * PDU.x;
      box('pdu', L(px, (PDU.y0 + PDU.y1) / 2, PDU.z), v(PDU.w, PDU.y1 - PDU.y0, PDU.d));
      box(stripe, L(px, (PDU.y0 + PDU.y1) / 2, PDU.z + PDU.d / 2 + 0.001), v(0.008, PDU.y1 - PDU.y0, 0.002));
      box('tap', L(px, OVERHEAD.powerY - 0.075, lane), v(0.09, 0.06, 0.06));
      add('power', routed([L(px, OVERHEAD.powerY - 0.105, lane), L(px, RACK_H + 0.08, lane),
        L(px, RACK_H + 0.02, PDU.z), L(px, PDU.y1 + 0.005, PDU.z)], 0.07), RADIUS.whip);
      box('grommet', L(px, RACK_H + 0.004, PDU.z - 0.01), v(0.06, 0.008, 0.06));
      void feed;
    }

    const tors = units.filter((u) => u.modelId === 'dell-s5248f' && u.startU >= 41).sort((a, b) => b.startU - a.startU);
    const leadYs = [];

    for (const u of units) {
      const model = MODELS[u.modelId];
      const n = psuCount(model);
      const yc = uY(u.startU, u.heightU);
      const H = u.heightU * U - 0.004;
      const rear = Math.min(FRONT_FACE + model.depth, PDU.z - 0.06);
      // ---- power: one cord per PSU, alternating A / B
      for (let i = 0; i < n; i++) {
        const sx = i % 2 === 0 ? -1 : 1;
        const tier = Math.floor(i / 2), tiers = Math.ceil(n / 2);
        const y = tiers === 1 ? yc : yc - H / 2 + H * (0.2 + (0.6 * tier) / Math.max(1, tiers - 1));
        const x = sx * (0.09 + (tier % 2) * 0.04);
        box('psu', L(x, y, rear + 0.004), v(0.07, Math.min(H * 0.7, 0.034), 0.008));
        add('power', drooped([L(x, y, rear + 0.01), L(x * 1.2, y - 0.01, Math.min(rear + 0.05, PDU.z - 0.02)),
          L(sx * 0.215, y - 0.02, PDU.z - 0.015), L(sx * (PDU.x - 0.022), y - 0.006, PDU.z)]), RADIUS.cord);
        link(u.partId, 'power', `${rack.id} PDU-${sx < 0 ? 'A' : 'B'}`);
      }
      // ---- copper: every server / GPU node / array to both TORs
      const isTor = tors.includes(u);
      if (tors.length && !isTor && ['server', 'gpu', 'storage'].includes(model.category)) {
        const y = model.heightU >= 4 ? yc - H * 0.3 : yc;
        tors.forEach((t, k) => {
          add('copper', drooped([L(0.03 + k * 0.012, y, rear + 0.008), L(0.06 + k * 0.012, y - 0.004, rear + 0.04),
            L(MGR.x - 0.012, y - 0.008, MGR.z - 0.02), L(MGR.x, y + 0.012, MGR.z)], 0.3), RADIUS.lead);
          link(u.partId, 'network', t.partId);
          link(t.partId, 'network', u.partId);
        });
        leadYs.push(y);
      }
    }

    // vertical data bundle up the manager, then into each TOR's rear
    if (tors.length && leadYs.length) {
      const top = uY(tors[0].startU, 1);
      add('copper', routed([L(MGR.x, Math.min(...leadYs) - 0.01, MGR.z), L(MGR.x, top, MGR.z)]), RADIUS.bundle);
      for (const t of tors) {
        const y = uY(t.startU, 1);
        const rear = FRONT_FACE + MODELS[t.modelId].depth;
        add('copper', routed([L(MGR.x, y - 0.02, MGR.z), L(MGR.x, y, MGR.z - 0.04), L(0.09, y, rear + 0.08), L(0.05, y, rear + 0.008)], 0.05), RADIUS.uplink);
      }
    }

    // fibre: each TOR uplinks to two spines in the network rack
    if (netRack && rack.id !== netRack.id && spines.length) {
      tors.forEach((t, k) => {
        const y = uY(t.startU, 1);
        for (let j = 0; j < 2; j++) {
          const spine = spines[(fiberIdx + j) % spines.length];
          const off = ((fiberIdx * 2 + j) % 9 - 4) * 0.009;
          const dy = ((fiberIdx + j) % 3) * 0.006;
          const pts = [
            L(0.2 - k * 0.02 - j * 0.008, y, FRONT_FACE - 0.012),
            L(0.2 - k * 0.02 - j * 0.008, y, FRONT_FACE - 0.04),
            L(RISER_X, y, FRONT_FACE - 0.04),
            // straight up the front riser, over the raceway lip, down into it
            L(RISER_X, OVERHEAD.fiberY + 0.06, FRONT_FACE - 0.04),
          ];
          const up = L(RISER_X, 0, LANE.fiber);
          const zRow = laneZ(rack.row, LANE.fiber) + off;
          pts.push(v(up.x, OVERHEAD.fiberY + 0.06, zRow));
          pts.push(v(up.x + 0.03 * Math.sign(netRack.pos[0] - up.x || 1), OVERHEAD.fiberY - 0.02 + dy, zRow));
          pts.push(v(netRack.pos[0] + 0.03 + off, OVERHEAD.fiberY - 0.02 + dy, zRow));
          const nm = mats.get(netRack.id);
          const netRiser = W(nm, RISER_X, 0, LANE.fiber);
          const zNet = laneZ(netRack.row, LANE.fiber) + off;
          if (rack.row !== netRack.row) pts.push(v(netRack.pos[0] + 0.03 + off, OVERHEAD.fiberY - 0.02 + dy, zNet));
          pts.push(v(netRiser.x + off * 0.3, OVERHEAD.fiberY - 0.02 + dy, zNet));
          const sy = uY(spine.startU, 1);
          const lip = W(nm, RISER_X, OVERHEAD.fiberY + 0.06, LANE.fiber);
          pts.push(v(netRiser.x + off * 0.3 + 0.02, OVERHEAD.fiberY + 0.06, lip.z));
          pts.push(W(nm, RISER_X, OVERHEAD.fiberY + 0.06, FRONT_FACE - 0.04 - Math.abs(off) * 0.2));
          pts.push(W(nm, RISER_X, sy, FRONT_FACE - 0.04));
          const px = -0.2 + ((fiberIdx * 2 + j) % 18) * 0.024;
          pts.push(W(nm, px, sy, FRONT_FACE - 0.04));
          pts.push(W(nm, px, sy, FRONT_FACE - 0.012));
          add('fiber', routed(pts, 0.05), RADIUS.fiber);
          link(t.partId, 'uplinks', spine.partId);
          link(spine.partId, 'uplinks', t.partId);
        }
        fiberIdx++;
      });
      box('grommet', L(RISER_X - 0.01, RACK_H + 0.004, FRONT_FACE - 0.03), v(0.04, 0.008, 0.05));
    }

    // copper trunk: this rack's patch panel to a patch panel in the network rack
    const patch = units.find((u) => u.modelId === 'patch-24');
    if (patch && netRack && rack.id !== netRack.id && netPatches.length) {
      const target = netPatches[trunkIdx % netPatches.length];
      const off = ((trunkIdx % 7) - 3) * 0.022;
      const y = uY(patch.startU, 1);
      const rear = FRONT_FACE + MODELS['patch-24'].depth;
      const nm = mats.get(netRack.id);
      const zRow = laneZ(rack.row, LANE.copper) + off;
      const exit = L(-0.08, 0, LANE.copper);
      const pts = [L(-0.08, y, rear + 0.01), L(-0.08, y, LANE.copper), L(-0.08, RACK_H + 0.02, LANE.copper),
        v(exit.x, OVERHEAD.copperY - 0.025, zRow), v(netRack.pos[0] + 0.35 + off, OVERHEAD.copperY - 0.025, zRow)];
      if (rack.row !== netRack.row) pts.push(v(netRack.pos[0] + 0.35 + off, OVERHEAD.copperY - 0.025, laneZ(netRack.row, LANE.copper) + off));
      const entry = W(nm, -0.08 - off * 0.3, 0, LANE.copper);
      pts.push(v(entry.x, OVERHEAD.copperY - 0.025, laneZ(netRack.row, LANE.copper) + off));
      const ty = uY(target.startU, 1);
      pts.push(W(nm, -0.08 - off * 0.3, RACK_H + 0.02, LANE.copper));
      pts.push(W(nm, -0.08 - off * 0.3, ty, LANE.copper));
      pts.push(W(nm, -0.08 - off * 0.3, ty, FRONT_FACE + MODELS['patch-24'].depth + 0.01));
      add('copper', routed(pts, 0.07), RADIUS.trunk);
      link(`${rack.id} patch panel`, 'trunk', `${netRack.id} U${target.startU}`);
      box('grommet', L(-0.08, RACK_H + 0.004, LANE.copper), v(0.08, 0.008, 0.06));
      trunkIdx++;
    }
  }
  void UNIT_W;
  return { cables, boxes, connections };
}

/** Merge a cable class into one tube geometry (one draw call per class). */
export function tubeGeometry(list, mergeGeometries) {
  if (!list.length) return null;
  const geos = list.map(({ curve, r }) => {
    const len = curve.getLength();
    const seg = Math.max(6, Math.min(420, Math.ceil(len / 0.035)));
    return new THREE.TubeGeometry(curve, seg, r, r > 0.008 ? 8 : 5, false);
  });
  const merged = mergeGeometries(geos, false);
  geos.forEach((g) => g.dispose());
  return merged;
}
