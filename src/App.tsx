import { Canvas } from '@react-three/fiber'
import { ContactShadows, Environment, OrbitControls } from '@react-three/drei'
import { useState } from 'react'
import CameraRig, { HOME_POSITION } from './components/CameraRig'
import Fridge from './components/Fridge'
import Magnet, { type MagnetData } from './components/Magnet'

const initialMagnets: MagnetData[] = [
  { id: 1, shape: 'circle', color: '#ff5d73', position: [-0.5, 1.2] },
  { id: 2, shape: 'star', color: '#ffc93c', position: [0.4, 0.9] },
  { id: 3, shape: 'heart', color: '#ff8fab', position: [-0.2, 0.4] },
  { id: 4, shape: 'square', color: '#4cc9f0', position: [0.5, -0.2] },
  { id: 5, shape: 'circle', color: '#7bd389', position: [-0.6, -0.5] },
]

export default function App() {
  const [dragging, setDragging] = useState(false)
  const [gliding, setGliding] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)

  return (
    <>
      <Canvas shadows camera={{ position: HOME_POSITION.toArray(), fov: 40 }} dpr={[1, 2]}>
        <color attach="background" args={['#f3ece2']} />
        <ambientLight intensity={0.4} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {/* Soft fill so the back isn't lit by the environment alone */}
        <directionalLight position={[-3, 4, -5]} intensity={0.5} />
        <Environment preset="apartment" />

        <Fridge />
        {initialMagnets.map((m) => (
          <Magnet key={m.id} data={m} onDragChange={setDragging} />
        ))}

        <ContactShadows position={[0, -2.2, 0]} opacity={0.4} scale={8} blur={2.5} />
        <OrbitControls
          makeDefault
          enabled={!dragging}
          enableRotate={!gliding}
          enableZoom={!gliding}
          enablePan={false}
          minDistance={3}
          maxDistance={9}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 1.8}
        />
        <CameraRig resetSignal={resetSignal} onGlideChange={setGliding} />
      </Canvas>
      <div className="hud">
        <h1>Fridge Magnets</h1>
        <p>Drag magnets around · drag the background to orbit 360°</p>
      </div>
      <button className="reset-btn" onClick={() => setResetSignal((n) => n + 1)} disabled={gliding}>
        Reset view
      </button>
    </>
  )
}
