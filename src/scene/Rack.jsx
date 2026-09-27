import React, { Suspense, useRef, useState, useEffect, useMemo } from 'react';
import { Instances, Instance, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { getTelemetry, severity } from '../data/telemetry';
import { U, RW, RD, N_U, PLINTH, TOP, RACK_H, FRONT_FACE, uY } from './rackGeometry';

// Bundled font for 3D text. Without an explicit font, troika-three-text fetches
// font data from cdn.jsdelivr.net at runtime — on a firewalled network that
// request fails and the suspended <Text> blanks the ENTIRE scene.
const TEXT_FONT = `${import.meta.env.BASE_URL}fonts/Inter-SemiBold.woff`;

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

// Map a part's severity to a colour + pulse profile. Higher-severity states
// glow brighter and throb faster so trouble draws the eye from the room
// overview. Offline — and stale (agent stopped reporting) — shows a dim, steady
// grey: we don't know the part's state, so it must not look healthy.
const LED_STYLES = {
  critical: { color: '#ff2b2b', base: 1.4, amp: 2.8, speed: 7.5 },
  offline: { color: '#4a5568', base: 0.18, amp: 0.0, speed: 0 },
  warning: { color: '#ffb020', base: 1.1, amp: 1.5, speed: 3.4 },
  optimal: { color: '#2bff6a', base: 1.1, amp: 0.8, speed: 1.7 },
};
function ledStyle(partId) {
  const t = getTelemetry(partId);
  return LED_STYLES[severity(t.condition, t.source)];
}

// Unlit thermal-glow shader for the instanced status LEDs. Each instance carries
// its own colour and pulse params (base/amp/speed/phase) so a single draw call
// animates a whole rack's LEDs; raw output keeps them bright like the old
// emissive material.
const LED_VERT = /* glsl */`
  attribute vec4 aData;   // base, amp, speed, phase
  attribute vec3 aColor;
  uniform float uTime;
  varying vec3 vColor;
  void main() {
    float glow = aData.x + aData.y * (0.5 + 0.5 * sin(uTime * aData.z + aData.w));
    vColor = aColor * glow;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const LED_FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

/**
 * All of a rack's per-unit status LEDs in ONE InstancedMesh (one draw call
 * instead of one mesh per unit). Each LED's colour + pulse is driven by its
 * part's telemetry condition, resampled on a ~2.5s timer; the pulled unit's LED
 * slides out with its chassis. Replaces the old per-unit <StatusLed>.
 */
function RackLeds({ units, pulled }) {
  const ref = useRef();
  const leds = useMemo(
    () => units.filter((u) => u.partId).map((u) => ({ partId: u.partId, y: uY(u.startU, u.heightU) })),
    [units],
  );
  const count = leds.length;

  const { geometry, material, aData, aColor, tmp, slide } = useMemo(() => {
    const geometry = new THREE.SphereGeometry(0.016, 12, 12);
    const aData = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4);
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    geometry.setAttribute('aData', aData);
    geometry.setAttribute('aColor', aColor);
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: LED_VERT,
      fragmentShader: LED_FRAG,
    });
    return { geometry, material, aData, aColor, tmp: new THREE.Object3D(), slide: { z: 0 } };
  }, [count]);

  // The unit count changes when live parts appear/disappear: free the old GPU
  // buffers instead of leaking one geometry+material per topology change.
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  // Seed matrices/colours + a per-instance phase, then resample on a timer.
  useEffect(() => {
    const m = ref.current;
    if (!m || !count) return undefined;
    const c = new THREE.Color();
    const applyStyle = (i, partId) => {
      const s = ledStyle(partId);
      c.set(s.color);
      aColor.setXYZ(i, c.r, c.g, c.b);
      aData.setX(i, s.base); aData.setY(i, s.amp); aData.setZ(i, s.speed);
    };
    leds.forEach((led, i) => {
      tmp.position.set(LED_X, led.y, LED_Z);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      applyStyle(i, led.partId);
      aData.setW(i, Math.random() * Math.PI * 2);
    });
    m.instanceMatrix.needsUpdate = true;
    aColor.needsUpdate = true;
    aData.needsUpdate = true;
    const id = setInterval(() => {
      leds.forEach((led, i) => applyStyle(i, led.partId));
      aColor.needsUpdate = true;
      aData.needsUpdate = true;
    }, 2500);
    return () => clearInterval(id);
  }, [leds, count, tmp, aColor, aData]);

  // Drive the pulse clock; slide the pulled unit's LED with its chassis.
  useFrame((state, delta) => {
    material.uniforms.uTime.value = state.clock.elapsedTime;
    const m = ref.current;
    if (!m || !count) return;
    const idx = leds.findIndex((l) => l.partId === pulled);
    const prev = slide.z;
    slide.z = THREE.MathUtils.damp(slide.z, idx >= 0 ? -0.5 : 0, 16, delta);
    if (Math.abs(slide.z - prev) > 1e-5 || (idx >= 0 && slide.z !== 0)) {
      leds.forEach((led, i) => {
        tmp.position.set(LED_X, led.y, LED_Z + (i === idx ? slide.z : 0));
        tmp.updateMatrix();
        m.setMatrixAt(i, tmp.matrix);
      });
      m.instanceMatrix.needsUpdate = true;
    }
  });

  if (!count) return null;
  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} />;
}

// --- PDU / UPS front detail --------------------------------------------------
// Outward is local -Z (the cold-aisle face), so "proud of the panel" means a
// more-negative z. All offsets below follow that convention.

// One horizontal outlet strip: a dark grey bar studded with small socket holes.
function PduStrip({ y, w }) {
  const nSock = 8;
  const span = w * 0.78;
  return (
    <group position={[0, y, FRONT_FACE - 0.006]}>
      <mesh>
        <boxGeometry args={[w * 0.9, 0.024, 0.014]} />
        <meshStandardMaterial color="#33383f" metalness={0.55} roughness={0.6} />
      </mesh>
      {Array.from({ length: nSock }).map((_, k) => (
        <mesh key={k} position={[-span / 2 + (k * span) / (nSock - 1), 0, -0.008]}>
          <boxGeometry args={[0.013, 0.013, 0.006]} />
          <meshStandardMaterial color="#08090c" metalness={0.2} roughness={0.85} />
        </mesh>
      ))}
    </group>
  );
}

// UPS status display: a small green LCD showing battery % and load % as both
// bar gauges and numeric labels.
function UpsDisplay({ battery, load, w, y }) {
  const dw = Math.min(0.28, w * 0.62);
  const dh = 0.14;
  const green = '#26e06a';
  const gauge = (v, gy) => {
    const barW = dw * 0.84;
    const fill = Math.max(0.001, (v / 100) * barW);
    return (
      <group position={[0, gy, -0.011]}>
        <mesh>
          <boxGeometry args={[barW, 0.016, 0.002]} />
          <meshStandardMaterial color="#0a2a16" emissive={green} emissiveIntensity={0.2} toneMapped={false} />
        </mesh>
        <mesh position={[-barW / 2 + fill / 2, 0, -0.002]}>
          <boxGeometry args={[fill, 0.016, 0.003]} />
          <meshStandardMaterial color={green} emissive={green} emissiveIntensity={1.7} toneMapped={false} />
        </mesh>
      </group>
    );
  };
  return (
    <group position={[0, y, FRONT_FACE - 0.006]}>
      {/* bezel + recessed green screen */}
      <mesh>
        <boxGeometry args={[dw + 0.03, dh + 0.03, 0.016]} />
        <meshStandardMaterial color="#191d22" metalness={0.5} roughness={0.6} />
      </mesh>
      <mesh position={[0, 0, -0.007]}>
        <boxGeometry args={[dw, dh, 0.004]} />
        <meshStandardMaterial color="#04160b" emissive={green} emissiveIntensity={0.5} toneMapped={false} />
      </mesh>
      {gauge(battery, dh * 0.16)}
      {gauge(load, -dh * 0.26)}
      {/* numeric labels (rotated to face outward, local -Z) */}
      <Text font={TEXT_FONT} rotation={[0, Math.PI, 0]} position={[0, dh * 0.34, -0.013]} fontSize={0.028}
        color={green} anchorX="center" anchorY="middle" letterSpacing={0.02}>
        {`BAT ${battery}%`}
      </Text>
      <Text font={TEXT_FONT} rotation={[0, Math.PI, 0]} position={[0, -dh * 0.05, -0.013]} fontSize={0.028}
        color={green} anchorX="center" anchorY="middle" letterSpacing={0.02}>
        {`LOAD ${load}%`}
      </Text>
    </group>
  );
}

// Full PDU/UPS front: black chassis + stacked outlet strips + a status display,
// with the display wired to the part's live load telemetry.
function PduFront({ partId, w, h }) {
  const depth = 0.5;
  const [tel, setTel] = useState(() => (partId ? getTelemetry(partId) : { load: 30, age: 300 }));
  useEffect(() => {
    if (!partId) return undefined;
    const id = setInterval(() => setTel(getTelemetry(partId)), 2500 + Math.random() * 1000);
    return () => clearInterval(id);
  }, [partId]);
  const load = Math.max(0, Math.min(100, Math.round(Number(tel.load) || 0)));
  const battery = Math.max(80, Math.min(100, Math.round(100 - (Number(tel.age) || 300) / 60)));

  const bigEnough = h > 0.25;                 // tall UPS gets the display; small strip doesn't
  const nStrips = Math.max(1, Math.min(7, Math.round(h / 0.13)));
  const topPad = bigEnough ? 0.19 : 0.0;      // reserve the top band for the display
  const top = h / 2 - 0.03 - topPad;
  const bot = -h / 2 + 0.03;
  const strips = [];
  for (let i = 0; i < nStrips; i++) {
    const t = nStrips === 1 ? 0.5 : i / (nStrips - 1);
    strips.push(bot + t * (top - bot));
  }

  return (
    <>
      <mesh position={[0, 0, FRONT_FACE + depth / 2]}>
        <boxGeometry args={[w, h, depth]} />
        <meshStandardMaterial color="#0c0e12" metalness={0.4} roughness={0.5} />
      </mesh>
      {strips.map((sy, i) => <PduStrip key={i} y={sy} w={w} />)}
      {bigEnough && (
        // Own Suspense boundary: if the font ever fails to load, only this
        // label is missing — the rest of the room still renders.
        <Suspense fallback={null}>
          <UpsDisplay battery={battery} load={load} w={w} y={h / 2 - 0.11} />
        </Suspense>
      )}
    </>
  );
}

// --- Server internals, revealed when a unit is pulled out and its lid opens ---
// Laid out front-to-back on the deck: fan bank, RAM, CPU heatsinks, RAM, PSUs.
const FAN_RING = { critical: '#ff2b2b', warning: '#ffb020', offline: '#4a5568', optimal: '#2bff6a' };

/**
 * One fan module. When bound to a live part (partId), it spins at the reported
 * RPM (scaled down so it reads as rotation, not a strobe), its ring glows with
 * the part's condition, and it's clickable/hoverable like any other part.
 */
function Fan({ x, z, r, h, partId, hostId, onSelectComponent, onHover, onUnhover }) {
  const rotor = useRef();
  const ring = useRef();
  const state = useRef({ rpm: 0, sev: 'optimal' });

  useEffect(() => {
    if (!partId) return undefined;
    const read = () => {
      const t = getTelemetry(partId);
      state.current = { rpm: Number(t.rpm) || 0, sev: severity(t.condition, t.source) };
      if (ring.current) {
        const col = FAN_RING[state.current.sev];
        ring.current.color.set(col);
        ring.current.emissive.set(col);
      }
    };
    read();
    const id = setInterval(read, 1000);
    return () => clearInterval(id);
  }, [partId]);

  useFrame((_, delta) => {
    if (!rotor.current) return;
    // 18k RPM → ~9 rev/s on screen; a stalled fan visibly stops.
    const rps = partId ? state.current.rpm / 2000 : 3;
    rotor.current.rotation.y += rps * Math.PI * 2 * delta;
  });

  const handlers = partId
    ? {
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(partId, e.object, true); },
        onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover?.(); },
        onClick: (e) => { e.stopPropagation(); onSelectComponent?.(partId, hostId); },
      }
    : {};

  return (
    <group position={[x, 0, z]} rotation={[Math.PI / 2, 0, 0]} {...handlers}>
      {/* housing */}
      <mesh>
        <cylinderGeometry args={[r, r, h * 0.86, 20, 1, true]} />
        <meshStandardMaterial color="#15181d" metalness={0.4} roughness={0.6} side={THREE.DoubleSide} />
      </mesh>
      {/* condition ring on the intake face */}
      <mesh position={[0, -h * 0.43, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[r * 0.97, r * 0.07, 6, 24]} />
        <meshStandardMaterial ref={ring} color="#2bff6a" emissive="#2bff6a" emissiveIntensity={partId ? 1.6 : 0}
          toneMapped={false} />
      </mesh>
      {/* rotor: hub + 5 blades */}
      <group ref={rotor}>
        <mesh>
          <cylinderGeometry args={[r * 0.32, r * 0.32, h * 0.5, 14]} />
          <meshStandardMaterial color="#2a2f38" metalness={0.5} roughness={0.5} />
        </mesh>
        {Array.from({ length: 5 }).map((_, k) => (
          <mesh key={k} rotation={[0, (k * Math.PI * 2) / 5, 0.35]} position={[0, 0, 0]}>
            <boxGeometry args={[r * 1.72, h * 0.08, r * 0.34]} />
            <meshStandardMaterial color="#3a4150" metalness={0.3} roughness={0.6} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

function ServerInternals({ w, h, zFront, depth, fanIds = [], hostId, onSelectComponent, onHover, onUnhover }) {
  const yb = -h / 2 + 0.006;                     // deck floor
  const zFan = zFront + 0.16;
  const zRamF = zFront + 0.30;
  const zHeat = zFront + 0.46;
  const zRamB = zFront + 0.60;
  const zPsu = zFront + depth - 0.07;

  const nFan = 6;
  const fanR = Math.min(0.045, (w * 0.94) / nFan / 2);
  const fans = Array.from({ length: nFan }, (_, i) =>
    -w / 2 + fanR + 0.02 + (i * (w - 0.04 - 2 * fanR)) / (nFan - 1));

  return (
    <group>
      {/* motherboard */}
      <mesh position={[0, yb + 0.002, zFront + depth / 2]}>
        <boxGeometry args={[w - 0.02, 0.004, depth - 0.04]} />
        <meshStandardMaterial color="#0e3a24" metalness={0.2} roughness={0.7} />
      </mesh>

      {/* fan bank (discs facing front), bound to live fan parts when reported */}
      {/* Seen from the front (local -Z) the viewer's left is local +X, so fan 1
          — leftmost when facing the chassis, as Dell numbers them — takes the
          highest-x slot. */}
      {fans.map((x, i) => (
        <Fan key={i} x={x} z={zFan} r={fanR} h={h} partId={fanIds[fans.length - 1 - i]} hostId={hostId}
          onSelectComponent={onSelectComponent} onHover={onHover} onUnhover={onUnhover} />
      ))}

      {/* two CPU heatsinks with aluminium fins */}
      {[-w * 0.2, w * 0.2].map((x, i) => (
        <group key={i} position={[x, 0, zHeat]}>
          <mesh position={[0, -h * 0.12, 0]}>
            <boxGeometry args={[w * 0.3, h * 0.2, 0.14]} />
            <meshStandardMaterial color="#3a3f47" metalness={0.6} roughness={0.4} />
          </mesh>
          {Array.from({ length: 9 }).map((_, k) => (
            <mesh key={k} position={[-w * 0.13 + (k * w * 0.26) / 8, h * 0.03, 0]}>
              <boxGeometry args={[0.005, h * 0.5, 0.14]} />
              <meshStandardMaterial color="#aeb4bd" metalness={0.85} roughness={0.25} />
            </mesh>
          ))}
        </group>
      ))}

      {/* RAM DIMM banks, front and rear of the heatsinks */}
      {[zRamF, zRamB].map((z, r) => (
        Array.from({ length: 10 }).map((_, k) => (
          <mesh key={`${r}-${k}`} position={[-w * 0.42 + (k * w * 0.84) / 9, h * 0.05, z]}>
            <boxGeometry args={[0.004, h * 0.55, 0.1]} />
            <meshStandardMaterial color="#14603a" metalness={0.3} roughness={0.6} />
          </mesh>
        ))
      ))}

      {/* rear power supplies */}
      {[-w * 0.22, w * 0.22].map((x, i) => (
        <mesh key={i} position={[x, 0, zPsu]}>
          <boxGeometry args={[w * 0.36, h * 0.8, 0.1]} />
          <meshStandardMaterial color="#1a1d22" metalness={0.5} roughness={0.5} />
        </mesh>
      ))}
    </group>
  );
}

// A 2U server: front bezel with drive bays, a hinged top cover that swings open
// when the unit is pulled out (`open`), and internals shown only while open.
function ServerBody({ w, h, open, variant = 'server', ...internals }) {
  const depth = 0.7;
  const zc = FRONT_FACE + depth / 2;
  const zBack = FRONT_FACE + depth;
  const lid = useRef();

  useFrame((_, delta) => {
    if (!lid.current) return;
    const target = open ? 1.95 : 0;               // ~112° open, hinged at the rear
    lid.current.rotation.x = THREE.MathUtils.damp(lid.current.rotation.x, target, 11, delta);
  });

  const nDrive = 14;
  const wallC = '#20242b';
  return (
    <>
      {/* tray: floor + side/rear walls (open top) */}
      <mesh position={[0, -h / 2 + 0.004, zc]}>
        <boxGeometry args={[w, 0.008, depth]} />
        <meshStandardMaterial color={wallC} metalness={0.4} roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * (w / 2 - 0.004), 0, zc]}>
          <boxGeometry args={[0.008, h, depth]} />
          <meshStandardMaterial color={wallC} metalness={0.4} roughness={0.5} />
        </mesh>
      ))}
      <mesh position={[0, 0, zBack - 0.004]}>
        <boxGeometry args={[w, h, 0.008]} />
        <meshStandardMaterial color={wallC} metalness={0.4} roughness={0.5} />
      </mesh>

      {/* front bezel + drive bays + status LEDs (unchanged closed appearance) */}
      <mesh position={[0, 0, FRONT_FACE + 0.004]}>
        <boxGeometry args={[w, h, 0.008]} />
        <meshStandardMaterial color="#2a2f38" metalness={0.4} roughness={0.5} />
      </mesh>
      {variant === 'gpu' ? (
        <>
          {/* GPU node: big intake grilles + an accent stripe instead of drive bays */}
          {[-1, 0, 1].map((k) => (
            <mesh key={k} position={[k * w * 0.3, -h * 0.05, FRONT_FACE - 0.004]}>
              <boxGeometry args={[w * 0.26, h * 0.6, 0.008]} />
              <meshStandardMaterial color="#111418" metalness={0.5} roughness={0.7} />
            </mesh>
          ))}
          <mesh position={[0, h * 0.36, FRONT_FACE - 0.005]}>
            <boxGeometry args={[w * 0.9, h * 0.08, 0.006]} />
            <meshStandardMaterial color="#1b3d05" emissive="#76b900" emissiveIntensity={1.2} toneMapped={false} />
          </mesh>
        </>
      ) : (
        <Instances limit={nDrive} range={nDrive}>
          <boxGeometry args={[0.018, h * 0.7, 0.008]} />
          <meshStandardMaterial color="#3a3f47" metalness={0.4} roughness={0.5} />
          {Array.from({ length: nDrive }).map((_, k) => (
            <Instance key={k} position={[-w / 2 + 0.03 + (k * (w - 0.06)) / (nDrive - 1), 0, FRONT_FACE - 0.004]} />
          ))}
        </Instances>
      )}
      <mesh position={[w / 2 - 0.03, h * 0.26, FRONT_FACE - 0.006]}>
        <boxGeometry args={[0.014, 0.012, 0.01]} />
        <meshStandardMaterial color="#5a2600" emissive="#ff7a1a" emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[w / 2 - 0.03, -h * 0.26, FRONT_FACE - 0.006]}>
        <boxGeometry args={[0.014, 0.008, 0.01]} />
        <meshStandardMaterial color="#0a3d14" emissive="#33ff66" emissiveIntensity={2.2} />
      </mesh>

      {/* internals only while pulled out (one server at a time → cheap) */}
      {open && <ServerInternals w={w} h={h} zFront={FRONT_FACE} depth={depth} {...internals} />}

      {/* hinged top cover, pivoting at the rear-top edge */}
      <group ref={lid} position={[0, h / 2, zBack]}>
        <mesh position={[0, 0, -depth / 2]}>
          <boxGeometry args={[w, 0.006, depth]} />
          <meshStandardMaterial color="#2a2f38" metalness={0.45} roughness={0.45} />
        </mesh>
      </group>
    </>
  );
}

function Unit({ startU, heightU, kind, partId, fans, pulled, onSelect, onSelectComponent, onHover, onUnhover }) {
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
        onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover?.(partId, e.object); },
        onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover?.(); },
        onClick: (e) => { e.stopPropagation(); onSelect?.(partId, e.object); },
      }
    : {};

  let content = null;
  if (kind === 'server' || kind === 'gpu') {
    content = (
      <ServerBody w={w} h={h} open={pulled === partId} variant={kind}
        fanIds={fans} hostId={partId} onSelectComponent={onSelectComponent}
        onHover={onHover} onUnhover={onUnhover} />
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
    content = <PduFront partId={partId} w={w} h={h} />;
  } else {
    return null;
  }

  return (
    <group position={[0, y, 0]}>
      <group ref={slide} userData={{ partId }} {...handlers}>
        {content}
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
  onSelectComponent,
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
        <Unit key={u.partId || i} {...u} pulled={pulled} onSelect={onSelect}
          onSelectComponent={onSelectComponent} onHover={onHover} onUnhover={onUnhover} />
      ))}
      <RackLeds units={units} pulled={pulled} />
    </group>
  );
}
