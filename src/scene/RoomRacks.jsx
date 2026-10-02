import React, { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text } from '@react-three/drei';
import * as THREE from 'three';
import { ROLE_LABEL } from '../data/layout';
import { getTelemetry, severity } from '../data/telemetry';
import { TOP, RACK_H, FRONT_Z, TEXT_FONT } from './rackGeometry';
import { ROOM_MATS, BOX } from './roomModel';

const DOT = new THREE.SphereGeometry(0.5, 8, 6);

// ------------------------------------------------------------------ shaders ---
// Status LED: colour + pulse per unit, driven by its telemetry condition.
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
// Drive / port activity: random flicker whose rate follows the unit's load.
const ACT_VERT = /* glsl */`
  attribute vec3 aColor;
  attribute vec2 aBlink;  // rate (Hz, 0 = dark), phase
  uniform float uTime;
  varying vec3 vColor;
  float hash(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    float t = uTime * aBlink.x + aBlink.y * 10.0;
    float on = step(0.45, hash(floor(t) + aBlink.y * 97.0));
    float glow = aBlink.x > 0.0 ? mix(0.35, 1.9, on) : 0.08;
    vColor = aColor * glow;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;
const LED_FRAG = /* glsl */`
  precision mediump float;
  varying vec3 vColor;
  void main() { gl_FragColor = vec4(vColor, 1.0); }
`;

const LED_STYLES = {
  critical: { color: '#ff2b2b', base: 1.4, amp: 2.8, speed: 7.5 },
  offline: { color: '#4a5568', base: 0.18, amp: 0.0, speed: 0 },
  warning: { color: '#ffb020', base: 1.1, amp: 1.5, speed: 3.4 },
  optimal: { color: '#2bff6a', base: 1.1, amp: 0.8, speed: 1.7 },
};

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

// ---------------------------------------------------------------- components ---
function Batch({ data, material, geometry = BOX, hidden, ...events }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    data.m.forEach((m, i) => mesh.setMatrixAt(i, data.owner[i] === hidden ? ZERO : m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [data, hidden]);
  return <instancedMesh ref={ref} args={[geometry, material, data.m.length]} {...events} />;
}

/** Status LEDs for every monitored unit in the room — one draw call. */
function StatusLeds({ room, hidden }) {
  const { leds, units } = room;
  const count = leds.m.length;
  const { material, aData, aColor } = useMemo(() => {
    const aData = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 4), 4);
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: LED_VERT, fragmentShader: LED_FRAG });
    return { material, aData, aColor };
  }, [count]);
  const geometry = useMemo(() => {
    const g = DOT.clone();
    g.setAttribute('aData', aData);
    g.setAttribute('aColor', aColor);
    return g;
  }, [aData, aColor]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    const c = new THREE.Color();
    const apply = () => {
      leds.owner.forEach((idx, i) => {
        const t = getTelemetry(units[idx].partId);
        const s = LED_STYLES[severity(t.condition, t.source)];
        c.set(s.color);
        aColor.setXYZ(i, c.r, c.g, c.b);
        aData.setXYZ(i, s.base, s.amp, s.speed);
      });
      aColor.needsUpdate = true;
      aData.needsUpdate = true;
    };
    leds.owner.forEach((_, i) => aData.setW(i, Math.random() * Math.PI * 2));
    apply();
    const id = setInterval(apply, 2500);
    return () => clearInterval(id);
  }, [leds, units, aColor, aData]);

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  if (!count) return null;
  return <Batch data={leds} material={material} geometry={geometry} hidden={hidden} />;
}

/** Drive-bay and port activity lights — flicker rate follows each unit's load. */
function ActivityLeds({ room, hidden }) {
  const { acts, units } = room;
  const count = acts.m.length;
  const { material, aBlink, aColor } = useMemo(() => {
    const aBlink = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 2), 2);
    const aColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count) * 3), 3);
    const c = new THREE.Color();
    acts.color.forEach((hex, i) => { c.set(hex); aColor.setXYZ(i, c.r, c.g, c.b); aBlink.setY(i, Math.random()); });
    const material = new THREE.ShaderMaterial({ uniforms: { uTime: { value: 0 } }, vertexShader: ACT_VERT, fragmentShader: LED_FRAG });
    return { material, aBlink, aColor };
  }, [acts, count]);
  const geometry = useMemo(() => {
    const g = BOX.clone();
    g.setAttribute('aBlink', aBlink);
    g.setAttribute('aColor', aColor);
    return g;
  }, [aBlink, aColor]);
  useEffect(() => () => { geometry.dispose(); material.dispose(); }, [geometry, material]);

  useEffect(() => {
    const apply = () => {
      const rate = new Map();
      acts.owner.forEach((idx, i) => {
        if (!rate.has(idx)) {
          const u = units[idx];
          if (!u.partId) rate.set(idx, 0.6);            // passive gear: slow link blink
          else {
            const t = getTelemetry(u.partId);
            const sev = severity(t.condition, t.source);
            rate.set(idx, sev === 'offline' ? 0 : 1.2 + Number(t.load || 0) / 9);
          }
        }
        aBlink.setX(i, rate.get(idx) * (0.7 + ((i * 7919) % 10) / 16));
      });
      aBlink.needsUpdate = true;
    };
    apply();
    const id = setInterval(apply, 3000);
    return () => clearInterval(id);
  }, [acts, units, aBlink]);

  useFrame((state) => { material.uniforms.uTime.value = state.clock.elapsedTime; });
  if (!count) return null;
  return <Batch data={acts} material={material} geometry={geometry} hidden={hidden} />;
}

function RackLabels({ racks }) {
  return (
    <Suspense fallback={null}>
      {racks.map((r) => (
        <group key={r.id} position={r.pos} rotation={[0, r.rot, 0]}>
          <Text font={TEXT_FONT} position={[0, RACK_H - TOP / 2, FRONT_Z - 0.006]} rotation={[0, Math.PI, 0]}
            fontSize={0.034} color="#dfe6ee" anchorX="center" anchorY="middle" letterSpacing={0.04}>
            {r.id.replace('RACK-', 'R')}
            <meshBasicMaterial toneMapped={false} />
          </Text>
          <Text font={TEXT_FONT} position={[0, RACK_H + 0.03, FRONT_Z + 0.08]} rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={0.045} color="#8fa0b3" anchorX="center" anchorY="middle">
            {ROLE_LABEL[r.role] || ''}
          </Text>
        </group>
      ))}
    </Suspense>
  );
}

/**
 * Every rack in the room, drawn as instanced batches: ~30 draw calls for
 * hundreds of units. The unit that is pulled out (`hidden`) is removed from
 * the batches and drawn in full detail by <DetailedUnit>.
 */
export default function RoomRacks({ room, racks, hidden, onSelectUnit, onHoverUnit, onUnhover }) {
  const materials = useMemo(() => {
    const out = {};
    for (const [k, spec] of Object.entries(ROOM_MATS)) out[k] = new THREE.MeshStandardMaterial(spec);
    return out;
  }, []);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);
  const hitMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false }),
    []);

  const unitOf = (e) => room.units[room.hits.owner[e.instanceId]];
  const events = {
    onPointerOver: (e) => {
      e.stopPropagation();
      const u = unitOf(e);
      if (!u) return;
      document.body.style.cursor = 'pointer';
      onHoverUnit?.(u);
    },
    onPointerOut: (e) => {
      e.stopPropagation();
      document.body.style.cursor = 'auto';
      onUnhover?.();
    },
    onClick: (e) => {
      e.stopPropagation();
      const u = unitOf(e);
      if (u) onSelectUnit?.(u);
    },
  };

  return (
    <group>
      {Object.entries(room.batches).map(([key, data]) => (
        <Batch key={`${key}-${data.m.length}`} data={data} material={materials[key] || materials.chassis} hidden={hidden} />
      ))}
      <StatusLeds key={`leds-${room.leds.m.length}`} room={room} hidden={hidden} />
      <ActivityLeds key={`acts-${room.acts.m.length}`} room={room} hidden={hidden} />
      <Batch key={`hits-${room.hits.m.length}`} data={room.hits} material={hitMaterial} hidden={hidden} {...events} />
      <RackLabels racks={racks} />
    </group>
  );
}
