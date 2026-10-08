/**
 * Paper designs for recipe notes. Each one is drawn once onto a canvas: that
 * canvas is the texture of the note on the fridge and also the menu picture,
 * so the two always match.
 */
import { Color } from 'three'
import { distToRect, doorFront } from './fridgeModels'
import { PASTELS } from './palette'

export type PaperKind = 'sticky' | 'notebook' | 'grid' | 'kraft' | 'index' | 'receipt'

export interface PaperDesign {
  kind: PaperKind
  label: string
  /** Real size on the door, in world units (the door is 2 wide) */
  size: [number, number]
}

export const PAPERS: PaperDesign[] = [
  { kind: 'sticky', label: 'square note', size: [0.3, 0.3] },
  { kind: 'notebook', label: 'torn page', size: [0.42, 0.54] },
  { kind: 'grid', label: 'torn square', size: [0.42, 0.5] },
  { kind: 'kraft', label: 'torn scrap', size: [0.4, 0.46] },
  { kind: 'index', label: 'index card', size: [0.5, 0.3] },
  { kind: 'receipt', label: 'receipt', size: [0.24, 0.62] },
]

export const paperDesign = (kind: PaperKind) => PAPERS.find((p) => p.kind === kind)!

/** Sticky notes come in the palette's pastels, a touch lighter at the top of the pad */
const STICKY: Record<string, [string, string]> = Object.fromEntries(
  PASTELS.map((c) => [c.label, [`#${new Color(c.color).lerp(new Color('#ffffff'), 0.3).getHexString()}`, c.color]]),
)

export type PaperStyleId = 'textured' | 'lined' | 'grid' | 'dotted' | 'cardstock' | 'kraft' | 'black' | `sticky-${string}`

/**
 * The papers a note can be made of. Pick one and every shape in the menu takes
 * it on. Top row: the white papers (plain and printed), then darker ones
 * down to black. Bottom row: sticky notes in the palette's pastels.
 */
export const PAPER_STYLES: { id: PaperStyleId; label: string; color: string; swatch: string }[] = [
  { id: 'textured', label: 'textured', color: '#f8f7f3', swatch: 'linear-gradient(150deg, #fbfaf7, #efede7)' },
  {
    id: 'lined',
    label: 'lined',
    color: '#f6f4ef',
    swatch: 'linear-gradient(90deg, transparent 5px, #ec8f95 5px 6px, transparent 6px), repeating-linear-gradient(#f6f4ef 0 4px, #a9c6e8 4px 5px)',
  },
  {
    id: 'grid',
    label: 'grid',
    color: '#fdfdfc',
    swatch: 'repeating-linear-gradient(90deg, transparent 0 3px, #bcd2ec 3px 4px), repeating-linear-gradient(transparent 0 3px, #bcd2ec 3px 4px), #fdfdfc',
  },
  { id: 'dotted', label: 'dotted', color: '#fdfdfb', swatch: 'radial-gradient(circle, #a7afb9 0.7px, #fdfdfb 1.1px) 0 0 / 4px 4px' },
  { id: 'cardstock', label: 'cardstock', color: '#f3ecd7', swatch: 'linear-gradient(150deg, #f7f1df, #ece3c8)' },
  { id: 'kraft', label: 'kraft', color: '#d3b07e', swatch: 'linear-gradient(150deg, #dbba8a, #c9a26c)' },
  { id: 'black', label: 'black', color: '#2a292c', swatch: 'linear-gradient(150deg, #3a393d, #1f1e21)' },
  ...Object.keys(STICKY).map((c) => ({
    id: `sticky-${c}` as const,
    label: `${c} sticky`,
    color: STICKY[c][1],
    swatch: `linear-gradient(160deg, ${STICKY[c][0]}, ${STICKY[c][1]})`,
  })),
]

/** Texture pixels per world unit: enough to stay crisp when zoomed right in */
const PX_PER_UNIT = 1800

// Seeded random so each design's torn edges come out the same every time
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647
    return (seed - 1) / 2147483646
  }
}

type Ctx = CanvasRenderingContext2D

/** Outline with optional torn / zigzag top and bottom edges, as a clip path */
function outline(ctx: Ctx, w: number, h: number, top: 'straight' | 'torn' | 'zigzag', bottom: 'straight' | 'torn' | 'zigzag', seed: number) {
  const r = rng(seed)
  const edge = (y0: number, dir: 1 | -1, style: string, fromX: number, toX: number) => {
    const steps = style === 'zigzag' ? Math.round(w / 22) : Math.round(w / 9)
    for (let i = 1; i <= steps; i++) {
      const x = fromX + ((toX - fromX) * i) / steps
      let dy = 0
      if (style === 'torn') dy = (r() * 0.9 + 0.1) * h * 0.022 + (r() < 0.15 ? r() * h * 0.015 : 0)
      if (style === 'zigzag') dy = i % 2 ? h * 0.018 : 0
      ctx.lineTo(x, y0 + dir * dy)
    }
  }
  ctx.beginPath()
  ctx.moveTo(0, top === 'straight' ? 0 : h * 0.02)
  if (top === 'straight') ctx.lineTo(w, 0)
  else edge(0, 1, top, 0, w)
  ctx.lineTo(w, h)
  if (bottom === 'straight') ctx.lineTo(0, h)
  else edge(h, -1, bottom, w, 0)
  ctx.closePath()
}

/** Fine paper grain so flat colours don't look like plastic */
function grain(ctx: Ctx, w: number, h: number, strength: number, seed: number) {
  const r = rng(seed)
  for (let i = 0; i < (w * h) / 60; i++) {
    ctx.fillStyle = r() < 0.5 ? `rgba(0,0,0,${strength * r()})` : `rgba(255,255,255,${strength * r()})`
    ctx.fillRect(r() * w, r() * h, 1.5, 1.5)
  }
}

function lines(ctx: Ctx, w: number, from: number, to: number, gap: number, color: string, width: number) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  for (let y = from; y < to; y += gap) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
    ctx.stroke()
  }
}

/** Lay the paper itself (colour, print and grain) over the whole note */
function surface(style: PaperStyleId, ctx: Ctx, w: number, h: number) {
  const u = PX_PER_UNIT // px per world unit, for fixed real-world spacings
  const fill = (c: string | CanvasGradient) => {
    ctx.fillStyle = c
    ctx.fillRect(0, 0, w, h)
  }
  if (style.startsWith('sticky-')) {
    const [top, bottom] = STICKY[style.slice(7)]
    const g = ctx.createLinearGradient(0, 0, w * 0.3, h)
    g.addColorStop(0, top)
    g.addColorStop(1, bottom)
    fill(g)
    grain(ctx, w, h, 0.05, 11)
    return
  }
  switch (style) {
    case 'black':
      fill('#2a292c')
      grain(ctx, w, h, 0.05, 19)
      break
    case 'dotted': {
      fill('#fdfdfb')
      const gap = 0.02 * u
      ctx.fillStyle = '#b4bcc6'
      for (let y = gap / 2; y < h; y += gap)
        for (let x = gap / 2; x < w; x += gap) {
          ctx.beginPath()
          ctx.arc(x, y, 2.6, 0, Math.PI * 2)
          ctx.fill()
        }
      grain(ctx, w, h, 0.035, 17)
      break
    }
    case 'lined':
      fill('#f6f4ef')
      lines(ctx, w, 0.05 * u, h, 0.024 * u, '#a9c6e8', 2.5)
      ctx.fillStyle = '#ec8f95'
      ctx.fillRect(0.055 * u, 0, 3, h)
      grain(ctx, w, h, 0.035, 12)
      break
    case 'grid': {
      fill('#fdfdfc')
      const gap = 0.018 * u
      ctx.strokeStyle = '#c9dbef'
      ctx.lineWidth = 2
      for (let x = gap / 2; x < w; x += gap) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      lines(ctx, w, gap / 2, h, gap, '#c9dbef', 2)
      grain(ctx, w, h, 0.035, 13)
      break
    }
    case 'cardstock':
      fill('#f3ecd7')
      grain(ctx, w, h, 0.035, 13)
      break
    case 'kraft': {
      fill('#d3b07e')
      // fibres
      const r = rng(21)
      for (let i = 0; i < (900 * w * h) / (720 * 830); i++) {
        ctx.strokeStyle = `rgba(${r() < 0.5 ? '120,85,40' : '240,218,180'},${0.12 * r()})`
        ctx.lineWidth = 1.5
        const x = r() * w
        const y = r() * h
        const a = r() * Math.PI
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14)
        ctx.stroke()
      }
      grain(ctx, w, h, 0.07, 14)
      break
    }
    case 'textured': {
      fill('#f8f7f3')
      // the fine tooth of watercolour-style paper: lots of tiny soft light and shade
      const r = rng(23)
      for (let i = 0; i < (w * h) / 40; i++) {
        ctx.fillStyle = r() < 0.5 ? `rgba(120,115,100,${0.05 * r()})` : `rgba(255,255,255,${0.5 * r()})`
        ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 1.5 + r() * 2)
      }
      break
    }
  }
}

/** One note: the shape's outline and details, on the chosen paper */
function draw(kind: PaperKind, ctx: Ctx, w: number, h: number, style: PaperStyleId) {
  const u = PX_PER_UNIT
  const shape = {
    sticky: ['straight', 'straight', 1],
    notebook: ['torn', 'straight', 7],
    grid: ['torn', 'straight', 3],
    kraft: ['straight', 'torn', 5],
    index: ['straight', 'straight', 2],
    receipt: ['zigzag', 'zigzag', 4],
  } as const
  const [top, bottom, seed] = shape[kind]
  outline(ctx, w, h, top, bottom, seed)
  ctx.clip()
  surface(style, ctx, w, h)
  switch (kind) {
    case 'sticky': {
      // adhesive strip: a touch darker and glossier
      ctx.fillStyle = style.startsWith('sticky-') ? 'rgba(255, 255, 255, 0.18)' : 'rgba(0, 0, 0, 0.04)'
      ctx.fillRect(0, 0, w, h * 0.17)
      // the free bottom edge lifts off the door a little
      const curl = ctx.createLinearGradient(0, h * 0.75, 0, h)
      curl.addColorStop(0, 'rgba(90, 70, 20, 0)')
      curl.addColorStop(1, 'rgba(90, 70, 20, 0.1)')
      ctx.fillStyle = curl
      ctx.fillRect(0, 0, w, h)
      break
    }
    case 'index':
      // the red heading rule an index card has, on lined card
      if (style === 'lined') {
        ctx.fillStyle = '#e48a8a'
        ctx.fillRect(0, 0.04 * u, w, 3)
      }
      break
    case 'receipt': {
      // faint thermal-print text bars (light ink on black paper)
      const ink = style === 'black' ? '235, 232, 225' : '70, 70, 75'
      const r = rng(31)
      const x0 = w * 0.12
      const lh = 0.022 * u
      let y = h * 0.1
      ctx.fillStyle = `rgba(${ink}, 0.38)`
      ctx.fillRect(w * 0.3, y, w * 0.4, lh * 0.45)
      y += lh * 1.8
      while (y < h * 0.86) {
        if (r() < 0.12) {
          ctx.fillStyle = `rgba(${ink}, 0.22)`
          for (let x = x0; x < w - x0; x += 10) ctx.fillRect(x, y + lh * 0.2, 5, 2)
        } else {
          ctx.fillStyle = `rgba(${ink}, 0.3)`
          ctx.fillRect(x0, y, (w * 0.45) * (0.4 + r() * 0.6), lh * 0.38)
          ctx.fillRect(w - x0 - w * 0.14, y, w * 0.14, lh * 0.38)
        }
        y += lh
      }
      break
    }
  }
}

const canvases = new Map<string, HTMLCanvasElement>()

export function paperCanvas(kind: PaperKind, style: PaperStyleId = 'lined') {
  const key = `${kind}|${style}`
  let c = canvases.get(key)
  if (c) return c
  const [w, h] = paperDesign(kind).size
  c = document.createElement('canvas')
  c.width = Math.round(w * PX_PER_UNIT)
  c.height = Math.round(h * PX_PER_UNIT)
  draw(kind, c.getContext('2d')!, c.width, c.height, style)
  canvases.set(key, c)
  return c
}

const thumbs = new Map<string, string>()

/** Small copy of the same drawing for the menu */
export function paperThumb(kind: PaperKind, style: PaperStyleId = 'lined') {
  const key = `${kind}|${style}`
  let t = thumbs.get(key)
  if (t) return t
  const src = paperCanvas(kind, style)
  const scale = 240 / Math.max(src.width, src.height)
  const c = document.createElement('canvas')
  c.width = Math.round(src.width * scale)
  c.height = Math.round(src.height * scale)
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height)
  t = c.toDataURL('image/png')
  thumbs.set(key, t)
  return t
}

/**
 * Where a note let go at (x, y) comes to rest: slid fully onto the nearest
 * door it fits on (never across a gap between doors), or null if it was let
 * go off the front entirely.
 */
export function placePaper(kind: PaperKind, x: number, y: number): [number, number] | null {
  const doors = doorFront().doors
  if (!doors.some((d) => distToRect(d, x, y) < 0.05)) return null
  const [w, h] = paperDesign(kind).size
  const m = 0.02 // margin, which also covers the slight tilt
  const hw = w / 2 + m
  const hh = h / 2 + m
  const fits = doors.filter((d) => d.x1 - d.x0 >= hw * 2 && d.y1 - d.y0 >= hh * 2)
  const pool = fits.length ? fits : doors
  const door = pool.reduce((a, b) => (distToRect(b, x, y) < distToRect(a, x, y) ? b : a))
  const clamp = (v: number, a: number, b: number) => (a > b ? (a + b) / 2 : Math.min(Math.max(v, a), b))
  // keep in from big rounded corners: inset the top/bottom edge by the roundest corner on that side
  const [tl, tr, br, bl] = door.corners ?? [0, 0, 0, 0]
  const top = Math.max(tl, tr) * 0.3
  const bottom = Math.max(bl, br) * 0.3
  return [clamp(x, door.x0 + hw, door.x1 - hw), clamp(y, door.y0 + hh + bottom, door.y1 - hh - top)]
}
