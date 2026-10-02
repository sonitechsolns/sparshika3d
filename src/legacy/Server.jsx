import React, { useRef, useState, useEffect } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeLocalSpinAxis } from '../utils/fanAxis';
import { getTelemetry, getMetadata, watchMetric, getMetricHistory } from '../data/telemetry';
import Sparkline from '../components/Sparkline';

// Map internal-component meshes → part_id (the join key to metadata + cloud
// telemetry), so each component is inspectable exactly like GPU-PILOT-01.
const PART_MAP = [
  { partId: 'CPU-R760-01', test: (n) => /^cpu_(heatsink|fins)_1$/.test(n) },
  { partId: 'CPU-R760-02', test: (n) => /^cpu_(heatsink|fins)_2$/.test(n) },
  { partId: 'RAM-R760-01', test: (n) => /^dimm_/.test(n) },
  { partId: 'DRIVE-R760-01', test: (n) => /^drive_(bay|latch|indicator|vent)_/.test(n) },
];

function partIdForMesh(name) {
  if (!name) return null;
  // Each fan module (blade assembly, shroud, or tab) → its own FAN-R760-0N id.
  const fan = name.match(/^system_fan_(\d+)(?:_shroud|_tab)?$/);
  if (fan) return `FAN-R760-0${fan[1]}`;
  // GPU riser cards (pcb or shroud) → GPU-RISER-0N.
  const gpu = name.match(/^gpu_riser_(\d+)_/);
  if (gpu) return `GPU-RISER-${gpu[1]}`;
  const hit = PART_MAP.find((p) => p.test(name));
  return hit ? hit.partId : null;
}

export default function Server({ position = [0, 0, 0], isCoverOpen = false, isBezelOn = false }) {
  const group = useRef();
  const { scene } = useGLTF('/server_r760.glb');
  const fansRef = useRef([]);
  const hiliteRef = useRef(null); // material currently emissive-highlighted

  const [hover, setHover] = useState(null);     // { partId, metadata, pos:[x,y,z] }
  const [selected, setSelected] = useState(null); // { partId, telemetry, pos:[x,y,z] }
  const [, setTick] = useState(0);

  // While a part is selected, record its metric history and refresh the panel
  // graphs on a timer.
  useEffect(() => {
    if (!selected) return undefined;
    watchMetric(selected.partId);
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [selected]);

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
        // Security bezel (hex grille + Dell logo) is a removable cover — off by
        // default so the 24 drive bays are the front face.
        if (/^(front_hex_mesh|logo_plate|dell_logo_decal)$/.test(node.name)) {
          node.visible = isBezelOn;
        }
      }
      if (/^(system_fan_\d+|psu_fan_\d+)$/.test(node.name)) {
        // Orient the spin axis toward the front (+Z ≈ the front face after
        // glTF's Y-up conversion) so every fan turns the same way and a positive
        // angle reads as counter-clockwise viewed from the front.
        const axis = computeLocalSpinAxis(node);
        node.updateWorldMatrix(true, false);
        if (axis.clone().transformDirection(node.matrixWorld).z < 0) axis.negate();
        fans.push({ obj: node, axis });
      }
    });
    fansRef.current = fans;
    return clone;
  }, [scene, isCoverOpen, isBezelOn]);

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

  // Fans spin only when the cover is open, about each fan's geometry-derived
  // disc-normal axis (so none tumble). Speed tracks CPU load_pct from telemetry
  // (higher load → faster); the sign gives CCW rotation viewed from the front.
  useFrame((state, delta) => {
    if (!isCoverOpen) return;
    const load = getTelemetry('CPU-R760-01').load;
    const speed = 3 + (Number(load) || 0) / 100 * 25; // rad/s: ~3 idle … ~28 full load
    for (const { obj, axis } of fansRef.current) {
      obj.rotateOnAxis(axis, speed * delta); // axis points front → +angle = CCW from front
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

      {/* Click telemetry panel with live metric graphs */}
      {selected && (
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
            {(() => {
              const hist = getMetricHistory(selected.partId);
              const cur = hist[hist.length - 1] || selected.telemetry;
              return (
                <div className="panel-body">
                  <div className="data-row">
                    <span>Condition</span>
                    <span className={`status ${String(cur.condition).includes('Critical') ? 'critical' : 'optimal'}`}>
                      {cur.condition}
                    </span>
                  </div>
                  <div className="data-row">
                    <span>Age</span>
                    <span>{cur.age} days</span>
                  </div>
                  <div className="metric-row">
                    <div className="metric-row__head">
                      <span>Temperature</span>
                      <span>{Number(cur.temp).toFixed(1)} &deg;C</span>
                    </div>
                    <Sparkline values={hist.map((s) => s.temp)} color="#ff8a4c" />
                  </div>
                  <div className="metric-row">
                    <div className="metric-row__head">
                      <span>Load</span>
                      <span>{cur.load}%</span>
                    </div>
                    <Sparkline values={hist.map((s) => s.load)} color="#4f46e5" />
                  </div>
                  {cur.rpm != null && (
                    <div className="metric-row">
                      <div className="metric-row__head">
                        <span>Fan RPM</span>
                        <span>{Number(cur.rpm).toLocaleString()}</span>
                      </div>
                      <Sparkline values={hist.map((s) => s.rpm)} color="#35e0c6" />
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </Html>
      )}
    </group>
  );
}

useGLTF.preload('/server_r760.glb');
