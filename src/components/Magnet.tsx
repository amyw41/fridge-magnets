import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { LOAD_IN, MAGNET_CONFIG as M } from '../fridgeStyle'
import { prefersReducedMotion } from '../motion'
import { GOLD, ROSE_GOLD, SILVER } from '../palette'
import { isOnDoor, MAGNET_SIZE, type MagnetData, type MagnetFinish, type MagnetShape } from '../magnetLayout'
import { doorFront } from '../fridgeModels'
import { BREAK, Fall, landing, Rip } from '../rip'
import { isOverTrash, setTrashState } from '../trash'
import { panKey } from './CameraRig'

const THICKNESS = M.thickness * MAGNET_SIZE
/** Centre's distance out from the fridge when resting on it */
const REST_OFF = THICKNESS / 2
const SHADOW_OFF = 0.0015

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

/** True if p is inside the closed outline */
function inside(x: number, y: number, outline: THREE.Vector2[]) {
  let hit = false
  for (let i = 0, j = outline.length - 1; i < outline.length; j = i++) {
    const a = outline[i]
    const b = outline[j]
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit
  }
  return hit
}

/**
 * Inflation of the outline like a soap film blown out from behind: solves for
 * a membrane pinned at the edge and pushed evenly from below. Unlike
 * distance-from-the-edge, it has no ridges down the middle of each arm, so
 * the surface is smooth all over. Returns a lookup of height 0..1 at (x, y).
 */
function membrane(outline: THREE.Vector2[]) {
  const N = 128
  const lo = -0.6
  const cell = 1.2 / (N - 1)
  const mask = new Uint8Array(N * N)
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) mask[j * N + i] = inside(lo + i * cell, lo + j * cell, outline) ? 1 : 0
  let h = new Float32Array(N * N)
  let next = new Float32Array(N * N)
  for (let it = 0; it < 1500; it++) {
    for (let j = 1; j < N - 1; j++)
      for (let i = 1; i < N - 1; i++) {
        const k = j * N + i
        next[k] = mask[k] ? (h[k - 1] + h[k + 1] + h[k - N] + h[k + N] + cell * cell) / 4 : 0
      }
    ;[h, next] = [next, h]
  }
  let max = 0
  for (const v of h) max = Math.max(max, v)
  return (x: number, y: number) => {
    const fx = THREE.MathUtils.clamp((x - lo) / cell, 0, N - 1.001)
    const fy = THREE.MathUtils.clamp((y - lo) / cell, 0, N - 1.001)
    const i = Math.floor(fx)
    const j = Math.floor(fy)
    const u = fx - i
    const v = fy - j
    const at = (a: number, b: number) => h[(j + b) * N + i + a]
    return ((at(0, 0) * (1 - u) + at(1, 0) * u) * (1 - v) + (at(0, 1) * (1 - u) + at(1, 1) * u) * v) / max
  }
}

/**
 * Puffy shape like an inflated foil balloon: the height at each point follows
 * its distance from the edge on a circular profile, so a star's arms swell
 * into round tubes, the centre domes up and soft creases run into each valley.
 */
function makePuffy(outline: THREE.Vector2[], smooth = false) {
  const film = smooth ? membrane(outline) : null
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
      if (film) {
        // round the film's edge over like a balloon's seam; smooth everywhere inside
        const f = k === rings ? 0 : Math.max(film(p.x, p.y), 0)
        positions.push(p.x, p.y, height * Math.pow(f, 0.6))
        continue
      }
      const d = k === rings ? 0 : Math.min(distToOutline(p, outline) / depth, 1)
      positions.push(p.x, p.y, height * Math.sqrt(1 - (1 - d) ** 2))
    }
  }
  positions[2] = height
  // Soften the creases: blur each ring's heights around the star a few times
  // so the folds roll like stretched foil instead of meeting at sharp ridges
  // (the film has none to soften)
  for (let pass = 0; pass < (film ? 0 : 8); pass++) {
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
    const g = shape === 'circle' ? makeButton() : (shape === 'star' ? makePuffy(roundedStarOutline(), true) : makePuffy(heartOutline()))
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

// Building a shape (the puffy ones especially) takes a moment, so each is built once and shared
const sharedGeometries = new Map<MagnetShape, THREE.BufferGeometry>()
function sharedGeometry(shape: MagnetShape) {
  let g = sharedGeometries.get(shape)
  if (!g) sharedGeometries.set(shape, (g = makeGeometry(shape)))
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
  onFloor,
  onTrash,
  appearDelay = 0,
  justPlaced = false,
}: {
  data: MagnetData
  onDragChange: (dragging: boolean) => void
  onDrop: (id: number, x: number, y: number) => void
  /** Let go in the open: it fell to the floor, landing at (x, z) turned yaw */
  onFloor: (id: number, x: number, z: number, yaw: number) => void
  /** Let go over the trash button */
  onTrash: (id: number) => void
  /** Seconds to wait before snapping onto the door; null keeps it hidden (e.g. while loading) */
  appearDelay?: number | null
  /** Just put on from the menu: already there (no pop), lifted, and settles down, as when let go after moving it */
  justPlaced?: boolean
}) {
  const appearClock = useRef(justPlaced ? Infinity : 0)
  const reduceMotion = useMemo(prefersReducedMotion, [])
  const ref = useRef<THREE.Group>(null!)
  const shadowRef = useRef<THREE.Mesh>(null!)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const camera = useThree((s) => s.camera)

  const geometry = sharedGeometry(data.shape)
  const shadowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(data.shape), transparent: true, depthWrite: false }),
    [data.shape],
  )

  // Drag state lives in refs: it changes every frame and needs no re-render
  const dragging = useRef(false)
  const hovered = useRef(false)
  const ray = useRef(new THREE.Ray())
  // Where it is now, [s, y] round the fridge (see fridgeSurface), and how far out
  const at = useRef({ s: data.position[0], y: data.position[1] })
  const off = useRef(REST_OFF)
  const grabOffset = useRef(new THREE.Vector2()) // magnet centre minus grab point, in [s, y]
  const grabDz = useRef(0) // grab point's height above the magnet centre
  const lift = useRef(justPlaced ? 1 : 0) // 0 = flat on door, 1 = fully lifted
  const rip = useMemo(() => new Rip(), []) // pulled off the fridge: clings, then tears free
  const stuckQ = useMemo(() => new THREE.Quaternion(), [])
  const euler = useMemo(() => new THREE.Euler(), [])
  const spin = (((data.id * 137) % 61) - 30) * (Math.PI / 180)
  // On the floor: how it fell there, and which landing spot that was for
  const fall = useMemo(() => new Fall(), [])
  const fellTo = useRef<string | null>(null)
  const firstFrame = useRef(true)

  /**
   * Keeps the exact grabbed point under the cursor: intersects the pointer ray
   * with the fridge's outside, raised to where that point currently sits.
   * Called on every pointer event as well as every frame, so the position is
   * never a frame behind. Off the fridge (or edge-on) it clings to the
   * nearest edge, pulled toward the pointer, until it's clearly away.
   */
  const followPointer = () => {
    const surface = doorFront().surface
    const hit = surface.hit(ray.current, off.current + grabDz.current)
    const s = hit && surface.wrap(hit.s + grabOffset.current.x)
    const y = hit && hit.y + grabOffset.current.y
    if (hit && surface.onSurface(s!, y!)) {
      at.current.s = s!
      at.current.y = y!
      rip.onFridge()
      return
    }
    const near = surface.nearest(ray.current, off.current + grabDz.current)
    if (!rip.broken && near.gap <= BREAK) {
      at.current.s = surface.wrap(near.s + grabOffset.current.x)
      at.current.y = THREE.MathUtils.clamp(near.y + grabOffset.current.y, surface.band[0], surface.band[1])
    }
    rip.offFridge(ray.current, camera, near.gap)
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
    // let go once torn off the fridge: it falls to the floor
    else if (rip.release()) {
      const [x, z, yaw] = landing(rip.target, camera, doorFront().surface, MAGNET_SIZE * 0.6)
      fall.start(ref.current.position, ref.current.quaternion, x, z, yaw, spin, REST_OFF, false)
      fellTo.current = [x, z, yaw].join()
      onFloor(data.id, x, z, yaw)
    } else onDrop(data.id, at.current.s, at.current.y)
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    // Space+drag pans the view; and only grab when facing it, since edge-on
    // the pointer can't tell where on the fridge it is
    const surface = doorFront().surface
    const face = surface.point(at.current.s)
    const dir = e.ray.direction
    const onFloor = !!data.floor
    if (panKey.held || e.button !== 0) return
    if (!onFloor && dir.x * Math.sin(face.angle) + dir.z * Math.cos(face.angle) > -0.25) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    // Disable orbiting now, before OrbitControls sees this same pointerdown
    if (controls) controls.enabled = false
    fellTo.current = null
    if (onFloor) {
      // picked up off the floor: held in the air under the pointer
      grabOffset.current.set(0, 0)
      grabDz.current = 0
      ray.current.copy(e.ray)
      dragging.current = true
      rip.pickUp(ref.current.position)
      onDragChange(true)
      setCursor('grabbing')
      setTrashState(true, false)
      return
    }
    const s = surface.toS(e.point.x, e.point.z)
    const base = surface.point(s)
    grabOffset.current.set(surface.wrap(at.current.s - s), at.current.y - e.point.y)
    grabDz.current =
      (e.point.x - base.x) * Math.sin(base.angle) + (e.point.z - base.z) * Math.cos(base.angle) - off.current
    ray.current.copy(e.ray)
    dragging.current = true
    rip.onFridge()
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
    off.current = REST_OFF + lift.current * M.liftHeight + (1 - appear) * M.liftHeight * 2
    // Lying on the floor (or falling there)
    const fl = data.floor
    if ((fl || fellTo.current) && !dragging.current) {
      if (fl && fellTo.current !== fl.join()) {
        if (firstFrame.current) fall.land(fl[0], fl[1], fl[2], spin, REST_OFF)
        else fall.start(g.position, g.quaternion, fl[0], fl[1], fl[2], spin, REST_OFF, false)
        fellTo.current = fl.join()
      }
      firstFrame.current = false
      fall.update(dt)
      g.position.copy(fall.position)
      g.quaternion.copy(fall.quaternion)
      shadowMaterial.opacity = 0
      return
    }
    const surface = doorFront().surface
    const now = at.current

    if (dragging.current) {
      followPointer() // the lift changes the grab height even if the pointer is still
    } else {
      now.s = surface.wrap(now.s + surface.wrap(data.position[0] - now.s) * k)
      now.y += (data.position[1] - now.y) * k
    }
    // Stand it on the fridge there, facing out
    const p = surface.point(now.s, off.current)
    g.position.set(p.x, now.y, p.z)
    g.rotation.set(0, p.angle, spin)
    rip.update(dt)
    firstFrame.current = false
    // ...unless it's being pulled off it
    rip.anchor.copy(g.position)
    rip.normal.set(Math.sin(p.angle), 0, Math.cos(p.angle))
    if (rip.active) {
      stuckQ.setFromEuler(euler.set(0, p.angle, spin))
      rip.pose(g.position, g.quaternion, stuckQ, camera, spin)
    }

    // Contact shadow: grows, softens and drifts away from the light as it lifts;
    // hidden when the magnet is held off the door
    const sh = shadowRef.current
    const l = lift.current
    const scale = THREE.MathUtils.lerp(M.shadow.restScale, M.shadow.liftScale, l) * MAGNET_SIZE
    const q = surface.point(now.s - l * M.liftHeight * 0.4, SHADOW_OFF)
    sh.position.set(q.x, now.y - MAGNET_SIZE * 0.06 - l * M.liftHeight * 0.7, q.z)
    sh.rotation.set(0, q.angle, spin)
    sh.scale.set(scale * appear, scale * appear, 1)
    const onDoor = isOnDoor(now.s, now.y) ? 1 : 0
    shadowMaterial.opacity =
      THREE.MathUtils.lerp(M.shadow.restOpacity, M.shadow.liftOpacity, l) * onDoor * appear * (1 - rip.blend) * (1 - rip.pull * 0.5)
  })

  return (
    <>
      <mesh ref={shadowRef} material={shadowMaterial} renderOrder={1000}>
        <planeGeometry />
      </mesh>
      <group ref={ref}>
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
