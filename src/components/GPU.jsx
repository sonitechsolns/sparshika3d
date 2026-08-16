import React, { useRef, useState, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF, Html } from '@react-three/drei';
import { getTelemetry, getMetadata, watchMetric, getMetricHistory } from '../data/telemetry';
import { computeLocalSpinAxis } from '../utils/fanAxis';
import Sparkline from './Sparkline';

export function GPU({ position, partId }) {
  const group = useRef();
  const { scene } = useGLTF('/gpu_pilot.glb');

  // Collect the fan rotor groups once. Each `Fan_N_Rotor` node parents the
  // hub + all blade orbits, so spinning the rotor spins the whole fan. The
  // static grille (`Fan_N_Housing`) lives outside the rotor and stays put.
  const fanRotors = useMemo(() => {
    const rotors = [];
    scene.traverse((o) => {
      if (/^Fan_\d+_Rotor$/.test(o.name)) {
        rotors.push({ obj: o, axis: computeLocalSpinAxis(o) });
      }
    });
    return rotors;
  }, [scene]);

  const [hovered, setHovered] = useState(false);
  const [clicked, setClicked] = useState(false);
  
  // Memoize metadata so it doesn't re-generate randomly on renders
  const metadata = useMemo(() => getMetadata(partId), [partId]);
  
  // Fetch telemetry only when clicked to simulate an API request
  const [telemetry, setTelemetry] = useState(null);
  const [, setTick] = useState(0);

  // While the detail panel is open, record metric history and refresh graphs.
  useEffect(() => {
    if (!clicked) return undefined;
    watchMetric(partId);
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, [clicked, partId]);

  const handleClick = (e) => {
    e.stopPropagation();
    if (!clicked) {
      setTelemetry(getTelemetry(partId));
    }
    setClicked(!clicked);
  };

  const handlePointerOver = (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
    setHovered(true);
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    document.body.style.cursor = 'auto';
    setHovered(false);
  };

  // Spin the fan blades every frame about each rotor's true disc-normal axis
  // (computed from geometry), driving real blade geometry — not a texture trick.
  // Speed scales with load once telemetry is known, with a slow idle spin.
  useFrame((_, delta) => {
    const load = telemetry ? telemetry.load : 25;
    const speed = 4 + (load / 100) * 20; // rad/s: idle ~4, full load ~24
    for (const { obj, axis } of fanRotors) {
      obj.rotateOnAxis(axis, speed * delta);
    }
  });

  return (
    <group ref={group} position={position} dispose={null}>
      <group
        onPointerOver={handlePointerOver}
        onPointerOut={handlePointerOut}
        onClick={handleClick}
        rotation={[0, -Math.PI / 4, 0]}
      >
        <primitive object={scene} />

        {/* Hover Popup */}
        {hovered && !clicked && (
          <Html position={[0.1, 0.1, 0.1]} center>
            <div className="hover-popup">
              <div className="popup-header">
                <img src={metadata.logo} alt="Logo" className="popup-logo" />
                <h4>{metadata.brand}</h4>
              </div>
              <div className="popup-body">
                <p><strong>Model:</strong> {metadata.model}</p>
                <p><strong>PN:</strong> {metadata.partNumber}</p>
                <p><strong>SN:</strong> {metadata.serialNumber}</p>
              </div>
            </div>
          </Html>
        )}

        {/* Click Detail Panel with live metric graphs */}
        {clicked && telemetry && (
          <Html position={[0.2, 0, 0.2]} center zIndexRange={[100, 0]}>
            <div className="detail-panel">
              <div className="panel-header">
                <h4>GPU Telemetry ({partId})</h4>
                <button className="close-btn" onClick={handleClick}>&times;</button>
              </div>
              {(() => {
                const hist = getMetricHistory(partId);
                const cur = hist[hist.length - 1] || telemetry;
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
    </group>
  );
}

// Preload the model to prevent popping in
useGLTF.preload('/gpu_pilot.glb');
