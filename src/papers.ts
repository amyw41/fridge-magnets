/**
 * Paper designs for recipe notes. Each one is drawn once onto a canvas: that
 * canvas is the texture of the note on the fridge and also the menu picture,
 * so the two always match.
 */
import { distToRect, doorFront } from './fridgeModels'
import { PALETTE } from './palette'

export type PaperKind = 'sticky' | 'notebook' | 'grid' | 'kraft' | 'index' | 'receipt'

export interface PaperDesign {
  kind: PaperKind
  label: string
  /** Real size on the door, in world units (the door is 2 wide) */
  size: [number, number]
}

export const PAPERS: PaperDesign[] = [
  { kind: 'sticky', label: 'sticky note', size: [0.3, 0.3] },
  { kind: 'notebook', label: 'torn notebook page', size: [0.42, 0.54] },
  { kind: 'grid', label: 'grid paper', size: [0.42, 0.5] },
  { kind: 'kraft', label: 'kraft paper', size: [0.4, 0.46] },
  { kind: 'index', label: 'index card', size: [0.5, 0.3] },
  { kind: 'receipt', label: 'receipt', size: [0.24, 0.62] },
]

export const paperDesign = (kind: PaperKind) => PAPERS.find((p) => p.kind === kind)!

/** Colours a note can be printed in (the shared palette). With none picked, each paper keeps its own. */
export const PAPER_COLORS = PALETTE

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

function draw(kind: PaperKind, ctx: Ctx, w: number, h: number, tint: string | null) {
  const u = PX_PER_UNIT // px per world unit, for fixed real-world spacings
  const base = (own: string) => tint ?? own
  switch (kind) {
    case 'sticky': {
      outline(ctx, w, h, 'straight', 'straight', 1)
      ctx.clip()
      const g = ctx.createLinearGradient(0, 0, w * 0.3, h)
      g.addColorStop(0, base('#fff1a6'))
      g.addColorStop(1, base('#fbe78e'))
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)
      if (tint) {
        // the same gentle fall-off as the yellow one, on any colour
        ctx.fillStyle = 'rgba(0, 0, 0, 0.035)'
        ctx.fillRect(0, h * 0.4, w, h * 0.6)
      }
      // adhesive strip: a touch darker and glossier
      ctx.fillStyle = tint ? 'rgba(0, 0, 0, 0.05)' : 'rgba(240, 200, 60, 0.28)'
      ctx.fillRect(0, 0, w, h * 0.17)
      // the free bottom edge lifts off the door a little
      const curl = ctx.createLinearGradient(0, h * 0.75, 0, h)
      curl.addColorStop(0, 'rgba(120, 90, 0, 0)')
      curl.addColorStop(1, 'rgba(120, 90, 0, 0.1)')
      ctx.fillStyle = curl
      ctx.fillRect(0, 0, w, h)
      grain(ctx, w, h, 0.05, 11)
      break
    }
    case 'notebook': {
      outline(ctx, w, h, 'torn', 'straight', 7)
      ctx.clip()
      ctx.fillStyle = base('#fdfdfa')
      ctx.fillRect(0, 0, w, h)
      lines(ctx, w, h * 0.13, h, 0.024 * u, '#a9c6e8', 2.5)
      ctx.fillStyle = '#ec8f95'
      ctx.fillRect(w * 0.14, 0, 3, h)
      grain(ctx, w, h, 0.035, 12)
      break
    }
    case 'grid': {
      outline(ctx, w, h, 'torn', 'straight', 3)
      ctx.clip()
      ctx.fillStyle = base('#fdfdfc')
      ctx.fillRect(0, 0, w, h)
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
    case 'kraft': {
      outline(ctx, w, h, 'straight', 'torn', 5)
      ctx.clip()
      ctx.fillStyle = base('#c8a27a')
      ctx.fillRect(0, 0, w, h)
      // fibres
      const r = rng(21)
      for (let i = 0; i < 900; i++) {
        ctx.strokeStyle = `rgba(${r() < 0.5 ? '90,60,30' : '235,210,170'},${0.12 * r()})`
        ctx.lineWidth = 1.5
        const x = r() * w
        const y = r() * h
        const a = r() * Math.PI
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14)
        ctx.stroke()
      }
      grain(ctx, w, h, 0.08, 14)
      break
    }
    case 'index': {
      outline(ctx, w, h, 'straight', 'straight', 2)
      ctx.clip()
      ctx.fillStyle = base('#fffdf6')
      ctx.fillRect(0, 0, w, h)
      lines(ctx, w, h * 0.34, h, 0.026 * u, '#b9cfe9', 2.5)
      ctx.fillStyle = '#e48a8a'
      ctx.fillRect(0, h * 0.2, w, 3)
      grain(ctx, w, h, 0.03, 15)
      break
    }
    case 'receipt': {
      outline(ctx, w, h, 'zigzag', 'zigzag', 4)
      ctx.clip()
      ctx.fillStyle = base('#fafaf8')
      ctx.fillRect(0, 0, w, h)
      // faint thermal-print text bars
      const r = rng(31)
      const x0 = w * 0.12
      const lh = 0.022 * u
      let y = h * 0.1
      ctx.fillStyle = 'rgba(70, 70, 75, 0.38)'
      ctx.fillRect(w * 0.3, y, w * 0.4, lh * 0.45)
      y += lh * 1.8
      while (y < h * 0.86) {
        if (r() < 0.12) {
          ctx.fillStyle = 'rgba(70, 70, 75, 0.22)'
          for (let x = x0; x < w - x0; x += 10) ctx.fillRect(x, y + lh * 0.2, 5, 2)
        } else {
          ctx.fillStyle = 'rgba(70, 70, 75, 0.3)'
          ctx.fillRect(x0, y, (w * 0.45) * (0.4 + r() * 0.6), lh * 0.38)
          ctx.fillRect(w - x0 - w * 0.14, y, w * 0.14, lh * 0.38)
        }
        y += lh
      }
      grain(ctx, w, h, 0.03, 16)
      break
    }
  }
}

const canvases = new Map<string, HTMLCanvasElement>()

export function paperCanvas(kind: PaperKind, color: string | null = null) {
  const key = `${kind}|${color}`
  let c = canvases.get(key)
  if (c) return c
  const [w, h] = paperDesign(kind).size
  c = document.createElement('canvas')
  c.width = Math.round(w * PX_PER_UNIT)
  c.height = Math.round(h * PX_PER_UNIT)
  draw(kind, c.getContext('2d')!, c.width, c.height, color)
  canvases.set(key, c)
  return c
}

const thumbs = new Map<string, string>()

/** Small copy of the same drawing for the menu */
export function paperThumb(kind: PaperKind, color: string | null = null) {
  const key = `${kind}|${color}`
  let t = thumbs.get(key)
  if (t) return t
  const src = paperCanvas(kind, color)
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
