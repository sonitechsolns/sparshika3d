import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { EYE, NODES, dirOf, neighbourToward, walkPose, yawTo } from './walk';

const PITCH_MAX = THREE.MathUtils.degToRad(70);

/** Floor chevron pointing toward a neighbouring standing point (click to go). */
function Arrow({ from, to, onGo }) {
  const yaw = yawTo(from, to);
  const d = dirOf(yaw);
  const ref = useRef();
  const hover = useRef(false);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const k = 0.5 + 0.5 * Math.sin(clock.elapsedTime * 3);
    ref.current.material.opacity = hover.current ? 0.95 : 0.45 + 0.3 * k;
  });
  const shape = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(0, 0.2); s.lineTo(0.17, -0.02); s.lineTo(0.08, -0.02); s.lineTo(0, 0.08);
    s.lineTo(-0.08, -0.02); s.lineTo(-0.17, -0.02); s.closePath();
    return new THREE.ShapeGeometry(s);
  }, []);
  useEffect(() => () => shape.dispose(), [shape]);
  return (
    <group position={[from.x + d.x * 0.9, 0.04, from.z + d.z * 0.9]} rotation={[0, yaw, 0]}>
      <mesh ref={ref} geometry={shape} rotation={[-Math.PI / 2, 0, 0]}
        onPointerOver={(e) => { e.stopPropagation(); hover.current = true; document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { hover.current = false; document.body.style.cursor = 'auto'; }}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; onGo(to.i); }}>
        <meshBasicMaterial color="#ffffff" transparent opacity={0.6} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      {/* larger invisible hit area so the arrow is easy to click */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0.05]}
        onClick={(e) => { e.stopPropagation(); if (e.delta > 6) return; onGo(to.i); }}>
        <circleGeometry args={[0.28, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Street-view style walking: stand at a point, drag to look around, click a
 * floor arrow (or press ↑/↓, W/S) to step to the next point, ←/→ to turn,
 * scroll to zoom. The camera glides between points; the hall stays live.
 */
export default function WalkControls({ node, setNode, aim }) {
  const { camera, gl } = useThree();
  const look = useRef({ yaw: aim?.yaw ?? 0, pitch: aim?.pitch ?? -0.05, fov: 68 });
  const goal = useRef(new THREE.Vector3(NODES[node].x, EYE, NODES[node].z));
  const nodeRef = useRef(node);

  // Enter: start from wherever the camera is now (so stepping into the hall is
  // a glide, not a cut) and switch to a wide, eye-level lens on the way.
  const cur = useRef(null);
  if (!cur.current) {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
    cur.current = { yaw: e.y, pitch: e.x };
  }
  useEffect(() => {
    const cam = camera;
    const prevFov = cam.fov;
    cam.rotation.order = 'YXZ';
    return () => { cam.fov = prevFov; cam.updateProjectionMatrix(); };
  }, [camera]);

  // A new heading to face (entering, or flying to a part): turn smoothly.
  useEffect(() => {
    if (!aim) return;
    // take the short way round
    const c = cur.current.yaw;
    let y = aim.yaw;
    while (y - c > Math.PI) y -= Math.PI * 2;
    while (y - c < -Math.PI) y += Math.PI * 2;
    look.current.yaw = y;
    look.current.pitch = THREE.MathUtils.clamp(aim.pitch ?? -0.05, -PITCH_MAX, PITCH_MAX);
  }, [aim]);

  useEffect(() => {
    nodeRef.current = node;
    goal.current.set(NODES[node].x, EYE, NODES[node].z);
  }, [node]);

  // Drag to look (grab-the-world, like street view), wheel to zoom.
  useEffect(() => {
    const el = gl.domElement;
    let drag = null;
    const down = (e) => { if (e.button === 0) drag = { x: e.clientX, y: e.clientY }; };
    const move = (e) => {
      if (!drag) return;
      const f = (look.current.fov / 68) * 0.0042;
      look.current.yaw += (e.clientX - drag.x) * f;
      look.current.pitch = THREE.MathUtils.clamp(look.current.pitch + (e.clientY - drag.y) * f, -PITCH_MAX, PITCH_MAX);
      drag = { x: e.clientX, y: e.clientY };
    };
    const up = () => { drag = null; };
    const wheel = (e) => { e.preventDefault(); look.current.fov = THREE.MathUtils.clamp(look.current.fov + e.deltaY * 0.03, 30, 80); };
    const key = (e) => {
      if (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'arrowleft' || k === 'a') look.current.yaw += Math.PI / 6;
      else if (k === 'arrowright' || k === 'd') look.current.yaw -= Math.PI / 6;
      else if (k === 'arrowup' || k === 'w' || k === 'arrowdown' || k === 's') {
        const back = k === 'arrowdown' || k === 's';
        const j = neighbourToward(nodeRef.current, look.current.yaw + (back ? Math.PI : 0));
        if (j != null) setNode(j);
      } else return;
      e.preventDefault();
    };
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    window.addEventListener('keydown', key);
    return () => {
      el.removeEventListener('pointerdown', down);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', key);
    };
  }, [gl, setNode]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.1);                       // no jumps after a stalled frame
    camera.position.x = THREE.MathUtils.damp(camera.position.x, goal.current.x, 4, dt);
    camera.position.z = THREE.MathUtils.damp(camera.position.z, goal.current.z, 4, dt);
    camera.position.y = THREE.MathUtils.damp(camera.position.y, EYE, 4, dt);
    cur.current.yaw = THREE.MathUtils.damp(cur.current.yaw, look.current.yaw, 7, dt);
    cur.current.pitch = THREE.MathUtils.damp(cur.current.pitch, look.current.pitch, 7, dt);
    camera.rotation.set(cur.current.pitch, cur.current.yaw, 0, 'YXZ');
    if (Math.abs(camera.fov - look.current.fov) > 0.05) {
      camera.fov = THREE.MathUtils.damp(camera.fov, look.current.fov, 10, dt);
      camera.updateProjectionMatrix();
    }
    walkPose.x = camera.position.x; walkPose.z = camera.position.z; walkPose.yaw = cur.current.yaw;
  });

  const here = NODES[node];
  return (
    <group>
      {here.links.map((j) => <Arrow key={`${node}-${j}`} from={here} to={NODES[j]} onGo={setNode} />)}
    </group>
  );
}
