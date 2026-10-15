import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { magnetThumb } from '../magnetThumbs'
import type { MagnetFinish, MagnetShape } from '../magnetLayout'
import { MAGNET_SIZE } from '../magnetLayout'
import { PALETTE, PRECIOUS, SILVER } from '../palette'
import { PAPER_STYLES, paperThumb, PAPERS, type PaperKind, type PaperStyleId } from '../papers'
import { prefersReducedMotion } from '../motion'

export interface MagnetPreset {
  shape: MagnetShape
  color: string
  finish: MagnetFinish
  label: string
}

const MAGNET_SHAPES: { shape: MagnetShape; label: string }[] = [
  { shape: 'star', label: 'star' },
  { shape: 'heart', label: 'heart' },
  { shape: 'circle', label: 'dot' },
]

/** Pick a colour and every shape in the panel takes it on (the shared palette) */
const MAGNET_COLORS = PALETTE

const presetOf = (shapeIndex: number, colorIndex: number): MagnetPreset => {
  const { shape, label } = MAGNET_SHAPES[shapeIndex]
  const c = MAGNET_COLORS[colorIndex]
  // stars and hearts are always shiny, tinted by the colour; dots are glossy plastic, or satin metal in the metals
  const precious = PRECIOUS.includes(c.color)
  const finish: MagnetFinish = shape !== 'circle' ? 'chrome' : precious ? 'satin' : 'plastic'
  return { shape, color: c.color, finish, label: `${c.label} ${label}` }
}

/**
 * A grid of colour dots. With `optional`, clicking the picked one again unpicks it.
 * `onPreview` hears which dot the pointer is over (null once it leaves them all).
 */
function Swatches({
  colors,
  value,
  onChange,
  onPreview,
  optional = false,
  label = 'colour',
  className = '',
}: {
  colors: { label: string; color: string; swatch?: string }[]
  value: number | null
  onChange: (i: number | null) => void
  onPreview?: (i: number | null) => void
  optional?: boolean
  label?: string
  className?: string
}) {
  return (
    <div className={`tool-swatches ${className}`} role="radiogroup" aria-label={label} onPointerLeave={() => onPreview?.(null)}>
      {colors.map((c, i) => (
        <button
          key={c.label}
          role="radio"
          aria-checked={i === value}
          aria-label={c.label}
          title={c.label}
          className={`fridge-swatch tool-swatch${i === value ? ' is-active' : ''}`}
          style={{ background: c.swatch ?? c.color }}
          onPointerEnter={() => onPreview?.(i)}
          onClick={() => onChange(optional && i === value ? null : i)}
        />
      ))}
    </div>
  )
}

type Section = 'paper' | 'magnets' | 'extras'

/**
 * The floating pill on the left. Hovering (or tapping) a button opens a side
 * panel with every option of that kind.
 */
type Grabbed = { what: 'magnet' | 'paper'; i: number }

export default function ToolMenu({
  onAddMagnet,
  onDropMagnet,
  onAddPaper,
  onDropPaper,
  pxPerUnit,
  onClearAll,
  canClear,
}: {
  /** Tapped: put it in the nearest free spot */
  onAddMagnet: (p: MagnetPreset) => void
  /** Dragged out and let go at this screen point */
  onDropMagnet: (p: MagnetPreset, clientX: number, clientY: number) => void
  onAddPaper: (kind: PaperKind, style: PaperStyleId) => void
  onDropPaper: (kind: PaperKind, style: PaperStyleId, clientX: number, clientY: number) => void
  /** Screen pixels per world unit on the door right now */
  pxPerUnit: () => number
  /** Takes everything off the fridge (the bin, clicked twice) */
  onClearAll: () => void
  /** Whether there's anything on the fridge to clear */
  canClear: boolean
}) {
  // The bin, clicked once: it goes red and asks; a second click clears the fridge.
  // Clicking anywhere else, or waiting a few seconds, calls it off.
  const [clearArmed, setClearArmed] = useState(false)
  const trashWrap = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!clearArmed) return
    const away = (e: PointerEvent) => {
      if (!trashWrap.current?.contains(e.target as Node)) setClearArmed(false)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setClearArmed(false)
    const timer = window.setTimeout(() => setClearArmed(false), 4000)
    window.addEventListener('pointerdown', away)
    window.addEventListener('keydown', esc)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', away)
      window.removeEventListener('keydown', esc)
    }
  }, [clearArmed])
  const clickTrash = () => {
    if (clearArmed) {
      setClearArmed(false)
      onClearAll()
    } else if (canClear) setClearArmed(true)
  }

  const [open, setOpen] = useState<Section | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  // Chosen colours, kept while the panels open and close
  const [magnetColor, setMagnetColor] = useState(MAGNET_COLORS.findIndex((c) => c.color === SILVER)) // a silver star
  const [paperStyle, setPaperStyle] = useState(PAPER_STYLES.findIndex((s) => s.id === 'lined'))
  // The colour under the pointer, shown on the thumbnails (and the sidebar
  // buttons) before it's picked; leaving the dots goes back to the picked one
  const [paperHover, setPaperHover] = useState<number | null>(null)
  const [magnetHover, setMagnetHover] = useState<number | null>(null)
  useEffect(() => {
    setPaperHover(null)
    setMagnetHover(null)
  }, [open])
  const shownMagnetColor = magnetHover ?? magnetColor
  const magnetThumbs = useMemo(
    () => MAGNET_SHAPES.map((_, i) => { const p = presetOf(i, shownMagnetColor); return magnetThumb(p.shape, p.color, p.finish) }),
    [shownMagnetColor],
  )
  // Draw every colour's and style's pictures ahead of time while the page is
  // idle, so hovering a dot changes the previews straight away instead of
  // stalling while that colour is drawn for the first time
  useEffect(() => {
    let cancelled = false
    const jobs = [
      ...PAPER_STYLES.flatMap((s) => PAPERS.map((p) => () => paperThumb(p.kind, s.id))),
      ...MAGNET_COLORS.flatMap((_, c) => MAGNET_SHAPES.map((_, i) => () => { const p = presetOf(i, c); return magnetThumb(p.shape, p.color, p.finish) })),
    ]
    const idle = (f: () => void) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(f, { timeout: 300 }) : setTimeout(f, 30)) // (Safari has no idle callbacks)
    const next = () => {
      if (cancelled) return
      const job = jobs.shift()
      if (!job) return
      const src = job()
      if (src) warm(src)
      idle(next)
    }
    const start = window.setTimeout(() => idle(next), 3000) // (after the page has loaded in, so it doesn't slow that down)
    return () => {
      cancelled = true
      window.clearTimeout(start)
    }
  }, [])
  const style = PAPER_STYLES[paperStyle].id
  const shownStyle = PAPER_STYLES[paperHover ?? paperStyle].id
  const dealIn = (el: HTMLImageElement | null) => {
    if (!el) return
    if (el.complete) el.classList.add('is-in')
    else el.addEventListener('load', () => el.classList.add('is-in'), { once: true })
  }
  const paperThumbs = useMemo(() => PAPERS.map((p) => paperThumb(p.kind, shownStyle)), [shownStyle])
  const thumbOf = (g: Grabbed) => (g.what === 'magnet' ? magnetThumbs : paperThumbs)[g.i]
  // Each button shows whichever option was last hovered in its panel
  const [magnetPreview, setMagnetPreview] = useState<number | null>(0) // starts on the silver star
  // starts on the square note, so the button shows (and adds) a real option straight away
  const [paperPreview, setPaperPreview] = useState<number | null>(0)

  // Drag an option out of the panel: a copy follows the cursor, at the size it
  // will be on the fridge, until it's let go
  // (it's moved directly, not re-rendered, so it keeps up with the cursor)
  const [ghost, setGhost] = useState<(Grabbed & { x: number; y: number; w: number }) | null>(null)
  const ghostRef = useRef<HTMLImageElement>(null)
  const press = useRef<(Grabbed & { x: number; y: number; dragging: boolean }) | null>(null)
  const magnetColorRef = useRef(magnetColor)
  magnetColorRef.current = magnetColor
  const paperStyleRef = useRef(style)
  paperStyleRef.current = style
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 4) {
        p.dragging = true
        setOpen(null) // get the panel out of the way of the fridge
        document.body.style.cursor = 'grabbing'
        // (magnet thumbnails have a little margin round the magnet)
        const units = p.what === 'magnet' ? MAGNET_SIZE * 1.24 : PAPERS[p.i].size[0]
        setGhost({ what: p.what, i: p.i, x: e.clientX, y: e.clientY, w: Math.max(28, pxPerUnit() * units) })
      }
      if (!p.dragging) return
      const g = ghostRef.current
      if (g) {
        g.style.left = `${e.clientX}px`
        g.style.top = `${e.clientY}px`
      }
    }
    const up = (e: PointerEvent) => {
      const p = press.current
      if (!p) return
      press.current = null
      setGhost(null)
      document.body.style.cursor = ''
      if (p.what === 'magnet') {
        const preset = presetOf(p.i, magnetColorRef.current)
        if (p.dragging) onDropMagnet(preset, e.clientX, e.clientY)
        else onAddMagnet(preset)
      } else {
        if (p.dragging) onDropPaper(PAPERS[p.i].kind, paperStyleRef.current, e.clientX, e.clientY)
        else onAddPaper(PAPERS[p.i].kind, paperStyleRef.current)
      }
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [onAddMagnet, onDropMagnet, onAddPaper, onDropPaper, pxPerUnit])
  const startPress = (what: Grabbed['what'], i: number) => (e: ReactPointerEvent) => {
    if (e.button !== 0) return
    e.preventDefault() // no native image drag
    press.current = { what, i, x: e.clientX, y: e.clientY, dragging: false }
  }
  const onKey = (add: () => void) => (e: ReactKeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      add()
    }
  }

  const openNow = (s: Section) => {
    window.clearTimeout(closeTimer.current)
    setOpen(s)
  }
  const closeSoon = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setOpen(null), 180)
  }

  // onPick: clicking the button itself adds the item its icon is showing.
  // grab: the same item can be dragged straight off the button onto the fridge.
  const item = (s: Section, label: string, icon: ReactNode, panel: ReactNode, onPick?: () => void, grab?: Grabbed) => (
    <div className="tool-item" onMouseEnter={() => openNow(s)} onMouseLeave={closeSoon}>
      <button
        className={`tool-btn${open === s ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open === s}
        // a press on a grabbable button adds (or drops) it on release; click is then only for the keyboard
        onPointerDown={grab ? startPress(grab.what, grab.i) : undefined}
        onClick={(e) => {
          if (grab && e.detail !== 0) return
          if (onPick) onPick()
          else setOpen(open === s ? null : s)
        }}
      >
        {icon}
      </button>
      {open === s && (
        <div className="tool-panel" role="menu">
          <p className="tool-panel-title">{label}</p>
          {panel}
        </div>
      )}
    </div>
  )

  return (
    <nav className="tool-menu" aria-label="Add to fridge">
      {item(
        'paper',
        'paper',
        paperPreview === null ? (
          <span className="icon-paper" />
        ) : (
          <Bloom className="icon-preview" src={paperThumbs[paperPreview]} swapKey={paperPreview} />
        ),
        <>
        <Swatches colors={PAPER_STYLES} value={paperStyle} onChange={(i) => i !== null && setPaperStyle(i)} onPreview={setPaperHover} label="paper" />
        <div className="option-grid">
          {PAPERS.map((p, i) => (
            <button
              key={p.kind}
              className="option-tile"
              aria-label={`Add a ${p.label}`}
              title={p.label}
              onPointerEnter={() => setPaperPreview(i)}
              onPointerDown={startPress('paper', i)}
              onKeyDown={onKey(() => onAddPaper(p.kind, style))}
            >
              <Bloom
                className="paper-thumb"
                src={paperThumbs[i]}
                // dealt in once it has actually drawn, not while it's still blank
                // (an image that's already there never fires load, so check that first)
                imgRef={dealIn}
                style={{ ['--tilt' as string]: `${i % 2 ? 2 : -2}deg`, ['--i' as string]: i }}
              />
            </button>
          ))}
        </div>
        </>,
        paperPreview === null ? undefined : () => onAddPaper(PAPERS[paperPreview].kind, style),
        paperPreview === null ? undefined : { what: 'paper', i: paperPreview },
      )}
      {item(
        'magnets',
        'magnets',
        magnetPreview === null ? (
          <span className="icon-magnet" />
        ) : (
          <Bloom className="icon-magnet-preview" src={magnetThumbs[magnetPreview]} swapKey={magnetPreview} />
        ),
        <>
        <Swatches colors={MAGNET_COLORS} value={magnetColor} onChange={(i) => i !== null && setMagnetColor(i)} onPreview={setMagnetHover} />
        <div className="option-grid">
          {MAGNET_SHAPES.map((m, i) => {
            const preset = presetOf(i, magnetColor)
            return (
              <button
                key={m.shape}
                className="option-tile"
                aria-label={`Add a ${preset.label}`}
                title={preset.label}
                onPointerEnter={() => setMagnetPreview(i)}
                onPointerDown={startPress('magnet', i)}
                onKeyDown={onKey(() => onAddMagnet(preset))}
              >
                <Bloom className="magnet-thumb" src={magnetThumbs[i]} />
              </button>
            )
          })}
        </div>
        </>,
        magnetPreview === null ? undefined : () => onAddMagnet(presetOf(magnetPreview, magnetColor)),
        magnetPreview === null ? undefined : { what: 'magnet', i: magnetPreview },
      )}
      <div className="tool-item" ref={trashWrap}>
      <button
        className={`tool-btn trash-btn${clearArmed ? ' is-clearing' : ''}`}
        aria-label={clearArmed ? 'click again to clear the fridge' : 'trash'}
        title={clearArmed ? undefined : 'Drag a magnet or note here to throw it away, or click to clear the fridge'}
        onClick={clickTrash}
      >
        <svg className="icon-trash" viewBox="6.5 7 19 19" aria-hidden="true">
          <defs>
            {/* Same silver as the plus, a shade deeper so the bin's outline reads at a glance */}
            <linearGradient id="trash-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#c4c8ce" />
              <stop offset="50%" stopColor="#7d828a" />
              <stop offset="100%" stopColor="#6a6f77" />
            </linearGradient>
          </defs>
          <g className="trash-lid" fill="url(#plus-fill)" stroke="url(#trash-rim)" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M14 10.6v-0.7a1.1 1.1 0 0 1 1.1-1.1h1.8a1.1 1.1 0 0 1 1.1 1.1v0.7" fill="none" />
            <rect x="9.4" y="10.6" width="13.2" height="2.3" rx="1.15" />
          </g>
          <path
            d="M10.9 13.9h10.2l-0.9 8.7a1.7 1.7 0 0 1-1.7 1.5h-5a1.7 1.7 0 0 1-1.7-1.5z"
            fill="url(#plus-fill)"
            stroke="url(#trash-rim)"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path className="trash-slits" d="M14.3 16.3v5.4M17.7 16.3v5.4" stroke="#7d828a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {clearArmed && (
        <div className="tool-panel trash-confirm" role="status">
          <p className="tool-panel-title">are you sure?</p>
          <p>click the bin again to clear everything off the fridge.</p>
        </div>
      )}
      </div>
      {item(
        'extras',
        'extras',
        <svg className="icon-plus" viewBox="0 0 32 32" aria-hidden="true">
          <defs>
            <linearGradient id="plus-rim" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="45%" stopColor="#a9adb3" />
              <stop offset="70%" stopColor="#eef0f2" />
              <stop offset="100%" stopColor="#8f939a" />
            </linearGradient>
            <radialGradient id="plus-fill" cx="35%" cy="28%" r="80%">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
              <stop offset="100%" stopColor="#c9ccd2" stopOpacity="0.25" />
            </radialGradient>
          </defs>
          <circle cx="16" cy="16" r="14.5" fill="url(#plus-fill)" stroke="url(#plus-rim)" strokeWidth="1.5" />
          <path d="M16 10v12M10 16h12" stroke="#9a9ea5" strokeWidth="2" strokeLinecap="round" />
        </svg>,
        <div className="extras-list">
          <button className="extras-option" disabled>
            <span className="extras-plus">+</span>
            <span>
              <span className="option-label">upload your own</span>
              <span className="option-hint">coming soon</span>
            </span>
          </button>
        </div>,
      )}
      {ghost &&
        createPortal(
          <img
            ref={ghostRef}
            className="drag-ghost"
            src={thumbOf(ghost)}
            alt=""
            style={{ left: ghost.x, top: ghost.y, width: ghost.w }}
          />,
          document.body,
        )}
    </nav>
  )
}

/**
 * A thumbnail that, when its picture changes (hovering or picking another
 * colour or style), sweeps the new one in across the old at a slant, with a
 * glossy highlight riding along its leading edge, like light gliding over
 * chrome, instead of swapping in one go.
 *
 * Each new picture is its own layer that sweeps in over the ones below, so
 * running quickly across colours chains the sweeps instead of cutting them
 * off; once a layer has covered the tile, everything under it goes. The wipe
 * is a soft-edged slanted mask slid across, with the picture inside slid back
 * by the same amount so it stays put. Only sliding is animated, which the
 * browser can do off the main thread, so it stays smooth even while the 3D
 * fridge is busy.
 *
 * A change of `swapKey` (the sidebar button showing a different shape or note,
 * not a new colour) swaps straight away, so the button keeps up with the pointer.
 */
function Bloom({
  src,
  className,
  style,
  imgRef,
  swapKey,
}: {
  src: string
  className: string
  style?: CSSProperties
  imgRef?: (el: HTMLImageElement | null) => void
  swapKey?: number
}) {
  const [layers, setLayers] = useState(() => [{ id: 0, src, blooming: false }])
  const nextId = useRef(1)
  const lastKey = useRef(swapKey)
  useLayoutEffect(() => {
    const swapped = lastKey.current !== swapKey
    lastKey.current = swapKey
    setLayers((ls) => {
      if (ls[ls.length - 1].src === src) return ls
      if (swapped || prefersReducedMotion()) return [{ id: ls[0].id, src, blooming: false }]
      return [...ls.slice(-4), { id: nextId.current++, src, blooming: true }]
    })
  }, [src, swapKey])
  const settle = (id: number) => setLayers((ls) => ls.slice(ls.findIndex((l) => l.id === id)).map((l) => (l.id === id ? { ...l, blooming: false } : l)))
  return (
    // (the shadow goes on this wrapper, once, so stacked layers never double it up)
    <span className={`bloom for-${className}`}>
      {layers.map((l) => (
        <span key={l.id} className={`bloom-layer${l.blooming ? ' is-blooming' : ''}`} ref={l.blooming ? (el) => { if (el) spread(el, () => settle(l.id)) } : undefined}>
          <span className="bloom-inner">
            {/* (only the first picture gets the ref: it's the one dealt in when the panel opens) */}
            <img className={className} src={l.src} style={style} alt="" draggable={false} ref={l.id === 0 ? imgRef : undefined} />
            {/* the highlight, cut to the picture's own shape */}
            {l.blooming && (
              <span className="bloom-shine" style={{ ...style, maskImage: `url(${l.src})`, WebkitMaskImage: `url(${l.src})` }}>
                <i />
              </span>
            )}
          </span>
        </span>
      ))}
    </span>
  )
}

/** Decodes a picture now and keeps it, so showing it later doesn't wait on decoding. */
const warmed: HTMLImageElement[] = []
function warm(src: string) {
  const img = new Image()
  img.src = src
  img.decode().catch(() => {})
  warmed.push(img)
}

const SWEEP_MS = 550

function spread(layer: HTMLElement, done: () => void) {
  if (layer.dataset.spread) return // (ref callbacks run again on every render)
  layer.dataset.spread = '1'
  const inner = layer.firstElementChild as HTMLElement
  const shine = inner.querySelector<HTMLElement>('.bloom-shine i')
  // The wipe's soft edge (about 0.9 to 1.2 picture widths past the picture's
  // left side, see .bloom-layer.is-blooming, and slanted) starts fully clear of
  // the picture and ends fully past it, slant and tilted notes included, so no
  // sliver of the old colour is left when it settles
  const w = inner.getBoundingClientRect().width
  const from = -1.3 * w
  const to = 0.35 * w
  // (quick off the mark, so the new colour shows the moment it's hovered, then
  // easing into place; held at the end until the settled picture is on screen:
  // letting go first snapped the wipe back for a frame and flashed the old colour)
  const timing = { duration: SWEEP_MS, easing: 'cubic-bezier(0.2, 0.75, 0.3, 1)', fill: 'forwards' } as const
  const moves = [
    layer.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], timing),
    inner.animate([{ transform: `translateX(${-from}px)` }, { transform: `translateX(${-to}px)` }], timing),
    shine?.animate([{ transform: `translateX(${from + 0.65 * w}px)` }, { transform: `translateX(${to + 0.65 * w}px)` }], timing), // (just behind the edge, on the new colour, and off the picture by the end)
  ]
  moves[0]!.onfinish = () => {
    if (layer.isConnected) flushSync(done)
    for (const m of moves) m?.cancel()
  }
}
