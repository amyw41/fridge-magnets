import { useState, type ReactNode } from 'react'
import { magnetThumb } from '../magnetThumbs'
import { SILVER } from '../palette'
import { paperThumb } from '../papers'

const SEEN = 'fridge-magnets:help-seen'

const seenBefore = () => {
  try {
    return localStorage.getItem(SEEN) === '1'
  } catch {
    return false
  }
}

/**
 * A quick guide to what everything does. It opens by itself on your first
 * visit, then folds away into a ? button in the corner for whenever you want it again.
 */
export default function HelpCard({ hidden }: { hidden: boolean }) {
  const [open, setOpen] = useState(() => !seenBefore())
  const [star] = useState(() => magnetThumb('star', SILVER, 'chrome'))
  const [note] = useState(() => paperThumb('sticky', 'lined'))

  const close = () => {
    setOpen(false)
    try {
      localStorage.setItem(SEEN, '1')
    } catch {
      // private window: it'll just show again next time
    }
  }

  const row = (icon: ReactNode, name: string, what: string) => (
    <li>
      <span className="help-icon">{icon}</span>
      <span>
        <b>{name}</b> {what}
      </span>
    </li>
  )

  return (
    <div className={`help${hidden ? ' is-hidden' : ''}${open ? ' is-open' : ''}`}>
      <section className="help-card" aria-label="How it works" aria-hidden={!open}>
        <p className="tool-panel-title">how it works</p>
        <ul>
          {row(<img src={note} alt="" className="help-note" />, 'notes', 'click to stick one on, then click it on the fridge to write your recipe.')}
          {row(<img src={star} alt="" />, 'magnets', 'click to add one, or hover to pick a shape and colour.')}
          {row(<TrashIcon />, 'trash', 'drag a magnet or note onto it to throw it away.')}
          {row(<FridgeIcon />, 'your fridge', 'click a bare spot on it to change its style and colour.')}
          {row(<MoveIcon />, 'look around', 'drag to turn, scroll to zoom, hold space and drag to slide.')}
          {row(<ShareIcon />, 'share', 'save a picture, or copy a link to your fridge. clear all empties it.')}
        </ul>
        <button className="help-done" onClick={close} tabIndex={open ? 0 : -1}>
          got it
        </button>
      </section>
      <button className="help-btn" onClick={() => setOpen(true)} aria-label="How it works" tabIndex={open ? -1 : 0}>
        ?
      </button>
    </div>
  )
}

// small silver glass icons, the same look as the sidebar's
const glass = { fill: 'url(#help-fill)', stroke: 'url(#help-rim)', strokeWidth: 1.5, strokeLinejoin: 'round' as const }
const line = { fill: 'none', stroke: '#7d828a', strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

function Defs() {
  return (
    <defs>
      <radialGradient id="help-fill" cx="35%" cy="28%" r="80%">
        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
        <stop offset="100%" stopColor="#c9ccd2" stopOpacity="0.25" />
      </radialGradient>
      <linearGradient id="help-rim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#c4c8ce" />
        <stop offset="50%" stopColor="#7d828a" />
        <stop offset="100%" stopColor="#6a6f77" />
      </linearGradient>
    </defs>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="6.5 7 19 19">
      <Defs />
      <g {...glass}>
        <path d="M14 10.6v-0.7a1.1 1.1 0 0 1 1.1-1.1h1.8a1.1 1.1 0 0 1 1.1 1.1v0.7" fill="none" />
        <rect x="9.4" y="10.6" width="13.2" height="2.3" rx="1.15" />
        <path d="M10.9 13.9h10.2l-0.9 8.7a1.7 1.7 0 0 1-1.7 1.5h-5a1.7 1.7 0 0 1-1.7-1.5z" />
      </g>
      <path d="M14.3 16.3v5.4M17.7 16.3v5.4" {...line} />
    </svg>
  )
}

function FridgeIcon() {
  return (
    <svg viewBox="6.5 6.5 19 19">
      <Defs />
      <rect x="10.5" y="8" width="11" height="16" rx="3" {...glass} />
      <path d="M10.5 13.5h11M13 10.5v1.5M13 16v2.5" {...line} />
    </svg>
  )
}

function MoveIcon() {
  return (
    <svg viewBox="6.5 6.5 19 19">
      <Defs />
      <circle cx="16" cy="16" r="7.5" {...glass} />
      <path d="M8.5 16h15M16 8.5v15" {...line} strokeWidth={1.2} />
      <ellipse cx="16" cy="16" rx="3.2" ry="7.5" {...line} strokeWidth={1.2} />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg viewBox="6.5 6 19 19">
      <Defs />
      <rect x="9.6" y="15" width="12.8" height="8.4" rx="2" {...glass} />
      <path d="M16 19V8.6M12.9 11.6 16 8.5l3.1 3.1" {...line} />
    </svg>
  )
}
