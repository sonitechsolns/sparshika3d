import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { getUnitIssues, useHealthVersion } from '../data/health';
import { RACK_H } from './rackGeometry';

const TONE = { failed: '#ff3b30', risk: '#ffb020', service: '#5aa9ff', ageing: '#9aa3ad' };
const RING = new THREE.RingGeometry(0.03, 0.045, 28);
const DOT = new THREE.CircleGeometry(0.018, 20);
const PIN = new THREE.OctahedronGeometry(0.06, 0);

function Marker({ issue, pos, up, onFocus, label }) {
  const g = useRef();
  const col = TONE[issue.category];
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame(({ clock }) => {
    if (!g.current) return;
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * (issue.category === 'failed' ? 5 : 3) + phase);
    g.current.scale.setScalar(0.85 + 0.35 * k);
  });
  const handlers = {
    onClick: (e) => { e.stopPropagation(); if (e.delta > 6) return; onFocus(issue.partId); },
    onPointerOver: (e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; },
    onPointerOut: () => { document.body.style.cursor = 'auto'; },
  };
  return (
    <>
      {/* on the unit's front face */}
      <Billboard position={pos}>
        <group ref={g} {...handlers}>
          <mesh geometry={RING}><meshBasicMaterial color={col} toneMapped={false} transparent opacity={0.95} depthWrite={false} /></mesh>
          <mesh geometry={DOT}><meshBasicMaterial color={col} toneMapped={false} /></mesh>
        </group>
        {label && (
          <Html position={[0, 0.09, 0]} center zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
            <div className={`beacon-tag beacon-tag--${issue.category}`}>
              <b>{issue.category === 'failed' ? 'Failed' : issue.category === 'risk' ? 'At risk' : 'Service'}</b> {issue.title}
            </div>
          </Html>
        )}
      </Billboard>
      {/* pin above the rack, visible from across the hall */}
      {up && (
        <mesh geometry={PIN} position={up} {...handlers}>
          <meshBasicMaterial color={col} toneMapped={false} />
        </mesh>
      )}
    </>
  );
}

/**
 * 3D markers for units with open issues: a pulsing ring on the unit's front
 * and a pin over its rack. `labels` adds text tags for the few nearest
 * markers (Walk mode) — capped so the page never floods with DOM labels.
 */
export default function Beacons({ room, onFocus, labels = false, include = ['failed', 'risk'] }) {
  useHealthVersion();
  const { camera } = useThree();
  const items = [];
  const pinned = new Set();
  for (const issue of getUnitIssues().values()) {
    if (!include.includes(issue.category)) continue;
    const idx = room.byPart.get(issue.unitId);
    if (idx == null) continue;
    const u = room.units[idx];
    const f = u.anchor.front;
    const pos = [u.anchor.pos.x + f.x * 0.06, u.anchor.pos.y, u.anchor.pos.z + f.z * 0.06];
    // one pin per rack (the worst issue sorts first)
    const pinKey = u.rackId;
    const up = pinned.has(pinKey) ? null : [u.anchor.pos.x + f.x * 0.1, RACK_H + 0.18, u.anchor.pos.z + f.z * 0.1];
    pinned.add(pinKey);
    items.push({ issue, pos, up });
  }

  // Which markers get a text tag: the 5 nearest within 4.5 m, rechecked twice a second.
  const [near, setNear] = useState(() => new Set());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => {
    if (!labels) { setNear(new Set()); return undefined; }
    const v = new THREE.Vector3();
    const tick = () => {
      const d = itemsRef.current
        .map((it) => ({ k: it.issue.key, d: v.set(...it.pos).distanceTo(camera.position) }))
        .filter((x) => x.d < 4.5).sort((a, b) => a.d - b.d).slice(0, 5).map((x) => x.k);
      setNear((prev) => (prev.size === d.length && d.every((k) => prev.has(k)) ? prev : new Set(d)));
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [labels, camera]);

  return (
    <group>
      {items.map(({ issue, pos, up }) => (
        <Marker key={issue.key} issue={issue} pos={pos} up={up} onFocus={onFocus} label={near.has(issue.key)} />
      ))}
    </group>
  );
}
