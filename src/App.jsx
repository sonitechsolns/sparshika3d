import React, { Suspense, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows, Grid, BakeShadows } from '@react-three/drei';
import { GPU } from './components/GPU';
import Server from './components/Server';
import { Hexagon } from 'lucide-react';
import './index.css';

function App() {
  const [activeModel, setActiveModel] = useState('server');
  const [isCoverOpen, setIsCoverOpen] = useState(false);

  return (
    <div className="app-container">
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Hexagon className="logo-icon" size={28} />
          <h1>Sparshika 3D</h1>
          <span className="badge">Pilot Phase 1</span>
        </div>

        <div style={{ display: 'flex', gap: '10px', marginLeft: 'auto' }}>
          {activeModel === 'server' && (
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
                transition: '0.2s',
                marginRight: '10px'
              }}
            >
              {isCoverOpen ? 'CLOSE COVER' : 'OPEN COVER'}
            </button>
          )}
          <button
            onClick={() => setActiveModel('server')}
            style={{
              background: activeModel === 'server' ? '#4f46e5' : 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: '0.2s'
            }}
          >
            Dell R760 Server
          </button>
          <button
            onClick={() => setActiveModel('gpu')}
            style={{
              background: activeModel === 'gpu' ? '#4f46e5' : 'rgba(255,255,255,0.1)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.2)',
              padding: '6px 16px',
              borderRadius: '20px',
              cursor: 'pointer',
              fontWeight: 'bold',
              transition: '0.2s'
            }}
          >
            NVIDIA RTX 3080 Ti GPU
          </button>
        </div>
      </header>

      <main className="canvas-container">
        <Canvas camera={{ position: [0.5, 0.5, 0.5], fov: 45 }}>
          <color attach="background" args={['#0a0b10']} />
          <ambientLight intensity={0.4} />
          <directionalLight
            position={[5, 10, 3]}
            intensity={2}
            castShadow
            shadow-mapSize={1024}
          />
          <pointLight position={[-5, 2, -5]} intensity={1.5} color="#4f46e5" />
          <pointLight position={[5, 2, 5]} intensity={1.5} color="#0ea5e9" />

          <Suspense fallback={null}>
            {activeModel === 'server' ? (
              <Server position={[0, 0, 0]} isCoverOpen={isCoverOpen} />
            ) : (
              <GPU position={[0, 0, 0]} partId="GPU-PILOT-01" />
            )}

            {/* Environment lighting to give metallic materials a premium look */}
            <Environment preset="city" />

            {/* Ground grid and shadows */}
            <Grid
              renderOrder={-1}
              position={[0, -0.05, 0]}
              infiniteGrid
              fadeDistance={5}
              fadeStrength={5}
              cellColor="#312e81"
              sectionColor="#4f46e5"
            />
            <ContactShadows position={[0, -0.04, 0]} opacity={0.7} scale={2} blur={1.5} far={1} />
          </Suspense>

          <OrbitControls
            makeDefault
            minPolarAngle={0}
            maxPolarAngle={Math.PI / 2 + 0.1}
            enableDamping
            dampingFactor={0.05}
          />
        </Canvas>
      </main>

      <div className="instructions-overlay">
        <p><strong>Hover</strong> over the part to see metadata.</p>
        <p><strong>Click</strong> the part to view telemetry data.</p>
      </div>
    </div>
  );
}

export default App;
