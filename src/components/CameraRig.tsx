import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

export const HOME_POSITION = new THREE.Vector3(0, 0.4, 7.5)
const HOME_TARGET = new THREE.Vector3(0, 0, 0)
const HOME = new THREE.Spherical().setFromVector3(HOME_POSITION.clone().sub(HOME_TARGET))
const DURATION = 1.4

type Controls = { target: THREE.Vector3; enableDamping: boolean; update: () => void }

/**
 * Discards OrbitControls' leftover damping momentum without moving the camera.
 * With damping off, update() applies the pending delta and zeroes it; we then
 * restore the pose and update again so nothing visibly jumps.
 */
function clearMomentum(controls: Controls, camera: THREE.Camera) {
  const pos = camera.position.clone()
  const damping = controls.enableDamping
  controls.enableDamping = false
  controls.update()
  camera.position.copy(pos)
  controls.update()
  controls.enableDamping = damping
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)

// Shortest signed rotation from one angle to another, in [-π, π]
function angleDelta(from: number, to: number) {
  const d = (to - from) % (Math.PI * 2)
  return d > Math.PI ? d - Math.PI * 2 : d < -Math.PI ? d + Math.PI * 2 : d
}

interface Glide {
  t: number
  from: THREE.Spherical
  fromTarget: THREE.Vector3
  dTheta: number
}

/**
 * Glides the camera back to the front view whenever `resetSignal` changes.
 * Interpolates in spherical coordinates so the camera swings around the
 * fridge instead of cutting through it.
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

  useEffect(() => {
    if (resetSignal === 0 || !controls) return
    // Otherwise leftover spin is applied after the glide and drifts the view
    clearMomentum(controls, camera)
    const fromTarget = controls.target.clone()
    const from = new THREE.Spherical().setFromVector3(camera.position.clone().sub(fromTarget))
    glide.current = { t: 0, from, fromTarget, dTheta: angleDelta(from.theta, HOME.theta) }
    onGlideChange(true)
  }, [resetSignal, camera, controls, onGlideChange])

  // Runs after OrbitControls' own update (priority -1), so our pose wins each frame
  useFrame((_, dt) => {
    const g = glide.current
    if (!g || !controls) return
    g.t = Math.min(g.t + dt / DURATION, 1)
    const k = easeInOutCubic(g.t)
    spherical.set(
      THREE.MathUtils.lerp(g.from.radius, HOME.radius, k),
      THREE.MathUtils.lerp(g.from.phi, HOME.phi, k),
      g.from.theta + g.dTheta * k,
    )
    target.lerpVectors(g.fromTarget, HOME_TARGET, k)
    camera.position.setFromSpherical(spherical).add(target)
    camera.lookAt(target)
    controls.target.copy(target)
    if (g.t === 1) {
      glide.current = null
      controls.update()
      onGlideChange(false)
    }
  })

  return null
}
