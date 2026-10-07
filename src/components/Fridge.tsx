import { RoundedBox } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import { useMemo } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FRIDGE_STYLE as S } from '../fridgeStyle'

export const FRIDGE = { width: 2, height: 4.4, depth: 1.4 }
export const DOOR_Z = FRIDGE.depth / 2
const BACK_Z = -DOOR_Z
const HX = FRIDGE.width / 2
const HY = FRIDGE.height / 2

// Body rounding: plan-view corner radius, vertical shoulder radii, and extra
// height the top bulges up by in the middle
const R_PLAN = 0.3
const R_TOP = 0.5
const R_BOTTOM = 0.2
const DOME = 0.12

/** Height of the seam between freezer (above) and main door (below) */
const SEAM_Y = 0.95

/** Flat part of the front face, where magnets can sit (before their own margin) */
export const FRONT_FLAT = {
  minX: -HX + R_PLAN,
  maxX: HX - R_PLAN,
  minY: -HY + R_BOTTOM,
  maxY: HY - R_TOP,
}

const DIAL_Y = FRONT_FLAT.maxY - 0.14

/** Where magnet centres may go: the flat front, inset by a magnet's size, below the dials */
export const MAGNET_AREA = {
  minX: FRONT_FLAT.minX + 0.22,
  maxX: FRONT_FLAT.maxX - 0.22,
  minY: FRONT_FLAT.minY + 0.22,
  maxY: DIAL_Y - 0.3,
}

// Condenser coil layout (local to the coil group), sized to the flat back
const COIL_ROWS = 14
const COIL_SPACING = 0.18
const COIL_WIDTH = 1.0
const COIL_RADIUS = 0.012
const COIL_HEIGHT = (COIL_ROWS - 1) * COIL_SPACING
const COIL_Z = BACK_Z - 0.08
const WIRE_COUNT = 18

// R3F only raycasts objects with handlers, so the body needs one to stop
// clicks/hovers passing through it to magnets on the far side.
const block = (e: ThreeEvent<PointerEvent>) => e.stopPropagation()

const clamp = THREE.MathUtils.clamp

/**
 * Retro fridge shell: a subdivided box whose vertices are pushed onto an
 * elliptically-rounded box (big soft shoulders on top, tighter at the base),
 * then the top is bulged upward into a gentle dome.
 */
function makeBodyGeometry() {
  const { width, height, depth } = FRIDGE
  const hz = depth / 2
  const box = new THREE.BoxGeometry(width, height, depth, 48, 96, 36)
  box.deleteAttribute('normal')
  box.deleteAttribute('uv')
  const pos = box.attributes.position
  const v = new THREE.Vector3()
  const inner = new THREE.Vector3()
  const d = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    inner.set(
      clamp(v.x, -HX + R_PLAN, HX - R_PLAN),
      clamp(v.y, -HY + R_BOTTOM, HY - R_TOP),
      clamp(v.z, -hz + R_PLAN, hz - R_PLAN),
    )
    const ry = v.y > inner.y ? R_TOP : R_BOTTOM
    d.subVectors(v, inner).divide(new THREE.Vector3(R_PLAN, ry, R_PLAN)).normalize()
    v.set(inner.x + d.x * R_PLAN, inner.y + d.y * ry, inner.z + d.z * R_PLAN)
    if (d.y > 0) {
      const fx = Math.max(0, 1 - (v.x / HX) ** 2)
      const fz = Math.max(0, 1 - (v.z / hz) ** 2)
      v.y += DOME * d.y * fx * fz
    }
    pos.setXYZ(i, v.x, v.y, v.z)
  }

  // Weld the box's per-face duplicate vertices so normals are smooth everywhere
  const body = mergeVertices(box)
  body.computeVertexNormals()
  return body
}

/** Quarter-circle as a cubic Bézier, from `a` to `b` around `corner`. */
function quarterArc(a: THREE.Vector3, corner: THREE.Vector3, b: THREE.Vector3) {
  const k = 0.5523
  return new THREE.CubicBezierCurve3(
    a,
    a.clone().lerp(corner, k),
    b.clone().lerp(corner, k),
    b,
  )
}

/** Dark seam tube following the front and front corners at SEAM_Y. */
function makeSeamGeometry() {
  const y = SEAM_Y
  const z = DOOR_Z
  const x = HX - R_PLAN
  const side = z - R_PLAN
  const path = new THREE.CurvePath<THREE.Vector3>()
  path.add(quarterArc(new THREE.Vector3(HX, y, side), new THREE.Vector3(HX, y, z), new THREE.Vector3(x, y, z)))
  path.add(new THREE.LineCurve3(new THREE.Vector3(x, y, z), new THREE.Vector3(-x, y, z)))
  path.add(quarterArc(new THREE.Vector3(-x, y, z), new THREE.Vector3(-HX, y, z), new THREE.Vector3(-HX, y, side)))
  return new THREE.TubeGeometry(path, 160, 0.006, 8, false)
}

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

/** Short horizontal chrome bar on two standoff posts. */
function Handle({ position, material }: { position: [number, number, number]; material: THREE.Material }) {
  const length = 0.42
  const standoff = 0.09
  return (
    <group position={position}>
      <mesh position={[0, 0, standoff]} rotation={[0, 0, Math.PI / 2]} material={material} castShadow>
        <capsuleGeometry args={[0.032, length, 8, 24]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh
          key={s}
          position={[s * (length / 2 - 0.05), 0, standoff / 2]}
          rotation={[Math.PI / 2, 0, 0]}
          material={material}
          castShadow
        >
          <cylinderGeometry args={[0.022, 0.03, standoff, 16]} />
        </mesh>
      ))}
    </group>
  )
}

function Back() {
  const coilGeometry = useMemo(makeCoilGeometry, [])
  const labelTexture = useMemo(makeLabelTexture, [])
  const wireGeometry = useMemo(
    () => new THREE.CylinderGeometry(0.005, 0.005, COIL_HEIGHT + 0.04, 6),
    [],
  )
  const coilMaterial = useMemo(() => new THREE.MeshStandardMaterial(S.coils), [])
  const panelBottom = FRONT_FLAT.minY + 0.05
  const panelTop = FRONT_FLAT.maxY - 0.05

  return (
    <group>
      {/* Flat back panel, sized to the flat area inside the rounded edges */}
      <mesh position={[0, (panelTop + panelBottom) / 2, BACK_Z - 0.005]} receiveShadow>
        <boxGeometry args={[(HX - R_PLAN) * 2 + 0.04, panelTop - panelBottom, 0.01]} />
        <meshStandardMaterial {...S.backPanel} />
      </mesh>

      {/* Condenser coils: serpentine tube with vertical wire fins on the outside */}
      <group position={[0, -1.75, COIL_Z]}>
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
        {[-0.38, 0.38].flatMap((x) =>
          [0, COIL_HEIGHT].map((y) => (
            <mesh key={`${x},${y}`} position={[x, y, 0.035]} material={coilMaterial}>
              <boxGeometry args={[0.05, 0.04, 0.07]} />
            </mesh>
          )),
        )}
      </group>

      {/* Label plate, facing outward (-Z) */}
      <group position={[0, 1.3, BACK_Z - 0.013]} rotation={[0, Math.PI, 0]}>
        <RoundedBox args={[0.64, 0.42, 0.006]} radius={0.002} smoothness={2}>
          <meshStandardMaterial {...S.labelPlate} />
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
  const bodyGeometry = useMemo(makeBodyGeometry, [])
  const seamGeometry = useMemo(makeSeamGeometry, [])
  const chrome = useMemo(() => new THREE.MeshStandardMaterial(S.chrome), [])
  const handleX = FRONT_FLAT.minX + 0.3

  return (
    <group>
      {/* Body */}
      <mesh geometry={bodyGeometry} castShadow receiveShadow onPointerDown={block} onPointerOver={block}>
        <meshPhysicalMaterial {...S.body} />
      </mesh>

      {/* Freezer / main door seam */}
      <mesh geometry={seamGeometry}>
        <meshStandardMaterial {...S.seam} />
      </mesh>

      {/* Handles: left side of each door, close to the seam */}
      <Handle position={[handleX, SEAM_Y + 0.25, DOOR_Z]} material={chrome} />
      <Handle position={[handleX, SEAM_Y - 0.3, DOOR_Z]} material={chrome} />

      {/* Five dial bumps along the top front */}
      {[-2, -1, 0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[i * 0.26, DIAL_Y, DOOR_Z]}
          scale={[1, 1, 0.55]}
          material={chrome}
          castShadow
        >
          <sphereGeometry args={[0.06, 32, 16]} />
        </mesh>
      ))}

      <Back />
    </group>
  )
}
