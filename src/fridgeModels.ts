/**
 * Built-in fridges you can switch between from the fridge menu (click any
 * empty spot on the fridge). Each model describes its body, its doors (in
 * door-plane x/y, with the floor at y = -2.2) and its
 * handles. The same door rectangles decide where magnets and notes can sit,
 * so they can never straddle a gap between doors.
 */
import { FRIDGE_STYLE as S } from './fridgeStyle'
import { PALETTE } from './palette'

export type FridgeFinish = 'enamel' | 'steel' | 'satin'

export interface FridgeRounding {
  /** Corner radius seen from above */
  plan: number
  /** Radius of the top shoulders */
  top: number
  /** Radius of the bottom edge */
  bottom: number
  /** How far the top bulges up in the middle */
  dome: number
}

/** Corner radii seen from the front: top-left, top-right, bottom-right, bottom-left */
export type Corners = [number, number, number, number]

export interface Rect {
  x0: number
  x1: number
  y0: number
  y1: number
  /** Rounded corners (door slabs only); square if left out */
  corners?: Corners
}

export interface HandleSpec {
  /** Centre of the bar */
  x: number
  y: number
  length: number
  dir: 'h' | 'v'
}

export interface FridgeColor {
  label: string
  color: string
  /** Gets a steel finish instead of enamel */
  metal?: boolean
}

export interface FridgeModel {
  id: string
  label: string
  /** Outside size; the retro is 2 wide, 4.4 tall, 1.4 deep */
  size: { w: number; h: number; d: number }
  /** 'rounded': one moulded retro shell with a painted seam. 'doors': a box cabinet with separate door slabs and real gaps */
  body: 'rounded' | 'doors'
  rounding: FridgeRounding
  /** Door faces (for 'rounded', the flat areas above and below the seam) */
  doors: Rect[]
  handles: HandleSpec[]
  /** Handle look: mirror chrome, brushed metal, or a dark grip */
  handleFinish: 'chrome' | 'brushed' | 'dark'
  /** Front-view corner radii of the cabinet (door bodies only) */
  cabinetCorners?: Corners
}

/** Every colour works on every fridge: the shared palette. Metal ones get a satin steel finish, the rest a glossy enamel. */
export const FRIDGE_COLORS: FridgeColor[] = PALETTE

/** Finish for a colour: steel for the metal ones, enamel for paint */
export const finishFor = (color: string): FridgeFinish =>
  FRIDGE_COLORS.find((c) => c.color === color)?.metal ? 'steel' : 'enamel'

// Every fridge stands on the floor (y = -2.2) with its door faces at the same
// depth, so doors run from -2.2 up to -2.2 + height.
const SOFT = { plan: 0.03, top: 0.03, bottom: 0.03, dome: 0 }

/** Largest to smallest, the order they show in the menu */
export const FRIDGE_MODELS: FridgeModel[] = [
  {
    // Big French door: two tall doors over two pull-out drawers
    id: 'french',
    label: 'french door',
    size: { w: 2.55, h: 4.85, d: 1.6 },
    body: 'doors',
    rounding: SOFT,
    // crisp and modern: barely-there corners
    cabinetCorners: [0.04, 0.04, 0.02, 0.02],
    doors: [
      { x0: -1.26, x1: -0.015, y0: 0.1, y1: 2.62, corners: [0.03, 0.012, 0.012, 0.012] },
      { x0: 0.015, x1: 1.26, y0: 0.1, y1: 2.62, corners: [0.012, 0.03, 0.012, 0.012] },
      { x0: -1.26, x1: 1.26, y0: -0.93, y1: 0.07, corners: [0.012, 0.012, 0.012, 0.012] },
      { x0: -1.26, x1: 1.26, y0: -2.06, y1: -0.96, corners: [0.012, 0.012, 0.025, 0.025] },
    ],
    handles: [
      { x: -0.13, y: 1.3, length: 1.8, dir: 'v' },
      { x: 0.13, y: 1.3, length: 1.8, dir: 'v' },
      { x: 0, y: -0.1, length: 1.9, dir: 'h' },
      { x: 0, y: -1.13, length: 1.9, dir: 'h' },
    ],
    handleFinish: 'brushed',
  },
  {
    // Tall fridge door over a bottom freezer drawer
    id: 'bottomfreezer',
    label: 'bottom freezer',
    size: { w: 2.2, h: 4.7, d: 1.5 },
    body: 'doors',
    rounding: SOFT,
    // softened top corners
    cabinetCorners: [0.14, 0.14, 0.04, 0.04],
    doors: [
      { x0: -1.085, x1: 1.085, y0: -0.5, y1: 2.47, corners: [0.12, 0.12, 0.02, 0.02] },
      { x0: -1.085, x1: 1.085, y0: -2.06, y1: -0.53, corners: [0.02, 0.02, 0.04, 0.04] },
    ],
    handles: [
      { x: -0.9, y: 1.05, length: 2.0, dir: 'v' },
      { x: 0, y: -0.7, length: 1.6, dir: 'h' },
    ],
    handleFinish: 'brushed',
  },
  {
    id: 'retro',
    label: 'retro',
    size: { w: 2, h: 4.4, d: 1.4 },
    body: 'rounded',
    rounding: { plan: 0.3, top: 0.5, bottom: 0.2, dome: 0.12 },
    doors: [
      { x0: -0.7, x1: 0.7, y0: 0.958, y1: 1.7 },
      { x0: -0.7, x1: 0.7, y0: -2.0, y1: 0.942 },
    ],
    handles: [
      { x: -0.4, y: 1.2, length: 0.42, dir: 'h' },
      { x: -0.4, y: 0.65, length: 0.42, dir: 'h' },
    ],
    handleFinish: 'chrome',
  },
  {
    // Bubbly mini fridge with a dark grip strip between its doors
    id: 'mini',
    label: 'mini',
    size: { w: 1.6, h: 2.6, d: 1.1 },
    body: 'doors',
    rounding: SOFT,
    cabinetCorners: [0.3, 0.3, 0.12, 0.12],
    doors: [
      { x0: -0.785, x1: 0.785, y0: -0.42, y1: 0.37, corners: [0.28, 0.28, 0.03, 0.03] },
      { x0: -0.785, x1: 0.785, y0: -2.06, y1: -0.48, corners: [0.03, 0.03, 0.1, 0.1] },
    ],
    handles: [{ x: 0, y: -0.45, length: 1.2, dir: 'h' }],
    handleFinish: 'dark',
  },
]

export interface FridgeLook {
  model: string
  color: string
}

export const DEFAULT_LOOK: FridgeLook = { model: 'retro', color: S.body.color }

export const fridgeModel = (id: string) => FRIDGE_MODELS.find((m) => m.id === id) ?? FRIDGE_MODELS[2]

/** Body surface for a finish, on top of the chosen colour */
export function bodyMaterial(finish: FridgeFinish) {
  switch (finish) {
    case 'enamel': { // candy enamel under a glassy clearcoat (tune it in fridgeStyle.ts)
      const { roughness, metalness, clearcoat, clearcoatRoughness } = S.body
      return { roughness, metalness, clearcoat, clearcoatRoughness }
    }
    case 'steel': // satin metal with a thin protective coat
      return { roughness: 0.3, metalness: 0.85, clearcoat: 0.3, clearcoatRoughness: 0.25 }
    case 'satin': // plain painted appliance
      return { roughness: 0.5, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.3 }
  }
}

export const HANDLE_RADIUS = 0.032

/** Things on the front a magnet can't overlap, in door-plane (x, y) coordinates */
export type Obstacle =
  | { kind: 'rect'; x: number; y: number; hw: number; hh: number }
  | { kind: 'circle'; x: number; y: number; r: number }

export interface DoorFront {
  doors: Rect[]
  obstacles: Obstacle[]
}

function frontOf(model: FridgeModel): DoorFront {
  const m = 0.012 // keep clear of the door's rounded edge
  return {
    doors: model.doors.map((d) => ({ ...d, x0: d.x0 + m, x1: d.x1 - m, y0: d.y0 + m, y1: d.y1 - m })),
    obstacles: model.handles.map((h) => {
      const long = h.length / 2 + HANDLE_RADIUS
      return h.dir === 'h'
        ? { kind: 'rect', x: h.x, y: h.y, hw: long, hh: HANDLE_RADIUS }
        : { kind: 'rect', x: h.x, y: h.y, hw: HANDLE_RADIUS, hh: long }
    }),
  }
}

// The fridge currently on screen. Magnet and note placement read this.
let current = frontOf(fridgeModel(DEFAULT_LOOK.model))
export const doorFront = () => current
export function setDoorFront(modelId: string) {
  current = frontOf(fridgeModel(modelId))
}

/** Middle of the biggest door, where things go when their spot is gone */
export function doorCentre() {
  const area = (d: Rect) => (d.x1 - d.x0) * (d.y1 - d.y0)
  const d = current.doors.reduce((a, b) => (area(b) > area(a) ? b : a))
  return { x: (d.x0 + d.x1) / 2, y: (d.y0 + d.y1) / 2 }
}

/** Distance from a point to a rectangle (0 inside) */
export function distToRect(d: Rect, x: number, y: number) {
  return Math.hypot(Math.max(d.x0 - x, 0, x - d.x1), Math.max(d.y0 - y, 0, y - d.y1))
}

/** True if a circle sits entirely on the door, rounded corners included */
export function circleInDoor(d: Rect, x: number, y: number, r: number) {
  if (x - r < d.x0 || x + r > d.x1 || y - r < d.y0 || y + r > d.y1) return false
  if (!d.corners) return true
  const [tl, tr, br, bl] = d.corners
  // in a corner's square, stay inside its arc
  const corner = (R: number, cx: number, cy: number, inX: boolean, inY: boolean) =>
    !(inX && inY) || Math.hypot(x - cx, y - cy) + r <= R
  return (
    corner(tl, d.x0 + tl, d.y1 - tl, x < d.x0 + tl, y > d.y1 - tl) &&
    corner(tr, d.x1 - tr, d.y1 - tr, x > d.x1 - tr, y > d.y1 - tr) &&
    corner(br, d.x1 - br, d.y0 + br, x > d.x1 - br, y < d.y0 + br) &&
    corner(bl, d.x0 + bl, d.y0 + bl, x < d.x0 + bl, y < d.y0 + bl)
  )
}
