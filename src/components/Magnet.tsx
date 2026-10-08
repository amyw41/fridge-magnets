import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LOAD_IN, MAGNET_CONFIG as M } from '../fridgeStyle'
import { prefersReducedMotion } from '../motion'
import { GOLD, ROSE_GOLD, SILVER } from '../palette'
import { isOnDoor, MAGNET_SIZE, type MagnetData, type MagnetFinish, type MagnetShape } from '../magnetLayout'
import { isOverTrash, setTrashState } from '../trash'
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

/**
 * Rounded five-point star outline, about 1 wide, as points in angle order.
 * Each corner is a quadratic curve so the tips read as soft and inflated.
 */
function roundedStarOutline() {
  const corners = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 0.52 : 0.3
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r)
  })
  const pts: THREE.Vector2[] = []
  for (let i = 0; i < 10; i++) {
    const prev = corners[(i + 9) % 10]
    const c = corners[i]
    const next = corners[(i + 1) % 10]
    const round = i % 2 === 0 ? 0.13 : 0.08
    const a = c.clone().add(prev.clone().sub(c).setLength(round))
    const b = c.clone().add(next.clone().sub(c).setLength(round))
    const curve = new THREE.QuadraticBezierCurve(a, c, b)
    pts.push(...curve.getPoints(14).slice(0, -1))
    // straight edge to the next corner's curve
    const nextA = next.clone().add(c.clone().sub(next).setLength(i % 2 === 0 ? 0.08 : 0.13))
    for (let k = 0; k < 8; k++) pts.push(b.clone().lerp(nextA, k / 8))
  }
  return pts
}

/**
 * Chubby heart outline, about 1 wide, as points going round anticlockwise.
 * It's shifted so the origin sits in the fullest part of the heart, which is
 * where the puffed-up surface is highest.
 */
function heartOutline() {
  const pts: THREE.Vector2[] = []
  const n = 160
  for (let i = 0; i < n; i++) {
    const t = -(i / n) * Math.PI * 2 // negative: anticlockwise, like the star
    const x = 16 * Math.sin(t) ** 3
    const y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)
    pts.push(new THREE.Vector2(x / 32, y / 32))
  }
  // find the point deepest inside and centre the heart on it
  let best = new THREE.Vector2()
  let bestD = -1
  const p = new THREE.Vector2()
  for (let y = -0.4; y <= 0.3; y += 0.01) {
    p.set(0, y)
    const d = distToOutline(p, pts)
    if (d > bestD) {
      bestD = d
      best = p.clone()
    }
  }
  return pts.map((q) => q.sub(best))
}

/** Shortest distance from p to the closed outline. */
function distToOutline(p: THREE.Vector2, outline: THREE.Vector2[]) {
  let best = Infinity
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]
    const b = outline[(i + 1) % outline.length]
    const abx = b.x - a.x
    const aby = b.y - a.y
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / (abx * abx + aby * aby)))
    best = Math.min(best, Math.hypot(p.x - a.x - abx * t, p.y - a.y - aby * t))
  }
  return best
}

/**
 * Puffy shape like an inflated foil balloon: the height at each point follows
 * its distance from the edge on a circular profile, so a star's arms swell
 * into round tubes, the centre domes up and soft creases run into each valley.
 */
function makePuffy(outline: THREE.Vector2[]) {
  const n = outline.length
  const rings = 40
  const depth = distToOutline(new THREE.Vector2(), outline) // the centre is the highest point
  const height = 0.36
  const positions: number[] = [0, 0, 0]
  const index: number[] = []
  const p = new THREE.Vector2()
  for (let k = 1; k <= rings; k++) {
    const u = Math.sin(((k / rings) * Math.PI) / 2) // rings bunch up at the edge
    for (let i = 0; i < n; i++) {
      p.copy(outline[i]).multiplyScalar(u)
      const d = k === rings ? 0 : Math.min(distToOutline(p, outline) / depth, 1)
      positions.push(p.x, p.y, height * Math.sqrt(1 - (1 - d) ** 2))
    }
  }
  positions[2] = height
  // Soften the creases: blur each ring's heights around the star a few times
  // so the folds roll like stretched foil instead of meeting at sharp ridges
  for (let pass = 0; pass < 8; pass++) {
    for (let k = 1; k < rings; k++) {
      const base = 1 + (k - 1) * n
      const z = Array.from({ length: n }, (_, i) => positions[(base + i) * 3 + 2])
      for (let i = 0; i < n; i++) {
        positions[(base + i) * 3 + 2] =
          (z[(i + n - 2) % n] + 2 * z[(i + n - 1) % n] + 3 * z[i] + 2 * z[(i + 1) % n] + z[(i + 2) % n]) / 9
      }
    }
  }
  for (let i = 0; i < n; i++) index.push(0, 1 + i, 1 + ((i + 1) % n))
  for (let k = 1; k < rings; k++) {
    const a = 1 + (k - 1) * n
    const b = 1 + k * n
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      index.push(a + i, b + i, b + j, a + i, b + j, a + j)
    }
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** Round button magnet: flat back, crisp rounded rim and a barely domed face. */
function makeButton() {
  const R = 0.5
  const h = 0.2
  const rim = 0.06
  const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(R - 0.01, 0), new THREE.Vector2(R, 0.01)]
  for (let k = 0; k <= 10; k++) {
    const a = (k / 10) * (Math.PI / 2)
    pts.push(new THREE.Vector2(R - rim + Math.cos(a) * rim, h - rim + Math.sin(a) * rim))
  }
  for (let k = 1; k <= 12; k++) {
    const x = (R - rim) * (1 - k / 12)
    pts.push(new THREE.Vector2(x, h + 0.015 * (1 - (x / (R - rim)) ** 2)))
  }
  const g = new THREE.LatheGeometry(pts, 96)
  g.rotateX(Math.PI / 2) // lathe axis (y) becomes the door normal (z)
  return g
}

export function makeGeometry(shape: MagnetShape) {
  if (shape === 'star' || shape === 'heart' || shape === 'circle') {
    const g = shape === 'circle' ? makeButton() : makePuffy(shape === 'star' ? roundedStarOutline() : heartOutline())
    g.translate(0, 0, -M.thickness / 2) // back face sits on the door
    g.scale(MAGNET_SIZE, MAGNET_SIZE, MAGNET_SIZE)
    return g
  }

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

/** Surface settings, shared with the menu thumbnails so both look the same. */
export function magnetMaterial(color: string, finish: MagnetFinish): THREE.MeshPhysicalMaterialParameters {
  // brushed-looking metal: a flat face in mirror chrome would just reflect the dark room
  if (finish === 'satin')
    return {
      color: color === GOLD ? '#ecc673' : color === ROSE_GOLD ? '#efbcaa' : '#eceef1',
      metalness: 1,
      roughness: 0.36,
      envMapIntensity: 2.4,
    }
  if (finish === 'chrome') {
    if (color === SILVER) return { color: '#ffffff', metalness: 1, roughness: 0.14, envMapIntensity: 3 }
    if (color === GOLD) return { color: '#f3c766', metalness: 1, roughness: 0.15, envMapIntensity: 3 }
    if (color === ROSE_GOLD) return { color: '#f4b9a5', metalness: 1, roughness: 0.15, envMapIntensity: 3 }
    const c = new THREE.Color(color)
    // white is glossy white, like a lacquered balloon
    if (c.getHSL({ h: 0, s: 0, l: 0 }).l > 0.9)
      return { color: '#f4f4f2', metalness: 0, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.3 }
    // any other colour: anodised metal, lifted a little so it stays bright,
    // under a clear glossy coat that keeps crisp white highlights
    return {
      color: c.clone().lerp(new THREE.Color('#ffffff'), 0.25),
      metalness: 1,
      roughness: 0.18,
      envMapIntensity: 3.2,
      emissive: c,
      emissiveIntensity: 0.18,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }
  }
  return {
    color,
    emissive: color,
    emissiveIntensity: 0.12,
    roughness: 0.38,
    clearcoat: 0.3,
    clearcoatRoughness: 0.35,
    sheen: 0.3,
    sheenRoughness: 0.6,
  }
}

/**
 * Contact shadow in the magnet's own outline (a star casts a star), softly
 * blurred. The outline fills 1/SHADOW_PAD of the texture so the blur has room.
 */
const SHADOW_PAD = 1.5
const shadowTextures = new Map<MagnetShape, THREE.Texture>()
function getShadowTexture(shape: MagnetShape) {
  let t = shadowTextures.get(shape)
  if (t) return t
  const n = 128
  const c = document.createElement('canvas')
  c.width = c.height = n
  const ctx = c.getContext('2d')!
  const s = n / SHADOW_PAD
  const pts = shape === 'star' ? roundedStarOutline() : shape === 'heart' ? heartOutline() : makeShape(shape).getPoints(24)
  ctx.filter = 'blur(4px)'
  ctx.fillStyle = 'rgb(18, 18, 20)' // neutral, so it reads right on any fridge colour
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(n / 2 + p.x * s, n / 2 - p.y * s) : ctx.moveTo(n / 2 + p.x * s, n / 2 - p.y * s)))
  ctx.closePath()
  ctx.fill()
  t = new THREE.CanvasTexture(c)
  shadowTextures.set(shape, t)
  return t
}

const setCursor = (c: string) => (document.body.style.cursor = c)

/** Overshoots slightly past 1 before settling: the "snap" of a magnet landing */
const easeOutBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2)

export default function Magnet({
  data,
  onDragChange,
  onDrop,
  onTrash,
  appearDelay = 0,
}: {
  data: MagnetData
  onDragChange: (dragging: boolean) => void
  onDrop: (id: number, x: number, y: number) => void
  /** Let go over the trash button */
  onTrash: (id: number) => void
  /** Seconds to wait before snapping onto the door; null keeps it hidden (e.g. while loading) */
  appearDelay?: number | null
}) {
  const appearClock = useRef(0)
  const reduceMotion = useMemo(prefersReducedMotion, [])
  const ref = useRef<THREE.Group>(null!)
  const shadowRef = useRef<THREE.Mesh>(null!)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null

  const geometry = useMemo(() => makeGeometry(data.shape), [data.shape])
  const shadowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(data.shape), transparent: true, depthWrite: false }),
    [data.shape],
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
    setTrashState(false, false)
    if (isOverTrash(e.nativeEvent.clientX, e.nativeEvent.clientY)) onTrash(data.id)
    else onDrop(data.id, ref.current.position.x, ref.current.position.y)
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
    setTrashState(true, false)
  }

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    if (!dragging.current) return
    ray.current.copy(e.ray)
    followPointer()
    setTrashState(true, isOverTrash(e.nativeEvent.clientX, e.nativeEvent.clientY))
  }

  useFrame((_, dt) => {
    const g = ref.current
    const k = 1 - Math.exp(-dt * M.snapSpeed)

    // Appear: pop in with a little overshoot while dropping onto the door
    let appear = 0
    if (appearDelay !== null) {
      appearClock.current += dt
      appear = reduceMotion ? 1 : THREE.MathUtils.clamp((appearClock.current - appearDelay) / LOAD_IN.magnetPopSeconds, 0, 1)
    }
    g.scale.setScalar(Math.max(1e-3, easeOutBack(appear))) // never exactly 0: raycasting needs an invertible matrix

    lift.current += ((dragging.current ? 1 : 0) - lift.current) * k
    g.position.z = REST_Z + lift.current * M.liftHeight + (1 - appear) * M.liftHeight * 2

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
    sh.position.set(
      g.position.x - l * M.liftHeight * 0.4,
      g.position.y - MAGNET_SIZE * 0.06 - l * M.liftHeight * 0.7,
      SHADOW_Z,
    )
    sh.rotation.z = g.rotation.z
    sh.scale.set(scale * appear, scale * appear, 1)
    const onDoor = isOnDoor(g.position.x, g.position.y) ? 1 : 0
    shadowMaterial.opacity = THREE.MathUtils.lerp(M.shadow.restOpacity, M.shadow.liftOpacity, l) * onDoor * appear
  })

  return (
    <>
      <mesh ref={shadowRef} material={shadowMaterial} renderOrder={1000}>
        <planeGeometry />
      </mesh>
      <group
        ref={ref}
        position={[data.position[0], data.position[1], REST_Z]}
        rotation={[0, 0, (((data.id * 137) % 61) - 30) * (Math.PI / 180)]}
      >
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
          <meshPhysicalMaterial {...magnetMaterial(data.color, data.finish)} />
        </mesh>
      </group>
    </>
  )
}
