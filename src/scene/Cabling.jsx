import React, { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCabling, tubeGeometry } from './cabling';
import { BOX } from './roomModel';
import { registerConnections } from '../data/telemetry';

// Cable jackets and containment, colour-coded the way halls are labelled.
const MAT = {
  power: { color: '#16171a', roughness: 0.62, metalness: 0.05 },
  copper: { color: '#2f6fd6', roughness: 0.5, metalness: 0.02 },
  fiber: { color: '#f2c81a', roughness: 0.4, metalness: 0, emissive: '#6b5200', emissiveIntensity: 0.35 },
  pdu: { color: '#1d2024', roughness: 0.5, metalness: 0.35 },
  pduA: { color: '#d8342c', roughness: 0.5, emissive: '#3a0806', emissiveIntensity: 0.4 },
  pduB: { color: '#2d6fe0', roughness: 0.5, emissive: '#06173a', emissiveIntensity: 0.4 },
  psu: { color: '#5b626b', roughness: 0.45, metalness: 0.55 },
  busway: { color: '#a7adb5', roughness: 0.35, metalness: 0.7 },
  busA: { color: '#d8342c', roughness: 0.5 },
  busB: { color: '#2d6fe0', roughness: 0.5 },
  tap: { color: '#c9ccd1', roughness: 0.4, metalness: 0.5 },
  tray: { color: '#6d747d', roughness: 0.45, metalness: 0.75 },
  raceway: { color: '#e9b90f', roughness: 0.55, metalness: 0.05 },
  rod: { color: '#7c828a', roughness: 0.5, metalness: 0.7 },
  grommet: { color: '#0c0d0f', roughness: 0.8 },
};

// Which boxes belong to which cable class (hidden together with it).
const GROUP = {
  power: ['pdu', 'pduA', 'pduB', 'psu', 'busway', 'busA', 'busB', 'tap'],
  copper: ['tray'],
  fiber: ['raceway'],
  always: ['rod', 'grommet'],
};

function Boxes({ list, mat }) {
  const ref = useRef();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    list.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [list]);
  if (!list.length) return null;
  return (
    <instancedMesh key={list.length} ref={ref} args={[BOX, undefined, list.length]} frustumCulled={false}>
      <meshStandardMaterial {...mat} />
    </instancedMesh>
  );
}

function Tubes({ geometry, mat }) {
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} frustumCulled={false}>
      <meshStandardMaterial {...mat} />
    </mesh>
  );
}

/**
 * Every cable in the hall, segregated by class: thick black power (busway →
 * tap-off → PDU → PSU), blue Cat6A copper (servers → vertical manager → TORs,
 * patch-panel trunks → network rack) and thin yellow fibre (TORs → raceway →
 * spines). `show` = { power, copper, fiber } toggles each class.
 */
export default function Cabling({ room, racks, show }) {
  const { cables, boxes, connections } = useMemo(() => buildCabling(room, racks), [room, racks]);
  useEffect(() => { registerConnections(connections); }, [connections]);
  const tubes = useMemo(() => ({
    power: tubeGeometry(cables.power, mergeGeometries),
    copper: tubeGeometry(cables.copper, mergeGeometries),
    fiber: tubeGeometry(cables.fiber, mergeGeometries),
  }), [cables]);

  return (
    <group>
      {['power', 'copper', 'fiber'].map((cls) => (
        <group key={cls} visible={show[cls] !== false}>
          <Tubes geometry={tubes[cls]} mat={MAT[cls]} />
          {GROUP[cls].map((k) => <Boxes key={k} list={boxes[k]} mat={MAT[k]} />)}
        </group>
      ))}
      {GROUP.always.map((k) => <Boxes key={k} list={boxes[k]} mat={MAT[k]} />)}
    </group>
  );
}
