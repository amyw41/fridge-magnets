import { FRIDGE } from './components/Fridge'
import { circleInDoor, doorFront } from './fridgeModels'
import { MAGNET_CONFIG } from './fridgeStyle'

export type MagnetShape = 'circle' | 'square' | 'star' | 'heart'
export type MagnetFinish = 'chrome' | 'satin' | 'plastic'

export interface MagnetData {
  id: number
  shape: MagnetShape
  color: string
  /** Polished chrome (the puffy silver stars) or satin plastic */
  finish: MagnetFinish
  /** Rest position [s, y] on the fridge's unrolled outside (see fridgeSurface) */
  position: [number, number]
}

/** Magnet width in world units */
export const MAGNET_SIZE = MAGNET_CONFIG.sizeFraction * FRIDGE.width

/** Collision radius of each shape as a fraction of the magnet's width */
const SHAPE_RADIUS: Record<MagnetShape, number> = {
  circle: 0.5,
  square: 0.57, // half-diagonal of a 0.8-wide square
  star: 0.5,
  heart: 0.5,
}

export const collisionRadius = (shape: MagnetShape) => SHAPE_RADIUS[shape] * MAGNET_SIZE

interface Circle {
  x: number
  y: number
  r: number
}

/** True if [s, y] is on the fridge, anywhere round it */
export function isOnDoor(s: number, y: number) {
  return doorFront().surface.onSurface(s, y)
}

function isFree({ x, y, r }: Circle, others: Circle[]) {
  const g = MAGNET_CONFIG.gap
  const { panels, obstacles, surface } = doorFront()
  const P = surface.perimeter
  // fully on one flat panel: never across the gap between two doors or round a corner
  if (!panels.some((d) => [x, x - P, x + P].some((s) => circleInDoor(d, s, y, r)))) return false
  for (const o of others) {
    if (Math.hypot(surface.wrap(x - o.x), y - o.y) < r + o.r + g) return false
  }
  for (const o of obstacles) {
    const dx = surface.wrap(x - o.x)
    if (o.kind === 'circle') {
      if (Math.hypot(dx, y - o.y) < r + o.r + g) return false
    } else {
      const ex = Math.max(Math.abs(dx) - o.hw, 0)
      const ey = Math.max(Math.abs(y - o.y) - o.hh, 0)
      if (Math.hypot(ex, ey) < r + g) return false
    }
  }
  return true
}

/**
 * Where a magnet dropped at `drop` ([s, y]) should come to rest, or null if
 * the drop was off the fridge (it should slide back where it came from).
 * Searches outward in rings for the nearest spot clear of the edges, other
 * magnets, handles, the coils on the back and the door seam.
 */
export function resolveDrop(
  drop: { x: number; y: number },
  shape: MagnetShape,
  others: MagnetData[],
): [number, number] | null {
  if (!isOnDoor(drop.x, drop.y)) return null
  const { surface } = doorFront()
  const r = collisionRadius(shape)
  const circles = others.map((m) => ({ x: m.position[0], y: m.position[1], r: collisionRadius(m.shape) }))
  if (isFree({ ...drop, r }, circles)) return [surface.wrap(drop.x), drop.y]

  const step = r * 0.25
  const maxSearch = FRIDGE.width
  for (let d = step; d <= maxSearch; d += step) {
    const n = Math.max(12, Math.ceil((2 * Math.PI * d) / step))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const c = { x: surface.wrap(drop.x + Math.cos(a) * d), y: drop.y + Math.sin(a) * d, r }
      if (isFree(c, circles)) return [c.x, c.y]
    }
  }
  return null
}
