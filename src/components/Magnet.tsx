import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { DOOR_Z, FRIDGE } from './Fridge'

export type MagnetShape = 'circle' | 'square' | 'star' | 'heart'

export interface MagnetData {
  id: number
  shape: MagnetShape
  color: string
  position: [number, number]
}

const DEPTH = 0.08
const doorPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -DOOR_Z)
const hit = new THREE.Vector3()

function makeShape(shape: MagnetShape): THREE.Shape {
  const s = new THREE.Shape()
  switch (shape) {
    case 'circle':
      s.absarc(0, 0, 0.18, 0, Math.PI * 2, false)
      break
    case 'square':
      s.moveTo(-0.16, -0.16).lineTo(0.16, -0.16).lineTo(0.16, 0.16).lineTo(-0.16, 0.16).closePath()
      break
    case 'star':
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? 0.22 : 0.1
        const a = (i / 10) * Math.PI * 2 + Math.PI / 2
        const x = Math.cos(a) * r
        const y = Math.sin(a) * r
        if (i === 0) s.moveTo(x, y)
        else s.lineTo(x, y)
      }
      s.closePath()
      break
    case 'heart':
      s.moveTo(0, -0.18)
      s.bezierCurveTo(-0.3, 0.02, -0.12, 0.24, 0, 0.1)
      s.bezierCurveTo(0.12, 0.24, 0.3, 0.02, 0, -0.18)
      break
  }
  return s
}

export default function Magnet({
  data,
  onDragChange,
}: {
  data: MagnetData
  onDragChange: (dragging: boolean) => void
}) {
  const ref = useRef<THREE.Group>(null!)
  const target = useRef(new THREE.Vector3(data.position[0], data.position[1], DOOR_Z))
  const offset = useRef(new THREE.Vector3())
  const [dragging, setDragging] = useState(false)
  const [hovered, setHovered] = useState(false)

  const geometry = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(makeShape(data.shape), {
      depth: DEPTH,
      bevelEnabled: true,
      bevelThickness: 0.02,
      bevelSize: 0.02,
      bevelSegments: 4,
      curveSegments: 24,
    })
    g.center()
    return g
  }, [data.shape])

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    // Only grab when viewing the door from the front; edge-on rays make the
    // door-plane projection unstable.
    if (e.ray.direction.z > -0.25 || !e.ray.intersectPlane(doorPlane, hit)) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    offset.current.copy(target.current).sub(hit)
    setDragging(true)
    onDragChange(true)
    document.body.style.cursor = 'grabbing'
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging) return
    if (!e.ray.intersectPlane(doorPlane, hit)) return
    const halfW = FRIDGE.width / 2 - 0.25
    const halfH = FRIDGE.height / 2 - 0.25
    target.current.set(
      THREE.MathUtils.clamp(hit.x + offset.current.x, -halfW, halfW),
      THREE.MathUtils.clamp(hit.y + offset.current.y, -halfH, halfH),
      DOOR_Z,
    )
  }

  const onUp = (e: ThreeEvent<PointerEvent>) => {
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    setDragging(false)
    onDragChange(false)
    document.body.style.cursor = hovered ? 'grab' : 'auto'
  }

  // Ease toward the target, lift off the door while held, and tilt with motion
  useFrame((_, dt) => {
    const g = ref.current
    const k = 1 - Math.exp(-dt * 14)
    const lift = dragging ? 0.25 : hovered ? 0.06 : 0
    const prevX = g.position.x
    const prevY = g.position.y
    g.position.x += (target.current.x - g.position.x) * k
    g.position.y += (target.current.y - g.position.y) * k
    g.position.z += (DOOR_Z + DEPTH / 2 + 0.02 + lift - g.position.z) * k
    const vx = (g.position.x - prevX) / Math.max(dt, 1e-3)
    const vy = (g.position.y - prevY) / Math.max(dt, 1e-3)
    g.rotation.y += (THREE.MathUtils.clamp(vx * 0.08, -0.5, 0.5) - g.rotation.y) * k
    g.rotation.x += (THREE.MathUtils.clamp(-vy * 0.08, -0.5, 0.5) - g.rotation.x) * k
    const s = dragging ? 1.12 : hovered ? 1.05 : 1
    g.scale.setScalar(g.scale.x + (s - g.scale.x) * k)
  })

  return (
    <group ref={ref} position={[data.position[0], data.position[1], DOOR_Z + 0.1]}>
      <mesh
        geometry={geometry}
        castShadow
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerOver={(e) => {
          e.stopPropagation()
          setHovered(true)
          if (!dragging) document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          setHovered(false)
          if (!dragging) document.body.style.cursor = 'auto'
        }}
      >
        <meshPhysicalMaterial color={data.color} roughness={0.3} clearcoat={1} clearcoatRoughness={0.1} />
      </mesh>
    </group>
  )
}
