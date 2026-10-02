// layout.js
// The demo room: two rows of eleven 42U racks in a hot/cold-aisle layout, each
// rack built the way a real hall is — a redundant pair of top-of-rack (TOR)
// switches, a patch panel and cable manager at the top, workloads below,
// blanking panels in every empty U. Everything here is simulated filler; parts
// reported by the on-prem agent replace units in the slots they occupy.

import { MODELS } from './catalog';

export const ROW_Z = 1.25;          // |z| of each rack row's centre line
export const RACK_PITCH = 0.6;      // racks sit shoulder to shoulder
export const RACKS_PER_ROW = 11;
const X0 = -3.6;                    // first rack centre (door end is -X)

const pad = (n) => String(n).padStart(2, '0');

/** Stack `count` units of a model upward from `fromU`. */
function stack(rackId, modelId, fromU, count) {
  const h = MODELS[modelId].heightU;
  return Array.from({ length: count }, (_, i) => {
    const startU = fromU + i * h;
    return { startU, heightU: h, modelId, partId: `${rackId}-U${pad(startU)}` };
  });
}

/** Redundant TOR pair + patching at the top of a rack (U39–U42). */
function top(rackId) {
  return [
    { startU: 42, heightU: 1, modelId: 'dell-s5248f', partId: `${rackId}-U42` },
    { startU: 41, heightU: 1, modelId: 'dell-s5248f', partId: `${rackId}-U41` },
    { startU: 40, heightU: 1, modelId: 'patch-24' },
    { startU: 39, heightU: 1, modelId: 'cable-mgr' },
  ];
}

// Rack roles. Each returns the rack's units (bottom-up is fine; order doesn't matter).
const ROLES = {
  compute: (id) => [...top(id), ...stack(id, 'dell-r760', 3, 16)],               // 16× R760, U3–U34
  dense: (id) => [...top(id), ...stack(id, 'dell-r660', 5, 30)],                 // 30× R660, U5–U34
  hpe: (id) => [...top(id), ...stack(id, 'hpe-dl380g11', 3, 16)],                // 16× DL380 Gen11
  dgx: (id) => [...top(id), ...stack(id, 'nvidia-dgx-h100', 3, 4)],              // 4× DGX H100 (≈41 kW)
  gpu: (id) => [...top(id), ...stack(id, 'smc-sys421ge', 3, 7)],                 // 7× 8-GPU 4U nodes
  storage: (id) => [
    ...top(id),
    ...stack(id, 'dell-me5024', 3, 12),                                          // 12× ME5024 arrays
    { startU: 28, heightU: 1, modelId: 'kvm-1u', partId: undefined },
  ],
  network: (id) => [
    ...stack(id, 'cisco-n9k-9336c', 36, 4),                                      // spine layer
    ...stack(id, 'dell-s5248f', 28, 4),                                          // border / aggregation
    ...[34, 32, 26, 24, 22, 20].map((u) => ({ startU: u, heightU: 1, modelId: 'patch-24' })),
    ...[35, 33, 27, 25, 23, 21].map((u) => ({ startU: u, heightU: 1, modelId: 'cable-mgr' })),
    { startU: 40, heightU: 1, modelId: 'kvm-1u' },
  ],
  power: (id) => [
    ...stack(id, 'apc-srt5k', 1, 3),                                             // 3× 5 kVA UPS, U1–U9
    ...stack(id, 'apc-srt-bp', 10, 6),                                           // 6× battery packs, U10–U21
  ],
};

// Row A (-Z, fronts face -Z) and row B (+Z, fronts face +Z), door end first.
// RACK-03 keeps the pilot agent's parts (GPU-PILOT-01, R760-A17, TOR-SW-03).
const ROW_A = ['compute', 'compute', 'compute', 'dense', 'hpe', 'network', 'dgx', 'dgx', 'gpu', 'storage', 'power'];
const ROW_B = ['compute', 'hpe', 'dense', 'compute', 'hpe', 'storage', 'gpu', 'dgx', 'dense', 'compute', 'power'];

export const ROLE_LABEL = {
  compute: 'Compute', dense: 'Compute (1U)', hpe: 'Compute', dgx: 'AI / GPU', gpu: 'AI / GPU',
  storage: 'Storage', network: 'Network core', power: 'Power',
};

export const RACK_LAYOUT = [
  ...ROW_A.map((role, i) => {
    const id = `RACK-${pad(i + 1)}`;
    return { id, role, row: 'A', pos: [X0 + i * RACK_PITCH, 0, -ROW_Z], rot: 0, units: ROLES[role](id) };
  }),
  ...ROW_B.map((role, i) => {
    const id = `RACK-${pad(i + 12)}`;
    return { id, role, row: 'B', pos: [X0 + i * RACK_PITCH, 0, ROW_Z], rot: Math.PI, units: ROLES[role](id) };
  }),
];

// Room-level cooling: two perimeter CRAC units at the far (+X) end, one per row.
export const CRACS = [
  { partId: 'CRAC-01', pos: [4.35, 0, -ROW_Z], rot: Math.PI / 2 },
  { partId: 'CRAC-02', pos: [4.35, 0, ROW_Z], rot: Math.PI / 2 },
];
