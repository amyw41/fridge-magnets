import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  DISH_CATEGORIES,
  emptyIngredient,
  paperBackground,
  paperDesign,
  recipeLayout,
  recipeOf,
  scaleAmount,
  totalTime,
  BODY_FONT,
  TITLE_FONT,
  SHEET_MIN,
  type Ingredient,
  type Recipe,
} from '../papers'
import type { PaperData } from './PaperNote'

/** One line of writing on screen; the paper is scaled so its ruled lines are this far apart */
const LINE_PX = 30
/** Space between the writing and every edge of the sheet (world units) */
const PAD = 0.03
/** Width of the (faint) scrollbar, which sits at the sheet's right edge */
const SCROLLBAR = 6
/** Where a ruled line falls: rows start here plus a whole number of lines */
const ROW_ORIGIN = 0.05 - 0.024 * 0.8
/** How much to make: amounts and servings show multiplied (what's saved stays as written) */
const SCALES = [
  [0.5, '½x'],
  [1, '1x'],
  [1.5, '1.5x'],
  [2, '2x'],
] as const

/**
 * Click a note to write on it: it comes up large in front of the fridge, in
 * the same paper, with a section for each part of a recipe (name and details,
 * ingredients, steps, notes). Long recipes scroll. Saves when you close it.
 */
export default function RecipeEditor({
  paper,
  onSave,
  onClose,
}: {
  paper: PaperData
  onSave: (recipe: Recipe) => void
  onClose: () => void
}) {
  const [r, setR] = useState<Recipe>(() => {
    const r = recipeOf(paper)
    return {
      ...r,
      ingredients: r.ingredients.length ? r.ingredients : [emptyIngredient()],
      steps: r.steps.length ? r.steps : [''],
    }
  })
  const set = (patch: Partial<Recipe>) => setR((r) => ({ ...r, ...patch }))
  const [scale, setScale] = useState(1)
  const sheet = useRef<HTMLDivElement>(null)
  // which row to put the cursor in after adding one
  const focusNext = useRef<string | null>(null)

  // the note's own paper, but at least big enough to write a recipe on comfortably
  const [w0, h0] = paperDesign(paper.kind).size
  const size: [number, number] = [Math.max(w0, SHEET_MIN[0]), Math.max(h0, SHEET_MIN[1])]
  const L = recipeLayout(paper.kind, paper.style, size)
  const fit = () => Math.min(LINE_PX / L.gap, (innerHeight * 0.8) / size[1], (innerWidth * 0.9) / size[0])
  const [s, setS] = useState(fit)
  useEffect(() => {
    const r = () => setS(fit())
    addEventListener('resize', r)
    return () => removeEventListener('resize', r)
  })
  const px = (v: number) => v * s
  const line = px(L.gap)
  // the same space on every side (the name's row has room above its letters, so it starts higher);
  // on ruled paper the top snaps onto the lines instead, and the left clears the margin rule
  const ruled = paper.style === 'lined' || paper.style === 'grid'
  const top = ruled ? ROW_ORIGIN + Math.ceil((PAD - ROW_ORIGIN) / L.gap) * L.gap : PAD - L.gap * 0.55
  const left = Math.max(PAD, L.left)

  const done = () => {
    onSave({
      ...r,
      title: r.title.trim(),
      ingredients: r.ingredients.filter((g) => g.name.trim() || g.amount.trim()),
      steps: r.steps.filter((t) => t.trim()),
      notes: r.notes.trim(),
    })
    onClose()
  }
  const doneRef = useRef(done)
  doneRef.current = done
  useEffect(() => {
    const key = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && doneRef.current()
    addEventListener('keydown', key)
    return () => removeEventListener('keydown', key)
  }, [])

  const focus = (id: string) => sheet.current?.querySelector<HTMLElement>(`[data-focus="${id}"]`)?.focus()
  useLayoutEffect(() => {
    if (!focusNext.current) return
    focus(focusNext.current)
    focusNext.current = null
  })
  useEffect(() => {
    focus(paper.title ? 'ing-0-name' : 'title')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setIng = (i: number, patch: Partial<Ingredient>) =>
    set({ ingredients: r.ingredients.map((g, j) => (j === i ? { ...g, ...patch } : g)) })
  const addIng = (at: number) => {
    set({ ingredients: [...r.ingredients.slice(0, at), emptyIngredient(), ...r.ingredients.slice(at)] })
    focusNext.current = `ing-${at}-amount`
  }
  const removeIng = (i: number) => {
    set({ ingredients: r.ingredients.length > 1 ? r.ingredients.filter((_, j) => j !== i) : [emptyIngredient()] })
    focusNext.current = `ing-${Math.max(0, i - 1)}-name`
  }
  const addStep = (at: number) => {
    set({ steps: [...r.steps.slice(0, at), '', ...r.steps.slice(at)] })
    focusNext.current = `step-${at}`
  }
  const removeStep = (i: number) => {
    set({ steps: r.steps.length > 1 ? r.steps.filter((_, j) => j !== i) : [''] })
    focusNext.current = `step-${Math.max(0, i - 1)}`
  }
  // Enter starts a new row; Backspace in an empty one removes it
  const rowKeys = (onEnter: () => void, empty: boolean, onRemove: () => void) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onEnter()
    } else if (e.key === 'Backspace' && empty) {
      e.preventDefault()
      onRemove()
    }
  }
  const scaled = scale !== 1
  const total = totalTime(r)

  return (
    <div className="recipe-backdrop" onPointerDown={(e) => e.target === e.currentTarget && done()}>
      <div
        ref={sheet}
        className="recipe-sheet"
        style={{
          width: px(size[0]),
          height: px(size[1]),
          backgroundImage: `url(${paperBackground(paper.kind, paper.style, size)})`,
          color: L.ink,
          fontFamily: BODY_FONT,
          ['--line' as string]: `${line}px`,
        }}
      >
        <div
          className="recipe-scroll"
          style={{
            left: px(left),
            // runs to the sheet's edge so the scrollbar sits out there, past the close button
            right: 0,
            paddingRight: px(PAD) - SCROLLBAR,
            top: px(top),
            bottom: px(PAD),
            fontSize: px(L.bodySize),
          }}
        >
          <div className="recipe-head">
            <input
              data-focus="title"
              className="recipe-title"
              value={r.title}
              maxLength={80}
              placeholder="(recipe name)"
              style={{ fontSize: px(L.titleSize), fontFamily: TITLE_FONT }}
              onChange={(e) => set({ title: e.target.value })}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                e.preventDefault()
                focus('ing-0-amount')
              }}
            />
            <select
              className={`recipe-pill recipe-category${r.category ? '' : ' is-empty'}`}
              value={r.category}
              aria-label="what kind of dish"
              onChange={(e) => set({ category: e.target.value })}
            >
              <option value="">(category)</option>
              {DISH_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="recipe-row recipe-rating" role="radiogroup" aria-label="rating">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                role="radio"
                aria-checked={r.rating === n}
                aria-label={`${n} star${n > 1 ? 's' : ''}`}
                className={n <= r.rating ? 'is-on' : ''}
                // clicking the current rating again clears it
                onClick={() => set({ rating: r.rating === n ? 0 : n })}
              >
                ★
              </button>
            ))}
          </div>

          <div className="recipe-row recipe-details">
            <span className="recipe-label">prep</span>
            <Minutes value={r.prep} onChange={(prep) => set({ prep })} />
            <span className="recipe-label">cook</span>
            <Minutes value={r.cook} onChange={(cook) => set({ cook })} />
            <span className="recipe-label">total</span>
            <span className={total ? '' : 'recipe-faint'}>{total || '–'}</span>
            <span className="recipe-label">serves</span>
            <input
              className="recipe-small"
              value={scaled ? scaleAmount(r.serves, scale) : r.serves}
              readOnly={scaled}
              maxLength={12}
              inputMode="numeric"
              placeholder="(#)"
              aria-label="serves"
              onChange={(e) => set({ serves: e.target.value })}
            />
          </div>

          <div className="recipe-row recipe-scales">
              {SCALES.map(([k, label]) => (
                <button key={k} className={`recipe-chip${scale === k ? ' is-on' : ''}`} onClick={() => setScale(k)}>
                  <span>{label}</span>
                </button>
              ))}
          </div>

          <div className="recipe-divider" />
          <p className="recipe-heading">ingredients</p>
          {r.ingredients.map((g, i) => (
            <div className={`recipe-ing${g.checked ? ' is-checked' : ''}`} key={i}>
              <button
                className="recipe-check"
                role="checkbox"
                aria-checked={!!g.checked}
                aria-label="got it"
                tabIndex={-1}
                onClick={() => setIng(i, { checked: !g.checked })}
              />
              <input
                data-focus={`ing-${i}-amount`}
                className="recipe-amount"
                value={scaled ? scaleAmount(g.amount, scale) : g.amount}
                readOnly={scaled}
                placeholder="(amount)"
                maxLength={40}
                onChange={(e) => setIng(i, { amount: e.target.value })}
                onKeyDown={rowKeys(() => focus(`ing-${i}-name`), !g.amount && !g.name, () => removeIng(i))}
              />
              <input
                data-focus={`ing-${i}-name`}
                className="recipe-name"
                value={g.name}
                placeholder="(ingredient)"
                maxLength={120}
                onChange={(e) => setIng(i, { name: e.target.value })}
                onKeyDown={rowKeys(() => addIng(i + 1), !g.amount && !g.name, () => removeIng(i))}
              />
              <button className="recipe-remove" aria-label="remove ingredient" tabIndex={-1} onClick={() => removeIng(i)}>
                ×
              </button>
            </div>
          ))}
          <button className="recipe-add" onClick={() => addIng(r.ingredients.length)}>
            <span>+ ingredient</span>
          </button>

          <div className="recipe-divider" />
          <p className="recipe-heading">steps</p>
          {r.steps.map((t, i) => (
            <div className="recipe-step" key={i}>
              <span className="recipe-num">{i + 1}.</span>
              <AutoText
                id={`step-${i}`}
                value={t}
                line={line}
                placeholder="(what to do)"
                onChange={(v) => set({ steps: r.steps.map((x, j) => (j === i ? v.replace(/\n/g, ' ') : x)) })}
                onKeyDown={rowKeys(() => addStep(i + 1), !t, () => removeStep(i))}
              />
              <button className="recipe-remove" aria-label="remove step" tabIndex={-1} onClick={() => removeStep(i)}>
                ×
              </button>
            </div>
          ))}
          <button className="recipe-add" onClick={() => addStep(r.steps.length)}>
            <span>+ step</span>
          </button>

          <div className="recipe-divider" />
          <p className="recipe-heading">notes</p>
          <div className="recipe-step">
            <AutoText
              id="notes"
              value={r.notes}
              line={line}
              maxLength={2000}
              placeholder="(swaps, tips, where it's from…)"
              onChange={(notes) => set({ notes })}
            />
          </div>
        </div>
        <button className="recipe-close" aria-label="close" onClick={done}>
          ×
        </button>
      </div>
    </div>
  )
}

/** A time in minutes */
function Minutes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <span className="recipe-minutes">
      <input
        className="recipe-small"
        value={value}
        maxLength={4}
        inputMode="numeric"
        placeholder="(#)"
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      />
      <span className="recipe-faint">min</span>
    </span>
  )
}

/** Writing that wraps onto as many ruled lines as it needs (steps, notes) */
function AutoText({
  id,
  value,
  line,
  placeholder,
  maxLength = 600,
  onChange,
  onKeyDown,
}: {
  id: string
  value: string
  line: number
  placeholder: string
  maxLength?: number
  onChange: (v: string) => void
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const t = ref.current!
    t.style.height = '0px'
    t.style.height = `${Math.max(1, Math.floor(t.scrollHeight / line + 0.3)) * line}px`
  }, [value, line])
  return (
    <textarea
      ref={ref}
      data-focus={id}
      className="recipe-step-text"
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}
