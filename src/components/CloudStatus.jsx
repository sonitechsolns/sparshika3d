import React, { useEffect, useState } from 'react';
import { getCloudStatus, useTelemetryVersion } from '../data/telemetry';
import { ago } from '../utils/format';

/** Header pill: is the twin showing live agent data, stale data, or none? */
export default function CloudStatus() {
  useTelemetryVersion();                       // re-render on every poll
  const [, setTick] = useState(0);             // …and every second for "ago"
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const s = getCloudStatus();
  let mode, label, sub;
  if (s.state === 'connecting') {
    mode = 'connecting'; label = 'Connecting to cloud…'; sub = '';
  } else if (s.state === 'offline' && !s.live) {
    mode = 'offline'; label = 'Cloud unreachable'; sub = s.stale ? `${s.stale} parts stale` : 'showing simulated data';
  } else if (!s.live && !s.stale) {
    mode = 'offline'; label = 'No agent data'; sub = `site ${s.site} · simulated data`;
  } else if (!s.live) {
    mode = 'stale'; label = 'Agent silent'; sub = `last reading ${ago(s.newest)}`;
  } else {
    mode = 'online'; label = `Live · ${s.live} part${s.live === 1 ? '' : 's'}`;
    sub = `${s.stale ? `${s.stale} stale · ` : ''}updated ${ago(s.newest)}`;
  }
  return (
    <div className={`cloud-pill cloud-pill--${mode}`} title={s.error ? `Last error: ${s.error}` : `Site ${s.site}`}>
      <span className="cloud-pill__dot" />
      <span>{label}</span>
      {sub && <span className="cloud-pill__sub">{sub}</span>}
    </div>
  );
}
