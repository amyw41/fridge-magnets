import { useEffect, useState, type ReactNode } from 'react'
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
 * A two-step guide in the middle of the screen: first the mouse controls,
 * then what everything on the fridge does. It opens by itself once you've
 * arrived at the fridge on your first visit; the fridge waits, blurred,
 * behind it. Clicking around the card moves it on. Afterwards it lives in a ?
 * button in the corner.
 */
export default function HelpCard({ hidden }: { hidden: boolean }) {
  const [step, setStep] = useState<0 | 1 | null>(() => (seenBefore() ? null : 0))
  const [star] = useState(() => magnetThumb('star', SILVER, 'chrome'))
  const [note] = useState(() => paperThumb('sticky', 'lined'))
  const open = step !== null && !hidden
  // the page last shown, kept while the guide fades out so it doesn't flick back to page one
  const [page, setPage] = useState<0 | 1>(0)
  // which way the newest page came in: popping up when the guide opens, sliding sideways between pages
  const [enter, setEnter] = useState<'open' | 'next' | 'back'>('open')
  const go = (to: 0 | 1, how: 'open' | 'next' | 'back') => {
    setStep(to)
    setPage(to)
    setEnter(how)
  }

  const close = () => {
    setStep(null)
    try {
      localStorage.setItem(SEEN, '1')
    } catch {
      // private window: it'll just show again next time
    }
  }
  const next = () => (step === 0 ? go(1, 'next') : close())
  const back = () => step === 1 && go(0, 'back')

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
      else if (e.key === 'Enter' || e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // a name, then a line for each thing it does
  const row = (icon: ReactNode, name: string, ...what: string[]) => (
    <li>
      <span className="help-icon">{icon}</span>
      <span>
        <b>{name}</b>
        {what.map((l) => (
          <span className="guide-line" key={l}>
            {l}
          </span>
        ))}
      </span>
    </li>
  )

  return (
    <>
      <div className={`guide${open ? ' is-open' : ''}`} onClick={next} aria-hidden={!open}>
        <section
          className={`guide-card is-${enter}`}
          key={page}
          // clicks on the card itself stay on it; only clicking around it moves on
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label={page === 1 ? "what's on the fridge" : 'getting around'}
        >
          {page === 1 ? (
            <>
              <p className="tool-panel-title">what's on the fridge</p>
              <ul className="guide-list">
                {row(<FridgeIcon />, 'fridge', 'click to change the color and style!')}
                {row(<img src={note} alt="" className="help-note" />, 'notes', 'click/drag from the menu to attach to the fridge!', 'click again to write your recipes.')}
                {row(<img src={star} alt="" />, 'magnets', 'click/drag from the menu to attach to the fridge!')}
                {row(<TrashIcon />, 'trash', 'drag an item to the trash to delete it.', 'double click to clear all.')}
                {row(<ShareIcon />, 'share', 'save a picture, or copy a link to your fridge.')}
                {row(<EyeIcon />, 'reset view', 'glide back to the front of the fridge.')}
              </ul>
            </>
          ) : (
            <>
              <p className="tool-panel-title">getting around</p>
              <div className="guide-controls">
                <Control mouse="left" move="turn" name="left click + drag" what="turn the fridge" />
                <Control mouse="wheel" move="scroll" name="scroll" what="zoom in and out" />
                <Control mouse="right" move="slide" name="right click + drag" what="slide around (or hold space and drag)" />
              </div>
            </>
          )}
          <div className="guide-foot">
            <span className="guide-dots" aria-label={`step ${page + 1} of 2`}>
              <i className={page === 0 ? 'is-on' : ''} />
              <i className={page === 1 ? 'is-on' : ''} />
            </span>
            <span className="guide-buttons">
              {page === 1 && (
                <button
                  className="help-done guide-back"
                  tabIndex={open ? 0 : -1}
                  onClick={(e) => {
                    e.stopPropagation()
                    back()
                  }}
                >
                  back
                </button>
              )}
              <button
                className="help-done"
                tabIndex={open ? 0 : -1}
                onClick={(e) => {
                  e.stopPropagation()
                  next()
                }}
              >
                {page === 1 ? 'got it' : 'next'}
              </button>
            </span>
          </div>
        </section>
      </div>
      <div className={`help${hidden || open ? ' is-hidden' : ''}`}>
        <button className="help-btn" onClick={() => go(0, 'open')} aria-label="How it works" tabIndex={open ? -1 : 0}>
          ?
        </button>
      </div>
    </>
  )
}

/** One mouse control: a mouse with the part you use lit up, gently acting it out */
function Control({ mouse, move, name, what }: { mouse: 'left' | 'right' | 'wheel'; move: 'turn' | 'slide' | 'scroll'; name: string; what: string }) {
  return (
    <div className="guide-control">
      <div className={`guide-mouse is-${move}`}>
        <svg viewBox="0 0 64 72" aria-hidden="true">
          <Defs />
          <defs>
            {/* one tidy chevron, turned to follow whichever way its line runs */}
            <marker id="guide-head" viewBox="0 0 8 8" refX="5.5" refY="4" markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto-start-reverse">
              <path className="guide-arrow" d="M2 1.2L5.5 4L2 6.8" />
            </marker>
          </defs>
          {move === 'turn' && <path className="guide-arrow" d="M17 59Q32 67 47 59" markerStart="url(#guide-head)" markerEnd="url(#guide-head)" />}
          {move === 'slide' && <path className="guide-arrow" d="M14 64H50" markerStart="url(#guide-head)" markerEnd="url(#guide-head)" />}
          {move === 'scroll' && <path className="guide-arrow" d="M57 18V38" markerStart="url(#guide-head)" markerEnd="url(#guide-head)" />}
          <g className="guide-body">
            <rect x="16" y="6" width="32" height="46" rx="16" {...glass} />
            {mouse === 'left' && <path className="guide-lit" d="M32 6a16 16 0 0 0-16 16v2h16z" />}
            {mouse === 'right' && <path className="guide-lit" d="M32 6a16 16 0 0 1 16 16v2h-16z" />}
            <path d="M16 24h32M32 6v18" {...line} strokeWidth={1.2} />
            <rect className={mouse === 'wheel' ? 'guide-lit guide-wheel' : ''} x="29.5" y="10" width="5" height="9" rx="2.5" {...(mouse === 'wheel' ? {} : line)} strokeWidth={1.2} />
          </g>
        </svg>
      </div>
      <b>{name}</b>
      <span>{what}</span>
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

function EyeIcon() {
  return (
    <svg viewBox="6.5 6.5 19 19">
      <Defs />
      <path d="M8.2 16c2-3.6 4.7-5.4 7.8-5.4s5.8 1.8 7.8 5.4c-2 3.6-4.7 5.4-7.8 5.4s-5.8-1.8-7.8-5.4z" {...glass} />
      <circle cx="16" cy="16" r="2.6" {...line} />
      <circle cx="16" cy="16" r="0.9" fill="#7d828a" />
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
