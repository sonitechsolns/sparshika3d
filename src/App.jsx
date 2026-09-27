import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Datacenter from './scene/Datacenter';
import TelemetryPanel from './components/TelemetryPanel';
import CloudStatus from './components/CloudStatus';
import { Hexagon } from 'lucide-react';
import './index.css';

function App() {
  // Selection lives here (above the Canvas) so the telemetry panel can render
  // as a fixed DOM side panel outside the 3D scene.
  // { partId, hostId?, pos, front } — hostId is set when a component inside a
  // pulled-out unit (e.g. one of its fans) is selected; the unit stays open.
  const [selected, setSelected] = useState(null);
  // Part requested by a deep link (?part=…), captured before the URL-sync
  // effect below rewrites the address bar.
  const [initialPart] = useState(() => new URLSearchParams(window.location.search).get('part'));
  const open = !!selected;

  // Keep the last part id so the panel keeps its content while it slides out.
  const [shownId, setShownId] = useState(null);
  useEffect(() => { if (selected) setShownId(selected.partId); }, [selected]);

  // Keep ?part= in the URL in sync with the selection, so the address bar is
  // always a shareable link to what's on screen (see DeepLink in Datacenter).
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      if (selected) url.searchParams.set('part', selected.partId);
      else url.searchParams.delete('part');
      window.history.replaceState(null, '', url);
    } catch {
      // Sandboxed frames (previews, embeds) may refuse history changes — the
      // selection still works, the address bar just won't track it.
    }
  }, [selected]);

  // Optional hot-aisle heat-map overlay (off by default).
  const [heatmap, setHeatmap] = useState(false);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hexagon className="logo-icon" size={28} />
          <h1>Sparshika 3D</h1>
          <span className="badge">Datacenter</span>
        </div>
        <div className="header-right">
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
        <Canvas camera={{ position: [-4.5, 2.3, 3.9], fov: 50 }}>
          <color attach="background" args={['#05070a']} />
          <Suspense fallback={null}>
            <Datacenter selected={selected} setSelected={setSelected} showHeatmap={heatmap}
              initialPart={initialPart} />
          </Suspense>

          <OrbitControls
            makeDefault
            target={[0.9, 1.0, 1.0]}
            enableDamping
            dampingFactor={0.05}
            minDistance={1}
            maxDistance={22}
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

      <div className={`instructions-overlay${open ? ' instructions-overlay--split' : ''}`}>
        <p><strong>Hover</strong> over a part to see metadata.</p>
        <p><strong>Click</strong> a unit to pull it out; click a fan inside to inspect it.</p>
      </div>
    </div>
  );
}

export default App;
