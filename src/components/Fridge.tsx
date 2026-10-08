import { RoundedBox } from '@react-three/drei'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { FRIDGE_STYLE as S } from '../fridgeStyle'
import {
  bodyMaterial,
  finishFor,
  fridgeModel,
  HANDLE_RADIUS,
  type FridgeLook,
  type FridgeModel,
  type Corners,
  type FridgeRounding,
  type HandleSpec,
} from '../fridgeModels'

export const FRIDGE = { width: 2, height: 4.4, depth: 1.4 }
export const DOOR_Z = FRIDGE.depth / 2
const BACK_Z = -DOOR_Z
const HX = FRIDGE.width / 2
const HY = FRIDGE.height / 2

// The roundest body's rounding (the retro model). Door space for magnets and
// notes is worked out from it, so it fits every model.
const R_PLAN = 0.3
const R_TOP = 0.5
const R_BOTTOM = 0.2
const DOME = 0.12

/** Height of the seam between freezer (above) and main door (below) */
export const SEAM_Y = 0.95

/** Flat part of the front (the door faces). Magnets must sit fully inside it. */
export const FRONT_FLAT = {
  minX: -HX + R_PLAN,
  maxX: HX - R_PLAN,
  minY: -HY + R_BOTTOM,
  maxY: HY - R_TOP,
}

/**
 * Box enclosing everything solid, including handles in front and coils
 * behind. It follows the fridge on screen (see setFridgeBounds), so the
 * camera limits fit a big French door and a mini fridge alike.
 */
export const FRIDGE_BOUNDS = {
  min: new THREE.Vector3(-HX, -HY, BACK_Z - 0.12),
  max: new THREE.Vector3(HX, HY + DOME, DOOR_Z + 0.13),
}
export const FLOOR_Y = -HY

/**
 * Where the front view frames the fridge: its middle height, and how much
 * further back than for the retro (bigger fridges only; a small one is left
 * looking small).
 */
export const FRIDGE_HOME = { y: 0, distance: 1 }

/** Resize FRIDGE_BOUNDS to a model; every model stands on the floor with its doors at DOOR_Z */
export function setFridgeBounds(model: FridgeModel) {
  const { w, h, d } = model.size
  FRIDGE_HOME.y = (h - FRIDGE.height) / 2
  FRIDGE_HOME.distance = Math.max(1, h / FRIDGE.height)
  FRIDGE_BOUNDS.min.set(-w / 2, FLOOR_Y, DOOR_Z - d - 0.12)
  FRIDGE_BOUNDS.max.set(w / 2, FLOOR_Y + h + model.rounding.dome, DOOR_Z + 0.13)
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

/** Push a point on the plain box out onto the rounded, domed retro shell (in place). */
function onBody(v: THREE.Vector3, r: FridgeRounding, inner = new THREE.Vector3(), d = new THREE.Vector3()) {
  const { plan: R_PLAN, top: R_TOP, bottom: R_BOTTOM, dome: DOME } = r
  const hz = FRIDGE.depth / 2
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
  return v
}

/**
 * Retro fridge shell: a subdivided box whose vertices are pushed onto an
 * elliptically-rounded box (big soft shoulders on top, tighter at the base),
 * then the top is bulged upward into a gentle dome.
 */
function makeBodyGeometry(r: FridgeRounding) {
  const { width, height, depth } = FRIDGE
  const box = new THREE.BoxGeometry(width, height, depth, 48, 96, 36)
  box.deleteAttribute('normal')
  box.deleteAttribute('uv')
  const pos = box.attributes.position
  const v = new THREE.Vector3()
  const inner = new THREE.Vector3()
  const d = new THREE.Vector3()

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i)
    onBody(v, r, inner, d)
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
function makeSeamGeometry(R_PLAN: number) {
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

/**
 * The doors' back edge: a seam running up one side, over the top and down the
 * other, where the front seam's ends meet it.
 */
function makeDoorEdgeGeometry(r: FridgeRounding) {
  const z = DOOR_Z - r.plan
  const pts: THREE.Vector3[] = []
  const N = 120
  // walk the outline of the plain box at this depth, then push it onto the shell
  for (let i = 0; i <= N; i++) pts.push(new THREE.Vector3(HX, -HY + (2 * HY * i) / N, z))
  for (let i = 1; i < N; i++) pts.push(new THREE.Vector3(HX - (2 * HX * i) / N, HY, z))
  for (let i = 0; i <= N; i++) pts.push(new THREE.Vector3(-HX, HY - (2 * HY * i) / N, z))
  const path = new THREE.CatmullRomCurve3(pts.map((p) => onBody(p, r)))
  return new THREE.TubeGeometry(path, 600, 0.006, 8, false)
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

/** Bar handle on two standoff posts, horizontal or vertical. */
function Handle({ spec, material }: { spec: HandleSpec; material: THREE.Material }) {
  const { length } = spec
  const standoff = 0.09
  if (material.name === 'grip') {
    // flat dark grip strip tucked in the gap between doors
    return (
      <mesh position={[spec.x, spec.y, DOOR_Z - 0.015]} rotation={[0, 0, spec.dir === 'v' ? Math.PI / 2 : 0]} material={material}>
        <boxGeometry args={[length, 0.05, 0.05]} />
      </mesh>
    )
  }
  return (
    <group position={[spec.x, spec.y, DOOR_Z]} rotation={[0, 0, spec.dir === 'v' ? Math.PI / 2 : 0]}>
      <mesh position={[0, 0, standoff]} rotation={[0, 0, Math.PI / 2]} material={material} castShadow>
        <capsuleGeometry args={[HANDLE_RADIUS, length, 8, 24]} />
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

const DOOR_DEPTH = 0.08
const CABINET_FRONT = DOOR_DEPTH + 0.004 // how far the cabinet front sits behind the door faces

/** Front-view rounded rectangle, centred on 0, with its own radius per corner */
function roundedRect(w: number, h: number, [tl, tr, br, bl]: Corners) {
  const x0 = -w / 2
  const x1 = w / 2
  const y0 = -h / 2
  const y1 = h / 2
  const r = (c: number) => Math.max(c, 0.0005)
  const s = new THREE.Shape()
  s.moveTo(x0 + r(bl), y0)
  s.lineTo(x1 - r(br), y0)
  s.absarc(x1 - r(br), y0 + r(br), r(br), -Math.PI / 2, 0, false)
  s.lineTo(x1, y1 - r(tr))
  s.absarc(x1 - r(tr), y1 - r(tr), r(tr), 0, Math.PI / 2, false)
  s.lineTo(x0 + r(tl), y1)
  s.absarc(x0 + r(tl), y1 - r(tl), r(tl), Math.PI / 2, Math.PI, false)
  s.lineTo(x0, y0 + r(bl))
  s.absarc(x0 + r(bl), y0 + r(bl), r(bl), Math.PI, (Math.PI * 3) / 2, false)
  return s
}

/** A slab with rounded front corners and softly bevelled edges, centred on 0 */
function makeSlab(w: number, h: number, depth: number, corners: Corners, bevel: number) {
  const inset = corners.map((c) => Math.max(c - bevel, 0)) as Corners
  const g = new THREE.ExtrudeGeometry(roundedRect(w - bevel * 2, h - bevel * 2, inset), {
    depth: depth - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 4,
    curveSegments: 20,
  })
  g.translate(0, 0, -(depth - bevel * 2) / 2)
  return g
}

const SQUARE: Corners = [0.02, 0.02, 0.02, 0.02]

/**
 * Modern fridge: a cabinet with separate door slabs standing proud of it, so
 * the gaps between doors read as real dark shadow lines. Corner rounding
 * comes from the model, from crisp to bubbly.
 */
function DoorBody({
  model,
  doorMaterial,
  events,
}: {
  model: FridgeModel
  doorMaterial: THREE.Material
  events: Record<string, (e: ThreeEvent<MouseEvent> & ThreeEvent<PointerEvent>) => void>
}) {
  const { w: width, h: height, d: depth } = model.size
  const backZ = DOOR_Z - depth
  const floor = FLOOR_Y
  const kick = 0.12 // recessed toe-kick at the floor
  const cabH = height - kick
  const cabD = depth - CABINET_FRONT
  const cabCorners = model.cabinetCorners ?? SQUARE
  const cabinet = useMemo(() => makeSlab(width, cabH, cabD, cabCorners, 0.02), [width, cabH, cabD, cabCorners])
  const backer = useMemo(
    () => new THREE.ShapeGeometry(roundedRect(width - 0.03, cabH - 0.03, cabCorners.map((c) => Math.max(c - 0.015, 0)) as Corners), 20),
    [width, cabH, cabCorners],
  )
  const doors = useMemo(
    () => model.doors.map((d) => makeSlab(d.x1 - d.x0, d.y1 - d.y0, DOOR_DEPTH, d.corners ?? SQUARE, 0.012)),
    [model.doors],
  )
  const kickWidth = width - 0.08 - Math.max(cabCorners[2], cabCorners[3]) * 1.4

  return (
    <group>
      {/* Cabinet */}
      <mesh
        geometry={cabinet}
        position={[0, floor + kick + cabH / 2, backZ + cabD / 2]}
        material={doorMaterial}
        castShadow
        receiveShadow
        {...events}
      />
      {/* Dark face behind the doors: what you see down the gaps */}
      <mesh geometry={backer} position={[0, floor + kick + cabH / 2, backZ + cabD + 0.001]}>
        <meshStandardMaterial color="#0e0e10" roughness={0.9} />
      </mesh>
      {/* Toe-kick */}
      <mesh position={[0, floor + kick / 2, backZ + cabD / 2 - 0.06]}>
        <boxGeometry args={[kickWidth, kick, cabD - 0.12]} />
        <meshStandardMaterial color="#141416" roughness={0.8} />
      </mesh>
      {/* Doors */}
      {model.doors.map((d, i) => (
        <mesh
          key={i}
          geometry={doors[i]}
          position={[(d.x0 + d.x1) / 2, (d.y0 + d.y1) / 2, DOOR_Z - DOOR_DEPTH / 2]}
          material={doorMaterial}
          castShadow
          receiveShadow
          {...events}
        />
      ))}
    </group>
  )
}

/** The retro's back, stretched to fit the fridge's size and pushed out to its back */
function Back({ size }: { size: FridgeModel['size'] }) {
  return (
    <group position={[0, FLOOR_Y, DOOR_Z - size.d - BACK_Z]} scale={[size.w / FRIDGE.width, size.h / FRIDGE.height, 1]}>
      <group position={[0, -FLOOR_Y, 0]}>
        <BackParts />
      </group>
    </group>
  )
}

function BackParts() {
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

export default function Fridge({ look, onOpenMenu, preview = false }: {
  look: FridgeLook
  /** Clicked (not dragged) on a bare spot of the body */
  onOpenMenu?: (clientX: number, clientY: number) => void
  /** A still picture for the fridge menu: leaves the real scene's camera limits and shadows alone */
  preview?: boolean
}) {
  const model = fridgeModel(look.model)
  useLayoutEffect(() => {
    if (!preview) setFridgeBounds(model)
  }, [model, preview])
  const bodyGeometry = useMemo(() => makeBodyGeometry(model.rounding), [model])
  const seamGeometry = useMemo(() => makeSeamGeometry(model.rounding.plan), [model])
  const doorEdgeGeometry = useMemo(() => makeDoorEdgeGeometry(model.rounding), [model])
  const chrome = useMemo(() => new THREE.MeshStandardMaterial(S.chrome), [])
  // Shadows are drawn once (StaticShadows), so redraw them whenever the fridge
  // itself is rebuilt, e.g. after an edit reloads it, or old shadows linger
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    if (!preview) gl.shadowMap.needsUpdate = true
  }, [gl, model, chrome, preview])

  // One shared paint material for the body (or doors); it fades to a newly
  // picked colour instead of snapping
  const bodyMat = useMemo(() => new THREE.MeshPhysicalMaterial({ color: look.color }), []) // eslint-disable-line react-hooks/exhaustive-deps
  const finish = finishFor(look.color)
  useEffect(() => {
    bodyMat.setValues(bodyMaterial(finish))
    bodyMat.needsUpdate = true
  }, [bodyMat, finish])
  const target = useMemo(() => new THREE.Color(), [])
  useFrame((_, dt) => {
    if (preview) return
    target.set(look.color)
    bodyMat.color.lerp(target, 1 - Math.exp(-dt * 10))
  })
  // previews only draw on demand, so they take the colour straight away
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    if (!preview) return
    bodyMat.color.set(look.color)
    invalidate()
  }, [preview, look.color, bodyMat, invalidate])
  const brushed = useMemo(() => new THREE.MeshStandardMaterial({ color: '#e9eaec', metalness: 1, roughness: 0.22 }), [])
  const grip = useMemo(() => new THREE.MeshStandardMaterial({ name: 'grip', color: '#141416', roughness: 0.55 }), [])
  const handleMaterial = { chrome, brushed, dark: grip }[model.handleFinish]

  const events = {
    onPointerDown: block,
    onPointerOver: block,
    onClick: (e: ThreeEvent<MouseEvent>) => {
      // a click, not the end of an orbit drag, and not on a magnet or note in front
      if (e.delta > 4 || e.intersections[0]?.object !== e.eventObject) return
      e.stopPropagation()
      onOpenMenu?.(e.nativeEvent.clientX, e.nativeEvent.clientY)
    },
  }

  return (
    <group>
      {model.body === 'rounded' ? (
        <>
          {/* Moulded retro body */}
          <mesh geometry={bodyGeometry} material={bodyMat} castShadow receiveShadow {...events} />
          {/* Freezer / main door seam */}
          <mesh geometry={seamGeometry}>
            <meshStandardMaterial {...S.seam} />
          </mesh>
          <mesh geometry={doorEdgeGeometry}>
            <meshStandardMaterial {...S.seam} />
          </mesh>
        </>
      ) : (
        <DoorBody model={model} doorMaterial={bodyMat} events={events as never} />
      )}

      {model.handles.map((h, i) => (
        <Handle key={`${model.id}-${i}`} spec={h} material={handleMaterial} />
      ))}

      <Back size={model.size} />
    </group>
  )
}
