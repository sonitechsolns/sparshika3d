import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import Datacenter from './scene/Datacenter';
import { Hexagon } from 'lucide-react';
import './index.css';

function App() {
  const [isCoverOpen, setIsCoverOpen] = useState(false);
  const [isBezelOn, setIsBezelOn] = useState(false);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hexagon className="logo-icon" size={28} />
          <h1>Sparshika 3D</h1>
          <span className="badge">Datacenter</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
          <button
            onClick={() => setIsCoverOpen(!isCoverOpen)}
            style={{
              background: isCoverOpen ? '#ff4444' : '#44ff44',
              color: 'black',
              border: 'none',
              padding: '6px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: '0.2s'
            }}
          >
            {isCoverOpen ? 'CLOSE COVERS' : 'OPEN COVERS'}
          </button>
          <button
            onClick={() => setIsBezelOn(!isBezelOn)}
            style={{
              background: isBezelOn ? '#4f46e5' : 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: '0.2s'
            }}
          >
            {isBezelOn ? 'BEZELS ON' : 'BEZELS OFF'}
          </button>
        </div>
      </header>

      <main className="canvas-container">
        <Canvas shadows camera={{ position: [4.2, 2.4, 2.6], fov: 55 }}>
          <color attach="background" args={['#05070a']} />
          <Suspense fallback={null}>
            <Datacenter isCoverOpen={isCoverOpen} isBezelOn={isBezelOn} />
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
