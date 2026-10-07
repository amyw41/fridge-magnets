import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { MAGNET_CONFIG as M } from '../fridgeStyle'
import { isOnDoor, MAGNET_SIZE, type MagnetData, type MagnetShape } from '../magnetLayout'
import { panKey } from './CameraRig'
import { DOOR_Z } from './Fridge'

const THICKNESS = M.thickness * MAGNET_SIZE
const REST_Z = DOOR_Z + THICKNESS / 2
const SHADOW_Z = DOOR_Z + 0.0015

/** Unit-size outlines (about 1 wide), scaled to MAGNET_SIZE after extruding. */
function makeShape(shape: MagnetShape): THREE.Shape {
  const s = new THREE.Shape()
  switch (shape) {
    case 'circle':
      s.absarc(0, 0, 0.5, 0, Math.PI * 2, false)
      break
    case 'square':
      s.moveTo(-0.4, -0.4).lineTo(0.4, -0.4).lineTo(0.4, 0.4).lineTo(-0.4, 0.4).closePath()
      break
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.5 : 0.23
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (i === 0) s.moveTo(x, y)
        else s.lineTo(x, y)
      }
      s.closePath()
      break
    case 'heart':
      s.moveTo(0, -0.42)
      s.bezierCurveTo(-0.72, 0.05, -0.3, 0.58, 0, 0.24)
      s.bezierCurveTo(0.3, 0.58, 0.72, 0.05, 0, -0.42)
      break
  }
  return s
}

function makeGeometry(shape: MagnetShape) {
  const bevel = 0.05
  const g = new THREE.ExtrudeGeometry(makeShape(shape), {
    depth: M.thickness - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 24,
  })
  g.center()
  g.scale(MAGNET_SIZE, MAGNET_SIZE, MAGNET_SIZE)
  return g
}

// One soft radial blob shared by every magnet's contact shadow
let shadowTexture: THREE.Texture | null = null
function getShadowTexture() {
  if (shadowTexture) return shadowTexture
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(60,20,30,1)')
  grad.addColorStop(0.5, 'rgba(60,20,30,0.5)')
  grad.addColorStop(1, 'rgba(60,20,30,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  shadowTexture = new THREE.CanvasTexture(c)
  return shadowTexture
}

const setCursor = (c: string) => (document.body.style.cursor = c)

export default function Magnet({
  data,
  onDragChange,
  onDrop,
}: {
  data: MagnetData
  onDragChange: (dragging: boolean) => void
  onDrop: (id: number, x: number, y: number) => void
}) {
  const ref = useRef<THREE.Group>(null!)
  const shadowRef = useRef<THREE.Mesh>(null!)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null

  const geometry = useMemo(() => makeGeometry(data.shape), [data.shape])
  const shadowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(), transparent: true, depthWrite: false }),
    [],
  )

  // Drag state lives in refs: it changes every frame and needs no re-render
  const dragging = useRef(false)
  const hovered = useRef(false)
  const ray = useRef(new THREE.Ray())
  const grabOffset = useRef(new THREE.Vector2()) // magnet centre minus grab point, on the door plane
  const grabDz = useRef(0) // grab point's height above the magnet centre
  const lift = useRef(0) // 0 = flat on door, 1 = fully lifted

  /**
   * Keeps the exact grabbed point under the cursor: intersects the pointer ray
   * with the plane that point currently sits on. Called on every pointer event
   * as well as every frame, so the position is never a frame behind.
   */
  const followPointer = () => {
    const g = ref.current
    const { origin: o, direction: d } = ray.current
    if (d.z > -1e-3) return
    const t = (g.position.z + grabDz.current - o.z) / d.z
    g.position.x = o.x + d.x * t + grabOffset.current.x
    g.position.y = o.y + d.y * t + grabOffset.current.y
  }

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    ray.current.copy(e.ray)
    followPointer()
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    dragging.current = false
    onDragChange(false)
    setCursor(hovered.current ? 'grab' : 'auto')
    onDrop(data.id, ref.current.position.x, ref.current.position.y)
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    // Space+drag pans the view; and only grab when facing the door, since
    // edge-on rays make the door-plane projection unstable
    if (panKey.held || e.button !== 0 || e.ray.direction.z > -0.25) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // Disable orbiting now, before OrbitControls sees this same pointerdown
    if (controls) controls.enabled = false
    const g = ref.current
    grabOffset.current.set(g.position.x - e.point.x, g.position.y - e.point.y)
    grabDz.current = e.point.z - g.position.z
    ray.current.copy(e.ray)
    dragging.current = true
    onDragChange(true)
    setCursor('grabbing')
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    ray.current.copy(e.ray)
    followPointer()
  }

  useFrame((_, dt) => {
    const g = ref.current
    const k = 1 - Math.exp(-dt * M.snapSpeed)

    lift.current += ((dragging.current ? 1 : 0) - lift.current) * k
    g.position.z = REST_Z + lift.current * M.liftHeight

    if (dragging.current) {
      followPointer() // the lift changes the grab plane even if the pointer is still
    } else {
      g.position.x += (data.position[0] - g.position.x) * k
      g.position.y += (data.position[1] - g.position.y) * k
    }

    // Contact shadow: grows, softens and drifts away from the light as it lifts;
    // hidden when the magnet is held off the door
    const sh = shadowRef.current
    const l = lift.current
    const scale = THREE.MathUtils.lerp(M.shadow.restScale, M.shadow.liftScale, l) * MAGNET_SIZE
    sh.position.set(g.position.x - l * M.liftHeight * 0.4, g.position.y - l * M.liftHeight * 0.7, SHADOW_Z)
    sh.scale.set(scale, scale, 1)
    const onDoor = isOnDoor(g.position.x, g.position.y) ? 1 : 0
    shadowMaterial.opacity = THREE.MathUtils.lerp(M.shadow.restOpacity, M.shadow.liftOpacity, l) * onDoor
  })

  return (
    <>
      <mesh ref={shadowRef} material={shadowMaterial} renderOrder={1}>
        <planeGeometry />
      </mesh>
      <group ref={ref} position={[data.position[0], data.position[1], REST_Z]}>
        <mesh
          geometry={geometry}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerOver={(e) => {
            e.stopPropagation()
            hovered.current = true
            if (!dragging.current) setCursor('grab')
          }}
          onPointerOut={() => {
            hovered.current = false
            if (!dragging.current) setCursor('auto')
          }}
        >
          <meshPhysicalMaterial color={data.color} roughness={0.3} clearcoat={1} clearcoatRoughness={0.1} />
        </mesh>
      </group>
    </>
  )
}
