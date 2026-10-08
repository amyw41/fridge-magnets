import { FRIDGE } from './components/Fridge'
import { circleInDoor, distToRect, doorFront } from './fridgeModels'
import { MAGNET_CONFIG } from './fridgeStyle'

export type MagnetShape = 'circle' | 'square' | 'star' | 'heart'
export type MagnetFinish = 'chrome' | 'plastic'

export interface MagnetData {
  id: number
  shape: MagnetShape
  color: string
  /** Polished chrome (the puffy silver stars) or satin plastic */
  finish: MagnetFinish
  /** Rest position on the door plane */
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

/** True if the point is on (or within a hair of) one of the doors. Gaps between doors count, so a drop there still lands. */
export function isOnDoor(x: number, y: number) {
  return doorFront().doors.some((d) => distToRect(d, x, y) < 0.05)
}

function isFree({ x, y, r }: Circle, others: Circle[]) {
  const g = MAGNET_CONFIG.gap
  // fully on one door: never across the gap between two
  const inside = doorFront().doors.some((d) => circleInDoor(d, x, y, r))
  if (!inside) return false
  for (const o of others) {
    if (Math.hypot(x - o.x, y - o.y) < r + o.r + g) return false
  }
  for (const o of doorFront().obstacles) {
    if (o.kind === 'circle') {
      if (Math.hypot(x - o.x, y - o.y) < r + o.r + g) return false
    } else {
      const dx = Math.max(Math.abs(x - o.x) - o.hw, 0)
      const dy = Math.max(Math.abs(y - o.y) - o.hh, 0)
      if (Math.hypot(dx, dy) < r + g) return false
    }
  }
  return true
}

/**
 * Where a magnet dropped at `drop` should come to rest, or null if the drop
 * was off the door (it should slide back where it came from).
 * Searches outward in rings for the nearest spot clear of the door edges,
 * other magnets, handles, dials and the door seam.
 */
export function resolveDrop(
  drop: { x: number; y: number },
  shape: MagnetShape,
  others: MagnetData[],
): [number, number] | null {
  if (!isOnDoor(drop.x, drop.y)) return null
  const r = collisionRadius(shape)
  const circles = others.map((m) => ({ x: m.position[0], y: m.position[1], r: collisionRadius(m.shape) }))
  if (isFree({ ...drop, r }, circles)) return [drop.x, drop.y]

  const step = r * 0.25
  const maxSearch = FRIDGE.width
  for (let d = step; d <= maxSearch; d += step) {
    const n = Math.max(12, Math.ceil((2 * Math.PI * d) / step))
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2
      const c = { x: drop.x + Math.cos(a) * d, y: drop.y + Math.sin(a) * d, r }
      if (isFree(c, circles)) return [c.x, c.y]
    }
  }
  return null
}
