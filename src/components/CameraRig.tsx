import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_CONFIG as C, LOAD_IN } from '../fridgeStyle'
import { prefersReducedMotion } from '../motion'
import { FLOOR_Y, FRIDGE_BOUNDS, FRIDGE_HOME } from './Fridge'

export const HOME_POSITION = new THREE.Vector3(0, 0.4, 7.5)
const HOME_TARGET = new THREE.Vector3(0, 0, 0)
/** Opening shot: close on the top of the fridge, framed to the right so the title sits on the left */
export const INTRO_POSITION = new THREE.Vector3(-0.92, 1.19, 5.1)
const INTRO_TARGET = new THREE.Vector3(-0.92, 1.19, 0)
const RETRO_HOME = new THREE.Spherical().setFromVector3(HOME_POSITION.clone().sub(HOME_TARGET))
// The front view for the fridge on screen: the retro's, re-aimed and pulled back to fit
const HOME = RETRO_HOME.clone()
const homeTarget = HOME_TARGET.clone()
function fitHome() {
  HOME.radius = RETRO_HOME.radius * FRIDGE_HOME.distance
  homeTarget.set(HOME_TARGET.x, HOME_TARGET.y + FRIDGE_HOME.y, HOME_TARGET.z)
}
const DURATION = 1.4

/** A copy of the camera set to the front view, for pictures that shouldn't depend on where you've moved */
export function homeCamera(camera: THREE.Camera) {
  fitHome()
  const c = camera.clone()
  c.position.setFromSpherical(HOME).add(homeTarget)
  c.lookAt(homeTarget)
  c.updateMatrixWorld()
  return c
}

/** Whether Space is held, which turns left-drag into panning (read by magnets too). */
export const panKey = { held: false }

type Controls = {
  target: THREE.Vector3
  enableDamping: boolean
  mouseButtons: { LEFT?: THREE.MOUSE }
  update: () => void
}

// The camera must stay outside this box (the fridge plus clearance)...
const SOLID = new THREE.Box3()
// ...and the orbit/pan target inside this one, so the view always stays on the fridge
const TARGET_BOUNDS = new THREE.Box3()
/** Fit both boxes to the fridge on screen, which changes size with the model */
function syncBounds() {
  SOLID.min.copy(FRIDGE_BOUNDS.min).subScalar(C.clearance)
  SOLID.max.copy(FRIDGE_BOUNDS.max).addScalar(C.clearance)
  TARGET_BOUNDS.min.set(FRIDGE_BOUNDS.min.x - C.panMargin, FLOOR_Y, FRIDGE_BOUNDS.min.z)
  TARGET_BOUNDS.max.set(FRIDGE_BOUNDS.max.x + C.panMargin, FRIDGE_BOUNDS.max.y, FRIDGE_BOUNDS.max.z)
}
syncBounds()
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
  syncBounds()
  const target = controls.target
  // Pan limit: slide camera and target together so the view direction is kept.
  // Not while gliding: the glide can start outside the limit (the intro shot
  // aims off to the side to make room for the title) and clamping its first
  // frames made the camera jump; it always ends centred anyway.
  clamped.copy(target).clamp(TARGET_BOUNDS.min, TARGET_BOUNDS.max)
  if (!gliding && !clamped.equals(target)) {
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

const azimuth = (camera: THREE.Camera, target: THREE.Vector3) =>
  Math.atan2(camera.position.x - target.x, camera.position.z - target.z)
const spin = new THREE.Quaternion()
const Y_AXIS = new THREE.Vector3(0, 1, 0)
const shift = new THREE.Vector3()
const flat = new THREE.Vector3()

/**
 * Turntable spin. OrbitControls spins around its target, which zoom-to-cursor
 * and panning move off-centre, so the fridge would swing around some point
 * beside it. Whatever horizontal spin OrbitControls applied since last frame
 * is moved onto the fridge's own vertical centre line (x = 0, z = 0) instead:
 * camera and target both rotate about that axis, which equals OrbitControls'
 * result plus a translation. Zoom and pan never change the azimuth, so the
 * azimuth change here is purely orbiting (including damping momentum).
 */
function spinAroundFridgeAxis(camera: THREE.Camera, controls: Controls, last: Pose) {
  const target = controls.target
  const lastAzimuth = Math.atan2(last.position.x - last.target.x, last.position.z - last.target.z)
  const delta = angleDelta(lastAzimuth, azimuth(camera, target))
  if (Math.abs(delta) < 1e-6) return
  // Where the target lands when rotated about the fridge axis, minus where it is
  spin.setFromAxisAngle(Y_AXIS, delta)
  flat.set(target.x, 0, target.z)
  shift.copy(flat).applyQuaternion(spin).sub(flat)
  target.add(shift)
  camera.position.add(shift)
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

/**
 * Load-in camera: the intro pose pulled back by `u × cameraPullBack` and turned
 * `u × cameraSpin` around the fridge's centre line. u = 1 is the start, 0 the
 * finished intro shot, so the fridge turns to face you as the camera settles.
 */
function entrancePose(pose: Pose, u: number, outPosition: THREE.Vector3, outTarget: THREE.Vector3) {
  outPosition.subVectors(pose.position, pose.target).multiplyScalar(1 + u * LOAD_IN.cameraPullBack).add(pose.target)
  outTarget.copy(pose.target)
  spin.setFromAxisAngle(Y_AXIS, u * LOAD_IN.cameraSpin)
  outPosition.applyQuaternion(spin)
  outTarget.applyQuaternion(spin)
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
  startAtIntro = false,
  introPose = null,
  revealed = true,
}: {
  resetSignal: number
  onGlideChange: (gliding: boolean) => void
  /** Start on the close-up intro shot; a reset glide then pulls back to the full fridge */
  startAtIntro?: boolean
  /** While set (the landing screen), the camera holds exactly this pose; it follows window resizes */
  introPose?: { position: THREE.Vector3; target: THREE.Vector3 } | null
  /** False while the loading curtain is up: the intro camera waits at its load-in start pose */
  revealed?: boolean
}) {
  const entrance = useRef(0) // load-in progress, 0 → 1
  const reduceMotion = useMemo(prefersReducedMotion, [])
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as unknown as Controls | null
  const glide = useRef<Glide | null>(null)
  const spherical = useMemo(() => new THREE.Spherical(), [])
  const target = useMemo(() => new THREE.Vector3(), [])
  const lastValid = useMemo<Pose>(
    () => ({ position: HOME_POSITION.clone(), target: HOME_TARGET.clone() }),
    [],
  )

  // Point the controls at the intro shot once they exist (only on first mount)
  const introApplied = useRef(false)
  useEffect(() => {
    if (!controls || !startAtIntro || introApplied.current) return
    introApplied.current = true
    camera.position.copy(INTRO_POSITION)
    controls.target.copy(INTRO_TARGET)
    camera.lookAt(INTRO_TARGET)
    controls.update()
    lastValid.position.copy(INTRO_POSITION)
    lastValid.target.copy(INTRO_TARGET)
  }, [controls, startAtIntro, camera, lastValid])

  // A layout effect, so the glide is set up in the same commit that ends the
  // intro: with a plain effect, frames could render in between with neither
  // the intro pose nor the glide in charge, and the camera visibly jumped.
  useLayoutEffect(() => {
    if (resetSignal === 0 || !controls) return
    // Otherwise leftover spin is applied after the glide and drifts the view
    clearMomentum(controls, camera)
    const fromTarget = controls.target.clone()
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget))
    fitHome()
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
    if (introPose && !glide.current) {
      // Load-in: hold the start pose until revealed, then glide in to the intro shot
      if (revealed) entrance.current = reduceMotion ? 1 : Math.min(1, entrance.current + dt / LOAD_IN.cameraSeconds)
      entrancePose(introPose, 1 - easeOutCubic(entrance.current), camera.position, controls.target)
      camera.lookAt(controls.target)
      lastValid.position.copy(camera.position)
      lastValid.target.copy(controls.target)
      return
    }
    const g = glide.current
    const gliding = g !== null
    if (!gliding) spinAroundFridgeAxis(camera, controls, lastValid)
    if (g) {
      g.t = Math.min(g.t + dt / DURATION, 1)
      const k = easeInOutCubic(g.t)
      spherical.set(
        THREE.MathUtils.lerp(g.from.radius, HOME.radius, k),
        THREE.MathUtils.lerp(g.from.phi, HOME.phi, k),
        g.from.theta + g.dTheta * k,
      )
      target.lerpVectors(g.fromTarget, homeTarget, k)
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
