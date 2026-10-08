import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { FRIDGE_COLORS, FRIDGE_MODELS, fridgeModel, type FridgeLook } from '../fridgeModels'
import { fridgeStylesPicture, PREVIEW_H, PREVIEW_W } from './FridgeThumb'

/**
 * Glass pop-up for changing the fridge itself, opened by clicking a bare
 * spot on the fridge. Closes on Escape or a click anywhere else.
 */
export default function FridgeMenu({
  at,
  look,
  onChange,
  onClose,
}: {
  at: { x: number; y: number }
  look: FridgeLook
  onChange: (look: FridgeLook) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState(at)

  // Open beside the click, kept fully on screen
  useLayoutEffect(() => {
    const r = ref.current!.getBoundingClientRect()
    const m = 16
    setPos({
      x: Math.min(Math.max(at.x + 14, m), window.innerWidth - r.width - m),
      y: Math.min(Math.max(at.y - r.height / 2, m), window.innerHeight - r.height - m),
    })
  }, [at])

  useEffect(() => {
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('pointerdown', down, true)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', down, true)
      window.removeEventListener('keydown', key)
    }
  }, [onClose])

  const model = fridgeModel(look.model)

  // Real renders of every style in the current colour (keeps the last picture until the new one is ready)
  const [picture, setPicture] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    fridgeStylesPicture(look.color).then(
      (url) => live && setPicture(url),
      () => {}, // no 3D available: the tiles stay plain
    )
    return () => {
      live = false
    }
  }, [look.color])

  return (
    <div ref={ref} className="fridge-menu" style={{ left: pos.x, top: pos.y }} role="dialog" aria-label="Customize fridge">
      <p className="tool-panel-title">style</p>
      <div className="fridge-styles">
        {FRIDGE_MODELS.map((m) => {
          const active = m.id === model.id
          return (
            <button
              key={m.id}
              className={`fridge-style${active ? ' is-active' : ''}`}
              title={m.label}
              aria-label={m.label}
              aria-pressed={active}
              onClick={() => !active && onChange({ model: m.id, color: look.color })}
            />
          )
        })}
        {picture && (
          <img className="fridge-styles-preview" src={picture} alt="" width={PREVIEW_W} height={PREVIEW_H} draggable={false} />
        )}
      </div>
      <p className="tool-panel-title">colour</p>
      <div className="fridge-colors">
        {FRIDGE_COLORS.map((c) => (
          <button
            key={c.color}
            className={`fridge-swatch${c.color === look.color ? ' is-active' : ''}`}
            style={{ background: c.color }}
            title={c.label}
            aria-label={c.label}
            aria-pressed={c.color === look.color}
            onClick={() => onChange({ model: model.id, color: c.color })}
          />
        ))}
      </div>
    </div>
  )
}
