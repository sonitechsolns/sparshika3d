// Shared EIA-310 rack dimensions (metres). Kept out of Rack.jsx so that file
// only exports components (React Fast Refresh requirement).
export const U = 0.04445;          // 1U in metres
export const RW = 0.6;             // rack width
export const RD = 1.0;             // rack depth
export const N_U = 42;
export const PLINTH = 0.06;
export const TOP = 0.06;
export const RACK_H = PLINTH + N_U * U + TOP;
export const FRONT_Z = -RD / 2;           // local front (cold-aisle side)
export const FRONT_FACE = FRONT_Z + 0.03; // front mounting plane

// y-centre of a unit spanning [startU, startU+heightU)
export const uY = (startU, heightU) => PLINTH + (startU - 1 + heightU / 2) * U;
