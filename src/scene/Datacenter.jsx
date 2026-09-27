import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Instances, Instance, Html } from '@react-three/drei';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import Rack from './Rack';
import { N_U } from './rackGeometry';
import { getMetadata, getTelemetry, useLiveTopology } from '../data/telemetry';
import { HoverCard } from '../components/TelemetryPanel';

// Room is 10m (X, length) x 6m (Z, width) x 3m (Y, height), centred on origin.
const ROOM = { L: 10, W: 6, H: 3 };
const TILE = 0.6;                 // 600mm raised-floor tiles
const HALF = { L: ROOM.L / 2, W: ROOM.W / 2 };
const ROW_Z = 1.25;               // |z| of each rack row's centre line

// --- Raised floor: 600mm tiles + teal-glowing perforated vent tiles in the
//     cold aisles. Instanced for performance.
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

      <Instances limit={normal.length} castShadow receiveShadow>
        <boxGeometry args={[TILE - 0.02, 0.05, TILE - 0.02]} />
        <meshStandardMaterial color="#9aa0aa" metalness={0.35} roughness={0.55} />
        {normal.map((p, i) => (
          <Instance key={i} position={p} />
        ))}
      </Instances>

      <Instances limit={Math.max(1, vents.length)}>
        <boxGeometry args={[TILE - 0.02, 0.05, TILE - 0.02]} />
        <meshStandardMaterial
          color="#0e2b2b"
          emissive="#35e0c6"
          emissiveIntensity={0.9}
          metalness={0.2}
          roughness={0.5}
        />
        {vents.map((p, i) => (
          <Instance key={i} position={p} />
        ))}
      </Instances>
    </group>
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
          <mesh position={[0, ROOM.H - 0.06, z]}>
            <boxGeometry args={[ROOM.L * 0.88, 0.06, 0.2]} />
            <meshStandardMaterial color="#eef4ff" emissive="#e4edff" emissiveIntensity={2.6} />
          </mesh>
          <pointLight position={[-2.6, ROOM.H - 0.25, z]} intensity={7} distance={8} decay={2} color="#d8e4ff" />
          <pointLight position={[2.6, ROOM.H - 0.25, z]} intensity={7} distance={8} decay={2} color="#d8e4ff" />
        </group>
      ))}
    </group>
  );
}

// --- Two black metal cable trays running lengthwise above each rack row.
function CableTrays() {
  return (
    <group>
      {[-ROW_Z, ROW_Z].map((z, i) => (
        <group key={i} position={[0, ROOM.H - 0.4, z]}>
          <mesh>
            <boxGeometry args={[ROOM.L * 0.9, 0.04, 0.34]} />
            <meshStandardMaterial color="#0d0f13" metalness={0.5} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.05, 0.16]}>
            <boxGeometry args={[ROOM.L * 0.9, 0.1, 0.02]} />
            <meshStandardMaterial color="#0d0f13" metalness={0.5} roughness={0.6} />
          </mesh>
          <mesh position={[0, 0.05, -0.16]}>
            <boxGeometry args={[ROOM.L * 0.9, 0.1, 0.02]} />
            <meshStandardMaterial color="#0d0f13" metalness={0.5} roughness={0.6} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

// --- Six racks in a hot/cold-aisle layout. Rows sit either side of the central
//     hot aisle; each rack's front faces outward to the cold aisles.
//
// The layout below is DEMO filler (simulated in the browser). Parts reported by
// the on-prem agent carry their own rack position (schema v1.1) and are placed
// into these racks at runtime by buildRacks(), displacing any demo unit in the
// same slots — so what the agent reports is what the twin shows.
const SW = [36, 34, 20].map((u) => ({ startU: u, heightU: 1, kind: 'switch', partId: `RACK-03-U${u}` }));
const ST = [38, 35, 32, 10].map((u) => ({ startU: u, heightU: 2, kind: 'storage', partId: `RACK-05-U${u}` }));
const PD = [{ startU: 2, heightU: 18, kind: 'pdu', partId: 'RACK-06-U02' },
            { startU: 38, heightU: 2, kind: 'pdu', partId: 'RACK-06-U38' }];

// Seventeen 2U R760s stacked from U9–U42 (~81% of the 42U), the rest blanking
// panels — a realistically populated server rack.
const servers = (rackId) =>
  Array.from({ length: 17 }, (_, i) => {
    const u = 9 + i * 2;
    return { startU: u, heightU: 2, kind: 'server', partId: `${rackId}-U${u}` };
  });

const RACK_LAYOUT = [
  // Row 1 (-Z): front faces -Z (no rotation)
  { id: 'RACK-01', pos: [-0.6, 0, -ROW_Z], rot: 0, units: servers('RACK-01') },
  { id: 'RACK-02', pos: [0.0, 0, -ROW_Z], rot: 0, units: servers('RACK-02') },
  { id: 'RACK-03', pos: [0.6, 0, -ROW_Z], rot: 0, units: SW },
  // Row 2 (+Z): front faces +Z (rotate 180°)
  { id: 'RACK-04', pos: [-0.6, 0, ROW_Z], rot: Math.PI, units: servers('RACK-04') },
  { id: 'RACK-05', pos: [0.0, 0, ROW_Z], rot: Math.PI, units: ST },
  { id: 'RACK-06', pos: [0.6, 0, ROW_Z], rot: Math.PI, units: PD },
];

const KNOWN_KINDS = new Set(['server', 'gpu', 'switch', 'storage', 'pdu']);
const _warned = new Set();

/** Merge live agent parts into the demo layout. Live units win their slots;
 *  fans attach to the live unit at the same rack position. */
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
          kind: KNOWN_KINDS.has(u.kind) ? u.kind : 'server',
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

function Racks({ racks, pulled, onSelect, onSelectComponent, onHover, onUnhover }) {
  return (
    <group>
      {racks.map((r) => (
        <Rack
          key={r.id}
          position={r.pos}
          rotationY={r.rot}
          units={r.units}
          pulled={pulled}
          onSelect={onSelect}
          onSelectComponent={onSelectComponent}
          onHover={onHover}
          onUnhover={onUnhover}
        />
      ))}
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

function HeatGradient({ racks }) {
  const uniforms = useMemo(() => ({ uIntensity: { value: 0.3 } }), []);
  const target = useRef(0.3);
  const allIds = useMemo(
    () => racks.flatMap((r) => r.units.map((u) => u.partId).filter(Boolean)),
    [racks],
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
    <mesh position={[0, 1.42, 0]} renderOrder={2}>
      <planeGeometry args={[2.5, 2.85]} />
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
function CameraFocus({ focus }) {
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

  useFrame((_, delta) => {
    if (!active.current || !controls) return;
    const a = 1 - Math.exp(-6 * delta); // frame-rate-independent ease
    camera.position.lerp(goalPos.current, a);
    controls.target.lerp(goalTarget.current, a);
    controls.update();
    if (camera.position.distanceTo(goalPos.current) < 0.015) active.current = false;
  });
  return null;
}

/**
 * Deep links: `?part=R760-A17` opens the twin with that part pulled out (and
 * `?part=FAN-R760-03` opens its host server with the fan selected), so an alert
 * or a chat message can link straight to a part. Runs once, as soon as the part
 * exists in the scene (live parts appear after the first poll).
 */
function DeepLink({ want, racks, onSelect, onSelectComponent }) {
  const { scene } = useThree();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    if (!want) { done.current = true; return; }
    let host = want;
    for (const r of racks) for (const u of r.units) if (u.fans?.includes(want)) host = u.partId;
    let obj = null;
    scene.traverse((o) => { if (!obj && o.userData?.partId === host) obj = o; });
    if (!obj) return; // not in the scene yet — retry when the racks update
    done.current = true;
    onSelect(host, obj);
    if (host !== want) setTimeout(() => onSelectComponent(want, host), 0);
  }, [want, racks, scene, onSelect, onSelectComponent]);
  return null;
}

/**
 * Datacenter room scene. Stage 1: room shell, raised floor, ceiling lights,
 * cable trays, CRAC units, and mood lighting. Racks + servers come next.
 */
export default function Datacenter({ selected, setSelected, showHeatmap = false, initialPart = null }) {
  const [hover, setHover] = useState(null);       // { partId, metadata, pos }
  const live = useLiveTopology();
  const racks = useMemo(() => buildRacks(live), [live]);
  const _v = useMemo(() => new THREE.Vector3(), []);
  const _q = useMemo(() => new THREE.Quaternion(), []);
  const _f = useMemo(() => new THREE.Vector3(), []);

  const worldPos = (obj) => {
    obj.getWorldPosition(_v);
    return [_v.x, _v.y + 0.28, _v.z]; // float the card just above the server
  };
  const onSelect = (partId, obj) => {
    // World-space front direction (unit's local -Z, the cold-aisle face) so the
    // camera can frame the pop-out no matter which way the rack faces.
    obj.getWorldQuaternion(_q);
    _f.set(0, 0, -1).applyQuaternion(_q).normalize();
    setSelected({ partId, pos: worldPos(obj), front: [_f.x, _f.y, _f.z] });
  };
  // A component inside the pulled-out unit (a fan): keep the host open and the
  // camera where it is, just switch the panel to the component.
  const onSelectComponent = (partId, hostId) =>
    setSelected((prev) => (prev ? { ...prev, partId, hostId } : prev));
  const onHover = (partId, obj, inside = false) =>
    setHover({ partId, metadata: getMetadata(partId), pos: worldPos(obj), inside });
  const pulled = selected ? selected.hostId || selected.partId : undefined;
  const onUnhover = () => setHover(null);

  return (
    <group>
      {/* Bright, even room lighting so all six racks read clearly. */}
      <ambientLight intensity={0.6} color="#b6c6d6" />
      <hemisphereLight args={['#48596a', '#0a0d12', 0.7]} />
      {/* cool-white fill above every rack */}
      {[-0.6, 0, 0.6].map((x) => (
        <React.Fragment key={x}>
          <pointLight position={[x, 1.95, -1.25]} intensity={4.5} distance={5} decay={2} color="#e2ecff" />
          <pointLight position={[x, 1.95, 1.25]} intensity={4.5} distance={5} decay={2} color="#e2ecff" />
        </React.Fragment>
      ))}
      {/* teal floor-vent accents */}
      <pointLight position={[-3, 0.3, 2.3]} intensity={3} distance={5} decay={2} color="#35e0c6" />
      <pointLight position={[3, 0.3, -2.3]} intensity={3} distance={5} decay={2} color="#35e0c6" />

      <Floor />
      <Shell />
      <CeilingLights />
      <CableTrays />
      <Racks
        racks={racks}
        pulled={pulled}
        onSelect={onSelect}
        onSelectComponent={onSelectComponent}
        onHover={onHover}
        onUnhover={onUnhover}
      />
      <DeepLink want={initialPart} racks={racks} onSelect={onSelect} onSelectComponent={onSelectComponent} />
      <SceneDimmer pulled={pulled} />
      <CameraFocus focus={selected} />
      {showHeatmap && <HeatGradient racks={racks} />}

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
