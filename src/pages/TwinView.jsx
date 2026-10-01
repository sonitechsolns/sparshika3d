import React, { Component, Suspense, useCallback, useState, useEffect, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerformanceMonitor } from '@react-three/drei';
import { Link, useSearchParams } from 'react-router-dom';
import Datacenter from '../scene/Datacenter';
import Beacons from '../scene/Beacons';
import WalkControls from '../scene/WalkControls';
import { VIEWS } from '../scene/views';
import { EYE, NODES, START, nearestNode, yawTo } from '../scene/walk';
import { uY } from '../scene/rackGeometry';
import TelemetryPanel from '../components/TelemetryPanel';
import CloudStatus from '../components/CloudStatus';
import OpsPanel from '../components/OpsPanel';
import WalkHud from '../components/WalkHud';
import { AlertButtons, Toasts } from '../components/Notifications';
import { componentOf, getPartInfo, startLiveTelemetry } from '../data/telemetry';
import { startHealth } from '../data/health';
import { CRACS, RACK_LAYOUT } from '../data/layout';
import { Footprints, RotateCcw } from 'lucide-react';
import { LogoMark } from '../components/Logo';

/**
 * Keeps a rendering fault from taking the whole page down: the 3D view shows a
 * notice with a reload button (which remounts a fresh WebGL canvas) while the
 * header, alerts and panels keep working.
 */
class SceneBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error('[sparshika] 3D view crashed:', error); }
  render() {
    if (this.state.error) {
      return (
        <div className="scene-notice" role="alert">
          <p>The 3D view hit a problem and was paused so the rest of the page keeps working.</p>
          <button type="button" className="chip chip--on" onClick={() => { this.setState({ error: null }); this.props.onReset(); }}>
            <RotateCcw size={14} aria-hidden="true" /> Reload 3D view
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/** Where to stand (and which way to face) to look at a unit in Walk mode. */
function walkSpotFor(partId) {
  const comp = componentOf(partId);
  const info = getPartInfo(comp?.hostId || partId);
  const crac = CRACS.find((c) => c.partId === (comp?.hostId || partId));
  if (crac) {                                          // cooling end: face the unit from the corridor
    const node = nearestNode(crac.pos[0] - 1.05, crac.pos[2]);
    const n = NODES[node];
    return { node, yaw: yawTo(n, { x: crac.pos[0], z: crac.pos[2] }),
      pitch: Math.atan2(1.95 - EYE, Math.hypot(crac.pos[0] - n.x, crac.pos[2] - n.z)) };
  }
  const rack = RACK_LAYOUT.find((r) => r.id === info?.rackId);
  if (!rack) return null;
  const f = rack.rot === 0 ? -1 : 1;                   // the rack's front faces -Z (row A) or +Z (row B)
  // aim at the pulled-out tray (about 0.4 m in front of the rack) at the unit's height
  const target = { x: rack.pos[0], z: rack.pos[2] + f * 0.9 };
  const node = nearestNode(target.x, rack.pos[2] + f * 1.6);
  const n = NODES[node];
  const y = info.startU ? uY(info.startU, info.heightU || 1) : EYE;
  const flat = Math.max(0.3, Math.hypot(target.x - n.x, target.z - n.z));
  return { node, yaw: yawTo(n, target), pitch: Math.atan2(y - EYE, flat) };
}

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
  // Stream this site's telemetry while the twin is on screen, and score it.
  useEffect(() => {
    const stopTelemetry = startLiveTelemetry(siteId);
    const stopHealth = startHealth();
    return () => { stopHealth(); stopTelemetry(); };
  }, [siteId]);
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
  // Fly-to requests ({ partId, n }): a deep link (?part=…) on arrival, then
  // the alerts list, notifications and 3D markers.
  const [params, setParams] = useSearchParams();
  const [focusReq, setFocusReq] = useState(() => (params.get('part') ? { partId: params.get('part'), n: 1 } : null));
  const open = !!selected;

  // Hall-health drawer (left) and Walk mode.
  const [ops, setOps] = useState({ open: false, tab: 'alerts' });
  const openOps = useCallback((tab) => setOps((o) => ({ open: !(o.open && o.tab === tab), tab })), []);
  const [walk, setWalk] = useState(null);             // null | { node, yaw, n }
  const walkRef = useRef(walk);
  walkRef.current = walk;

  const focusPart = useCallback((partId) => {
    if (!partId) return;
    if (typeof window !== 'undefined' && window.innerWidth < 1600) setOps((o) => ({ ...o, open: false }));
    if (walkRef.current) {
      const spot = walkSpotFor(partId);
      if (spot) setWalk((w) => ({ ...w, node: spot.node, aim: { yaw: spot.yaw, pitch: spot.pitch, n: Date.now() } }));
    }
    setFocusReq({ partId, n: Date.now() });
  }, []);
  const startWalk = () => { setSelected(null); setWalk({ node: START.node, aim: { yaw: START.yaw, pitch: -0.05, n: Date.now() } }); };
  const exitWalk = () => { setWalk(null); setSelected(null); setView({ name: 'overview', n: Date.now() }); };
  const setWalkNode = useCallback((node) => setWalk((w) => (w ? { ...w, node } : w)), []);

  // Rendering safety: adaptive resolution, WebGL context-loss recovery, and a
  // canvas key so the 3D view can be remounted without reloading the page.
  const [dpr, setDpr] = useState(1.5);
  const [canvasKey, setCanvasKey] = useState(0);
  const [lost, setLost] = useState(false);
  const onCreated = useCallback(({ gl }) => {
    const el = gl.domElement;
    if (typeof window !== 'undefined') window.__sparshikaRenderer = gl;   // renderer stats for diagnostics
    el.addEventListener('webglcontextlost', (e) => { e.preventDefault(); setLost(true); });
    el.addEventListener('webglcontextrestored', () => { setLost(false); setCanvasKey((k) => k + 1); });
  }, []);
  const resetScene = () => { setLost(false); setSelected(null); setCanvasKey((k) => k + 1); };

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
      <header className={`app-header${open ? ' app-header--split' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', pointerEvents: 'auto' }}>
          <Link to="/" aria-label="Sparshika home" style={{ display: 'flex', color: 'inherit' }}>
            <LogoMark size={28} />
          </Link>
          <h1>{title}</h1>
          <span className="badge">{badge}</span>
        </div>
        <div className="header-right">
          {nav && <div className="twin-nav">{nav}</div>}
          <AlertButtons onOpen={openOps} />
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
        <SceneBoundary onReset={resetScene}>
        <Canvas key={canvasKey} camera={{ position: VIEWS.overview.pos, fov: 50 }} dpr={dpr}
          gl={{ powerPreference: 'high-performance', antialias: true }} onCreated={onCreated}>
          <color attach="background" args={['#050b18']} />
          <PerformanceMonitor onDecline={() => setDpr(1)} onIncline={() => setDpr(1.5)} flipflops={3} onFallback={() => setDpr(1)} />
          <Suspense fallback={null}>
            <Datacenter selected={selected} setSelected={setSelected} showHeatmap={heatmap}
              focusReq={focusReq} cables={cables} view={view} walk={!!walk}>
              {/* markers step aside while a unit is pulled out, so they don't crowd the close-up */}
              {(room) => (walk || !selected) && <Beacons room={room} onFocus={focusPart} labels={!!walk} />}
            </Datacenter>
          </Suspense>

          {walk ? (
            <WalkControls node={walk.node} setNode={setWalkNode} aim={walk.aim} />
          ) : (
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
          )}
        </Canvas>
        </SceneBoundary>
        {lost && (
          <div className="scene-notice" role="alert">
            <p>The graphics driver reset the 3D view. It usually comes back on its own in a moment.</p>
            <button type="button" className="chip chip--on" onClick={resetScene}><RotateCcw size={14} aria-hidden="true" /> Reload 3D view</button>
          </div>
        )}
      </main>

      <OpsPanel open={ops.open} tab={ops.tab} setTab={(tab) => setOps({ open: true, tab })}
        onClose={() => setOps((o) => ({ ...o, open: false }))} onFocus={focusPart} />
      <Toasts onFocus={focusPart} onOpen={openOps} />
      {walk && <WalkHud node={walk.node} setNode={setWalkNode} onExit={exitWalk} onFocus={focusPart} />}

      {/* Fixed telemetry side panel — slides in from the right (35%), never
          overlapping the 3D scene (which shrinks to the left 65%). */}
      <aside className={`side-panel${open ? ' side-panel--open' : ''}`}>
        {shownId && (
          <TelemetryPanel partId={shownId} side onClose={() => setSelected(null)} />
        )}
      </aside>

      <div className={`view-dock${open ? ' view-dock--split' : ''}${ops.open ? ' view-dock--ops' : ''}${walk ? ' view-dock--walk' : ''}`}>
        <div className="view-dock__group" role="group" aria-label="Camera views">
          <span className="view-dock__label">View</span>
          {Object.entries(VIEWS).map(([k, v]) => (
            <button key={k} type="button" className={`chip${!walk && view?.name === k ? ' chip--on' : ''}`}
              onClick={() => { if (walk) setWalk(null); goTo(k); }}>{v.label}</button>
          ))}
          <button type="button" className={`chip chip--walk${walk ? ' chip--on' : ''}`} onClick={walk ? exitWalk : startWalk}
            title="Walk through the hall like street view">
            <Footprints size={14} aria-hidden="true" /> {walk ? 'Exit walk' : 'Walk'}
          </button>
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

      <div className={`instructions-overlay${open ? ' instructions-overlay--split' : ''}${walk || ops.open ? ' instructions-overlay--hidden' : ''}`}>
        <p><strong>Hover</strong> over a part to see metadata.</p>
        <p><strong>Click</strong> a unit to pull it out; click a fan or power supply inside to inspect it.</p>
      </div>
    </div>
  );
}
