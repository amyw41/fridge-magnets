import { useEffect, useRef, useState } from 'react'

type Result = 'done' | 'cancelled'

/**
 * Glass buttons in the corner: bring the view back to the front of the fridge,
 * and share the fridge (as a picture or a link that opens it). Clearing the
 * fridge lives on the sidebar's bin.
 */
export default function FridgeActions({
  hidden,
  onPicture,
  onLink,
  onResetView,
  canResetView,
}: {
  hidden: boolean
  onResetView: () => void
  /** False while already looking at the front of the fridge */
  canResetView: boolean
  onPicture: () => Promise<Result>
  onLink: () => Promise<'shared' | 'copied' | 'cancelled'>
}) {
  const [open, setOpen] = useState(false)
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

  return (
    <div ref={wrap} className={`fridge-actions${hidden ? ' is-hidden' : ''}`}>
      <button className="glass-btn" onClick={onResetView} disabled={!canResetView} title="Glide back to the front of the fridge">
        {/* a glass eye: back to looking at the front */}
        <svg className="glass-icon" viewBox="6.5 6.5 19 19" aria-hidden="true">
          <path d="M8.2 16c2-3.6 4.7-5.4 7.8-5.4s5.8 1.8 7.8 5.4c-2 3.6-4.7 5.4-7.8 5.4s-5.8-1.8-7.8-5.4z" fill="url(#action-fill)" stroke="url(#action-rim)" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="16" cy="16" r="2.6" fill="none" stroke="#7d828a" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="0.9" fill="#7d828a" />
        </svg>
        reset view
      </button>
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
    </div>
  )
}
