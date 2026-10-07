import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import { useCallback, useState } from 'react'
import CameraRig, { HOME_POSITION } from './components/CameraRig'
import Fridge from './components/Fridge'
import Magnet from './components/Magnet'
import StaticShadows from './components/StaticShadows'
import Studio from './components/Studio'
import WheelNavigation from './components/WheelNavigation'
import { CAMERA_CONFIG, FRIDGE_STYLE } from './fridgeStyle'
import { resolveDrop, type MagnetData } from './magnetLayout'

// Starting spots keep clear of the handles on the left near the door seam
const initialMagnets: MagnetData[] = [
  { id: 1, shape: 'star', color: '#ffc93c', position: [0.25, 1.15] },
  { id: 2, shape: 'circle', color: '#ff5d73', position: [0.3, 0.4] },
  { id: 3, shape: 'heart', color: '#ff8fab', position: [-0.25, -0.05] },
  { id: 4, shape: 'square', color: '#4cc9f0', position: [0.3, -0.6] },
  { id: 5, shape: 'circle', color: '#7bd389', position: [-0.3, -1.1] },
]

export default function App() {
  const [magnets, setMagnets] = useState(initialMagnets)
  const [dragging, setDragging] = useState(false)
  const [gliding, setGliding] = useState(false)

  // Settle a dropped magnet: keep it, nudge it to the nearest free spot, or
  // (dropped off the door / nowhere free) leave its old position so it slides back
  const handleDrop = useCallback((id: number, x: number, y: number) => {
    setMagnets((ms) => {
      const me = ms.find((m) => m.id === id)!
      const spot = resolveDrop({ x, y }, me.shape, ms.filter((m) => m.id !== id))
      return spot ? ms.map((m) => (m.id === id ? { ...m, position: spot } : m)) : ms
    })
  }, [])

  return (
    <>
      <Canvas
        shadows
        camera={{ position: HOME_POSITION.toArray(), fov: 40, near: 0.05 }}
        dpr={[1, 2]}
        onContextMenu={(e) => e.preventDefault()}
      >
        <color attach="background" args={[FRIDGE_STYLE.scene.background]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize={[1024, 1024]}
        />
        {/* Soft fill so the back isn't lit by the environment alone */}
        <directionalLight position={[-3, 4, -5]} intensity={0.5} />
        <Studio />

        <Fridge />
        {magnets.map((m) => (
          <Magnet key={m.id} data={m} onDragChange={setDragging} onDrop={handleDrop} />
        ))}

        {/* Floor shadow is baked on the first frame: only the static fridge reaches the floor */}
        <ContactShadows position={[0, -2.2, 0]} opacity={0.4} scale={8} blur={2.5} frames={1} />
        <StaticShadows />
        <OrbitControls
          makeDefault
          enabled={!dragging}
          enableRotate={!gliding}
          enablePan={!gliding}
          enableZoom={false} // replaced by WheelNavigation
          minDistance={CAMERA_CONFIG.minDistance}
          maxDistance={CAMERA_CONFIG.maxDistance}
          minPolarAngle={CAMERA_CONFIG.minPolarAngle}
          maxPolarAngle={CAMERA_CONFIG.maxPolarAngle}
        />
        <WheelNavigation disabled={gliding} />
        <CameraRig resetSignal={0} onGlideChange={setGliding} />
      </Canvas>
      <div className="hud">
        <h1>Fridge Magnets</h1>
        <p>Drag magnets around · drag to orbit · scroll or pinch to zoom · two-finger scroll, right-drag or Space+drag to pan</p>
      </div>
    </>
  )
}
