import { RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'

export const FRIDGE = { width: 2, height: 4.4, depth: 1.4 }
export const DOOR_Z = FRIDGE.depth / 2
const BACK_Z = -DOOR_Z

// Condenser coil layout (local to the coil group)
const COIL_ROWS = 14
const COIL_SPACING = 0.18
const COIL_WIDTH = 1.3
const COIL_RADIUS = 0.012
const COIL_HEIGHT = (COIL_ROWS - 1) * COIL_SPACING
const COIL_Z = BACK_Z - 0.08
const WIRE_COUNT = 24

// R3F only raycasts objects with handlers, so the body needs one to stop
// clicks/hovers passing through it to magnets on the far side.
const block = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

/** One continuous serpentine tube: straight runs joined by half-circle bends. */
function makeCoilGeometry() {
  const path = new THREE.CurvePath<THREE.Vector3>()
  const r = COIL_SPACING / 2
  const k = (4 / 3) * r // cubic Bézier handle length for a semicircle
  for (let i = 0; i < COIL_ROWS; i++) {
    const y = i * COIL_SPACING
    const dir = i % 2 === 0 ? 1 : -1
    const xs = (-dir * COIL_WIDTH) / 2
    const xe = -xs
    path.add(new THREE.LineCurve3(new THREE.Vector3(xs, y, 0), new THREE.Vector3(xe, y, 0)))
    if (i < COIL_ROWS - 1) {
      path.add(
        new THREE.CubicBezierCurve3(
          new THREE.Vector3(xe, y, 0),
          new THREE.Vector3(xe + dir * k, y, 0),
          new THREE.Vector3(xe + dir * k, y + 2 * r, 0),
          new THREE.Vector3(xe, y + 2 * r, 0),
        ),
      )
    }
  }
  return new THREE.TubeGeometry(path, COIL_ROWS * 48, COIL_RADIUS, 8, false)
}

function makeLabelTexture() {
  const c = document.createElement('canvas')
  c.width = 512
  c.height = 320
  const ctx = c.getContext('2d')!

  const bg = ctx.createLinearGradient(0, 0, 512, 320)
  bg.addColorStop(0, '#e6e9ec')
  bg.addColorStop(1, '#b4bac0')
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, 512, 320)
  ctx.strokeStyle = '#5b6168'
  ctx.lineWidth = 5
  ctx.strokeRect(16, 16, 480, 288)

  ctx.fillStyle = '#2b2f33'
  ctx.font = 'bold 52px system-ui, sans-serif'
  ctx.fillText('FROSTLINE', 44, 88)
  ctx.fillRect(44, 104, 424, 3)
  ctx.font = '26px ui-monospace, Consolas, monospace'
  const lines = ['MODEL   FM-2026', 'SERIAL  0042-MAG', '120V ~ 60Hz   1.5A', 'REFRIG. R-600a  48g']
  lines.forEach((line, i) => ctx.fillText(line, 44, 150 + i * 38))

  ctx.fillStyle = '#7d848b'
  for (const [x, y] of [[34, 34], [478, 34], [34, 286], [478, 286]]) {
    ctx.beginPath()
    ctx.arc(x, y, 7, 0, Math.PI * 2)
    ctx.fill()
  }

  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}

function Back() {
  const { width, height } = FRIDGE
  const coilGeometry = useMemo(makeCoilGeometry, [])
  const labelTexture = useMemo(makeLabelTexture, [])
  const wireGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.005, 0.005, COIL_HEIGHT + 0.04, 6),
    [],
  )
  const coilMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#141414', metalness: 0.6, roughness: 0.45 }),
    [],
  )

  return (
    <group>
      {/* Flat back panel */}
      <mesh position={[0, 0, BACK_Z - 0.005]} receiveShadow>
        <boxGeometry args={[width - 0.3, height - 0.3, 0.01]} />
        <meshStandardMaterial color="#5c6366" roughness={0.85} />
      </mesh>

      {/* Condenser coils: serpentine tube with vertical wire fins on the outside */}
      <group position={[0, -1.45, COIL_Z]}>
        <mesh geometry={coilGeometry} material={coilMaterial} castShadow />
        {Array.from({ length: WIRE_COUNT }, (_, i) => (
          <mesh
            key={i}
            geometry={wireGeometry}
            material={coilMaterial}
            position={[-COIL_WIDTH / 2 + (i / (WIRE_COUNT - 1)) * COIL_WIDTH, COIL_HEIGHT / 2, -COIL_RADIUS - 0.005]}
          />
        ))}
        {/* Mounting brackets back to the panel */}
        {[-0.5, 0.5].flatMap((x) =>
          [0, COIL_HEIGHT].map((y) => (
            <mesh key={`${x},${y}`} position={[x, y, 0.035]} material={coilMaterial}>
              <boxGeometry args={[0.05, 0.04, 0.07]} />
            </mesh>
          )),
        )}
      </group>

      {/* Label plate, facing outward (-Z) */}
      <group position={[0, 1.5, BACK_Z - 0.013]} rotation={[0, Math.PI, 0]}>
        <RoundedBox args={[0.64, 0.42, 0.006]} radius={0.002} smoothness={2}>
          <meshStandardMaterial color="#9da3a9" metalness={0.7} roughness={0.35} />
        </RoundedBox>
        <mesh position={[0, 0, 0.0035]}>
          <planeGeometry args={[0.6, 0.375]} />
          <meshStandardMaterial map={labelTexture} metalness={0.4} roughness={0.45} />
        </mesh>
      </group>
    </group>
  )
}

export default function Fridge() {
  const { width, height, depth } = FRIDGE
  return (
    <group>
      {/* Body */}
      <RoundedBox
        args={[width, height, depth]}
        radius={0.12}
        smoothness={6}
        castShadow
        receiveShadow
        onPointerDown={block}
        onPointerOver={block}
      >
        <meshStandardMaterial color="#e9f1f2" roughness={0.25} metalness={0.1} />
      </RoundedBox>
      {/* Freezer split line */}
      <mesh position={[0, 1.35, DOOR_Z + 0.001]}>
        <planeGeometry args={[width - 0.1, 0.02]} />
        <meshStandardMaterial color="#b8c4c6" />
      </mesh>
      {/* Handles */}
      <RoundedBox args={[0.07, 0.6, 0.08]} radius={0.03} position={[width / 2 - 0.2, 1.85, DOOR_Z + 0.08]} castShadow>
        <meshStandardMaterial color="#c9d2d4" metalness={0.8} roughness={0.2} />
      </RoundedBox>
      <RoundedBox args={[0.07, 1.2, 0.08]} radius={0.03} position={[width / 2 - 0.2, 0.4, DOOR_Z + 0.08]} castShadow>
        <meshStandardMaterial color="#c9d2d4" metalness={0.8} roughness={0.2} />
      </RoundedBox>
      <Back />
    </group>
  )
}
