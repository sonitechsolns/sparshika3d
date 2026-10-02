import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { Link, useSearchParams } from 'react-router-dom';
import Datacenter from '../scene/Datacenter';
import { VIEWS } from '../scene/views';
import TelemetryPanel from '../components/TelemetryPanel';
import CloudStatus from '../components/CloudStatus';
import { startLiveTelemetry } from '../data/telemetry';
import { Hexagon } from 'lucide-react';

const CABLE_KEYS = [
  ['power', 'Power'],
  ['copper', 'Copper'],
  ['fiber', 'Fibre'],
];

/**
 * The 3D twin. `siteId` streams that site's live telemetry; null runs the
 * demo hall on browser simulation. `nav` renders extra header controls
 * (site switcher, settings, sign out).
 */
export default function TwinView({ siteId = null, title = 'Sparshika 3D', badge = 'Datacenter', nav = null }) {
  // Stream this site's telemetry while the twin is on screen.
  useEffect(() => startLiveTelemetry(siteId), [siteId]);
  // The twin is a full-screen canvas: stop the page itself from scrolling.
  useEffect(() => {
    document.body.classList.add('twin-mode');
    return () => document.body.classList.remove('twin-mode');
  }, []);

  // Selection lives here (above the Canvas) so the telemetry panel can render
  // as a fixed DOM side panel outside the 3D scene.
  // { partId, hostId?, pos, front } — hostId is set when a component inside a
  // pulled-out unit (e.g. one of its fans) is selected; the unit stays open.
  const [selected, setSelected] = useState(null);
  // Part requested by a deep link (?part=…), captured once on arrival.
  const [params, setParams] = useSearchParams();
  const [initialPart] = useState(() => params.get('part'));
  const open = !!selected;

  // Keep the last part id so the panel keeps its content while it slides out.
  const [shownId, setShownId] = useState(null);
  useEffect(() => { if (selected) setShownId(selected.partId); }, [selected]);

  // Keep ?part= in sync with the selection, so the address bar is always a
  // shareable link to what's on screen (see DeepLink in Datacenter).
  useEffect(() => {
    setParams((p) => {
      const next = new URLSearchParams(p);
      if (selected) next.set('part', selected.partId); else next.delete('part');
      return next;
    }, { replace: true });
  }, [selected, setParams]);

  // Optional hot-aisle heat-map overlay (off by default).
  const [heatmap, setHeatmap] = useState(false);
  // Cable classes shown in the hall, and the last camera preset asked for
  // (the nonce lets the same preset be chosen twice in a row).
  const [cables, setCables] = useState({ power: true, copper: true, fiber: true });
  const [view, setView] = useState(null);
  const goTo = (name) => { setSelected(null); setView({ name, n: Date.now() }); };

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
          <Link to="/" aria-label="Sparshika home" style={{ display: 'flex', color: 'inherit' }}>
            <Hexagon className="logo-icon" size={28} />
          </Link>
          <h1>{title}</h1>
          <span className="badge">{badge}</span>
        </div>
        <div className="header-right">
          {nav && <div className="twin-nav">{nav}</div>}
          <CloudStatus />
          <button
            className={`toggle-btn${heatmap ? ' toggle-btn--on' : ''}`}
            onClick={() => setHeatmap((h) => !h)}
            title="Toggle hot-aisle heat map"
          >
            <span className="toggle-dot" /> Heat Map
          </button>
        </div>
      </header>

      <main className={`canvas-container${open ? ' canvas-container--split' : ''}`}>
        <Canvas camera={{ position: VIEWS.overview.pos, fov: 50 }} dpr={[1, 1.75]}>
          <color attach="background" args={['#05070a']} />
          <Suspense fallback={null}>
            <Datacenter selected={selected} setSelected={setSelected} showHeatmap={heatmap}
              initialPart={initialPart} cables={cables} view={view} />
          </Suspense>

          <OrbitControls
            makeDefault
            target={VIEWS.overview.target}
            enableDamping
            dampingFactor={0.08}
            rotateSpeed={0.55}
            zoomSpeed={0.8}
            panSpeed={0.8}
            zoomToCursor
            screenSpacePanning
            minDistance={0.6}
            maxDistance={16}
            maxPolarAngle={Math.PI * 0.49}
          />
        </Canvas>
      </main>

      {/* Fixed telemetry side panel — slides in from the right (35%), never
          overlapping the 3D scene (which shrinks to the left 65%). */}
      <aside className={`side-panel${open ? ' side-panel--open' : ''}`}>
        {shownId && (
          <TelemetryPanel partId={shownId} side onClose={() => setSelected(null)} />
        )}
      </aside>

      <div className={`view-dock${open ? ' view-dock--split' : ''}`}>
        <div className="view-dock__group" role="group" aria-label="Camera views">
          <span className="view-dock__label">View</span>
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} type="button" className={`chip${view?.name === k ? ' chip--on' : ''}`} onClick={() => goTo(k)}>{v.label}</button>
          ))}
        </div>
        <div className="view-dock__group" role="group" aria-label="Cables">
          <span className="view-dock__label">Cables</span>
          {CABLE_KEYS.map(([k, label]) => (
            <button key={k} type="button" aria-pressed={cables[k]} className={`chip chip--cable${cables[k] ? ' chip--on' : ''}`}
              onClick={() => setCables((c) => ({ ...c, [k]: !c[k] }))}>
              <span className={`cable-swatch cable-swatch--${k}`} aria-hidden="true" />{label}
            </button>
          ))}
        </div>
      </div>

      <div className={`instructions-overlay${open ? ' instructions-overlay--split' : ''}`}>
        <p><strong>Hover</strong> over a part to see metadata.</p>
        <p><strong>Click</strong> a unit to pull it out; click a fan inside to inspect it.</p>
      </div>
    </div>
  );
}
