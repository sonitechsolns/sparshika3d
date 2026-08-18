import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Instances, Instance } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTelemetry } from '../data/telemetry';

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
  const black = ['#1b1f26', 0.45, 0.55];
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

// Status-LED placement: a small dot on the left edge of a unit's front face,
// standing slightly proud so it reads from across the room.
const LED_X = -(RW - 0.06) / 2 + 0.02;
const LED_Z = FRONT_FACE - 0.016;

// Map a telemetry condition string to a colour + pulse profile. Higher-severity
// states glow brighter and throb faster so trouble draws the eye from the
// room overview. Offline shows a dim, steady grey (present but dark).
function ledStyle(condition) {
  const c = String(condition || '').toLowerCase();
  if (c.includes('critical') || c.includes('fault'))
    return { color: '#ff2b2b', base: 1.4, amp: 2.8, speed: 7.5 };
  if (c.includes('offline'))
    return { color: '#4a5568', base: 0.18, amp: 0.0, speed: 0 };
  if (c.includes('warn') || c.includes('maintenance'))
    return { color: '#ffb020', base: 1.1, amp: 1.5, speed: 3.4 };
  return { color: '#2bff6a', base: 1.1, amp: 0.8, speed: 1.7 }; // Optimal
}

/**
 * Per-unit status LED wired to its part's telemetry condition. Samples the
 * condition on a jittered ~2.5s timer (not per frame — getTelemetry advances
 * the sim walk on every read) and pulses the emissive glow each frame.
 */
function StatusLed({ partId }) {
  const mat = useRef();
  const [cond, setCond] = useState(() => (partId ? getTelemetry(partId).condition : 'Optimal'));
  useEffect(() => {
    if (!partId) return undefined;
    const id = setInterval(() => setCond(getTelemetry(partId).condition), 2200 + Math.random() * 1200);
    return () => clearInterval(id);
  }, [partId]);
  const style = useMemo(() => ledStyle(cond), [cond]);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []); // desync the pulses
  useFrame((state) => {
    if (!mat.current) return;
    const t = state.clock.elapsedTime;
    mat.current.emissiveIntensity = style.base + style.amp * (0.5 + 0.5 * Math.sin(t * style.speed + phase));
  });
  if (!partId) return null;
  return (
    <mesh position={[LED_X, 0, LED_Z]}>
      <sphereGeometry args={[0.011, 12, 12]} />
      <meshStandardMaterial
        ref={mat}
        color={style.color}
        emissive={style.color}
        emissiveIntensity={style.base}
        toneMapped={false}
      />
    </mesh>
  );
}

function Unit({ startU, heightU, kind, partId, pulled, onSelect, onHover, onUnhover }) {
  const y = uY(startU, heightU);
  const h = heightU * U - 0.004;
  const w = RW - 0.06;
  const slide = useRef();

  // Slide the selected unit ~0.5m out of the rack (local -Z, the front) and
  // ease it back when deselected — ~0.3s via exponential damping.
  useFrame((_, delta) => {
    if (!slide.current) return;
    const target = pulled === partId ? -0.5 : 0;
    slide.current.position.z = THREE.MathUtils.damp(slide.current.position.z, target, 16, delta);
  });

  // Every mounted unit with a partId is selectable → telemetry.
  const handlers = partId
    ? {
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover && onHover(partId, e.object); },
        onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover && onUnhover(); },
        onClick: (e) => { e.stopPropagation(); onSelect && onSelect(partId, e.object); },
      }
    : {};

  let content = null;
  if (kind === 'server') {
    const depth = 0.7;
    const n = 14;
    content = (
      <>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#2a2f38" metalness={0.4} roughness={0.5} />
        </mesh>
        {Array.from({ length: n }).map((_, k) => (
          <mesh key={k} position={[-w / 2 + 0.03 + (k * (w - 0.06)) / (n - 1), 0, FRONT_FACE - 0.004]}>
            <boxGeometry args={[0.018, h * 0.7, 0.008]} />
            <meshStandardMaterial color="#3a3f47" metalness={0.4} roughness={0.5} />
          </mesh>
        ))}
        <mesh position={[w / 2 - 0.03, h * 0.26, FRONT_FACE - 0.006]}>
          <boxGeometry args={[0.014, 0.012, 0.01]} />
          <meshStandardMaterial color="#5a2600" emissive="#ff7a1a" emissiveIntensity={1.6} />
        </mesh>
        <mesh position={[w / 2 - 0.03, -h * 0.26, FRONT_FACE - 0.006]}>
          <boxGeometry args={[0.014, 0.008, 0.01]} />
          <meshStandardMaterial color="#0a3d14" emissive="#33ff66" emissiveIntensity={2.2} />
        </mesh>
      </>
    );
  } else if (kind === 'switch') {
    const depth = 0.35;
    const n = 12;
    content = (
      <>
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
      </>
    );
  } else if (kind === 'storage') {
    const depth = 0.5;
    const n = 12;
    content = (
      <>
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
      </>
    );
  } else if (kind === 'pdu') {
    const depth = 0.5;
    content = (
      <>
        <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
          <boxGeometry args={[w, h, depth]} />
          <meshStandardMaterial color="#0c0e12" metalness={0.4} roughness={0.5} />
        </mesh>
      </>
    );
  } else {
    return null;
  }

  return (
    <group position={[0, y, 0]}>
      <group ref={slide} userData={{ partId }} {...handlers}>
        {content}
        <StatusLed partId={partId} />
      </group>
    </group>
  );
}

/**
 * A 42U rack. `units` is a list of mounted equipment ({ startU, heightU, kind });
 * every uncovered U is filled with an instanced blanking panel.
 */
export default function Rack({
  position = [0, 0, 0],
  rotationY = 0,
  units = [],
  pulled,
  onSelect,
  onHover,
  onUnhover,
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
        <meshStandardMaterial color="#20242b" metalness={0.3} roughness={0.75} />
        {blanks.map((by, i) => (
          <Instance key={i} position={[0, by, FRONT_FACE + 0.01]} />
        ))}
      </Instances>
      {units.map((u, i) => (
        <Unit key={i} {...u} pulled={pulled} onSelect={onSelect} onHover={onHover} onUnhover={onUnhover} />
      ))}
    </group>
  );
}
