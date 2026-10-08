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
function draw(kind: PaperKind, ctx: Ctx, w: number, h: number, style: PaperStyleId, plain: boolean) {
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
      // a receipt with a recipe written on it doesn't need the pretend print
      if (plain) break
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

/** `plain`: without printed decoration that would clash with handwriting */
export function paperCanvas(kind: PaperKind, style: PaperStyleId = 'lined', plain = false) {
  const key = `${kind}|${style}|${plain}`
  let c = canvases.get(key)
  if (c) return c
  const [w, h] = paperDesign(kind).size
  c = document.createElement('canvas')
  c.width = Math.round(w * PX_PER_UNIT)
  c.height = Math.round(h * PX_PER_UNIT)
  draw(kind, c.getContext('2d')!, c.width, c.height, style, plain)
  canvases.set(key, c)
  return c
}

/* ---------- Recipes written on notes ---------- */

/** The app's own pair: the serif from the title, the sans from the buttons */
export const TITLE_FONT = "'IBM Plex Serif', Georgia, serif"
export const BODY_FONT = "Inter, system-ui, sans-serif"

/** What kind of dish it is, shown beside the name */
export const DISH_CATEGORIES = ['breakfast', 'lunch', 'dinner', 'side', 'snack', 'dessert', 'baking', 'drink'] as const
export interface Ingredient {
  amount: string
  name: string
  /** Ticked off while cooking */
  checked?: boolean
}
export interface Recipe {
  title: string
  /** One of DISH_CATEGORIES, or '' */
  category: string
  /** 0 (not rated) to 5 */
  rating: number
  /** Minutes, as typed */
  prep: string
  cook: string
  serves: string
  ingredients: Ingredient[]
  steps: string[]
  notes: string
}
export const emptyIngredient = (): Ingredient => ({ amount: '', name: '' })
/** The recipe on a note, with blanks for anything it doesn't have yet */
export const recipeOf = (r: Partial<Recipe>): Recipe => ({
  title: r.title ?? '',
  category: r.category ?? '',
  rating: r.rating ?? 0,
  prep: r.prep ?? '',
  cook: r.cook ?? '',
  serves: r.serves ?? '',
  ingredients: r.ingredients ?? [],
  steps: r.steps ?? [],
  notes: r.notes ?? '',
})
export const hasRecipe = (p: Partial<Recipe>) => {
  const r = recipeOf(p)
  return !!(
    r.title.trim() || r.category || r.rating || r.prep.trim() || r.cook.trim() || r.serves.trim() || r.notes.trim() ||
    r.ingredients.some((g) => g.name.trim() || g.amount.trim()) || r.steps.some((t) => t.trim())
  )
}

const minutes = (s: string) => {
  const n = parseFloat(s)
  return Number.isFinite(n) && n > 0 ? n : 0
}
/** "1 hr 5 min" from a number of minutes */
export const formatMinutes = (m: number) => {
  const h = Math.floor(m / 60)
  const r = Math.round(m % 60)
  return [h ? `${h} hr` : '', r ? `${r} min` : ''].filter(Boolean).join(' ')
}
/** Prep plus cook, or '' when neither is filled in */
export const totalTime = (r: Pick<Recipe, 'prep' | 'cook'>) => formatMinutes(minutes(r.prep) + minutes(r.cook))

const FRACTIONS: Record<string, number> = { '½': 0.5, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 0.25, '¾': 0.75, '⅛': 0.125 }
const NICE: [number, string][] = [[0, ''], [0.125, '1/8'], [0.25, '1/4'], [1 / 3, '1/3'], [0.5, '1/2'], [2 / 3, '2/3'], [0.75, '3/4'], [1, '']]
/** A quantity written the way a recipe would: 1 1/2, 3/4, 2.4 */
function niceNumber(v: number) {
  const whole = Math.floor(v + 1e-9)
  const rest = v - whole
  const [f, text] = NICE.reduce((a, b) => (Math.abs(b[0] - rest) < Math.abs(a[0] - rest) ? b : a))
  if (Math.abs(f - rest) > 0.02) return String(Math.round(v * 100) / 100)
  const w = whole + (f === 1 ? 1 : 0)
  return [w ? String(w) : '', text].filter(Boolean).join(' ') || '0'
}
/** Every number in an amount ("1 1/2 cups", "2-3", "½ tsp") times k */
export function scaleAmount(amount: string, k: number) {
  if (k === 1) return amount
  return amount.replace(/(\d+\s+\d+\/\d+|\d+\/\d+|\d*\.?\d+|[½⅓⅔¼¾⅛])/g, (m) => {
    let v: number
    if (m in FRACTIONS) v = FRACTIONS[m]
    else if (m.includes('/')) {
      const parts = m.trim().split(/\s+/)
      const [a, b] = parts[parts.length - 1].split('/').map(Number)
      v = (parts.length > 1 ? Number(parts[0]) : 0) + a / b
    } else v = Number(m)
    return Number.isFinite(v) ? niceNumber(v * k) : m
  })
}

/** Lined paper's line spacing; every paper uses it so writing sits on the lines where there are some */
const RULE_GAP = 0.024
const RULE_FIRST = 0.05

/**
 * Where the writing goes on a note of size w × h, in world units from its
 * top-left corner. Shared by the note on the fridge and the editor, so the
 * writing sits the same way on both.
 */
export function recipeLayout(kind: PaperKind, style: PaperStyleId, [w, h] = paperDesign(kind).size) {
  // below the torn edge / zigzag, and clear of the margin rule on lined paper
  const top = kind === 'notebook' || kind === 'grid' || kind === 'receipt' ? 0.024 : 0.008
  const left = style === 'lined' ? 0.07 : 0.022
  const right = w - 0.022
  const bottom = h - (kind === 'receipt' || kind === 'kraft' || kind === 'notebook' || kind === 'grid' ? 0.035 : 0.02)
  // rows on the lined-paper grid; the title takes the first one with room above it
  const row = (y: number) => RULE_FIRST + Math.ceil((y - RULE_FIRST) / RULE_GAP) * RULE_GAP
  const titleSize = 0.032
  const titleBaseline = row(top + titleSize * 0.75)
  const ink = style === 'black' ? '#f1ece2' : style === 'kraft' ? '#3b2a1c' : '#2f2c48'
  return {
    left,
    right,
    titleSize,
    titleBaseline,
    bodySize: RULE_GAP * 0.52,
    gap: RULE_GAP,
    bodyFirst: titleBaseline + RULE_GAP,
    bottom,
    ink,
  }
}

/** Break text into lines that fit `width` */
function wrap(ctx: Ctx, text: string, width: number) {
  const out: string[] = []
  let line = ''
  for (const word of text.split(/(\s+)/)) {
    const next = line + word
    if (line.trim() && ctx.measureText(next).width > width) {
      out.push(line.trimEnd())
      line = word.trimStart()
    } else line = next
  }
  out.push(line)
  return out
}

/**
 * The recipe as lines of writing, in reading order after the name: a line
 * of details (kind, rating, time, servings), ingredients, steps, notes.
 */
function recipeLines(ctx: Ctx, r: Recipe, width: number, bodyFont: string, headFont: string) {
  type Line = { text: string; font?: string; indent?: number; faint?: boolean; rule?: boolean }
  const out: Line[] = []
  ctx.font = bodyFont
  const section = (name: string) => {
    // a faint rule between sections
    if (out.length || r.title.trim()) out.push({ text: '', rule: true })
    out.push({ text: name, font: headFont, faint: true })
  }
  const total = totalTime(r)
  const details = [
    r.category,
    r.rating ? '★'.repeat(r.rating) + '☆'.repeat(5 - r.rating) : '',
    total,
    r.serves.trim() ? `serves\u00a0${r.serves.trim()}` : '',
  ].filter(Boolean)
  if (details.length) for (const l of wrap(ctx, details.join('  ·  '), width)) out.push({ text: l, font: bodyFont, faint: true })
  const items = r.ingredients.filter((g) => g.name.trim() || g.amount.trim())
  if (items.length) {
    section('INGREDIENTS')
    for (const g of items)
      for (const l of wrap(ctx, `${g.amount.trim()} ${g.name.trim()}`.trim(), width)) out.push({ text: l, font: bodyFont })
  }
  const steps = r.steps.filter((t) => t.trim())
  if (steps.length) {
    section('STEPS')
    steps.forEach((t, i) => {
      const num = `${i + 1}. `
      const indent = ctx.measureText(num).width
      wrap(ctx, t.trim(), width - indent).forEach((l, j) => out.push({ text: j ? l : num + l, font: bodyFont, indent: j ? indent : 0 }))
    })
  }
  if (r.notes.trim()) {
    section('NOTES')
    for (const para of r.notes.trim().split('\n')) for (const l of wrap(ctx, para, width)) out.push({ text: l, font: bodyFont })
  }
  return out
}

/**
 * The note with its recipe written on, as a texture for the fridge. Whatever
 * doesn't fit trails off with an ellipsis; the editor always has the whole thing.
 */
export async function writtenPaperCanvas(kind: PaperKind, style: PaperStyleId, r: Recipe) {
  const src = paperCanvas(kind, style, true)
  const u = PX_PER_UNIT
  const L = recipeLayout(kind, style)
  const titleFont = `300 ${L.titleSize * u}px ${TITLE_FONT}`
  const bodyFont = `400 ${L.bodySize * u}px ${BODY_FONT}`
  const headFont = `600 ${L.bodySize * 0.72 * u}px ${BODY_FONT}`
  await Promise.all([document.fonts.load(titleFont), document.fonts.load(bodyFont), document.fonts.load(headFont)]).catch(() => {})
  const c = document.createElement('canvas')
  c.width = src.width
  c.height = src.height
  const ctx = c.getContext('2d')!
  ctx.drawImage(src, 0, 0)
  ctx.fillStyle = L.ink
  const width = (L.right - L.left) * u
  if (r.title.trim()) {
    ctx.font = titleFont
    let t = r.title.trim()
    while (t.length > 1 && ctx.measureText(t).width > width) t = t.slice(0, -1)
    if (t !== r.title.trim()) t = t.slice(0, -1) + '…'
    ctx.fillText(t, L.left * u, L.titleBaseline * u)
  }
  const lines = recipeLines(ctx, r, width, bodyFont, headFont)
  const fits = Math.max(0, Math.floor((L.bottom - L.bodyFirst) / L.gap) + 1)
  lines.slice(0, fits).forEach((line, i) => {
    const y = (L.bodyFirst + i * L.gap) * u
    if (line.rule) {
      ctx.globalAlpha = 0.22
      ctx.fillRect(L.left * u, y - u * 0.0008, width, u * 0.0016)
      return
    }
    let s = line.text
    ctx.font = line.font!
    ctx.letterSpacing = line.font === headFont ? `${L.bodySize * 0.72 * u * 0.02}px` : '0px'
    if (i === fits - 1 && lines.length > fits) {
      while (s && ctx.measureText(s + '…').width > width) s = s.slice(0, -1)
      s = s.trimEnd() + '…'
    }
    ctx.globalAlpha = line.faint ? 0.55 : 1
    ctx.fillText(s, L.left * u + (line.indent ?? 0), y)
  })
  ctx.letterSpacing = '0px'
  ctx.globalAlpha = 1
  return c
}

/** Editor sheets are at least this big (world units), so small notes still have room to write */
export const SHEET_MIN: [number, number] = [0.5, 0.52]

const backgrounds = new Map<string, string>()
/** The note's paper, at the editor's (roomier) size, as an image */
export function paperBackground(kind: PaperKind, style: PaperStyleId, [w, h]: [number, number]) {
  const key = `${kind}|${style}|${w}|${h}`
  let b = backgrounds.get(key)
  if (!b) {
    const c = document.createElement('canvas')
    c.width = Math.round(w * PX_PER_UNIT * 0.6)
    c.height = Math.round(h * PX_PER_UNIT * 0.6)
    const ctx = c.getContext('2d')!
    // drawn at 0.6 scale to keep the image light; spacings scale with it
    ctx.scale(0.6, 0.6)
    draw(kind, ctx, w * PX_PER_UNIT, h * PX_PER_UNIT, style, true)
    backgrounds.set(key, (b = c.toDataURL()))
  }
  return b
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
