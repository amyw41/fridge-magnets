import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_CONFIG as C } from '../fridgeStyle'
import { FLOOR_Y, FRIDGE_BOUNDS } from './Fridge'

export const HOME_POSITION = new THREE.Vector3(0, 0.4, 7.5)
const HOME_TARGET = new THREE.Vector3(0, 0, 0)
const HOME = new THREE.Spherical().setFromVector3(HOME_POSITION.clone().sub(HOME_TARGET))
const DURATION = 1.4

/** Whether Space is held, which turns left-drag into panning (read by magnets too). */
export const panKey = { held: false }

type Controls = {
  target: THREE.Vector3
  enableDamping: boolean
  mouseButtons: { LEFT?: THREE.MOUSE }
  update: () => void
}

// The camera must stay outside this box (the fridge plus clearance)...
const SOLID = new THREE.Box3(
  FRIDGE_BOUNDS.min.clone().subScalar(C.clearance),
  FRIDGE_BOUNDS.max.clone().addScalar(C.clearance),
)
// ...and the orbit/pan target inside this one, so the view always stays on the fridge
const TARGET_BOUNDS = new THREE.Box3(
  new THREE.Vector3(FRIDGE_BOUNDS.min.x - C.panMargin, FLOOR_Y, FRIDGE_BOUNDS.min.z),
  new THREE.Vector3(FRIDGE_BOUNDS.max.x + C.panMargin, FRIDGE_BOUNDS.max.y, FRIDGE_BOUNDS.max.z),
)
const clamped = new THREE.Vector3()
const probe = new THREE.Vector3()

/** Pushes `p` out through the nearest face of `box` if it's inside. */
function pushOutOf(box: THREE.Box3, p: THREE.Vector3) {
  if (!box.containsPoint(p)) return
  const exits: [number, 'x' | 'y' | 'z', number][] = [
    [p.x - box.min.x, 'x', box.min.x],
    [box.max.x - p.x, 'x', box.max.x],
    [box.max.y - p.y, 'y', box.max.y],
    [p.z - box.min.z, 'z', box.min.z],
    [box.max.z - p.z, 'z', box.max.z],
  ] // no exit through the bottom: that's under the floor
  const [, axis, value] = exits.reduce((a, b) => (b[0] < a[0] ? b : a))
  p[axis] = value
}

const isValidCameraPosition = (p: THREE.Vector3) =>
  !SOLID.containsPoint(p) && p.y >= FLOOR_Y + C.floorClearance

/** The last camera pose that passed the checks, to fall back to. */
interface Pose {
  position: THREE.Vector3
  target: THREE.Vector3
}

/**
 * Keeps the camera physical: never inside the fridge, never under the floor,
 * always looking at the fridge. Runs every frame after OrbitControls.
 *
 * A zoom/orbit/pan that would enter the fridge is cut short at the surface,
 * so the camera stops like it hit something solid. (Pushing it out through
 * the nearest face instead can flip it over the top.) During the reset glide,
 * where undoing would stall it, it's pushed out instead.
 */
function constrain(camera: THREE.Camera, controls: Controls, lastValid: Pose, gliding: boolean) {
  const target = controls.target
  // Pan limit: slide camera and target together so the view direction is kept
  clamped.copy(target).clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max)
  if (!clamped.equals(target)) {
    camera.position.add(clamped.sub(target))
    target.add(clamped)
  }

  if (isValidCameraPosition(camera.position)) {
    // fine as is
  } else if (!gliding && isValidCameraPosition(lastValid.position)) {
    // Back off along this frame's move to the furthest point that's still outside
    let lo = 0
    let hi = 1
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (isValidCameraPosition(probe.lerpVectors(lastValid.position, camera.position, mid))) lo = mid
      else hi = mid
    }
    camera.position.lerpVectors(lastValid.position, camera.position, lo)
    target.lerpVectors(lastValid.target, target, lo)
  } else {
    pushOutOf(SOLID, camera.position)
    camera.position.y = Math.max(camera.position.y, FLOOR_Y + C.floorClearance)
  }
  lastValid.position.copy(camera.position)
  lastValid.target.copy(target)
  camera.lookAt(target)
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Shortest signed rotation from one angle to another, in [-π, π]
function angleDelta(from: number, to: number) {
  const d = (to - from) % (Math.PI * 2)
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d
}

/**
 * Discards OrbitControls' leftover damping momentum without moving the camera.
 * With damping off, update() applies the pending delta and zeroes it; we then
 * restore the pose and update again so nothing visibly jumps.
 */
function clearMomentum(controls: Controls, camera: THREE.Camera) {
  const pos = camera.position.clone()
  const target = controls.target.clone()
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  camera.position.copy(pos)
  controls.target.copy(target)
  controls.update()
  controls.enableDamping = damping
}

interface Glide {
  t: number
  from: THREE.Spherical
  fromTarget: THREE.Vector3
  dTheta: number
}

/**
 * Camera behaviour on top of OrbitControls:
 * - glides back to the front view whenever `resetSignal` changes, swinging
 *   around the fridge in spherical coordinates rather than cutting through it
 * - Space+drag pans
 * - keeps the camera out of the fridge and above the floor
 */
export default function CameraRig({
  resetSignal,
  onGlideChange,
}: {
  resetSignal: number
  onGlideChange: (gliding: boolean) => void
}) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const glide = useRef<Glide | null>(null)
  const spherical = useMemo(() => new THREE.Spherical(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const lastValid = useMemo<Pose>(
    () => ({ position: HOME_POSITION.clone(), target: HOME_TARGET.clone() }),
    [],
  )

  useEffect(() => {
    if (resetSignal === 0 || !controls) return
    // Otherwise leftover spin is applied after the glide and drifts the view
    clearMomentum(controls, camera)
    const fromTarget = controls.target.clone()
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget))
    glide.current = { t: 0, from, fromTarget, dTheta: angleDelta(from.theta, HOME.theta) }
    onGlideChange(true)
  }, [resetSignal, camera, controls, onGlideChange])

  // Space held: left-drag pans instead of orbiting
  useEffect(() => {
    if (!controls) return
    const set = (held: boolean) => {
      panKey.held = held
      controls.mouseButtons.LEFT = held ? THREE.MOUSE.PAN : THREE.MOUSE.ROTATE
      document.body.style.cursor = held ? 'grab' : 'auto'
    }
    const down = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || e.repeat) return
      e.preventDefault()
      set(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') set(false)
    }
    const blur = () => set(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', blur)
    }
  }, [controls])

  // Runs after OrbitControls' own update (priority -1), so our pose wins each frame
  useFrame((_, dt) => {
    if (!controls) return
    const g = glide.current
    const gliding = g !== null
    if (g) {
      g.t = Math.min(g.t + dt / DURATION, 1)
      const k = easeInOutCubic(g.t)
      spherical.set(
        THREE.MathUtils.lerp(g.from.radius, HOME.radius, k),
        THREE.MathUtils.lerp(g.from.phi, HOME.phi, k),
        g.from.theta + g.dTheta * k,
      )
      target.lerpVectors(g.fromTarget, HOME_TARGET, k)
      camera.position.setFromSpherical(spherical).add(target)
      controls.target.copy(target)
      if (g.t === 1) {
        glide.current = null
        camera.lookAt(target)
        controls.update()
        onGlideChange(false)
      }
    }
    constrain(camera, controls, lastValid, gliding)
  })

  return null
}
