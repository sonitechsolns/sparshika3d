import React from 'react';
import { Instances, Instance } from '@react-three/drei';

export const U = 0.04445;          // 1U in metres
export const RW = 0.6;             // rack width
export const RD = 1.0;             // rack depth
export const N_U = 42;
const PLINTH = 0.06;
const TOP = 0.06;
export const RACK_H = PLINTH + N_U * U + TOP;
const FRONT_Z = -RD / 2;           // local front (cold-aisle side)
const FRONT_FACE = FRONT_Z + 0.03; // front mounting plane

// y-centre of a unit spanning [startU, startU+heightU)
export const uY = (startU, heightU) => PLINTH + (startU - 1 + heightU / 2) * U;

function Cabinet() {
  const black = ['#0c0e12', 0.4, 0.55];
  const [c, m, r] = black;
  const posts = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  return (
    <group>
      {posts.map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (RW / 2 - 0.02), RACK_H / 2, sz * (RD / 2 - 0.02)]} castShadow>
          <boxGeometry args={[0.04, RACK_H, 0.04]} />
          <meshStandardMaterial color={c} metalness={m} roughness={r} />
        </mesh>
      ))}
      <mesh position={[0, PLINTH / 2, 0]}><boxGeometry args={[RW, PLINTH, RD]} /><meshStandardMaterial color={c} metalness={m} roughness={r} /></mesh>
      <mesh position={[0, RACK_H - TOP / 2, 0]}><boxGeometry args={[RW, TOP, RD]} /><meshStandardMaterial color={c} metalness={m} roughness={r} /></mesh>
      <mesh position={[-RW / 2 + 0.005, RACK_H / 2, 0]}><boxGeometry args={[0.01, RACK_H, RD]} /><meshStandardMaterial color={c} metalness={m} roughness={r} /></mesh>
      <mesh position={[RW / 2 - 0.005, RACK_H / 2, 0]}><boxGeometry args={[0.01, RACK_H, RD]} /><meshStandardMaterial color={c} metalness={m} roughness={r} /></mesh>
      <mesh position={[0, RACK_H / 2, RD / 2 - 0.005]}><boxGeometry args={[RW, RACK_H, 0.01]} /><meshStandardMaterial color={c} metalness={m} roughness={r} /></mesh>

      {/* front mounting rails */}
      {[-1, 1].map((s, i) => (
        <mesh key={i} position={[s * (RW / 2 - 0.04), PLINTH + (N_U * U) / 2, FRONT_FACE]}>
          <boxGeometry args={[0.02, N_U * U, 0.02]} />
          <meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.5} />
        </mesh>
      ))}

      {/* green status LED near the top of the door */}
      <mesh position={[RW / 2 - 0.06, RACK_H - TOP - 0.03, FRONT_FACE - 0.01]}>
        <boxGeometry args={[0.022, 0.016, 0.012]} />
        <meshStandardMaterial color="#0a3d14" emissive="#33ff66" emissiveIntensity={2.2} />
      </mesh>
    </group>
  );
}

function Unit({ startU, heightU, kind, partId, onServerSelect, onServerHover, onServerUnhover }) {
  const y = uY(startU, heightU);
  const h = heightU * U - 0.004;
  const w = RW - 0.06;

  if (kind === 'server') {
    const depth = 0.7;
    const n = 14;
    const handlers = {
      onPointerOver: (e) => { e.stopPropagation(); onServerHover && onServerHover(partId, e.object); },
      onPointerOut: (e) => { e.stopPropagation(); onServerUnhover && onServerUnhover(); },
      onClick: (e) => { e.stopPropagation(); onServerSelect && onServerSelect(partId, e.object); },
    };
    return (
      <group position={[0, y, 0]} {...handlers}>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#1a1d22" metalness={0.4} roughness={0.5} />
        </mesh>
        {/* drive bays */}
        {Array.from({ length: n }).map((_, k) => (
          <mesh key={k} position={[-w / 2 + 0.03 + (k * (w - 0.06)) / (n - 1), 0, FRONT_FACE - 0.004]}>
            <boxGeometry args={[0.018, h * 0.7, 0.008]} />
            <meshStandardMaterial color="#3a3f47" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        {/* orange pull tab + green activity LED */}
        <mesh position={[w / 2 - 0.03, h * 0.26, FRONT_FACE - 0.006]}>
          <boxGeometry args={[0.014, 0.012, 0.01]} />
          <meshStandardMaterial color="#5a2600" emissive="#ff7a1a" emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[w / 2 - 0.03, -h * 0.26, FRONT_FACE - 0.006]}>
          <boxGeometry args={[0.014, 0.008, 0.01]} />
          <meshStandardMaterial color="#0a3d14" emissive="#33ff66" emissiveIntensity={2.2} />
        </mesh>
      </group>
    );
  }

  if (kind === 'switch') {
    const depth = 0.35;
    const n = 12;
    return (
      <group position={[0, y, 0]}>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#14161a" metalness={0.4} roughness={0.5} />
        </mesh>
        {Array.from({ length: n }).map((_, k) => (
          <mesh key={k} position={[-w / 2 + 0.05 + (k * (w - 0.1)) / (n - 1), 0, FRONT_FACE - 0.003]}>
            <boxGeometry args={[0.008, 0.006, 0.006]} />
            <meshStandardMaterial color="#062611" emissive={k % 4 === 0 ? '#ffb020' : '#33ff66'} emissiveIntensity={2.6} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === 'storage') {
    const depth = 0.5;
    const n = 12;
    return (
      <group position={[0, y, 0]}>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#8b9099" metalness={0.3} roughness={0.5} />
        </mesh>
        {Array.from({ length: n }).map((_, k) => (
          <mesh key={k} position={[-w / 2 + 0.03 + (k * (w - 0.06)) / (n - 1), 0, FRONT_FACE - 0.004]}>
            <boxGeometry args={[0.022, h * 0.72, 0.008]} />
            <meshStandardMaterial color="#5a5f66" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
      </group>
    );
  }

  if (kind === 'pdu') {
    const depth = 0.5;
    return (
      <group position={[0, y, 0]}>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#0c0e12" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, h * 0.28, FRONT_FACE - 0.005]}>
          <boxGeometry args={[w * 0.42, 0.07, 0.006]} />
          <meshStandardMaterial color="#08222f" emissive="#2bb0ff" emissiveIntensity={1.6} />
        </mesh>
      </group>
    );
  }

  return null;
}

/**
 * A 42U rack. `units` is a list of mounted equipment ({ startU, heightU, kind });
 * every uncovered U is filled with an instanced blanking panel.
 */
export default function Rack({
  position = [0, 0, 0],
  rotationY = 0,
  units = [],
  onServerSelect,
  onServerHover,
  onServerUnhover,
}) {
  const covered = new Set();
  units.forEach((u) => {
    for (let k = 0; k < u.heightU; k++) covered.add(u.startU + k);
  });
  const blanks = [];
  for (let u = 1; u <= N_U; u++) if (!covered.has(u)) blanks.push(uY(u, 1));

  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <Cabinet />
      <Instances limit={Math.max(1, blanks.length)} castShadow>
        <boxGeometry args={[RW - 0.06, U - 0.004, 0.02]} />
        <meshStandardMaterial color="#15181d" metalness={0.3} roughness={0.75} />
        {blanks.map((by, i) => (
          <Instance key={i} position={[0, by, FRONT_FACE + 0.01]} />
        ))}
      </Instances>
      {units.map((u, i) => (
        <Unit
          key={i}
          {...u}
          onServerSelect={onServerSelect}
          onServerHover={onServerHover}
          onServerUnhover={onServerUnhover}
        />
      ))}
    </group>
  );
}
