import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Datacenter from './scene/Datacenter';
import { Hexagon } from 'lucide-react';
import './index.css';

function App() {
  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hexagon className="logo-icon" size={28} />
          <h1>Sparshika 3D</h1>
          <span className="badge">Datacenter</span>
        </div>
      </header>

      <main className="canvas-container">
        <Canvas shadows camera={{ position: [4.2, 2.4, 2.6], fov: 55 }}>
          <color attach="background" args={['#05070a']} />
          <Suspense fallback={null}>
            <Datacenter />
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

      <div className="instructions-overlay">
        <p><strong>Hover</strong> over a part to see metadata.</p>
        <p><strong>Click</strong> a server to view telemetry.</p>
      </div>
    </div>
  );
}

export default App;
