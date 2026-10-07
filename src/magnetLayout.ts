import { FRIDGE, FRONT_FLAT, OBSTACLES } from './components/Fridge'
import { MAGNET_CONFIG } from './fridgeStyle'

export type MagnetShape = 'circle' | 'square' | 'star' | 'heart'

export interface MagnetData {
  id: number
  shape: MagnetShape
  color: string
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

/** True if the point is on a door face at all (anywhere on the flat front). */
export function isOnDoor(x: number, y: number) {
  return x >= FRONT_FLAT.minX && x <= FRONT_FLAT.maxX && y >= FRONT_FLAT.minY && y <= FRONT_FLAT.maxY
}

function isFree({ x, y, r }: Circle, others: Circle[]) {
  const g = MAGNET_CONFIG.gap
  if (x - r < FRONT_FLAT.minX || x + r > FRONT_FLAT.maxX) return false
  if (y - r < FRONT_FLAT.minY || y + r > FRONT_FLAT.maxY) return false
  for (const o of others) {
    if (Math.hypot(x - o.x, y - o.y) < r + o.r + g) return false
  }
  for (const o of OBSTACLES) {
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
