import * as THREE from 'three'

/**
 * Pulling something off the fridge. While the pointer is off the fridge the
 * thing clings to its last spot, leaning and peeling toward the pointer the
 * harder it's pulled; past BREAK it tears free with a flutter and follows the
 * pointer through the air, facing the camera. Back over the fridge, it sticks
 * on again wherever the pointer meets it. Let go while torn free, it falls to
 * the floor (see Fall).
 */

/** How far (world units) the pointer can stray from the fridge before it tears free */
export const BREAK = 0.3

const Z = new THREE.Vector3(0, 0, 1)
const X = new THREE.Vector3(1, 0, 0)
const tmp = new THREE.Vector3()
const qa = new THREE.Quaternion()
const qb = new THREE.Quaternion()

export class Rip {
  /** Where it's stuck, and which way it faces there (the caller sets these every frame) */
  readonly anchor = new THREE.Vector3()
  readonly normal = new THREE.Vector3(0, 0, 1)
  /** Where the pointer holds it once it's off the fridge */
  readonly target = new THREE.Vector3()
  /** Which way along the fridge it's being pulled */
  readonly dir = new THREE.Vector3()
  /** 0..1: how hard it's pulled while still stuck */
  pull = 0
  /** 0 on the fridge … 1 torn free and held in the air (eased) */
  blend = 0
  /** Flutter angle just after tearing free */
  wobble = 0
  /** Torn free and following the pointer */
  broken = false

  private pullGoal = 0
  private wobbleV = 0
  private readonly plane = new THREE.Plane()
  /** Picked up off the floor: carried at the height it was picked up from */
  private carriedFrom: THREE.Vector3 | null = null

  /** The pointer is over the fridge: it sticks there */
  onFridge() {
    this.broken = false
    this.pullGoal = 0
    this.carriedFrom = null
  }

  /**
   * The pointer is off the fridge, `gap` from its nearest edge: stretch toward
   * it, then once it's clearly away, tear free and follow it
   */
  offFridge(ray: THREE.Ray, camera: THREE.Camera, gap: number) {
    camera.getWorldDirection(tmp).negate()
    this.plane.setFromNormalAndCoplanarPoint(tmp, this.carriedFrom ?? this.anchor)
    if (!ray.intersectPlane(this.plane, this.target)) return
    this.dir.subVectors(this.target, this.anchor).projectOnPlane(this.normal)
    if (this.dir.lengthSq() > 1e-8) this.dir.normalize()
    if (!this.broken && gap > BREAK) {
      this.broken = true
      this.wobbleV = 10
    }
    this.pullGoal = this.broken ? 0 : gap / BREAK
  }

  /** Picked up off the floor at `from`: already free, held in the air */
  pickUp(from: THREE.Vector3) {
    this.carriedFrom = from.clone()
    this.target.copy(from)
    this.broken = true
    this.blend = 1
    this.pull = this.pullGoal = 0
  }

  /** Let go. Returns true if it was torn free (it falls to the floor) */
  release() {
    this.carriedFrom = null
    const free = this.broken
    this.broken = false
    this.pullGoal = 0
    return free
  }

  update(dt: number) {
    dt = Math.min(dt, 1 / 30) // keeps the flutter spring steady through slow frames
    this.blend += ((this.broken ? 1 : 0) - this.blend) * (1 - Math.exp(-dt * 14))
    this.pull += (this.pullGoal - this.pull) * (1 - Math.exp(-dt * 22))
    this.wobbleV += (-this.wobble * 170 - this.wobbleV * 8) * dt
    this.wobble += this.wobbleV * dt
  }

  /** True while it needs drawing differently from plain stuck */
  get active() {
    return this.blend > 1e-3 || this.pull > 1e-3 || Math.abs(this.wobble) > 1e-3
  }

  /**
   * Pose of something rigid (a magnet). `stuck` is its orientation on the
   * fridge, `spin` its turn about its own face.
   */
  pose(position: THREE.Vector3, quaternion: THREE.Quaternion, stuck: THREE.Quaternion, camera: THREE.Camera, spin: number) {
    // stuck: leans toward the pointer, the near edge lifting off first
    position
      .copy(this.anchor)
      .addScaledVector(this.dir, this.pull * 0.04)
      .addScaledVector(this.normal, this.pull * 0.03)
    tmp.crossVectors(this.normal, this.dir)
    quaternion.copy(stuck)
    if (tmp.lengthSq() > 1e-8) quaternion.premultiply(qa.setFromAxisAngle(tmp.normalize(), -this.pull * 0.6))
    // free: facing the camera at the pointer, fluttering as it comes away
    qb.copy(camera.quaternion).multiply(qa.setFromAxisAngle(X, this.wobble * 0.35)).multiply(qa.setFromAxisAngle(Z, spin))
    position.lerp(this.target, this.blend)
    quaternion.slerp(qb, this.blend)
  }
}

const right = new THREE.Vector3()
const up = new THREE.Vector3()
const back = new THREE.Vector3()

/**
 * The same for a sheet of paper, point by point: `stuck` is a point of the
 * laid-down sheet and (lx, ly) where that point sits on the flat sheet. Stuck,
 * the side nearest the pointer peels up; free, the sheet hangs flat toward the
 * camera at the pointer and flutters.
 */
export class PaperRip extends Rip {
  private reach = 1

  /** Call once per frame before `point`, with the sheet's half-diagonal and the camera */
  begin(camera: THREE.Camera, halfDiagonal: number) {
    right.setFromMatrixColumn(camera.matrixWorld, 0)
    up.setFromMatrixColumn(camera.matrixWorld, 1)
    back.setFromMatrixColumn(camera.matrixWorld, 2)
    this.reach = halfDiagonal
  }

  /**
   * Moves the laid-down point `p` (with normal `n`) to where it is now.
   * `along` is how far the point sits toward the pull, from -1 to 1.
   */
  point(p: THREE.Vector3, n: THREE.Vector3, lx: number, ly: number, along: number) {
    // peel: the edge toward the pointer curls up off the fridge
    const u = (along + 1) / 2
    p.addScaledVector(n, this.pull * 0.22 * u ** 2.5)
    if (this.blend <= 0) return
    const c = Math.cos(this.wobble * 0.5)
    const s = Math.sin(this.wobble * 0.5)
    tmp
      .copy(this.target)
      .addScaledVector(right, lx)
      .addScaledVector(up, ly * c)
      .addScaledVector(back, ly * s)
    p.lerp(tmp, this.blend)
    n.lerp(back, this.blend).normalize()
  }

  /** Pull direction along the sheet, split into [s, y] parts given the sheet's facing angle there */
  pullAlong(angle: number) {
    return { ds: this.dir.x * Math.cos(angle) - this.dir.z * Math.sin(angle), dy: this.dir.y, reach: this.reach }
  }
}

const FLOOR_Y = -2.2
const qc = new THREE.Quaternion()
const axis = new THREE.Vector3()

/**
 * Falling off to the floor and lying there. A magnet drops and tumbles flat
 * with a little bounce; paper drifts down, swaying side to side.
 */
export class Fall {
  readonly position = new THREE.Vector3()
  readonly quaternion = new THREE.Quaternion()
  /** How much a sheet of paper is curled by the air as it falls (0 flat) */
  curl = 0
  private readonly from = new THREE.Vector3()
  private readonly fromQ = new THREE.Quaternion()
  private readonly to = new THREE.Vector3()
  private readonly toQ = new THREE.Quaternion()
  private t = 0
  private duration = 0
  private paper = false
  private swayPhase = 0

  /** Lying flat face up, turned `yaw` about the vertical and `spin` about its own face */
  static flat(yaw: number, spin: number, out = new THREE.Quaternion()) {
    return out
      .setFromAxisAngle(axis.set(0, 1, 0), yaw)
      .multiply(qc.setFromAxisAngle(X, -Math.PI / 2))
      .multiply(qc.setFromAxisAngle(Z, spin))
  }

  /** Start falling from where it is now */
  start(position: THREE.Vector3, quaternion: THREE.Quaternion, x: number, z: number, yaw: number, spin: number, rest: number, paper: boolean) {
    this.from.copy(position)
    this.fromQ.copy(quaternion)
    this.to.set(x, FLOOR_Y + rest, z)
    Fall.flat(yaw, spin, this.toQ)
    this.paper = paper
    const h = Math.max(this.from.y - this.to.y, 0.05)
    // paper reaches a slow drifting speed; a magnet just drops
    this.duration = paper ? 0.35 + h / 1.4 : Math.sqrt((2 * h) / 11)
    this.t = 0
    this.swayPhase = Math.random() * Math.PI * 2
    this.update(0)
  }

  /** Already lying there (loaded like this) */
  land(x: number, z: number, yaw: number, spin: number, rest: number) {
    this.to.set(x, FLOOR_Y + rest, z)
    Fall.flat(yaw, spin, this.toQ)
    this.duration = 0
    this.t = 1
    this.position.copy(this.to)
    this.quaternion.copy(this.toQ)
    this.curl = 0
  }

  get falling() {
    return this.t < this.duration + 0.35
  }

  update(dt: number) {
    this.t += Math.min(dt, 1 / 30)
    const u = this.duration ? Math.min(this.t / this.duration, 1) : 1
    const settle = THREE.MathUtils.smoothstep(u, 0, 1)
    this.position.lerpVectors(this.from, this.to, settle)
    this.quaternion.slerpQuaternions(this.fromQ, this.toQ, settle)
    this.curl = 0
    if (this.paper) {
      // easing into a steady drift, rocking and swaying less as it nears the floor
      this.position.y = THREE.MathUtils.lerp(this.from.y, this.to.y, u < 1 ? u * u * (1.6 - 0.6 * u) : 1)
      const fade = 1 - u
      const w = this.swayPhase + this.t * Math.PI * 2 * 0.9
      this.position.x += Math.sin(w) * 0.18 * fade
      this.position.z += Math.cos(w * 0.7) * 0.06 * fade
      this.quaternion.multiply(qc.setFromAxisAngle(axis.set(0, 1, 0.3).normalize(), Math.cos(w) * 0.6 * fade))
      this.curl = Math.sin(w * 2) * 0.12 * fade
    } else {
      // gravity, a tumble on the way down, then a small bounce
      this.position.y = u < 1 ? this.from.y + (this.to.y - this.from.y) * u * u : this.to.y
      this.quaternion.multiply(qc.setFromAxisAngle(X, Math.sin(Math.PI * u) * 1.2))
      const b = (this.t - this.duration) / 0.3
      if (b > 0 && b < 1) this.position.y += Math.sin(Math.PI * b) * 0.05 * (1 - b)
    }
  }
}

/**
 * Where something let go at `from` lands: straight below, kept clear of the
 * fridge and not too far off, lying turned to face the way the camera looks.
 */
export function landing(
  from: THREE.Vector3,
  camera: THREE.Camera,
  surface: { clearOf(x: number, z: number, clear: number): [number, number] },
  clear: number,
): [number, number, number] {
  const r = Math.hypot(from.x, from.z)
  const k = r > 3 ? 3 / r : 1
  const [x, z] = surface.clearOf(from.x * k, from.z * k, clear)
  camera.getWorldDirection(tmp)
  const yaw = Math.atan2(-tmp.x, -tmp.z)
  return [x, z, yaw]
}
