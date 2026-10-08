/**
 * Keeps your fridge between visits: everything on it is saved in this
 * browser as you go (no account), and put back the next time you open it.
 * A share link carries the whole fridge in the address after #fridge=, so
 * opening one shows that fridge instead (no server needed).
 */
import type { PaperData } from './components/PaperNote'
import { FRIDGE_MODELS, setDoorFront, type FridgeLook } from './fridgeModels'
import type { MagnetData } from './magnetLayout'
import { PAPER_STYLES, PAPERS } from './papers'

const KEY = 'fridge-magnets:v1'
const LINK = '#fridge='

export interface SavedFridge {
  look: FridgeLook
  magnets: MagnetData[]
  papers: PaperData[]
}

const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
const spot = (p: unknown) => Array.isArray(p) && p.length === 2 && num(p[0]) && num(p[1]) && Math.abs(p[0]) < 5 && Math.abs(p[1]) < 5
const hex = (c: unknown) => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)

/** Only takes what it recognises, so an old or broken save can't break the app */
function check(raw: unknown): SavedFridge | null {
  if (!raw || typeof raw !== 'object') return null
  const { look, magnets, papers } = raw as Record<string, unknown>
  const l = look as FridgeLook | undefined
  if (!l || !FRIDGE_MODELS.some((m) => m.id === l.model) || !hex(l.color)) return null
  if (!Array.isArray(magnets) || !Array.isArray(papers)) return null
  const ms = magnets.filter(
    (m): m is MagnetData =>
      m && ['circle', 'square', 'star', 'heart'].includes(m.shape) && hex(m.color) &&
      ['chrome', 'satin', 'plastic'].includes(m.finish) && spot(m.position),
  )
  const ps = papers.filter(
    (p): p is PaperData =>
      p && PAPERS.some((d) => d.kind === p.kind) && PAPER_STYLES.some((s) => s.id === p.style) && spot(p.position) && num(p.tilt),
  )
  return {
    look: { model: l.model, color: l.color },
    magnets: ms.map((m, i) => ({ id: i + 1, shape: m.shape, color: m.color, finish: m.finish, position: m.position })),
    papers: ps.map((p, i) => ({ id: i + 1, kind: p.kind, style: p.style, position: p.position, tilt: p.tilt })),
  }
}

const round = (p: [number, number]) => p.map((v) => Math.round(v * 1000) / 1000)

/** A link that opens this exact fridge */
export function fridgeLink(f: SavedFridge) {
  const short = {
    look: f.look,
    magnets: f.magnets.map(({ shape, color, finish, position }) => ({ shape, color, finish, position: round(position) })),
    papers: f.papers.map(({ kind, style, position, tilt }) => ({ kind, style, position: round(position), tilt: Math.round(tilt * 1000) / 1000 })),
  }
  const bytes = new TextEncoder().encode(JSON.stringify(short))
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return location.origin + location.pathname + LINK + b64
}

function fromLink(): SavedFridge | null {
  if (!location.hash.startsWith(LINK)) return null
  try {
    const b64 = location.hash.slice(LINK.length).replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return check(JSON.parse(new TextDecoder().decode(bytes)))
  } catch {
    return null
  } finally {
    // tidy the address bar; the fridge is now yours to play with (and gets saved)
    history.replaceState(null, '', location.pathname + location.search)
  }
}

let loaded: SavedFridge | null | undefined

/** A shared fridge if you opened a link, else the fridge as it was last time, else null */
export function savedFridge(): SavedFridge | null {
  if (loaded === undefined) {
    try {
      loaded = fromLink() ?? check(JSON.parse(localStorage.getItem(KEY) ?? 'null'))
    } catch {
      loaded = null
    }
    // the door layout follows the model, so magnets land back where they were
    if (loaded) setDoorFront(loaded.look.model)
  }
  return loaded
}

export function saveFridge(f: SavedFridge) {
  try {
    localStorage.setItem(KEY, JSON.stringify(f))
  } catch {
    // private window or storage full: the fridge just won't be remembered
  }
}
