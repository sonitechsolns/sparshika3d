import React, { useRef, useState } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeLocalSpinAxis } from '../utils/fanAxis';
import { getTelemetry, getMetadata } from '../data/telemetry';

// Map internal-component meshes → part_id (the join key to metadata + cloud
// telemetry), so each component is inspectable exactly like GPU-PILOT-01.
const PART_MAP = [
  { partId: 'CPU-R760-01', test: (n) => /^cpu_(heatsink|fins)_1$/.test(n) },
  { partId: 'CPU-R760-02', test: (n) => /^cpu_(heatsink|fins)_2$/.test(n) },
  { partId: 'RAM-R760-01', test: (n) => /^dimm_/.test(n) },
  { partId: 'DRIVE-R760-01', test: (n) => /^drive_(bay|latch|indicator)_/.test(n) },
];

function partIdForMesh(name) {
  if (!name) return null;
  const hit = PART_MAP.find((p) => p.test(name));
  return hit ? hit.partId : null;
}

export default function Server({ position = [0, 0, 0], isCoverOpen = false }) {
  const group = useRef();
  const { scene } = useGLTF('/server_r760.glb');
  const fansRef = useRef([]);
  const hiliteRef = useRef(null); // material currently emissive-highlighted

  const [hover, setHover] = useState(null);     // { partId, metadata, pos:[x,y,z] }
  const [selected, setSelected] = useState(null); // { partId, telemetry, pos:[x,y,z] }

  // Clone materials to prevent shared mutation issues
  const clonedScene = React.useMemo(() => {
    const clone = scene.clone();
    const fans = [];
    clone.traverse((node) => {
      if (node.isMesh) {
        node.material = node.material.clone();
        if (node.name === 'top_cover') {
          node.visible = !isCoverOpen;
        }
      }
      if (/^(system_fan_\d+_rotor_\d+|psu_fan_\d+)$/.test(node.name)) {
        fans.push({ obj: node, axis: computeLocalSpinAxis(node) });
      }
    });
    fansRef.current = fans;
    return clone;
  }, [scene, isCoverOpen]);

  // Position of the event's mesh, expressed in this component's local frame so
  // the popup/panel anchors to the actual part.
  const localPos = (obj) => {
    const v = obj.getWorldPosition(new THREE.Vector3());
    if (group.current) group.current.worldToLocal(v);
    return [v.x, v.y, v.z];
  };

  const setHighlight = (material) => {
    if (hiliteRef.current && hiliteRef.current !== material) {
      hiliteRef.current.emissive?.setHex(0x000000);
    }
    if (material?.emissive) material.emissive.setHex(0x223a3a);
    hiliteRef.current = material || null;
  };

  const handlePointerOver = (e) => {
    const partId = partIdForMesh(e.object.name);
    if (!partId) return;
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    setHighlight(e.object.material);
    setHover({ partId, metadata: getMetadata(partId), pos: localPos(e.object) });
  };

  const handlePointerOut = (e) => {
    if (!partIdForMesh(e.object.name)) return;
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    setHighlight(null);
    setHover(null);
  };

  const handleClick = (e) => {
    const partId = partIdForMesh(e.object.name);
    if (!partId) return; // click on chassis/empty → ignore
    e.stopPropagation();
    setSelected((cur) =>
      cur && cur.partId === partId
        ? null // toggle off if same part
        : { partId, telemetry: getTelemetry(partId), pos: localPos(e.object) }
    );
  };

  // Fans only spin (and matter) once the cover is open.
  useFrame((state, delta) => {
    if (!isCoverOpen) return;
    for (const { obj, axis } of fansRef.current) {
      obj.rotateOnAxis(axis, 6 * delta);
    }
  });

  return (
    <group ref={group} position={position} dispose={null}>
      <group
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        rotation={[0, -Math.PI / 8, 0]}
      >
        <primitive object={clonedScene} />
      </group>

      {/* Hover metadata popup (hidden while a detail panel is open) */}
      {hover && !selected && (
        <Html position={hover.pos} center>
          <div className="hover-popup">
            <div className="popup-header">
              <img src={hover.metadata.logo} alt="Logo" className="popup-logo" />
              <h4>{hover.metadata.brand}</h4>
            </div>
            <div className="popup-body">
              <p><strong>Model:</strong> {hover.metadata.model}</p>
              <p><strong>PN:</strong> {hover.metadata.partNumber}</p>
              <p><strong>SN:</strong> {hover.metadata.serialNumber}</p>
            </div>
          </div>
        </Html>
      )}

      {/* Click telemetry panel */}
      {selected && selected.telemetry && (
        <Html
          position={[selected.pos[0], selected.pos[1] + 0.12, selected.pos[2]]}
          center
          zIndexRange={[100, 0]}
        >
          <div className="detail-panel">
            <div className="panel-header">
              <h4>Telemetry ({selected.partId})</h4>
              <button className="close-btn" onClick={() => setSelected(null)}>&times;</button>
            </div>
            <div className="panel-body">
              <div className="data-row">
                <span>Condition</span>
                <span className={`status ${selected.telemetry.condition.includes('Critical') ? 'critical' : 'optimal'}`}>
                  {selected.telemetry.condition}
                </span>
              </div>
              <div className="data-row">
                <span>Age</span>
                <span>{selected.telemetry.age} days</span>
              </div>
              <div className="data-row">
                <span>Temperature</span>
                <span>{selected.telemetry.temp} &deg;C</span>
              </div>
              <div className="data-row">
                <span>Load</span>
                <span>{selected.telemetry.load}%</span>
              </div>
            </div>
          </div>
        </Html>
      )}
    </group>
  );
}

useGLTF.preload('/server_r760.glb');
