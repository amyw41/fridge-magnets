import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { CAMERA_CONFIG as C } from '../fridgeStyle'
import { DOOR_Z, FRIDGE_BOUNDS } from './Fridge'

type Controls = { target: THREE.Vector3; enabled: boolean }

// The body itself (handles and coils excluded), so the anchor lands on the door surface
// (kept in step with FRIDGE_BOUNDS, which follows the fridge's size)
const FRIDGE_BOX = new THREE.Box3()
/** A trackpad gesture keeps its classification while events keep coming this fast */
const GESTURE_GAP_MS = 120
/** A blocked wheel gesture counts as over once its events stop for this long */
const SWALLOW_GAP_MS = 200

/** Wheel notches are whole numbers of 50+ px; trackpads send small or fractional deltas. */
const looksLikeNotch = (e: WheelEvent) => Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50

/**
 * Best-effort mouse-wheel vs trackpad detection (browsers don't say which):
 * - line/page deltas only come from wheels
 * - ctrl+wheel is a pinch unless it's notch-sized (ctrl + a real wheel)
 * - horizontal motion means two fingers
 * - Chrome/Safari give wheel notches a legacy wheelDeltaY of ±120 (multiples),
 *   and trackpads exactly -3 × deltaY
 * - otherwise go by size: notch-sized means wheel
 */
function looksLikeTrackpad(e: WheelEvent) {
  if (e.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) return false
  if (e.ctrlKey) return !looksLikeNotch(e)
  if (e.deltaX !== 0) return true
  const legacy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY
  if (legacy && legacy % 120 === 0) return false
  if (legacy && Math.abs(legacy + 3 * e.deltaY) <= 1) return true
  return !looksLikeNotch(e)
}

/** deltaY in pixels whatever unit the browser reported it in */
const pixelDeltaY = (e: WheelEvent) =>
  e.deltaY * (e.deltaMode === WheelEvent.DOM_DELTA_LINE ? 33 : e.deltaMode === WheelEvent.DOM_DELTA_PAGE ? 800 : 1)

/**
 * Figma-style wheel navigation, replacing OrbitControls' zoom:
 * - zoom is anchored to the cursor and exponential in the wheel delta
 * - trackpad pinch (ctrl+wheel) zooms and two-finger scroll pans, both instantly
 * - a mouse wheel zooms with a very short ease
 * Zooming scales the camera *and* the orbit target about the point under the
 * cursor, so the view direction never changes and that point stays put.
 */
export default function WheelNavigation({ disabled }: { disabled: boolean }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const gl = useThree((s) => s.gl)
  const controls = useThree((s) => s.controls) as unknown as Controls | null

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const anchor = useMemo(() => new THREE.Vector3(), [])
  const plane = useMemo(() => new THREE.Plane(), [])
  const forward = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const toTarget = useMemo(() => new THREE.Vector3(), [])

  const cursor = useRef(new THREE.Vector2()) // last cursor position, in NDC
  const pendingWheelLog = useRef(0) // log of the distance multiplier still to apply
  const lastGesture = useRef({ time: -Infinity, trackpad: false })
  const disabledRef = useRef(disabled)
  disabledRef.current = disabled

  /**
   * The 3D point under the cursor, into `anchor`: on the fridge if the cursor's
   * over it, otherwise on the plane through the orbit target facing the camera.
   */
  const findAnchor = (target: THREE.Vector3) => {
    raycaster.setFromCamera(cursor.current, camera)
    FRIDGE_BOX.min.set(FRIDGE_BOUNDS.min.x, FRIDGE_BOUNDS.min.y, FRIDGE_BOUNDS.min.z + 0.12)
    FRIDGE_BOX.max.set(FRIDGE_BOUNDS.max.x, FRIDGE_BOUNDS.max.y, DOOR_Z)
    if (raycaster.ray.intersectBox(FRIDGE_BOX, anchor)) return true
    camera.getWorldDirection(forward)
    plane.setFromNormalAndCoplanarPoint(forward, target)
    return raycaster.ray.intersectPlane(plane, anchor) !== null
  }

  /** Scale camera + target distance by `scale` about the point under the cursor. */
  const zoomAt = (scale: number) => {
    if (!controls) return
    const target = controls.target
    const radius = camera.position.distanceTo(target)
    scale = THREE.MathUtils.clamp(scale, C.minDistance / radius, C.maxDistance / radius)
    if (scale === 1 || !findAnchor(target)) return
    camera.position.sub(anchor).multiplyScalar(scale).add(anchor)
    target.sub(anchor).multiplyScalar(scale).add(anchor)
  }

  /** Move camera + target across the screen so what's under the fingers tracks them 1:1. */
  const panBy = (dxPx: number, dyPx: number) => {
    if (!controls || !findAnchor(controls.target)) return
    camera.getWorldDirection(forward)
    const depth = forward.dot(toTarget.subVectors(anchor, camera.position))
    const worldPerPx = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / gl.domElement.clientHeight
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    const move = right.multiplyScalar(dxPx * worldPerPx).addScaledVector(up, -dyPx * worldPerPx)
    camera.position.add(move)
    controls.target.add(move)
  }

  useEffect(() => {
    const el = gl.domElement
    const setCursor = (clientX: number, clientY: number) => {
      const rect = el.getBoundingClientRect()
      cursor.current.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
    }
    const blocked = () => disabledRef.current || !controls?.enabled

    // A wheel gesture that arrives while navigation is blocked (e.g. the scroll
    // that starts the app, then glides) is swallowed to its very end, including
    // trackpad momentum, instead of zooming/panning the moment the glide finishes.
    let swallowing = false
    let lastSwallowed = 0

    const onWheel = (e: WheelEvent) => {
      e.preventDefault() // also stops the browser's own pinch-to-zoom of the page
      if (blocked() || (swallowing && e.timeStamp - lastSwallowed < SWALLOW_GAP_MS)) {
        swallowing = true
        lastSwallowed = e.timeStamp
        return
      }
      swallowing = false
      setCursor(e.clientX, e.clientY)

      // Classify once per gesture so a trackpad swipe can't flip to "mouse" midway
      const last = lastGesture.current
      const trackpad = e.timeStamp - last.time < GESTURE_GAP_MS ? last.trackpad : looksLikeTrackpad(e)
      lastGesture.current = { time: e.timeStamp, trackpad }

      const dy = pixelDeltaY(e)
      if (e.ctrlKey && trackpad) {
        zoomAt(Math.exp(dy * C.pinchZoomSpeed)) // pinch
      } else if (trackpad) {
        panBy(e.deltaX, dy) // two-finger scroll
      } else {
        pendingWheelLog.current += dy * C.wheelZoomSpeed // mouse wheel, eased below
      }
    }

    // Safari reports trackpad pinch as gesture events instead of ctrl+wheel
    let gestureScale = 1
    type GestureEvent = UIEvent & { scale: number; clientX: number; clientY: number }
    const onGestureStart = (e: Event) => {
      e.preventDefault()
      gestureScale = 1
    }
    const onGestureChange = (e: Event) => {
      e.preventDefault()
      const g = e as GestureEvent
      if (blocked()) return
      setCursor(g.clientX, g.clientY)
      zoomAt(gestureScale / g.scale)
      gestureScale = g.scale
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('gesturestart', onGestureStart)
    el.addEventListener('gesturechange', onGestureChange)
    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('gesturestart', onGestureStart)
      el.removeEventListener('gesturechange', onGestureChange)
    }
    // zoomAt/panBy only close over stable refs and memoised objects
  }, [gl, controls, camera])

  // Mouse-wheel ease: apply most of the pending zoom within wheelEaseMs
  // (exponential approach with time constant wheelEaseMs / 3, ≈95% done)
  useFrame((_, dt) => {
    const pending = pendingWheelLog.current
    if (pending === 0) return
    if (disabled) {
      pendingWheelLog.current = 0
      return
    }
    const step = Math.abs(pending) < 1e-4 ? pending : pending * (1 - Math.exp(-dt / (C.wheelEaseMs / 3000)))
    pendingWheelLog.current -= step
    zoomAt(Math.exp(step))
  }, -0.5) // after OrbitControls (-1), before CameraRig's constraints (0)

  return null
}
