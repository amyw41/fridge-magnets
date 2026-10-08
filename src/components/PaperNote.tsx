import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { paperCanvas, paperDesign, type PaperKind } from '../papers'
import { isOverTrash, setTrashState } from '../trash'
import { panKey } from './CameraRig'
import { DOOR_Z } from './Fridge'

export interface PaperData {
  id: number
  kind: PaperKind
  /** Printed colour; null keeps the paper's own */
  color: string | null
  /** Centre on the door plane */
  position: [number, number]
  /** Slight turn, in radians, so notes don't look machine-placed */
  tilt: number
}

/** Just off the door: magnets sit on top of paper */
const REST_Z = DOOR_Z + 0.004
const LIFT = 0.03

// Soft shadow in the note's own shape (torn edges and all), one per design
const shadowTextures = new Map<PaperKind, THREE.Texture>()
function getShadowTexture(kind: PaperKind) {
  let t = shadowTextures.get(kind)
  if (t) return t
  const src = paperCanvas(kind)
  const s = 160 / Math.max(src.width, src.height)
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * s * 1.3)
  c.height = Math.round(src.height * s * 1.3)
  const ctx = c.getContext('2d')!
  ctx.filter = 'blur(5px)'
  ctx.drawImage(src, c.width * 0.115, c.height * 0.115, src.width * s, src.height * s)
  ctx.filter = 'none'
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = 'rgb(18, 18, 20)' // neutral, so it reads right on any fridge colour
  ctx.fillRect(0, 0, c.width, c.height)
  t = new THREE.CanvasTexture(c)
  shadowTextures.set(kind, t)
  return t
}

const setCursor = (c: string) => (document.body.style.cursor = c)

export default function PaperNote({
  data,
  stack,
  onDragChange,
  onDrop,
  onTrash,
}: {
  data: PaperData
  /** Position in the pile: later notes lie on top */
  stack: number
  onDragChange: (dragging: boolean) => void
  onDrop: (id: number, x: number, y: number) => void
  /** Let go over the trash button */
  onTrash: (id: number) => void
}) {
  const [w, h] = paperDesign(data.kind).size
  const ref = useRef<THREE.Mesh>(null!)
  const shadowRef = useRef<THREE.Mesh>(null!)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const gl = useThree((s) => s.gl)

  const material = useMemo(() => {
    const map = new THREE.CanvasTexture(paperCanvas(data.kind, data.color))
    map.colorSpace = THREE.SRGBColorSpace
    map.anisotropy = gl.capabilities.getMaxAnisotropy()
    // a little self-glow from its own colours, so white paper reads white under the studio light
    return new THREE.MeshStandardMaterial({
      map,
      emissive: '#ffffff',
      emissiveMap: map,
      emissiveIntensity: 0.35,
      roughness: 0.92,
      transparent: true,
      depthWrite: false,
    })
  }, [data.kind, data.color, gl])
  const shadowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(data.kind), transparent: true, depthWrite: false, opacity: 0.28 }),
    [data.kind],
  )

  const dragging = useRef(false)
  const hovered = useRef(false)
  const ray = useRef(new THREE.Ray())
  const grabOffset = useRef(new THREE.Vector2())
  const lift = useRef(0)

  const followPointer = () => {
    const m = ref.current
    const { origin: o, direction: d } = ray.current
    if (d.z > -1e-3) return
    const t = (m.position.z - o.z) / d.z
    m.position.x = o.x + d.x * t + grabOffset.current.x
    m.position.y = o.y + d.y * t + grabOffset.current.y
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    if (panKey.held || e.button !== 0 || e.ray.direction.z > -0.25) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false
    const m = ref.current
    grabOffset.current.set(m.position.x - e.point.x, m.position.y - e.point.y)
    ray.current.copy(e.ray)
    dragging.current = true
    onDragChange(true)
    setCursor('grabbing')
    setTrashState(true, false)
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    ray.current.copy(e.ray)
    followPointer()
    setTrashState(true, isOverTrash(e.nativeEvent.clientX, e.nativeEvent.clientY))
  }

  const endDrag = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    ray.current.copy(e.ray)
    followPointer()
    ;(e.target as Element).releasePointerCapture(e.pointerId)
    dragging.current = false
    onDragChange(false)
    setCursor(hovered.current ? 'grab' : 'auto')
    setTrashState(false, false)
    if (isOverTrash(e.nativeEvent.clientX, e.nativeEvent.clientY)) onTrash(data.id)
    else onDrop(data.id, ref.current.position.x, ref.current.position.y)
  }

  useFrame((_, dt) => {
    const m = ref.current
    const k = 1 - Math.exp(-dt * 16)
    lift.current += ((dragging.current ? 1 : 0) - lift.current) * k
    m.position.z = REST_Z + lift.current * LIFT
    if (dragging.current) followPointer()
    else {
      m.position.x += (data.position[0] - m.position.x) * k
      m.position.y += (data.position[1] - m.position.y) * k
    }
    // Held notes draw over the whole pile
    const order = dragging.current ? 900 : 10 + stack * 2
    m.renderOrder = order + 1
    const sh = shadowRef.current
    sh.renderOrder = order
    const l = lift.current
    sh.position.set(m.position.x - l * LIFT * 0.4, m.position.y - 0.006 - l * LIFT * 0.8, DOOR_Z + 0.002)
    sh.scale.setScalar(1 + l * 0.06)
    shadowMaterial.opacity = THREE.MathUtils.lerp(0.28, 0.2, l)
  })

  return (
    <>
      <mesh ref={shadowRef} material={shadowMaterial} rotation={[0, 0, data.tilt]}>
        <planeGeometry args={[w * 1.3, h * 1.3]} />
      </mesh>
      <mesh
        ref={ref}
        material={material}
        position={[data.position[0], data.position[1], REST_Z]}
        rotation={[0, 0, data.tilt]}
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
        <planeGeometry args={[w, h]} />
      </mesh>
    </>
  )
}
