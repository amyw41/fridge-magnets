import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { magnetThumb } from '../magnetThumbs'
import type { MagnetFinish, MagnetShape } from '../magnetLayout'
import { MAGNET_SIZE } from '../magnetLayout'
import { PALETTE, PRECIOUS, SILVER } from '../palette'
import { PAPER_STYLES, paperThumb, PAPERS, type PaperKind, type PaperStyleId } from '../papers'

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

/** A grid of colour dots. With `optional`, clicking the picked one again unpicks it. */
function Swatches({
  colors,
  value,
  onChange,
  optional = false,
  label = 'colour',
  className = '',
}: {
  colors: { label: string; color: string; swatch?: string }[]
  value: number | null
  onChange: (i: number | null) => void
  optional?: boolean
  label?: string
  className?: string
}) {
  return (
    <div className={`tool-swatches ${className}`} role="radiogroup" aria-label={label}>
      {colors.map((c, i) => (
        <button
          key={c.label}
          role="radio"
          aria-checked={i === value}
          aria-label={c.label}
          title={c.label}
          className={`fridge-swatch tool-swatch${i === value ? ' is-active' : ''}`}
          style={{ background: c.swatch ?? c.color }}
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
}: {
  /** Tapped: put it in the nearest free spot */
  onAddMagnet: (p: MagnetPreset) => void
  /** Dragged out and let go at this screen point */
  onDropMagnet: (p: MagnetPreset, clientX: number, clientY: number) => void
  onAddPaper: (kind: PaperKind, style: PaperStyleId) => void
  onDropPaper: (kind: PaperKind, style: PaperStyleId, clientX: number, clientY: number) => void
  /** Screen pixels per world unit on the door right now */
  pxPerUnit: () => number
}) {
  const [open, setOpen] = useState<Section | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)
  // Chosen colours, kept while the panels open and close
  const [magnetColor, setMagnetColor] = useState(MAGNET_COLORS.findIndex((c) => c.color === SILVER)) // a silver star
  const [paperStyle, setPaperStyle] = useState(1) // lined
  const magnetThumbs = useMemo(
    () => MAGNET_SHAPES.map((_, i) => { const p = presetOf(i, magnetColor); return magnetThumb(p.shape, p.color, p.finish) }),
    [magnetColor],
  )
  const style = PAPER_STYLES[paperStyle].id
  const paperThumbs = useMemo(() => PAPERS.map((p) => paperThumb(p.kind, style)), [style])
  const thumbOf = (g: Grabbed) => (g.what === 'magnet' ? magnetThumbs : paperThumbs)[g.i]
  // Each button shows whichever option was last hovered in its panel
  const [magnetPreview, setMagnetPreview] = useState<number | null>(0) // starts on the silver star
  // starts on the square note, so the button shows (and adds) a real option straight away
  const [paperPreview, setPaperPreview] = useState<number | null>(0)

  // Drag an option out of the panel: a copy follows the cursor, at the size it
  // will be on the fridge, until it's let go
  const [ghost, setGhost] = useState<(Grabbed & { x: number; y: number; w: number }) | null>(null)
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
      }
      if (!p.dragging) return
      // (magnet thumbnails have a little margin round the magnet)
      const units = p.what === 'magnet' ? MAGNET_SIZE * 1.24 : PAPERS[p.i].size[0]
      setGhost({ what: p.what, i: p.i, x: e.clientX, y: e.clientY, w: Math.max(28, pxPerUnit() * units) })
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

  // onPick: clicking the button itself adds the item its icon is showing
  const item = (s: Section, label: string, icon: ReactNode, panel: ReactNode, onPick?: () => void) => (
    <div className="tool-item" onMouseEnter={() => openNow(s)} onMouseLeave={closeSoon}>
      <button
        className={`tool-btn${open === s ? ' is-open' : ''}`}
        aria-label={label}
        aria-expanded={open === s}
        onClick={() => (onPick ? onPick() : setOpen(open === s ? null : s))}
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
          <img className="icon-preview" src={paperThumbs[paperPreview]} alt="" draggable={false} />
        ),
        <>
        <Swatches colors={PAPER_STYLES} value={paperStyle} onChange={(i) => i !== null && setPaperStyle(i)} label="paper" />
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
              <img
                className="paper-thumb"
                src={paperThumbs[i]}
                alt=""
                draggable={false}
                style={{ rotate: `${i % 2 ? 2 : -2}deg` }}
              />
            </button>
          ))}
        </div>
        </>,
        paperPreview === null ? undefined : () => onAddPaper(PAPERS[paperPreview].kind, style),
      )}
      {item(
        'magnets',
        'magnets',
        magnetPreview === null ? (
          <span className="icon-magnet" />
        ) : (
          <img className="icon-magnet-preview" src={magnetThumbs[magnetPreview]} alt="" draggable={false} />
        ),
        <>
        <Swatches colors={MAGNET_COLORS} value={magnetColor} onChange={(i) => i !== null && setMagnetColor(i)} />
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
                <img className="magnet-thumb" src={magnetThumbs[i]} alt="" draggable={false} />
              </button>
            )
          })}
        </div>
        </>,
        magnetPreview === null ? undefined : () => onAddMagnet(presetOf(magnetPreview, magnetColor)),
      )}
      <button className="tool-btn trash-btn" aria-label="trash" title="Drag a magnet or note here to throw it away">
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
