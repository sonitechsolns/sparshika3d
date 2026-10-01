import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { MATS, MODELS, UNIT_W, faceOf } from '../data/catalog';
import { getTelemetry, severity } from '../data/telemetry';
import { U } from './rackGeometry';

const FAN_RING = { critical: '#ff2b2b', warning: '#ffb020', offline: '#4a5568', optimal: '#2bff6a' };
const LED = { critical: '#ff2b2b', warning: '#ffb020', offline: '#4a5568', optimal: '#2bff6a' };

/** Private material set: the room's shared materials get dimmed while a unit
 *  is in focus, so the focused unit needs its own. */
function useMats() {
  const mats = useMemo(() => {
    const out = {};
    for (const [k, spec] of Object.entries(MATS)) out[k] = new THREE.MeshStandardMaterial(spec);
    out.pcb = new THREE.MeshStandardMaterial({ color: '#0e3a24', metalness: 0.2, roughness: 0.7 });
    out.dimm = new THREE.MeshStandardMaterial({ color: '#14603a', metalness: 0.3, roughness: 0.6 });
    out.fin = new THREE.MeshStandardMaterial({ color: '#aeb4bd', metalness: 0.85, roughness: 0.25 });
    out.sink = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.6, roughness: 0.4 });
    out.battery = new THREE.MeshStandardMaterial({ color: '#23262b', metalness: 0.2, roughness: 0.8 });
    out.tray = new THREE.MeshStandardMaterial({ color: '#20242b', metalness: 0.4, roughness: 0.5 });
    return out;
  }, []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);
  return mats;
}

/** Floating tag over the highlighted component: what it is and its state. */
function ComponentLabel({ partId, y }) {
  const [t, setT] = useState(() => getTelemetry(partId));
  useEffect(() => {
    const id = setInterval(() => setT(getTelemetry(partId)), 1000);
    return () => clearInterval(id);
  }, [partId]);
  const sev = severity(t.condition, t.source);
  const m = String(partId).match(/-(FAN|PSU)-(\d+)$/);
  const name = m ? `${m[1] === 'PSU' ? 'Power supply' : 'Fan'} ${m[2]}` : partId;
  const value = t.rpm != null ? `${Number(t.rpm).toLocaleString()} RPM` : t.power != null ? `${t.power} W` : '';
  return (
    <Html position={[0, y, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
      <div className={`comp-tag comp-tag--${sev}`}>
        <b>{name}</b> {value} · {t.condition}
      </div>
    </Html>
  );
}

/** Pulse helper for highlighted components. */
const pulse = (t) => 0.5 + 0.5 * Math.sin(t * 6);

function Box({ p, s, m }) {
  return (
    <mesh position={p} material={m}>
      <boxGeometry args={s} />
    </mesh>
  );
}

/**
 * One fan module: spins at its reported RPM (scaled so it reads as rotation,
 * not a strobe), ring glows with its condition, clickable like any part.
 */
function Fan({ x, y, z, r, len, partId, hostId, mats, onSelectComponent, onHover, onUnhover, focused }) {
  const rotor = useRef();
  const ring = useRef();
  const halo = useRef();
  const state = useRef({ rpm: 0 });

  useEffect(() => {
    const read = () => {
      const t = getTelemetry(partId);
      state.current.rpm = Number(t.rpm) || 0;
      const col = FAN_RING[severity(t.condition, t.source)];
      if (ring.current) { ring.current.color.set(col); ring.current.emissive.set(col); }
      if (halo.current) halo.current.color.set(col);
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [partId]);

  useFrame(({ clock }, delta) => {
    if (rotor.current) rotor.current.rotation.y += (state.current.rpm / 2000) * Math.PI * 2 * delta;
    if (focused) {
      const k = pulse(clock.elapsedTime);
      if (ring.current) ring.current.emissiveIntensity = 1.6 + 2.4 * k;
      if (halo.current) halo.current.opacity = 0.25 + 0.55 * k;
    } else if (ring.current && ring.current.emissiveIntensity !== 1.6) {
      ring.current.emissiveIntensity = 1.6;
    }
  });

  const handlers = {
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(partId, e.object); },
    onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover?.(); },
    onClick: (e) => { e.stopPropagation(); if (e.delta > 6) return; onSelectComponent?.(partId, hostId); },
  };

  return (
    <group position={[x, y, z]} rotation={[Math.PI / 2, 0, 0]} {...handlers}>
      <mesh material={mats.carrier}>
        <cylinderGeometry args={[r, r, len, 20, 1, true]} />
      </mesh>
      <mesh position={[0, -len / 2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 0.97, r * 0.07, 6, 24]} />
        <meshStandardMaterial ref={ring} color="#2bff6a" emissive="#2bff6a" emissiveIntensity={1.6} toneMapped={false} />
      </mesh>
      {focused && (
        <mesh position={[0, -len / 2 - 0.004, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r * 1.18, r * 0.12, 8, 32]} />
          <meshBasicMaterial ref={halo} color="#ff2b2b" transparent opacity={0.6} toneMapped={false} depthWrite={false} />
        </mesh>
      )}
      <group ref={rotor}>
        <mesh material={mats.bezel}>
          <cylinderGeometry args={[r * 0.32, r * 0.32, len * 0.6, 14]} />
        </mesh>
        {Array.from({ length: 5 }).map((_, k) => (
          <mesh key={k} rotation={[0, (k * Math.PI * 2) / 5, 0.35]} material={mats.ear}>
            <boxGeometry args={[r * 1.72, len * 0.12, r * 0.34]} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** A bank of fans across the chassis width; two rows when there are many. */
function FanBank({ n, z, H, ids, focus, ...rest }) {
  const rows = n > 8 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const r = Math.min((H / rows) * 0.42, (UNIT_W - 0.05) / perRow / 2 - 0.003);
  const len = Math.min(0.06, H * 0.86);
  const out = [];
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    const span = UNIT_W - 0.05 - 2 * r;
    // fan 1 is leftmost facing the front, i.e. the highest local x
    const x = perRow === 1 ? 0 : span / 2 - (col * span) / (perRow - 1);
    const y = rows === 1 ? 0 : (row === 0 ? H / 4 : -H / 4);
    out.push(<Fan key={i} x={x} y={y} z={z} r={r} len={len} partId={ids[i]} focused={focus === ids[i]} {...rest} />);
    if (focus === ids[i]) out.push(<group key="tag" position={[x, y, z]}><ComponentLabel partId={ids[i]} y={H / 2 + 0.05} /></group>);
  }
  return <>{out}</>;
}

/** A hot-swap power supply: clickable, red when it has failed. */
function Psu({ p, s, partId, mats, focused, hostId, onSelectComponent, onHover, onUnhover }) {
  const body = useMemo(() => mats.chassis.clone(), [mats]);
  const led = useRef();
  const halo = useRef();
  const bad = useRef(false);
  useEffect(() => () => body.dispose(), [body]);
  useEffect(() => {
    const read = () => {
      const t = getTelemetry(partId);
      const sev = severity(t.condition, t.source);
      bad.current = sev === 'critical';
      body.color.set(bad.current ? '#7a1a1a' : mats.chassis.color);
      body.emissive.set(bad.current ? '#ff2b2b' : '#000000');
      body.emissiveIntensity = bad.current ? 0.5 : 0;
      if (led.current) { led.current.color.set(LED[sev]); led.current.emissive.set(LED[sev]); }
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [partId, body, mats]);
  useFrame(({ clock }) => {
    if (!focused) return;
    const k = pulse(clock.elapsedTime);
    if (bad.current) body.emissiveIntensity = 0.4 + 1.2 * k;
    if (halo.current) halo.current.opacity = 0.15 + 0.4 * k;
  });
  const handlers = {
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(partId, e.object); },
    onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover?.(); },
    onClick: (e) => { e.stopPropagation(); if (e.delta > 6) return; onSelectComponent?.(partId, hostId); },
  };
  return (
    <group position={p}>
      <mesh material={body} {...handlers}>
        <boxGeometry args={s} />
      </mesh>
      <mesh position={[s[0] * 0.3, s[1] * 0.25, s[2] / 2 + 0.002]}>
        <boxGeometry args={[0.008, 0.008, 0.003]} />
        <meshStandardMaterial ref={led} color="#2bff6a" emissive="#2bff6a" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {focused && (<>
        <mesh>
          <boxGeometry args={[s[0] + 0.02, s[1] + 0.02, s[2] + 0.02]} />
          <meshBasicMaterial ref={halo} color="#ff2b2b" transparent opacity={0.4} toneMapped={false} depthWrite={false} />
        </mesh>
        <ComponentLabel partId={partId} y={s[1] / 2 + 0.06} />
      </>)}
    </group>
  );
}

function Heatsink({ x, z, w, d, h, y, mats, fins = 9 }) {
  return (
    <group position={[x, y, z]}>
      <Box p={[0, -h * 0.3, 0]} s={[w, h * 0.35, d]} m={mats.sink} />
      {Array.from({ length: fins }).map((_, k) => (
        <Box key={k} p={[-w / 2 + (k + 0.5) * (w / fins), h * 0.12, 0]} s={[0.004, h * 0.62, d]} m={mats.fin} />
      ))}
    </group>
  );
}

/** Category-specific guts, laid out front → back along +z. */
function Internals({ model, H, depth, fanIds, mats, fanProps, unitId, focus }) {
  const yb = -H / 2 + 0.006;
  const cat = model.category;
  const inner = model.internals || {};
  const nFan = inner.fans || 0;
  const board = <Box p={[0, yb + 0.002, depth / 2]} s={[UNIT_W - 0.02, 0.004, depth - 0.04]} m={mats.pcb} />;
  const hMax = Math.min(H * 0.8, 0.12);                    // component height inside the chassis
  const psus = (n, z) => Array.from({ length: n }, (_, i) => {
    const w = (UNIT_W - 0.04) / n;
    const id = `${unitId}-PSU-${i + 1}`;
    return <Psu key={`psu${i}`} partId={id} focused={focus === id} p={[-UNIT_W / 2 + 0.02 + w * (i + 0.5), yb + hMax / 2, z]}
      s={[w - 0.01, hMax, 0.09]} mats={mats} {...fanProps} />;
  });

  if (cat === 'server') {
    const zFan = 0.14, zRam1 = 0.27, zCpu = 0.42, zRam2 = 0.57;
    return (
      <group>
        {board}
        {nFan > 0 && <FanBank focus={focus} n={nFan} z={zFan} H={H} ids={fanIds} mats={mats} {...fanProps} />}
        {[zRam1, zRam2].map((z, r) => Array.from({ length: (inner.dimms || 16) / 2 }).map((_, k, arr) => (
          <Box key={`d${r}-${k}`} p={[-UNIT_W * 0.42 + (k * UNIT_W * 0.84) / (arr.length - 1), yb + hMax * 0.45, z]}
            s={[0.004, hMax * 0.8, 0.1]} m={mats.dimm} />
        )))}
        {[-UNIT_W * 0.2, UNIT_W * 0.2].map((x, i) => (
          <Heatsink key={i} x={x} y={yb + hMax / 2} z={zCpu} w={UNIT_W * 0.3} d={0.13} h={hMax} mats={mats} />
        ))}
        {psus(inner.psus || 2, depth - 0.07)}
      </group>
    );
  }

  if (cat === 'gpu') {
    const n = inner.gpus || 8;
    const cols = n > 4 ? 4 : n;
    const rowsZ = n > 4 ? [0.3, 0.52] : [0.36];
    const gw = (UNIT_W - 0.06) / cols;
    const gh = Math.min(H * 0.7, 0.16);
    return (
      <group>
        {board}
        {nFan > 0 && <FanBank focus={focus} n={nFan} z={0.1} H={H} ids={fanIds} mats={mats} {...fanProps} />}
        {rowsZ.map((z, r) => Array.from({ length: cols }).map((_, c) => (
          <group key={`g${r}-${c}`}>
            <Heatsink x={-UNIT_W / 2 + 0.03 + gw * (c + 0.5)} y={yb + gh / 2} z={z} w={gw - 0.012} d={0.17} h={gh} mats={mats} fins={7} />
            <Box p={[-UNIT_W / 2 + 0.03 + gw * (c + 0.5), yb + gh + 0.003, z - 0.07]} s={[gw - 0.02, 0.004, 0.012]} m={mats.nvGreen} />
          </group>
        )))}
        {[-UNIT_W * 0.2, UNIT_W * 0.2].map((x, i) => (
          <Heatsink key={i} x={x} y={yb + Math.min(hMax, 0.06) / 2} z={0.68} w={UNIT_W * 0.22} d={0.09} h={Math.min(hMax, 0.06)} mats={mats} />
        ))}
        {psus(inner.psus || 4, depth - 0.07)}
      </group>
    );
  }

  if (cat === 'storage') {
    return (
      <group>
        {board}
        <Box p={[0, 0, 0.3]} s={[UNIT_W - 0.03, H * 0.85, 0.01]} m={mats.pcb} />
        {/* power-supply / cooling modules at the rear */}
        {psus(inner.psus || 2, depth - 0.1)}
        {nFan > 0 && <FanBank focus={focus} n={nFan} z={0.4} H={H} ids={fanIds} mats={mats} {...fanProps} />}
      </group>
    );
  }

  if (cat === 'switch') {
    return (
      <group>
        {board}
        <Heatsink x={0} y={yb + hMax / 2} z={0.18} w={0.14} d={0.14} h={hMax} mats={mats} fins={12} />
        {psus(inner.psus || 2, depth - 0.1).map((el, i) => React.cloneElement(el, { key: `p${i}` }))}
        {nFan > 0 && <FanBank focus={focus} n={nFan} z={depth - 0.04} H={H} ids={fanIds} mats={mats} {...fanProps} />}
      </group>
    );
  }

  if (cat === 'ups') {
    const nb = inner.batteries || 8;
    const cols = nb / 2;
    return (
      <group>
        {board}
        {[0.2, 0.38].map((z, r) => Array.from({ length: cols }).map((_, c) => (
          <Box key={`b${r}-${c}`} p={[-UNIT_W / 2 + 0.03 + ((UNIT_W - 0.06) / cols) * (c + 0.5), yb + H * 0.4, z]}
            s={[(UNIT_W - 0.06) / cols - 0.012, H * 0.75, 0.16]} m={mats.battery} />
        )))}
        {nFan > 0 && <FanBank focus={focus} n={nFan} z={depth - 0.05} H={H} ids={fanIds} mats={mats} {...fanProps} />}
      </group>
    );
  }
  return board;
}

/**
 * The unit an operator pulled out: identical front panel to the instanced
 * version, but with an open tray, a hinged lid and working internals. It slides
 * out on mount and slides back before handing control back to the room
 * (`onClosed`), so the swap with the instanced copy is seamless.
 */
export default function DetailedUnit({ unit, open, liveFans, focusComponent, onClosed, onSelectUnit, onSelectComponent, onHover, onUnhover }) {
  const mats = useMats();
  const model = MODELS[unit.modelId];
  const face = faceOf(unit.modelId);
  const H = unit.heightU * U - 0.004;
  const depth = model.depth;
  const slide = useRef();
  const lid = useRef();
  const led = useRef();
  const closedOnce = useRef(false);

  const nFan = model.internals?.fans || 0;
  const fanIds = useMemo(() => {
    if (liveFans?.length) return liveFans;
    return Array.from({ length: nFan }, (_, i) => `${unit.partId}-FAN-${i + 1}`);
  }, [liveFans, nFan, unit.partId]);

  useEffect(() => {
    const read = () => {
      const t = getTelemetry(unit.partId);
      const col = LED[severity(t.condition, t.source)];
      if (led.current) { led.current.color.set(col); led.current.emissive.set(col); }
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [unit.partId]);

  useEffect(() => { if (open) closedOnce.current = false; }, [open]);

  useFrame((_, delta) => {
    const s = slide.current;
    if (!s) return;
    s.position.z = THREE.MathUtils.damp(s.position.z, open ? -0.5 : 0, 12, delta);
    if (lid.current) lid.current.rotation.x = THREE.MathUtils.damp(lid.current.rotation.x, open ? 1.95 : 0, 10, delta);
    if (!open && Math.abs(s.position.z) < 0.003 && !closedOnce.current) {
      closedOnce.current = true;
      onClosed?.();
    }
  });

  const fanProps = { hostId: unit.partId, onSelectComponent, onHover: (id, obj) => onHover?.(id, obj, true), onUnhover };
  const unitHandlers = {
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(unit.partId, e.object, true); },
    onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover?.(); },
    onClick: (e) => { e.stopPropagation(); if (e.delta > 6) return; onSelectUnit?.(unit); },
  };

  return (
    <group matrix={unit.world} matrixAutoUpdate={false}>
      <group ref={slide} userData={{ partId: unit.partId }}>
        {/* front panel, minus the solid chassis block */}
        <group {...unitHandlers}>
          {face.prims.filter((p) => p.role !== 'chassis').map((p, i) => (
            <Box key={i} p={[p.x, p.y, p.z]} s={[p.w, p.h, p.d]} m={mats[p.m] || mats.bezel} />
          ))}
          {face.acts.map((a, i) => (
            <mesh key={`a${i}`} position={[a.x, a.y, a.z]}>
              <boxGeometry args={[0.0035, 0.0035, 0.0025]} />
              <meshBasicMaterial color={a.c} toneMapped={false} />
            </mesh>
          ))}
          {face.led && (
            <mesh position={[face.led.x, face.led.y, -0.012]}>
              <sphereGeometry args={[0.006, 10, 8]} />
              <meshStandardMaterial ref={led} color="#2bff6a" emissive="#2bff6a" emissiveIntensity={2} toneMapped={false} />
            </mesh>
          )}
          {/* open tray: floor, side walls, rear wall */}
          <Box p={[0, -H / 2 + 0.004, depth / 2]} s={[UNIT_W, 0.008, depth]} m={mats.tray} />
          {[-1, 1].map((s) => <Box key={s} p={[s * (UNIT_W / 2 - 0.004), 0, depth / 2]} s={[0.008, H, depth]} m={mats.tray} />)}
          <Box p={[0, 0, depth - 0.004]} s={[UNIT_W, H, 0.008]} m={mats.tray} />
        </group>

        <Internals model={model} H={H} depth={depth} fanIds={fanIds} mats={mats} fanProps={fanProps}
          unitId={unit.partId} focus={focusComponent} />

        {/* hinged top cover, pivoting on the rear-top edge */}
        <group ref={lid} position={[0, H / 2, depth]}>
          <Box p={[0, 0, -depth / 2]} s={[UNIT_W, 0.006, depth]} m={mats.bezel} />
        </group>
      </group>
    </group>
  );
}
