import * as THREE from 'three'
import type { FridgeModel, Obstacle, Rect } from './fridgeModels'

/**
 * The fridge's outside, unrolled flat so magnets and notes can go anywhere
 * round it: front, sides and back.
 *
 * Positions are [s, y]. y is height; s is the distance round the fridge (as
 * seen from above) from the middle of the front, going right. On the front
 * s is just x, so front positions mean the same as they always did. s wraps
 * round: s and s ± perimeter are the same spot, and the middle of the back is
 * at ±perimeter/2. Going right in s is going right on every face, seen from
 * outside.
 */

/** Every model's door faces sit here (Fridge's DOOR_Z) */
const FRONT_Z = 0.7
const FLOOR = -2.2
/** Retro height: the back parts are drawn at this size and stretched to fit */
const BACK_PARTS_HEIGHT = 4.4
/** Door slabs stand this far proud of the cabinet (Fridge's CABINET_FRONT) */
const CABINET_FRONT = 0.084
/** Recessed toe-kick under the cabinet */
const KICK = 0.12
/** The flat panel on the back stands this far out */
const BACK_PANEL = 0.01
/** Keep clear of edges by this much */
const MARGIN = 0.02

export interface SurfacePoint {
  x: number
  z: number
  /** Which way it faces, turned about the vertical: 0 front, π/2 right side, ±π back */
  angle: number
}

export interface SurfaceHit {
  s: number
  y: number
}

export class FridgeSurface {
  /** Distance all the way round */
  readonly perimeter: number
  /** Half-width of the flat front (the front's flat part spans s = ±frontHalf) */
  readonly frontHalf: number
  /** Flat panels on the sides and back that magnets can sit on, in [s, y] */
  readonly panels: Rect[]
  /** Things on the back to keep clear of: the condenser coils and the label plate */
  readonly obstacles: Obstacle[]
  /** Height range of the flat sides and back */
  readonly sideBand: [number, number]
  /** Height range anything can be let go in */
  readonly band: [number, number]

  // Plan (seen from above): a rounded rectangle. a and b are the half-lengths
  // of its straight front and side, R the corner radius, zc its middle.
  private readonly a: number
  private readonly b: number
  private readonly R: number
  private readonly zc: number
  // s at the end of each stretch, going right from the front middle
  private readonly u: [number, number, number, number]

  constructor(model: FridgeModel, doors: Rect[]) {
    const { w, h, d } = model.size
    const R = Math.min(model.rounding.plan, w / 2, d / 2)
    const a = w / 2 - R
    const b = d / 2 - R
    const quarter = (Math.PI / 2) * R
    this.R = R
    this.a = a
    this.b = b
    this.zc = FRONT_Z - d / 2
    this.u = [a, a + quarter, a + quarter + 2 * b, a + 2 * quarter + 2 * b]
    this.perimeter = 2 * (this.u[3] + a)
    this.frontHalf = a

    // Sides: flat from the front corner (or behind the door slabs) to the back corner
    const doorsProud = model.body === 'doors' ? CABINET_FRONT : 0
    const s0 = this.u[1] + Math.max(MARGIN, doorsProud + MARGIN - R)
    const s1 = this.u[2] - MARGIN
    let y0: number
    let y1: number
    if (model.body === 'rounded') {
      y0 = FLOOR + model.rounding.bottom + MARGIN
      y1 = FLOOR + h - model.rounding.top - MARGIN
    } else {
      const [tl, tr, br, bl] = model.cabinetCorners ?? [0.02, 0.02, 0.02, 0.02]
      y0 = FLOOR + KICK + Math.max(br, bl) + MARGIN
      y1 = FLOOR + h - Math.max(tl, tr) - MARGIN
    }
    this.sideBand = [y0, y1]

    // Back: the panel the coils hang on, drawn at retro size and stretched to fit
    const sx = w / 2
    const backY = (y: number) => FLOOR + ((y - FLOOR) * h) / BACK_PARTS_HEIGHT
    const backHalf = Math.min(0.72 * sx, a) - MARGIN
    const half = this.perimeter / 2
    const backRect = (hw: number, ya: number, yb: number): Obstacle => ({
      kind: 'rect',
      x: half,
      y: (backY(ya) + backY(yb)) / 2,
      hw: hw * sx,
      hh: (backY(yb) - backY(ya)) / 2,
    })

    this.panels = [
      { x0: s0, x1: s1, y0, y1 },
      { x0: -s1, x1: -s0, y0, y1 },
      { x0: half - backHalf, x1: half + backHalf, y0: backY(-1.95) + MARGIN, y1: Math.min(backY(1.65) - MARGIN, y1) },
    ]
    this.obstacles = [backRect(0.62, -1.79, 0.63), backRect(0.33, 1.08, 1.52)]
    this.band = [Math.min(y0, ...doors.map((r) => r.y0)), Math.max(y1, ...doors.map((r) => r.y1))]
  }

  /** The same spot with s in [-perimeter/2, perimeter/2) */
  wrap(s: number) {
    const p = this.perimeter
    return ((((s + p / 2) % p) + p) % p) - p / 2
  }

  /** True if [s, y] is on the fridge (or close enough to let go there) */
  onSurface(_s: number, y: number) {
    return y > this.band[0] - 0.05 && y < this.band[1] + 0.05
  }

  /** Where [s, *] is, `off` out from the surface, and which way it faces there */
  point(s: number, off = 0, out: SurfacePoint = { x: 0, z: 0, angle: 0 }): SurfacePoint {
    const { a, b, R, zc, u } = this
    s = this.wrap(s)
    const t = Math.abs(s)
    let x: number
    let z: number
    let angle: number
    if (t <= u[0]) {
      x = t
      z = zc + b + R
      angle = 0
    } else if (t <= u[1]) {
      angle = (t - u[0]) / R
      x = a + R * Math.sin(angle)
      z = zc + b + R * Math.cos(angle)
    } else if (t <= u[2]) {
      angle = Math.PI / 2
      x = a + R
      z = zc + b - (t - u[1])
    } else if (t <= u[3]) {
      angle = Math.PI / 2 + (t - u[2]) / R
      x = a + R * Math.sin(angle)
      z = zc - b + R * Math.cos(angle)
    } else {
      angle = Math.PI
      x = a - (t - u[3])
      z = zc - b - R
    }
    // the back panel stands a little proud: ease out onto it round the back corners
    const o = off + BACK_PANEL * THREE.MathUtils.clamp((angle - Math.PI / 2) / (Math.PI / 2), 0, 1)
    out.x = (x + Math.sin(angle) * o) * (s < 0 ? -1 : 1)
    out.z = z + Math.cos(angle) * o
    out.angle = s < 0 ? -angle : angle
    return out
  }

  /** s of the spot on the surface nearest (x, z), seen from above */
  toS(x: number, z: number) {
    const { a, b, R, zc, u } = this
    const ax = Math.abs(x)
    const px = Math.min(ax, a)
    const pz = THREE.MathUtils.clamp(z - zc, -b, b)
    const dx = ax - px
    const dz = z - zc - pz
    let t: number
    if (dx <= 0) t = z >= zc ? px : u[3] + (a - px)
    else if (dz === 0) t = u[1] + (b - pz)
    else {
      const angle = Math.atan2(dx, dz)
      t = angle <= Math.PI / 2 ? a + R * angle : u[2] + R * (angle - Math.PI / 2)
    }
    return x < 0 ? -t : t
  }

  /**
   * Where a ray (e.g. the pointer's) meets the surface pushed `off` outward,
   * or null if it misses or only grazes it edge-on. Taller than the fridge,
   * so hits above or below it still count (and are off the surface).
   */
  hit(ray: THREE.Ray, off: number, minFacing = 0.15): SurfaceHit | null {
    const { a, b, zc } = this
    const { origin: o, direction: d } = ray
    const Ro = this.R + off
    let best = Infinity
    let hx = 0
    let hz = 0
    let facing = 0
    const consider = (t: number, nx: number, nz: number) => {
      const dot = d.x * nx + d.z * nz
      if (t > 1e-6 && t < best && dot < 0) {
        best = t
        hx = o.x + d.x * t
        hz = o.z + d.z * t
        facing = -dot
      }
    }
    // straight front, back and sides
    if (d.z !== 0)
      for (const nz of [1, -1]) {
        const t = (zc + nz * (b + Ro) - o.z) / d.z
        if (Math.abs(o.x + d.x * t) <= a) consider(t, 0, nz)
      }
    if (d.x !== 0)
      for (const nx of [1, -1]) {
        const t = (nx * (a + Ro) - o.x) / d.x
        if (Math.abs(o.z + d.z * t - zc) <= b) consider(t, nx, 0)
      }
    // rounded corners
    const A = d.x * d.x + d.z * d.z
    if (A > 1e-12)
      for (const sx of [1, -1])
        for (const sz of [1, -1]) {
          const ox = o.x - sx * a
          const oz = o.z - zc - sz * b
          const B = ox * d.x + oz * d.z
          const disc = B * B - A * (ox * ox + oz * oz - Ro * Ro)
          if (disc < 0) continue
          for (const t of [(-B - Math.sqrt(disc)) / A, (-B + Math.sqrt(disc)) / A]) {
            const cx = ox + d.x * t
            const cz = oz + d.z * t
            if (cx * sx >= 0 && cz * sz >= 0) consider(t, cx / Ro, cz / Ro)
          }
        }
    if (best === Infinity || facing < minFacing) return null
    return { s: this.toS(hx, hz), y: o.y + d.y * best }
  }

  /** Move [s, y] from another fridge onto this one, keeping it on the same face */
  from(other: FridgeSurface, s: number) {
    const p = other.point(s)
    return this.toS(p.x, p.z)
  }
}
