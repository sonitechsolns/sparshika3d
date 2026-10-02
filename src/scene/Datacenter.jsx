import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Instances, Instance, Html } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import RoomRacks from './RoomRacks';
import DetailedUnit from './DetailedUnit';
import Cabling from './Cabling';
import { VIEWS } from './views';
import { buildRoom } from './roomModel';
import { N_U } from './rackGeometry';
import { RACK_LAYOUT, CRACS, ROW_Z, RACK_PITCH, RACKS_PER_ROW } from '../data/layout';
import { modelForKind } from '../data/catalog';
import { getMetadata, getTelemetry, registerParts, severity, useLiveTopology } from '../data/telemetry';
import { HoverCard } from '../components/TelemetryPanel';

// Room is 10m (X, length) x 6m (Z, width) x 3m (Y, height), centred on origin.
const ROOM = { L: 10, W: 6, H: 3 };
const TILE = 0.6;                 // 600mm raised-floor tiles
const HALF = { L: ROOM.L / 2, W: ROOM.W / 2 };

// --- Raised floor: 600mm tiles + perforated (unlit) vent tiles in the cold
//     aisles. Instanced for performance.
function Floor() {
  const { normal, vents } = useMemo(() => {
    const nx = Math.round(ROOM.L / TILE);
    const nz = Math.round(ROOM.W / TILE);
    const normal = [];
    const vents = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const x = -HALF.L + TILE / 2 + ix * TILE;
        const z = -HALF.W + TILE / 2 + iz * TILE;
        const cold = Math.abs(z) > 1.7;           // cold aisles on the outer sides
        if (cold && ix % 2 === 0) vents.push([x, 0, z]);
        else normal.push([x, 0, z]);
      }
    }
    return { normal, vents };
  }, []);

  return (
    <group>
      {/* dark sub-floor / plenum visible through the tile gaps */}
      <mesh position={[0, -0.04, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[ROOM.L, ROOM.W]} />
        <meshStandardMaterial color="#080b10" roughness={0.95} />
      </mesh>
      <VentHoles vents={vents} />

      <Instances limit={normal.length} castShadow receiveShadow>
        <boxGeometry args={[TILE - 0.02, 0.05, TILE - 0.02]} />
        <meshStandardMaterial color="#838a94" metalness={0.35} roughness={0.6} />
        {normal.map((p, i) => (
          <Instance key={i} position={p} />
        ))}
      </Instances>

      <Instances limit={Math.max(1, vents.length)}>
        <boxGeometry args={[TILE - 0.02, 0.05, TILE - 0.02]} />
        <meshStandardMaterial color="#6a717a" metalness={0.45} roughness={0.7} />
        {vents.map((p, i) => (
          <Instance key={i} position={p} />
        ))}
      </Instances>
    </group>
  );
}

// Perforation dots on each vent tile (one instanced batch), so vents read as
// perforated steel rather than as lit panels.
function VentHoles({ vents }) {
  const holes = useMemo(() => {
    const out = [];
    const n = 7, step = (TILE - 0.1) / (n - 1);
    for (const [x, , z] of vents) {
      for (let i = 0; i < n; i++) for (let k = 0; k < n; k++) {
        out.push([x - (TILE - 0.1) / 2 + i * step, 0.0255, z - (TILE - 0.1) / 2 + k * step]);
      }
    }
    return out;
  }, [vents]);
  return (
    <Instances limit={Math.max(1, holes.length)}>
      <planeGeometry args={[0.03, 0.03]} />
      <meshStandardMaterial color="#1c2026" roughness={0.9} />
      {holes.map((p, i) => <Instance key={i} position={p} rotation={[-Math.PI / 2, 0, 0]} />)}
    </Instances>
  );
}

// --- Walls, ceiling, and a glass door on the -X end.
function Shell() {
  const wall = '#171b21';
  return (
    <group>
      {/* ceiling — single-sided (faces down) so it culls from above and you can
          orbit into an overhead view of the room */}
      <mesh position={[0, ROOM.H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.L, ROOM.W]} />
        <meshStandardMaterial color="#0a0c10" roughness={1} />
      </mesh>

      {/* long side walls (z = ±W/2) */}
      <mesh position={[0, ROOM.H / 2, -HALF.W]}>
        <boxGeometry args={[ROOM.L, ROOM.H, 0.1]} />
        <meshStandardMaterial color={wall} roughness={0.9} transparent opacity={0.2} />
      </mesh>
      <mesh position={[0, ROOM.H / 2, HALF.W]}>
        <boxGeometry args={[ROOM.L, ROOM.H, 0.1]} />
        <meshStandardMaterial color={wall} roughness={0.9} transparent opacity={0.2} />
      </mesh>

      {/* solid end wall (+X) */}
      <mesh position={[HALF.L, ROOM.H / 2, 0]}>
        <boxGeometry args={[0.1, ROOM.H, ROOM.W]} />
        <meshStandardMaterial color={wall} roughness={0.9} transparent opacity={0.2} />
      </mesh>

      {/* end wall (-X) with a glass door */}
      <mesh position={[-HALF.L, ROOM.H / 2, 0]}>
        <boxGeometry args={[0.1, ROOM.H, ROOM.W]} />
        <meshStandardMaterial color={wall} roughness={0.9} transparent opacity={0.2} />
      </mesh>
      <mesh position={[-HALF.L + 0.06, 1.05, 0]}>
        <boxGeometry args={[0.05, 2.1, 1.3]} />
        <meshStandardMaterial color="#8fc4e0" transparent opacity={0.22} metalness={0.1} roughness={0.05} />
      </mesh>
      {/* door frame */}
      <mesh position={[-HALF.L + 0.06, 1.05, 0]}>
        <boxGeometry args={[0.06, 2.2, 1.42]} />
        <meshStandardMaterial color="#2b2f36" metalness={0.5} roughness={0.5} wireframe />
      </mesh>
    </group>
  );
}

// --- Ceiling: fluorescent strips running lengthwise (parallel to the racks),
//     plus cool-white fill lights.
function CeilingLights() {
  const zs = [-ROW_Z, 0, ROW_Z];
  return (
    <group>
      {zs.map((z, i) => (
        <group key={i}>
          {/* downward-facing only, so an overhead view looks through it */}
          <mesh position={[0, ROOM.H - 0.03, z]} rotation={[Math.PI / 2, 0, 0]}>
            <planeGeometry args={[ROOM.L * 0.88, 0.2]} />
            <meshStandardMaterial color="#eef4ff" emissive="#e4edff" emissiveIntensity={2.6} />
          </mesh>
          <pointLight position={[0, ROOM.H - 0.25, z]} intensity={12} distance={13} decay={1.4} color="#e6eeff" />
        </group>
      ))}
    </group>
  );
}

// --- Racks -------------------------------------------------------------------
// The room layout (src/data/layout.js) is DEMO filler, simulated in the browser.
// Parts reported by the on-prem agent carry their own rack position (schema
// v1.1) and are merged in here, displacing any demo unit in the same slots — so
// what the agent reports is what the twin shows.
const _warned = new Set();

function buildRacks(live) {
  const units = live.filter((p) => p.kind !== 'fan');
  const fans = live.filter((p) => p.kind === 'fan');
  const rackIds = new Set(RACK_LAYOUT.map((r) => r.id));
  for (const p of units) {
    if (!rackIds.has(p.rackId) && !_warned.has(p.partId)) {
      _warned.add(p.partId);
      console.warn(`[sparshika] ${p.partId} is in ${p.rackId}, which the twin's room layout doesn't have — not drawn.`);
    }
  }
  return RACK_LAYOUT.map((r) => {
    const mine = units
      .filter((u) => u.rackId === r.id)
      .map((u) => {
        const heightU = Math.max(1, Math.min(u.heightU, N_U));
        const startU = Math.max(1, Math.min(u.startU, N_U - heightU + 1));
        return {
          startU,
          heightU,
          modelId: modelForKind(u.kind, heightU),
          partId: u.partId,
          live: true,
          fans: fans
            .filter((f) => f.rackId === r.id && f.startU === u.startU)
            .map((f) => f.partId)
            .sort(),
        };
      });
    const taken = new Set();
    mine.forEach((u) => { for (let k = 0; k < u.heightU; k++) taken.add(u.startU + k); });
    const demo = r.units.filter((d) => {
      for (let k = 0; k < d.heightU; k++) if (taken.has(d.startU + k)) return false;
      return true;
    });
    return { ...r, units: [...demo, ...mine] };
  });
}

// --- Perimeter cooling (CRAC) units at the far end of each row ----------------
registerParts(CRACS.map((c) => ({ partId: c.partId, modelId: 'vertiv-pdx' })));

function CracUnit({ crac, onSelectObject, onHover, onUnhover }) {
  const fans = useRef([]);
  const led = useRef();
  const rpm = useRef(1200);
  useEffect(() => {
    const read = () => {
      const t = getTelemetry(crac.partId);
      rpm.current = Number(t.rpm) || 0;
      const sev = severity(t.condition, t.source);
      const col = { critical: '#ff2b2b', warning: '#ffb020', offline: '#4a5568', optimal: '#2bff6a' }[sev];
      if (led.current) { led.current.color.set(col); led.current.emissive.set(col); }
    };
    read();
    const id = setInterval(read, 1500);
    return () => clearInterval(id);
  }, [crac.partId]);
  useFrame((_, dt) => fans.current.forEach((f) => { if (f) f.rotation.y += (rpm.current / 600) * dt * Math.PI * 2; }));

  const W = 0.9, H = 1.95, D = 0.85;
  const handlers = {
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; onHover(crac.partId, e.eventObject); },
    onPointerOut: (e) => { e.stopPropagation(); document.body.style.cursor = 'auto'; onUnhover(); },
    onClick: (e) => { e.stopPropagation(); onSelectObject(crac.partId, e.eventObject); },
  };
  return (
    <group position={crac.pos} rotation={[0, crac.rot, 0]}>
      <group userData={{ partId: crac.partId }} position={[0, H / 2, 0]} {...handlers}>
        <mesh>
          <boxGeometry args={[W, H, D]} />
          <meshStandardMaterial color="#c3c8ce" metalness={0.35} roughness={0.5} />
        </mesh>
        {/* front door seams + display + status LED (front is local -Z) */}
        {[-W / 6, W / 6].map((x) => (
          <mesh key={x} position={[x, -0.1, -D / 2 - 0.002]}>
            <boxGeometry args={[0.004, H * 0.85, 0.002]} />
            <meshStandardMaterial color="#8c929a" />
          </mesh>
        ))}
        <mesh position={[0, H * 0.3, -D / 2 - 0.004]}>
          <boxGeometry args={[0.16, 0.1, 0.006]} />
          <meshStandardMaterial color="#06210f" emissive="#27e06c" emissiveIntensity={0.7} toneMapped={false} />
        </mesh>
        <mesh position={[0.12, H * 0.3, -D / 2 - 0.006]}>
          <sphereGeometry args={[0.012, 10, 8]} />
          <meshStandardMaterial ref={led} color="#2bff6a" emissive="#2bff6a" emissiveIntensity={2} toneMapped={false} />
        </mesh>
        {/* return-air grille on top with three EC fans under it */}
        <mesh position={[0, H / 2 + 0.002, 0]}>
          <boxGeometry args={[W * 0.9, 0.004, D * 0.8]} />
          <meshStandardMaterial color="#0b0d10" transparent opacity={0.55} />
        </mesh>
        {[-0.28, 0, 0.28].map((x, i) => (
          <group key={x} position={[x, H / 2 - 0.03, 0]} ref={(el) => { fans.current[i] = el; }}>
            {Array.from({ length: 5 }).map((_, k) => (
              <mesh key={k} rotation={[0, (k * Math.PI * 2) / 5, 0.3]}>
                <boxGeometry args={[0.24, 0.008, 0.05]} />
                <meshStandardMaterial color="#4a5260" metalness={0.4} roughness={0.5} />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

// --- Hot-aisle heat map -------------------------------------------------------
// A semi-transparent vertical plane standing in the hot aisle (z=0, between the
// two rack rows), coloured with a thermal gradient: cool blue at the floor
// rising to warm orange/red at the top. The average temperature across all
// racks drives how far up the warm colours reach — hotter = redder.
const HEAT_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const HEAT_FRAG = /* glsl */`
  precision mediump float;
  varying vec2 vUv;
  uniform float uIntensity;               // 0 (cool) .. 1 (hot)

  vec3 thermal(float t) {                 // blue -> cyan -> orange -> red
    vec3 blue   = vec3(0.10, 0.32, 0.95);
    vec3 cyan   = vec3(0.10, 0.72, 0.90);
    vec3 orange = vec3(1.00, 0.52, 0.13);
    vec3 red    = vec3(1.00, 0.13, 0.05);
    if (t < 0.4) return mix(blue, cyan, t / 0.4);
    if (t < 0.7) return mix(cyan, orange, (t - 0.4) / 0.3);
    return mix(orange, red, (t - 0.7) / 0.3);
  }

  void main() {
    float h = vUv.y;                                        // 0 floor, 1 top
    float warmth = clamp(h * (0.25 + uIntensity * 1.2), 0.0, 1.0);
    vec3 col = thermal(warmth);
    // soft side/floor fade so it reads as a haze, not a hard billboard
    float edgeX = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
    float edgeY = smoothstep(0.0, 0.1, h);
    float a = (0.32 + 0.34 * uIntensity) * edgeX * edgeY;
    gl_FragColor = vec4(col, a);
  }
`;

const AISLE_X = -3.6 + ((RACKS_PER_ROW - 1) * RACK_PITCH) / 2;
const AISLE_LEN = RACKS_PER_ROW * RACK_PITCH;

function HeatGradient({ room }) {
  const uniforms = useMemo(() => ({ uIntensity: { value: 0.3 } }), []);
  const target = useRef(0.3);
  const allIds = useMemo(
    () => room.units.filter((u) => u.selectable).map((u) => u.partId),
    [room],
  );

  // Average unit temperature, sampled on a timer (getTelemetry advances the sim
  // walk, so not per frame), mapped to 0..1 intensity. When the agent reports
  // live units, ONLY live readings drive the map — simulated filler never
  // colours a real heat reading.
  useEffect(() => {
    const sample = () => {
      const readings = allIds.map((pid) => getTelemetry(pid));
      const live = readings.filter((t) => t.source === 'live');
      const use = live.length ? live : readings;
      let s = 0, n = 0;
      use.forEach((t) => { const v = Number(t.temp); if (!Number.isNaN(v)) { s += v; n++; } });
      if (n) target.current = Math.max(0, Math.min(1, (s / n - 38) / 40));
    };
    sample();
    const id = setInterval(sample, 2500);
    return () => clearInterval(id);
  }, [allIds]);

  // Ease toward the sampled intensity for smooth colour transitions.
  useFrame((_, delta) => {
    const u = uniforms.uIntensity;
    u.value += (target.current - u.value) * Math.min(1, delta * 2);
  });

  return (
    <mesh position={[AISLE_X, 1.42, 0]} renderOrder={2}>
      <planeGeometry args={[AISLE_LEN, 2.85]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={HEAT_VERT}
        fragmentShader={HEAT_FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        toneMapped={false}
      />
    </mesh>
  );
}

// Fade every mesh that isn't part of the pulled-out unit down to 20% while a
// unit is in focus, restoring them on reset.
function SceneDimmer({ pulled }) {
  const { scene } = useThree();
  useEffect(() => {
    if (!pulled) return undefined;
    const touched = [];
    scene.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      for (let p = o; p; p = p.parent) {
        if (p.userData && p.userData.partId === pulled) return; // keep the focused unit
      }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.userData.__dim) return;
        m.userData.__dim = { opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
        m.transparent = true;
        m.opacity = 0.2;
        m.depthWrite = false;
        touched.push(m);
      });
    });
    return () => {
      touched.forEach((m) => {
        const s = m.userData.__dim;
        if (s) {
          m.opacity = s.opacity;
          m.transparent = s.transparent;
          m.depthWrite = s.depthWrite;
          delete m.userData.__dim;
        }
      });
    };
  }, [pulled, scene]);
  return null;
}

// Smoothly fly the camera to frame a pulled-out unit from the front, so the
// pop-out is always visible regardless of which way its rack faces. Restores
// the operator's overview when focus clears.
function CameraFocus({ focus, view }) {
  const { camera, controls } = useThree();
  const goalPos = useRef(new THREE.Vector3());
  const goalTarget = useRef(new THREE.Vector3());
  const home = useRef(null);         // camera pose to return to on reset
  const active = useRef(false);

  useEffect(() => {
    if (!controls) return undefined;
    if (focus) {
      if (!home.current) {
        home.current = { pos: camera.position.clone(), target: controls.target.clone() };
      }
      const look = new THREE.Vector3(...focus.pos);
      const dir = new THREE.Vector3(...focus.front);
      // The pulled-out tray's centre sits ~0.6 m in front of the unit's rack
      // position. Stand off in front and well above it so the view looks DOWN
      // into the open chassis (fans, heatsinks) instead of at the raised lid.
      goalPos.current.copy(look)
        .add(dir.clone().multiplyScalar(1.45))
        .add(new THREE.Vector3(0, 0.95, 0));
      goalTarget.current.copy(look).add(dir.clone().multiplyScalar(0.62));
      active.current = true;
    } else if (home.current) {
      goalPos.current.copy(home.current.pos);
      goalTarget.current.copy(home.current.target);
      home.current = null;
      active.current = true;
    }
    return undefined;
  }, [focus, camera, controls]);

  // View presets (declared after the focus effect so a preset chosen while a
  // unit is open wins over "return to where you were").
  useEffect(() => {
    if (!view || !VIEWS[view.name]) return;
    goalPos.current.set(...VIEWS[view.name].pos);
    goalTarget.current.set(...VIEWS[view.name].target);
    home.current = null;
    active.current = true;
  }, [view]);

  // Grabbing the controls cancels any fly-to, so the camera never fights you.
  useEffect(() => {
    if (!controls) return undefined;
    const stop = () => { active.current = false; };
    controls.addEventListener('start', stop);
    return () => controls.removeEventListener('start', stop);
  }, [controls]);

  useFrame((_, delta) => {
    if (!active.current || !controls) return;
    const a = 1 - Math.exp(-6 * delta); // frame-rate-independent ease
    camera.position.lerp(goalPos.current, a);
    controls.target.lerp(goalTarget.current, a);
    controls.update();
    if (camera.position.distanceTo(goalPos.current) < 0.01 && controls.target.distanceTo(goalTarget.current) < 0.01) active.current = false;
  });
  return null;
}

/**
 * Deep links: `?part=R760-A17` opens the twin with that part pulled out (and
 * `?part=FAN-R760-03` opens its host server with the fan selected), so an alert
 * or a chat message can link straight to a part. Runs once, as soon as the part
 * exists in the scene (live parts appear after the first poll).
 */
function DeepLink({ want, room, onSelectUnit, onSelectComponent }) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (!want) { done.current = true; return; }
    let host = want;
    for (const u of room.units) if (u.fans?.includes(want)) host = u.partId;
    const fan = want.match(/^(.*)-FAN-\d+$/);
    if (fan && room.byPart.has(fan[1])) host = fan[1];
    const idx = room.byPart.get(host);
    if (idx == null) return; // not in the room yet — retry when it updates
    done.current = true;
    onSelectUnit(room.units[idx]);
    if (host !== want) setTimeout(() => onSelectComponent(want, host), 0);
  }, [want, room, onSelectUnit, onSelectComponent]);
  return null;
}

/**
 * The datacenter hall: shell, raised floor, lighting, segregated cabling, 22 racks of
 * real hardware (instanced), perimeter cooling, the pulled-out unit in full
 * detail, heat map, camera focus and hover cards.
 */
export default function Datacenter({ selected, setSelected, showHeatmap = false, initialPart = null, cables = {}, view = null }) {
  const [hover, setHover] = useState(null);       // { partId, metadata, pos, inside }
  const live = useLiveTopology();
  const racks = useMemo(() => buildRacks(live), [live]);
  const room = useMemo(() => buildRoom(racks), [racks]);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);

  const anchorOf = (obj) => {
    obj.getWorldPosition(_v);
    obj.getWorldQuaternion(_q);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(_q).normalize();
    return { pos: [_v.x, _v.y + 0.28, _v.z], front: [f.x, f.y, f.z] };
  };
  const unitPos = (u) => [u.anchor.pos.x, u.anchor.pos.y + 0.28, u.anchor.pos.z];

  const onSelectUnit = (u) =>
    setSelected({ partId: u.partId, pos: unitPos(u), front: u.anchor.front.toArray() });
  const onSelectObject = (partId, obj) => setSelected({ partId, ...anchorOf(obj) });
  // A component inside the pulled-out unit (a fan): keep the host open and the
  // camera where it is, just switch the panel to the component.
  const onSelectComponent = (partId, hostId) =>
    setSelected((prev) => (prev ? { ...prev, partId, hostId } : prev));
  const onHoverUnit = (u) => setHover({ partId: u.partId, metadata: getMetadata(u.partId), pos: unitPos(u), inside: false });
  const onHover = (partId, obj, inside = false) =>
    setHover({ partId, metadata: getMetadata(partId), pos: anchorOf(obj).pos, inside });
  const onUnhover = () => setHover(null);

  // Which rack unit is pulled out. `shown` lags `pulled` so a unit can slide
  // back in before the next one comes out (and before the instanced copy
  // reappears).
  const pulled = selected ? selected.hostId || selected.partId : undefined;
  const pulledUnit = pulled != null && room.byPart.has(pulled) ? pulled : null;
  const [shown, setShown] = useState(null);
  useEffect(() => {
    if (shown == null && pulledUnit) setShown(pulledUnit);
  }, [shown, pulledUnit]);
  const shownIdx = shown != null ? room.byPart.get(shown) : undefined;
  const shownUnit = shownIdx != null ? room.units[shownIdx] : null;

  return (
    <group>
      <ambientLight intensity={0.95} color="#c8d4e2" />
      <hemisphereLight args={['#9fb0c4', '#1a1f27', 1.25]} />
      {/* cold-aisle wash so every rack face reads clearly, plus a hot-aisle
          fill so the rear cabling is legible */}
      <directionalLight position={[0, 5, -6]} intensity={1.5} color="#eef3ff" />
      <directionalLight position={[0, 5, 6]} intensity={1.5} color="#eef3ff" />
      <directionalLight position={[-6, 4, 0]} intensity={0.8} color="#f4f6fb" />

      <Floor />
      <Shell />
      <CeilingLights />
      <Cabling room={room} racks={racks} show={cables} />
      <RoomRacks
        room={room}
        racks={racks}
        hidden={shownIdx}
        onSelectUnit={onSelectUnit}
        onHoverUnit={onHoverUnit}
        onUnhover={onUnhover}
      />
      {shownUnit && (
        <DetailedUnit
          key={shownUnit.partId}
          unit={shownUnit}
          open={pulled === shownUnit.partId}
          liveFans={shownUnit.fans}
          onClosed={() => setShown(null)}
          onSelectUnit={onSelectUnit}
          onSelectComponent={onSelectComponent}
          onHover={onHover}
          onUnhover={onUnhover}
        />
      )}
      {CRACS.map((c) => (
        <CracUnit key={c.partId} crac={c} onSelectObject={onSelectObject} onHover={onHover} onUnhover={onUnhover} />
      ))}
      <DeepLink want={initialPart} room={room} onSelectUnit={onSelectUnit} onSelectComponent={onSelectComponent} />
      <SceneDimmer pulled={pulled} />
      <CameraFocus focus={selected} view={view} />
      {showHeatmap && <HeatGradient room={room} />}

      {/* Click-away backdrop: any empty click resets the focus. */}
      <mesh scale={40} onClick={() => setSelected(null)}>
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.BackSide} />
      </mesh>

      {/* Screen-space hover card (no distanceFactor) so it stays a readable size
          at any zoom. The selected-unit telemetry is a fixed DOM side panel
          rendered by App, outside the Canvas. */}
      {hover && (!selected || hover.inside) && (
        <Html position={hover.pos} center>
          <HoverCard metadata={hover.metadata} source={getTelemetry(hover.partId).source} />
        </Html>
      )}
    </group>
  );
}
