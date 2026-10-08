import { useEffect, useRef, useState } from 'react'

type Result = 'done' | 'cancelled'

/**
 * Two glass buttons in the corner: share the fridge (as a picture or a link
 * that opens it), and clear everything off it (tap twice, so one stray click
 * can't wipe it).
 */
export default function FridgeActions({
  hidden,
  onPicture,
  onLink,
  onClear,
  empty,
}: {
  hidden: boolean
  onPicture: () => Promise<Result>
  onLink: () => Promise<'shared' | 'copied' | 'cancelled'>
  onClear: () => void
  empty: boolean
}) {
  const [open, setOpen] = useState(false)
  const [armed, setArmed] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const timer = useRef(0)
  const wrap = useRef<HTMLDivElement>(null)
  useEffect(() => () => window.clearTimeout(timer.current), [])

  // the share choices close when you click anywhere else
  useEffect(() => {
    if (!open) return
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('pointerdown', away)
    return () => window.removeEventListener('pointerdown', away)
  }, [open])

  const flash = (text: string | null, ms: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setNote(null)
      setArmed(false)
    }, ms)
    setNote(text)
  }

  const picture = async () => {
    setOpen(false)
    if ((await onPicture()) === 'done') flash('picture saved', 2200)
  }
  const link = async () => {
    setOpen(false)
    if ((await onLink()) === 'copied') flash('link copied', 2200)
  }
  const clear = () => {
    setOpen(false)
    if (!armed) {
      setArmed(true)
      flash(null, 3500)
      return
    }
    setArmed(false)
    onClear()
  }

  return (
    <div ref={wrap} className={`fridge-actions${hidden ? ' is-hidden' : ''}`}>
      <div className="share-wrap">
        <button className={`glass-btn${open ? ' is-open' : ''}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {/* silver glass like the sidebar icons: a tray with an arrow lifting out */}
          <svg className="glass-icon" viewBox="6.5 6 19 19" aria-hidden="true">
            <defs>
              <radialGradient id="action-fill" cx="35%" cy="28%" r="80%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
                <stop offset="100%" stopColor="#c9ccd2" stopOpacity="0.25" />
              </radialGradient>
              <linearGradient id="action-rim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#c4c8ce" />
                <stop offset="50%" stopColor="#7d828a" />
                <stop offset="100%" stopColor="#6a6f77" />
              </linearGradient>
            </defs>
            <rect x="9.6" y="15" width="12.8" height="8.4" rx="2" fill="url(#action-fill)" stroke="url(#action-rim)" strokeWidth="1.5" />
            <path d="M16 19V8.6M12.9 11.6 16 8.5l3.1 3.1" fill="none" stroke="#7d828a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {note ?? 'share'}
        </button>
        {open && (
          <div className="share-menu">
            <button onClick={picture}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
                <circle cx="9" cy="10" r="1.6" />
                <path d="m4.5 17.5 5-4.5 3.5 3 2.5-2 4 3.5" />
              </svg>
              save picture
            </button>
            <button onClick={link}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" />
                <path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />
              </svg>
              copy link
            </button>
          </div>
        )}
      </div>
      <button className={`glass-btn${armed ? ' is-armed' : ''}`} onClick={clear} disabled={empty && !armed}>
        {/* the sidebar's bin */}
        <svg className="glass-icon" viewBox="6.5 7 19 19" aria-hidden="true">
          <g fill="url(#action-fill)" stroke="url(#action-rim)" strokeWidth="1.5" strokeLinejoin="round">
            <path d="M14 10.6v-0.7a1.1 1.1 0 0 1 1.1-1.1h1.8a1.1 1.1 0 0 1 1.1 1.1v0.7" fill="none" />
            <rect x="9.4" y="10.6" width="13.2" height="2.3" rx="1.15" />
            <path d="M10.9 13.9h10.2l-0.9 8.7a1.7 1.7 0 0 1-1.7 1.5h-5a1.7 1.7 0 0 1-1.7-1.5z" />
          </g>
          <path d="M14.3 16.3v5.4M17.7 16.3v5.4" stroke="#7d828a" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {armed ? 'tap again to clear' : 'clear all'}
      </button>
    </div>
  )
}
