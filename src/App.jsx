import React, { Suspense, useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Datacenter from './scene/Datacenter';
import TelemetryPanel from './components/TelemetryPanel';
import { Hexagon } from 'lucide-react';
import './index.css';

function App() {
  // Selection lives here (above the Canvas) so the telemetry panel can render
  // as a fixed DOM side panel outside the 3D scene. { partId, pos, front }
  const [selected, setSelected] = useState(null);
  const open = !!selected;

  // Keep the last part id so the panel keeps its content while it slides out.
  const [shownId, setShownId] = useState(null);
  useEffect(() => { if (selected) setShownId(selected.partId); }, [selected]);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hexagon className="logo-icon" size={28} />
          <h1>Sparshika 3D</h1>
          <span className="badge">Datacenter</span>
        </div>
      </header>

      <main className={`canvas-container${open ? ' canvas-container--split' : ''}`}>
        <Canvas shadows camera={{ position: [4.2, 2.4, 2.6], fov: 55 }}>
          <color attach="background" args={['#05070a']} />
          <Suspense fallback={null}>
            <Datacenter selected={selected} setSelected={setSelected} />
          </Suspense>

          <OrbitControls
            makeDefault
            target={[-0.5, 0.8, 0]}
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
        <p><strong>Click</strong> a server to view telemetry.</p>
      </div>
    </div>
  );
}

export default App;
