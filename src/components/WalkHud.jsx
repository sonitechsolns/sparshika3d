import React, { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { NODES, walkPose, dirOf } from '../scene/walk';
import { RACK_LAYOUT, CRACS } from '../data/layout';
import { getUnitIssues, useHealthVersion } from '../data/health';
import { getPartInfo } from '../data/telemetry';

const S = 24;                               // px per metre
const W = 10 * S, H = 6 * S;
const X = (x) => (x + 5) * S;
const Z = (z) => (z + 3) * S;
const TONE = { failed: '#ff3b30', risk: '#ffb020' };
const racks = new Map(RACK_LAYOUT.map((r) => [r.id, r]));

/** Walk-mode overlay: minimap (click a dot to jump there), place name, exit. */
export default function WalkHud({ node, setNode, onExit, onFocus }) {
  useHealthVersion();
  const [pose, setPose] = useState({ ...walkPose });
  useEffect(() => {
    let raf = 0, last = 0;
    const loop = (t) => {
      if (t - last > 80) { last = t; setPose({ ...walkPose }); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const d = dirOf(pose.yaw);
  const px = X(pose.x), pz = Z(pose.z);
  const cone = (a) => { const q = dirOf(pose.yaw + a); return `${px + q.x * 26},${pz + q.z * 26}`; };

  const alerts = [];
  for (const i of getUnitIssues().values()) {
    if (!TONE[i.category]) continue;
    const r = racks.get(getPartInfo(i.unitId)?.rackId);
    if (!r) continue;
    const fz = r.rot === 0 ? -0.55 : 0.55;           // front face side of the rack
    alerts.push({ i, x: r.pos[0], z: r.pos[2] + fz });
  }

  return (
    <div className="walk-hud">
      <div className="walk-hud__top">
        <span className="walk-hud__place">{NODES[node].label}</span>
        <button type="button" className="chip chip--on" onClick={onExit}><LogOut size={14} aria-hidden="true" /> Exit walk</button>
      </div>
      <svg className="minimap" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Floor plan">
        <rect x="0" y="0" width={W} height={H} rx="8" className="minimap__room" />
        {RACK_LAYOUT.map((r) => (
          <rect key={r.id} x={X(r.pos[0] - 0.29)} y={Z(r.pos[2] - 0.5)} width={0.58 * S} height={S} className="minimap__rack" />
        ))}
        {CRACS.map((c) => <rect key={c.partId} x={X(c.pos[0] - 0.43)} y={Z(c.pos[2] - 0.45)} width={0.86 * S} height={0.9 * S} className="minimap__crac" />)}
        {NODES.map((n) => (
          <circle key={n.i} cx={X(n.x)} cy={Z(n.z)} r={n.i === node ? 4 : 3} className={`minimap__node${n.i === node ? ' minimap__node--here' : ''}`}
            onClick={() => setNode(n.i)}><title>{n.label}</title></circle>
        ))}
        {alerts.map(({ i, x, z }) => (
          <circle key={i.key} cx={X(x)} cy={Z(z)} r="4.5" fill={TONE[i.category]} className="minimap__alert"
            onClick={() => onFocus(i.partId)}><title>{i.title}</title></circle>
        ))}
        <polygon points={`${px},${pz} ${cone(0.45)} ${cone(-0.45)}`} className="minimap__cone" />
        <circle cx={px} cy={pz} r="4" className="minimap__me" />
        <line x1={px} y1={pz} x2={px + d.x * 10} y2={pz + d.z * 10} className="minimap__dir" />
      </svg>
      <p className="walk-hud__hint">Drag to look · click the floor arrows or press ↑ ↓ to walk · ← → to turn · scroll to zoom · click a marker to open the part</p>
    </div>
  );
}
