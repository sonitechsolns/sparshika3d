import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { RACK_LAYOUT, ROLE_LABEL } from '../data/layout';
import { MODELS } from '../data/catalog';
import { getMetadata, getTelemetry, registerParts, severity } from '../data/telemetry';

const N_U = 42;
const TICK_MS = 1500;
const SEV_RANK = { critical: 3, warning: 2, offline: 1, optimal: 0 };

// The demo hall's units, so the simulation knows each one's model (the same
// simulation the 3D demo runs: the fault you find here is there too).
let registered = false;
function ensureRegistered() {
  if (registered) return;
  registered = true;
  registerParts(RACK_LAYOUT.flatMap((r) => r.units.filter((u) => u.partId)
    .map(({ partId, modelId, startU, heightU }) => ({ partId, modelId, rackId: r.id, startU, heightU }))));
}

// Alert level, as in the Alerts drawer: red = failed, amber = at risk.
// Routine "maintenance recommended" stays green here so real trouble stands out.
const sevOf = (t) => {
  const s = severity(t.condition, t.source);
  if (s === 'critical' || s === 'offline') return s;
  if (t.faults?.some((f) => f.state === 'degrading') || /warning/i.test(String(t.condition))) return 'warning';
  return 'optimal';
};
const isPart = (u) => u.partId && MODELS[u.modelId]?.category !== 'passive';

/** Worst status per rack, for the hall strip. */
function readHall() {
  const out = {};
  for (const r of RACK_LAYOUT) {
    let worst = 'optimal';
    for (const u of r.units) {
      if (!isPart(u)) continue;
      const s = sevOf(getTelemetry(u.partId));
      if (SEV_RANK[s] > SEV_RANK[worst]) worst = s;
    }
    out[r.id] = worst;
  }
  return out;
}

function firstIssue(rack) {
  let best = null;
  for (const u of rack.units) {
    if (!isPart(u)) continue;
    const s = sevOf(getTelemetry(u.partId));
    if (!best || SEV_RANK[s] > best.rank) best = { id: u.partId, rank: SEV_RANK[s] };
  }
  return best?.id || null;
}

function Readout({ unit, rackId }) {
  if (!unit) {
    return (
      <div className="trk-card trk-card--idle">
        <p className="trk-card__hint">Touch any unit in the rack to read it.</p>
      </div>
    );
  }
  const model = MODELS[unit.modelId];
  const meta = getMetadata(unit.partId);
  const t = getTelemetry(unit.partId);
  const sev = sevOf(t);
  const span = unit.heightU > 1 ? `U${unit.startU}–U${unit.startU + unit.heightU - 1}` : `U${unit.startU}`;
  const fans = Array.isArray(t.rpms) ? t.rpms : [];
  const running = fans.filter((r) => Number(r) > 0).length;
  const faults = t.faults || [];
  const target = faults.find((f) => f.id !== unit.partId)?.id || unit.partId;
  return (
    <div className={`trk-card trk-card--${sev}`}>
      <div className="trk-card__head">
        <b>{unit.partId}</b>
        <span className={`trk-pill trk-pill--${sev}`}>{t.condition}</span>
      </div>
      <p className="trk-card__sub">{meta.brand} {meta.model || model?.name} · {rackId} {span}</p>
      <dl className="trk-card__kv">
        <div><dt>Temperature</dt><dd>{Number(t.temp).toFixed(1)} °C</dd></div>
        <div><dt>Load</dt><dd>{Math.round(Number(t.load))}%</dd></div>
        {fans.length > 0 && (
          <div><dt>Fans</dt><dd>{running} of {fans.length} running{running < fans.length ? '' : ` · ${Math.min(...fans.map(Number)).toLocaleString()} rpm`}</dd></div>
        )}
        {t.power != null && <div><dt>Power</dt><dd>{Math.round(t.power)} W</dd></div>}
      </dl>
      {faults.length > 0 && (
        <ul className="trk-card__faults">
          {faults.map((f) => <li key={`${f.id}-${f.index}`} className={`trk-fault trk-fault--${f.state}`}>{f.detail}</li>)}
        </ul>
      )}
      <Link className="trk-card__go" to={`/demo?part=${encodeURIComponent(target)}`}>
        {faults.length ? 'Open it in 3D and show the fault' : 'Open it in 3D'}
      </Link>
    </div>
  );
}

/**
 * Hero toy: one rack of the demo hall, drawn front-on, live from the same
 * simulation as the 3D twin. Touch (hover, tap or tab to) a unit to read it,
 * switch racks with the hall strip, and jump into the 3D view from any part.
 */
export default function TouchRack() {
  ensureRegistered();
  const [rackId, setRackId] = useState('RACK-18');
  const rack = useMemo(() => RACK_LAYOUT.find((r) => r.id === rackId), [rackId]);
  const [sel, setSel] = useState(() => firstIssue(RACK_LAYOUT.find((r) => r.id === 'RACK-18')));
  const [hall, setHall] = useState(() => readHall());
  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => { setHall(readHall()); setTick((n) => n + 1); }, TICK_MS);
    return () => clearInterval(id);
  }, []);

  const go = (id) => {
    const r = RACK_LAYOUT.find((x) => x.id === id);
    setRackId(id);
    setSel(firstIssue(r));
  };
  const step = (d) => {
    const i = RACK_LAYOUT.findIndex((r) => r.id === rackId);
    go(RACK_LAYOUT[(i + d + RACK_LAYOUT.length) % RACK_LAYOUT.length].id);
  };

  const taken = new Set();
  rack.units.forEach((u) => { for (let k = 0; k < u.heightU; k++) taken.add(u.startU + k); });
  const blanks = Array.from({ length: N_U }, (_, i) => i + 1).filter((u) => !taken.has(u));
  const selUnit = rack.units.find((u) => u.partId === sel) || null;

  return (
    <div className="trk" aria-label="Interactive rack from the demo hall">
      <div className="trk-hall" role="group" aria-label="Choose a rack">
        {['A', 'B'].map((row) => (
          <div className="trk-hall__row" key={row}>
            {RACK_LAYOUT.filter((r) => r.row === row).map((r) => (
              <button key={r.id} type="button" className={`trk-hall__rack trk-hall__rack--${hall[r.id]}${r.id === rackId ? ' is-on' : ''}`}
                onClick={() => go(r.id)} aria-pressed={r.id === rackId} aria-label={`${r.id}, ${ROLE_LABEL[r.role]}, ${hall[r.id]}`} title={r.id} />
            ))}
          </div>
        ))}
      </div>

      <div className="trk-main">
        <div className="trk-frame">
          <div className="trk-frame__top">
            <button type="button" className="trk-step" onClick={() => step(-1)} aria-label="Previous rack">‹</button>
            <span><b>{rack.id}</b> {ROLE_LABEL[rack.role]}</span>
            <button type="button" className="trk-step" onClick={() => step(1)} aria-label="Next rack">›</button>
          </div>
          <div className="trk-rack" style={{ '--n': N_U }}>
            {blanks.map((u) => <span key={`b${u}`} className="trk-u trk-u--blank" style={{ '--s': u, '--h': 1 }} aria-hidden="true" />)}
            {rack.units.map((u) => {
              const cat = MODELS[u.modelId]?.category || 'passive';
              const kind = cat === 'passive' ? u.modelId.split('-')[0] : cat;
              if (!isPart(u)) {
                return <span key={`p${u.startU}`} className={`trk-u trk-u--${kind}`} style={{ '--s': u.startU, '--h': u.heightU }} aria-hidden="true" />;
              }
              const sev = sevOf(getTelemetry(u.partId));
              return (
                <button key={u.partId} type="button"
                  className={`trk-u trk-u--${kind} trk-u--${sev}${sel === u.partId ? ' is-sel' : ''}`}
                  style={{ '--s': u.startU, '--h': u.heightU }}
                  onMouseEnter={() => setSel(u.partId)} onFocus={() => setSel(u.partId)} onClick={() => setSel(u.partId)}
                  aria-label={`${u.partId}, ${sev}`} aria-pressed={sel === u.partId}>
                  <span className="trk-led" aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </div>
        <Readout unit={selUnit} rackId={rack.id} />
      </div>
    </div>
  );
}
