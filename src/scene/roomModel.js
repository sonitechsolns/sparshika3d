// roomModel.js — flattens the rack layout into instanced batches (pure data;
// the renderer is RoomRacks.jsx).
import * as THREE from 'three';
import { MATS, MODELS, UNIT_W, faceOf, isSelectable } from '../data/catalog';
import { registerParts } from '../data/telemetry';
import { U, RW, RD, N_U, PLINTH, TOP, RACK_H, FRONT_FACE, uY } from './rackGeometry';

export const BOX = new THREE.BoxGeometry(1, 1, 1);

export const ROOM_MATS = {
  ...MATS,
  rackFrame: { color: '#1b1f26', metalness: 0.45, roughness: 0.55 },
  rackRail: { color: '#3a3f47', metalness: 0.6, roughness: 0.5 },
};

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();

function trs(x, y, z, sx = 1, sy = 1, sz = 1) {
  return new THREE.Matrix4().compose(_v.set(x, y, z), _q.identity(), _s.set(sx, sy, sz));
}

/**
 * Flatten racks into instanced batches. Every unit gets:
 *   world  — its frame (origin at the front mounting plane, unit centre)
 *   anchor — world position + front direction, for hover cards and the camera
 * Batches are keyed by material; `owner` maps each instance back to its unit
 * (-1 = rack furniture) so a pulled-out unit can be hidden from the batches.
 */
export function buildRoom(racks) {
  const units = [];
  const byPart = new Map();
  const batches = {};
  const acts = { m: [], owner: [], color: [] };
  const leds = { m: [], owner: [] };
  const hits = { m: [], owner: [] };
  const push = (key, m, owner) => {
    (batches[key] ||= { m: [], owner: [] });
    batches[key].m.push(m);
    batches[key].owner.push(owner);
  };

  for (const rack of racks) {
    const rackM = new THREE.Matrix4().compose(
      _v.set(...rack.pos), _q.setFromEuler(_e.set(0, rack.rot, 0)), _s.set(1, 1, 1));
    const R = (local) => new THREE.Matrix4().multiplyMatrices(rackM, local);

    // Cabinet: posts, plinth, roof, side + rear panels, front rails.
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      push('rackFrame', R(trs(sx * (RW / 2 - 0.02), RACK_H / 2, sz * (RD / 2 - 0.02), 0.04, RACK_H, 0.04)), -1);
    }
    push('rackFrame', R(trs(0, PLINTH / 2, 0, RW, PLINTH, RD)), -1);
    push('rackFrame', R(trs(0, RACK_H - TOP / 2, 0, RW, TOP, RD)), -1);
    push('rackFrame', R(trs(-RW / 2 + 0.005, RACK_H / 2, 0, 0.01, RACK_H, RD)), -1);
    push('rackFrame', R(trs(RW / 2 - 0.005, RACK_H / 2, 0, 0.01, RACK_H, RD)), -1);
    push('rackFrame', R(trs(0, RACK_H / 2, RD / 2 - 0.005, RW, RACK_H, 0.01)), -1);
    for (const s of [-1, 1]) {
      push('rackRail', R(trs(s * (RW / 2 - 0.04), PLINTH + (N_U * U) / 2, FRONT_FACE, 0.02, N_U * U, 0.02)), -1);
    }

    const covered = new Set();
    for (const u of rack.units) {
      const model = MODELS[u.modelId];
      if (!model) continue;
      for (let k = 0; k < u.heightU; k++) covered.add(u.startU + k);
      const world = R(trs(0, uY(u.startU, u.heightU), FRONT_FACE));
      const selectable = !!u.partId && isSelectable(u.modelId);
      const idx = units.length;
      const pos = new THREE.Vector3().setFromMatrixPosition(world);
      const front = new THREE.Vector3(0, 0, -1).applyQuaternion(_q.setFromRotationMatrix(world)).normalize();
      units.push({ ...u, rackId: rack.id, world, selectable, anchor: { pos, front } });
      if (u.partId) byPart.set(u.partId, idx);

      const face = faceOf(u.modelId);
      const W = (m) => new THREE.Matrix4().multiplyMatrices(world, m);
      for (const p of face.prims) push(p.m, W(trs(p.x, p.y, p.z, p.w, p.h, p.d)), idx);
      for (const a of face.acts) {
        acts.m.push(W(trs(a.x, a.y, a.z, 0.0035, 0.0035, 0.0025)));
        acts.owner.push(idx);
        acts.color.push(a.c);
      }
      if (face.led && selectable) {
        leds.m.push(W(trs(face.led.x, face.led.y, -0.012, 0.012, 0.012, 0.008)));
        leds.owner.push(idx);
      }
      if (selectable) {
        const H = u.heightU * U - 0.004;
        const depth = model.depth;
        hits.m.push(W(trs(0, 0, (depth - 0.04) / 2, UNIT_W, H, depth + 0.04)));
        hits.owner.push(idx);
      }
    }
    // Blanking panels in every empty U.
    for (let u = 1; u <= N_U; u++) {
      if (!covered.has(u)) push('bezel', R(trs(0, uY(u, 1), FRONT_FACE + 0.01, UNIT_W, U - 0.004, 0.02)), -1);
    }
  }

  registerParts(units.filter((u) => u.partId).map(({ partId, modelId, rackId, startU, heightU }) =>
    ({ partId, modelId, rackId, startU, heightU })));

  return { units, byPart, batches, acts, leds, hits };
}

