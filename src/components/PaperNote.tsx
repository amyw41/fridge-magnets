import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { hasRecipe, paperCanvas, paperDesign, recipeOf, writtenPaperCanvas, type PaperKind, type PaperStyleId, type Recipe } from '../papers'
import { doorFront } from '../fridgeModels'
import type { FridgeSurface, SurfacePoint } from '../fridgeSurface'
import { BREAK, Fall, landing, PaperRip } from '../rip'
import { isOverTrash, setTrashState } from '../trash'
import { panKey } from './CameraRig'

/** A note, and the recipe written on it (if any) */
export interface PaperData extends Partial<Recipe> {
  id: number
  kind: PaperKind
  /** Printed colour; null keeps the paper's own */
  style: PaperStyleId
  /** Centre [s, y] on the fridge's unrolled outside (see fridgeSurface) */
  position: [number, number]
  /** Slight turn, in radians, so notes don't look machine-placed */
  tilt: number
  /** Fallen off onto the floor: lying at (x, z), turned yaw. Its position is then where it last was on the fridge */
  floor?: [number, number, number]
}

/** Just off the door: magnets sit on top of paper */
const REST_OFF = 0.004
const SHADOW_OFF = 0.002
const LIFT = 0.03
/** Columns the note is split into, so it can bend round the fridge's corners */
const BEND_SEGMENTS = 48

/** A flat note of this size, with its flat layout kept to bend from */
function makeSheet(w: number, h: number) {
  const g = new THREE.PlaneGeometry(w, h, BEND_SEGMENTS, 4)
  g.userData.flat = Float32Array.from(g.attributes.position.array)
  return g
}

/**
 * Lays the note on the fridge centred at [s, y], `off` out from it: each
 * point of the flat sheet goes to its own spot round the surface, so a note
 * across a corner wraps round it.
 */
const bendPoint: SurfacePoint = { x: 0, z: 0, angle: 0 }
const vp = new THREE.Vector3()
const vn = new THREE.Vector3()
function layOn(
  g: THREE.BufferGeometry,
  surface: FridgeSurface,
  s: number,
  y: number,
  tilt: number,
  off: number,
  scale = 1,
  rip?: PaperRip,
) {
  const flat = g.userData.flat as Float32Array
  const pos = g.attributes.position
  const nor = g.attributes.normal
  const c = Math.cos(tilt) * scale
  const sn = Math.sin(tilt) * scale
  // being pulled off: which way, across the sheet
  const pull = rip?.active ? rip.pullAlong(surface.point(s).angle) : null
  for (let i = 0; i < pos.count; i++) {
    const lx = flat[i * 3]
    const ly = flat[i * 3 + 1]
    const ts = lx * c - ly * sn
    const ty = lx * sn + ly * c
    const p = surface.point(s + ts, off, bendPoint)
    vp.set(p.x, y + ty, p.z)
    vn.set(Math.sin(p.angle), 0, Math.cos(p.angle))
    if (pull) rip!.point(vp, vn, ts, ty, (ts * pull.ds + ty * pull.dy) / pull.reach)
    pos.setXYZ(i, vp.x, vp.y, vp.z)
    nor.setXYZ(i, vn.x, vn.y, vn.z)
  }
  pos.needsUpdate = true
  nor.needsUpdate = true
  g.computeBoundingSphere()
  g.computeBoundingBox()
}

/** Lays the note out flat at `pos`, turned `quat`, curled by `curl` across its width */
const fr = new THREE.Vector3()
const fu = new THREE.Vector3()
const fb = new THREE.Vector3()
function layFlat(g: THREE.BufferGeometry, pos: THREE.Vector3, quat: THREE.Quaternion, tilt: number, curl: number, w: number) {
  const flat = g.userData.flat as Float32Array
  const p = g.attributes.position
  const n = g.attributes.normal
  fr.set(1, 0, 0).applyQuaternion(quat)
  fu.set(0, 1, 0).applyQuaternion(quat)
  fb.set(0, 0, 1).applyQuaternion(quat)
  const c = Math.cos(tilt)
  const sn = Math.sin(tilt)
  for (let i = 0; i < p.count; i++) {
    const lx = flat[i * 3] * c - flat[i * 3 + 1] * sn
    const ly = flat[i * 3] * sn + flat[i * 3 + 1] * c
    const bend = (lx / w) ** 2 * 4 * curl
    vp.copy(pos).addScaledVector(fr, lx).addScaledVector(fu, ly).addScaledVector(fb, bend * w * 0.5)
    vn.copy(fb).addScaledVector(fr, (-8 * curl * lx) / w).normalize()
    p.setXYZ(i, vp.x, vp.y, vp.z)
    n.setXYZ(i, vn.x, vn.y, vn.z)
  }
  p.needsUpdate = true
  n.needsUpdate = true
  g.computeBoundingSphere()
  g.computeBoundingBox()
}

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
  onFloor,
  onTrash,
  onOpen,
}: {
  data: PaperData
  /** Position in the pile: later notes lie on top */
  stack: number
  onDragChange: (dragging: boolean) => void
  onDrop: (id: number, x: number, y: number) => void
  /** Let go in the open: it fell to the floor, landing at (x, z) turned yaw */
  onFloor: (id: number, x: number, z: number, yaw: number) => void
  /** Let go over the trash button */
  onTrash: (id: number) => void
  /** Clicked without dragging: open it to write on */
  onOpen: (id: number) => void
}) {
  const [w, h] = paperDesign(data.kind).size
  const ref = useRef<THREE.Mesh>(null!)
  const shadowRef = useRef<THREE.Mesh>(null!)
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null
  const gl = useThree((s) => s.gl)

  const material = useMemo(() => {
    const map = new THREE.CanvasTexture(paperCanvas(data.kind, data.style))
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
  }, [data.kind, data.style, gl])

  // Once there's a recipe on it, write it onto the note (the handwriting font loads first).
  // Keyed on the recipe's content, so moving the note doesn't redraw it.
  const recipeKey = JSON.stringify(recipeOf(data))
  useEffect(() => {
    if (!hasRecipe(data)) {
      material.map!.image = paperCanvas(data.kind, data.style)
      material.map!.needsUpdate = true
      return
    }
    let live = true
    const recipe = recipeOf(data)
    writtenPaperCanvas(data.kind, data.style, recipe).then((c) => {
      if (!live) return
      material.map!.image = c
      material.map!.needsUpdate = true
    })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [material, data.kind, data.style, recipeKey])
  const shadowMaterial = useMemo(
    () => new THREE.MeshBasicMaterial({ map: getShadowTexture(data.kind), transparent: true, depthWrite: false, opacity: 0.28 }),
    [data.kind],
  )

  const sheet = useMemo(() => makeSheet(w, h), [w, h])
  const shadowSheet = useMemo(() => makeSheet(w * 1.3, h * 1.3), [w, h])

  const dragging = useRef(false)
  const hovered = useRef(false)
  const ray = useRef(new THREE.Ray())
  // Where it is now, [s, y] round the fridge, and how far out
  const at = useRef({ s: data.position[0], y: data.position[1] })
  const off = useRef(REST_OFF)
  const grabOffset = useRef(new THREE.Vector2())
  const lift = useRef(0)
  const camera = useThree((s) => s.camera)
  const rip = useMemo(() => new PaperRip(), []) // pulled off the fridge: peels, then tears free
  const downAt = useRef({ x: 0, y: 0 })
  // On the floor: how it fell there, and which landing spot that was for
  const fall = useMemo(() => new Fall(), [])
  const fellTo = useRef<string | null>(null)
  const firstFrame = useRef(true)
  const held = useRef(new THREE.Vector3()) // where its middle is drawn now
  const heldQ = useRef(new THREE.Quaternion())

  const followPointer = () => {
    const surface = doorFront().surface
    const hit = surface.hit(ray.current, off.current)
    const s = hit && surface.wrap(hit.s + grabOffset.current.x)
    const y = hit && hit.y + grabOffset.current.y
    if (hit && surface.onSurface(s!, y!)) {
      at.current.s = s!
      at.current.y = y!
      rip.onFridge()
      return
    }
    // off the fridge (or edge-on): it clings to the nearest edge, peeling, until it's clearly away
    const near = surface.nearest(ray.current, off.current)
    if (!rip.broken && near.gap <= BREAK) {
      at.current.s = surface.wrap(near.s + grabOffset.current.x)
      at.current.y = THREE.MathUtils.clamp(near.y + grabOffset.current.y, surface.band[0], surface.band[1])
    }
    rip.offFridge(ray.current, camera, near.gap)
  }

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    const surface = doorFront().surface
    const face = surface.point(at.current.s)
    const dir = e.ray.direction
    const onFloor = !!data.floor
    if (panKey.held || e.button !== 0) return
    if (!onFloor && dir.x * Math.sin(face.angle) + dir.z * Math.cos(face.angle) > -0.25) return
    e.stopPropagation()
    ;(e.target as Element).setPointerCapture(e.pointerId)
    if (controls) controls.enabled = false
    downAt.current = { x: e.nativeEvent.clientX, y: e.nativeEvent.clientY }
    ray.current.copy(e.ray)
    dragging.current = true
    fellTo.current = null
    if (onFloor) {
      // picked up off the floor: held in the air under the pointer
      grabOffset.current.set(0, 0)
      rip.pickUp(held.current)
    } else {
      grabOffset.current.set(surface.wrap(at.current.s - surface.toS(e.point.x, e.point.z)), at.current.y - e.point.y)
      rip.onFridge()
    }
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
    const { clientX: x, clientY: y } = e.nativeEvent
    if (isOverTrash(x, y)) onTrash(data.id)
    else if (Math.hypot(x - downAt.current.x, y - downAt.current.y) < 5) onOpen(data.id)
    // let go once torn off the fridge: it drifts down to the floor
    else if (rip.release()) {
      const [fx, fz, yaw] = landing(rip.target, camera, doorFront().surface, Math.hypot(w, h) / 2)
      fall.start(held.current, heldQ.current, fx, fz, yaw, 0, 0.003, true)
      fellTo.current = [fx, fz, yaw].join()
      onFloor(data.id, fx, fz, yaw)
    } else onDrop(data.id, at.current.s, at.current.y)
  }

  useFrame((_, dt) => {
    const m = ref.current
    const k = 1 - Math.exp(-dt * 16)
    const surface = doorFront().surface
    const now = at.current
    lift.current += ((dragging.current ? 1 : 0) - lift.current) * k
    off.current = REST_OFF + lift.current * LIFT
    // Held notes draw over the whole pile
    const order = dragging.current ? 900 : 10 + stack * 2
    m.renderOrder = order + 1
    shadowRef.current.renderOrder = order

    // Lying on the floor (or drifting down there)
    const fl = data.floor
    if ((fl || fellTo.current) && !dragging.current) {
      if (fl && fellTo.current !== fl.join()) {
        if (firstFrame.current) fall.land(fl[0], fl[1], fl[2], 0, 0.003)
        else fall.start(held.current, heldQ.current, fl[0], fl[1], fl[2], 0, 0.003, true)
        fellTo.current = fl.join()
      }
      firstFrame.current = false
      if (fall.falling || sheet.userData.laid !== 'floor') {
        fall.update(dt)
        layFlat(sheet, fall.position, fall.quaternion, data.tilt, fall.curl, w)
        sheet.userData.laid = fall.falling ? 'falling' : 'floor'
      }
      held.current.copy(fall.position)
      heldQ.current.copy(fall.quaternion)
      shadowMaterial.opacity = 0
      return
    }
    firstFrame.current = false
    if (dragging.current) followPointer()
    else {
      now.s = surface.wrap(now.s + surface.wrap(data.position[0] - now.s) * k)
      now.y += (data.position[1] - now.y) * k
    }
    const l = lift.current
    rip.update(dt)
    const centre = surface.point(now.s, off.current)
    rip.anchor.set(centre.x, now.y, centre.z)
    rip.normal.set(Math.sin(centre.angle), 0, Math.cos(centre.angle))
    // re-bend only when it's moved (the sheets remember where they were laid); always while being pulled off
    const key = rip.active
      ? 'pulled'
      : [now.s, now.y, off.current, data.tilt, surface.perimeter].map((v) => v.toFixed(5)).join()
    if (sheet.userData.laid !== key || key === 'pulled') {
      sheet.userData.laid = key
      if (rip.active) rip.begin(camera, Math.hypot(w, h) / 2)
      layOn(sheet, surface, now.s, now.y, data.tilt, off.current, 1, rip)
      layOn(shadowSheet, surface, now.s - l * LIFT * 0.4, now.y - 0.006 - l * LIFT * 0.8, data.tilt, SHADOW_OFF, 1 + l * 0.06)
    }
    // where it's drawn now, for falling from or picking up
    held.current.copy(rip.blend > 0.5 ? rip.target : rip.anchor)
    heldQ.current.copy(camera.quaternion)
    if (rip.blend <= 0.5) heldQ.current.setFromAxisAngle(vn.set(0, 1, 0), centre.angle)
    shadowMaterial.opacity = THREE.MathUtils.lerp(0.28, 0.2, l) * (1 - rip.blend) * (1 - rip.pull * 0.5)
  })

  return (
    <>
      <mesh ref={shadowRef} geometry={shadowSheet} material={shadowMaterial} />
      <mesh
        ref={ref}
        geometry={sheet}
        material={material}
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
      />
    </>
  )
}
