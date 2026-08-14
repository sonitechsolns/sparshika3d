import React, { useRef, useState } from 'react';
import { useGLTF, Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { computeLocalSpinAxis } from '../utils/fanAxis';

export default function Server({ position = [0, 0, 0], isCoverOpen = false }) {
  const group = useRef();
  const { scene } = useGLTF('/server_r760.glb');
  const [hoveredPart, setHoveredPart] = useState(null);
  const fansRef = useRef([]);

  // Clone materials to prevent shared mutation issues
  const clonedScene = React.useMemo(() => {
    const clone = scene.clone();
    const fans = [];
    clone.traverse((node) => {
      if (node.isMesh) {
        node.material = node.material.clone();

        // Hide top cover if open
        if (node.name === 'top_cover') {
          node.visible = !isCoverOpen;
        }
      }
      // Collect every fan rotor (system + PSU) with its true spin axis,
      // computed from geometry so it can't be rotated about the wrong axis.
      if (/^(system_fan_\d+_rotor_\d+|psu_fan_\d+)$/.test(node.name)) {
        fans.push({ obj: node, axis: computeLocalSpinAxis(node) });
      }
    });
    fansRef.current = fans;
    return clone;
  }, [scene, isCoverOpen]);

  // Handle pointer events
  const handlePointerOver = (e) => {
    e.stopPropagation();
    if (e.object.name) {
      setHoveredPart(e.object.name);
      if (e.object.material && e.object.material.emissive) {
        e.object.material.emissive = new THREE.Color(0x333333);
      }
    }
  };

  const handlePointerOut = (e) => {
    e.stopPropagation();
    setHoveredPart(null);
    if (e.object.material && e.object.material.emissive) {
      e.object.material.emissive = new THREE.Color(0x000000);
    }
  };

  const handleClick = (e) => {
    e.stopPropagation();
    console.log("Clicked:", e.object.name);
  };

  // Animate fans (only meaningful once the cover is open). Each fan spins about
  // its own geometry-derived disc-normal axis, so no fan tumbles.
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
        rotation={[0, -Math.PI / 8, 0]} // Slight angle for default viewing
      >
        <primitive object={clonedScene} />
      </group>
      
      {hoveredPart && (
        <Html position={[0, 0.4, 0]} center>
          <div style={{
            background: 'rgba(0, 0, 0, 0.8)',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            fontFamily: 'monospace',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
            border: '1px solid #333'
          }}>
            {hoveredPart}
          </div>
        </Html>
      )}
    </group>
  );
}

useGLTF.preload('/server_r760.glb');
