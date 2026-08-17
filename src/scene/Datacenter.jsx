import React, { useMemo, useState } from 'react';
import { Instances, Instance, Html } from '@react-three/drei';
import * as THREE from 'three';
import Rack from './Rack';
import { getMetadata } from '../data/telemetry';
import TelemetryPanel, { HoverCard } from '../components/TelemetryPanel';

// Room is 10m (X, length) x 6m (Z, width) x 3m (Y, height), centred on origin.
export const ROOM = { L: 10, W: 6, H: 3 };
const TILE = 0.6;                 // 600mm raised-floor tiles
const HALF = { L: ROOM.L / 2, W: ROOM.W / 2 };
const AISLE_HALF = 0.75;          // half of the 1.5m hot aisle
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
      {/* ceiling */}
      <mesh position={[0, ROOM.H, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ROOM.L, ROOM.W]} />
        <meshStandardMaterial color="#0a0c10" roughness={1} side={2} />
      </mesh>

      {/* long side walls (z = ±W/2) */}
      <mesh position={[0, ROOM.H / 2, -HALF.W]}>
        <boxGeometry args={[ROOM.L, ROOM.H, 0.1]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>
      <mesh position={[0, ROOM.H / 2, HALF.W]}>
        <boxGeometry args={[ROOM.L, ROOM.H, 0.1]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>

      {/* solid end wall (+X) */}
      <mesh position={[HALF.L, ROOM.H / 2, 0]}>
        <boxGeometry args={[0.1, ROOM.H, ROOM.W]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
      </mesh>

      {/* end wall (-X) with a glass door */}
      <mesh position={[-HALF.L, ROOM.H / 2, 0]}>
        <boxGeometry args={[0.1, ROOM.H, ROOM.W]} />
        <meshStandardMaterial color={wall} roughness={0.9} />
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
            <meshStandardMaterial color="#eef4ff" emissive="#e4edff" emissiveIntensity={1.8} />
          </mesh>
          <pointLight position={[-2.6, ROOM.H - 0.25, z]} intensity={5} distance={7} decay={2} color="#d8e4ff" />
          <pointLight position={[2.6, ROOM.H - 0.25, z]} intensity={5} distance={7} decay={2} color="#d8e4ff" />
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
const SW = [{ startU: 40, heightU: 1, kind: 'switch' }, { startU: 38, heightU: 1, kind: 'switch' },
            { startU: 36, heightU: 1, kind: 'switch' }, { startU: 20, heightU: 1, kind: 'switch' }];
const ST = [{ startU: 38, heightU: 2, kind: 'storage' }, { startU: 35, heightU: 2, kind: 'storage' },
            { startU: 32, heightU: 2, kind: 'storage' }, { startU: 10, heightU: 2, kind: 'storage' }];
const PD = [{ startU: 2, heightU: 18, kind: 'pdu' }, { startU: 38, heightU: 2, kind: 'pdu' }];

// 4 R760 servers at the top of each server rack, rest blanking panels.
const servers = (rackId) =>
  [39, 37, 35, 33].map((u) => ({ startU: u, heightU: 2, kind: 'server', partId: `${rackId}-U${u}` }));

const RACKS = [
  // Row 1 (-Z): front faces -Z (no rotation)
  { id: 'RACK-01', pos: [-0.6, 0, -ROW_Z], rot: 0, units: servers('RACK-01') },
  { id: 'RACK-02', pos: [0.0, 0, -ROW_Z], rot: 0, units: servers('RACK-02') },
  { id: 'RACK-03', pos: [0.6, 0, -ROW_Z], rot: 0, units: SW },
  // Row 2 (+Z): front faces +Z (rotate 180°)
  { id: 'RACK-04', pos: [-0.6, 0, ROW_Z], rot: Math.PI, units: servers('RACK-04') },
  { id: 'RACK-05', pos: [0.0, 0, ROW_Z], rot: Math.PI, units: ST },
  { id: 'RACK-06', pos: [0.6, 0, ROW_Z], rot: Math.PI, units: PD },
];

function Racks({ onServerSelect, onServerHover, onServerUnhover }) {
  return (
    <group>
      {RACKS.map((r) => (
        <Rack
          key={r.id}
          position={r.pos}
          rotationY={r.rot}
          units={r.units}
          onServerSelect={onServerSelect}
          onServerHover={onServerHover}
          onServerUnhover={onServerUnhover}
        />
      ))}
    </group>
  );
}

// --- Two CRAC units (white/grey, 0.6m wide x 2m tall) against the side walls.
function CRACUnits() {
  const mat = <meshStandardMaterial color="#c8ccd2" metalness={0.2} roughness={0.5} />;
  return (
    <group>
      <mesh position={[-3.6, 1.0, HALF.W - 0.45]} castShadow>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        {mat}
      </mesh>
      <mesh position={[3.6, 1.0, -(HALF.W - 0.45)]} castShadow>
        <boxGeometry args={[0.7, 2.0, 0.8]} />
        {mat}
      </mesh>
    </group>
  );
}

/**
 * Datacenter room scene. Stage 1: room shell, raised floor, ceiling lights,
 * cable trays, CRAC units, and mood lighting. Racks + servers come next.
 */
export default function Datacenter() {
  const [hover, setHover] = useState(null);       // { partId, metadata, pos }
  const [selected, setSelected] = useState(null); // { partId, pos }
  const _v = useMemo(() => new THREE.Vector3(), []);

  const worldPos = (obj) => {
    obj.getWorldPosition(_v);
    return [_v.x, _v.y + 0.28, _v.z]; // float the card just above the server
  };
  const onServerSelect = (partId, obj) => setSelected({ partId, pos: worldPos(obj) });
  const onServerHover = (partId, obj) => {
    document.body.style.cursor = 'pointer';
    setHover({ partId, metadata: getMetadata(partId), pos: worldPos(obj) });
  };
  const onServerUnhover = () => {
    document.body.style.cursor = 'auto';
    setHover(null);
  };

  return (
    <group>
      {/* Mood lighting: dark ambient + teal floor-vent accents. */}
      <ambientLight intensity={0.16} color="#9fb2c8" />
      <hemisphereLight args={['#33424f', '#05070a', 0.35]} />
      <pointLight position={[-3, 0.3, 2.3]} intensity={3} distance={5} decay={2} color="#35e0c6" />
      <pointLight position={[3, 0.3, -2.3]} intensity={3} distance={5} decay={2} color="#35e0c6" />
      <pointLight position={[3, 0.3, 2.3]} intensity={2} distance={5} decay={2} color="#2b8fff" />

      <Floor />
      <Shell />
      <CeilingLights />
      <CableTrays />
      <CRACUnits />
      <Racks
        onServerSelect={onServerSelect}
        onServerHover={onServerHover}
        onServerUnhover={onServerUnhover}
      />

      {hover && !selected && (
        <Html position={hover.pos} center distanceFactor={6}>
          <HoverCard metadata={hover.metadata} />
        </Html>
      )}
      {selected && (
        <Html position={selected.pos} center distanceFactor={6} zIndexRange={[100, 0]}>
          <TelemetryPanel partId={selected.partId} onClose={() => setSelected(null)} />
        </Html>
      )}
    </group>
  );
}
