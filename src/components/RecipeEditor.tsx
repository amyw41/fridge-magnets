import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import {
  DISH_CATEGORIES,
  emptyIngredient,
  paperBackground,
  recipeLayout,
  recipeOf,
  scaleAmount,
  totalTime,
  BODY_FONT,
  TITLE_FONT,
  type Ingredient,
  type Recipe,
} from '../papers'
import type { PaperData } from './PaperNote'

/** The sheet's layout comes from a 607 × 637 design; everything is sized in those units (--u) */
const DESIGN: [number, number] = [607, 637]
/** The same sheet in world units, for drawing the note's paper behind it */
const SHEET: [number, number] = [0.6, 0.63]
/** How much to make: amounts and servings show multiplied (what's saved stays as written) */
const SCALES = [
  [0.5, '1/2x'],
  [1, '1x'],
  [2, '2x'],
] as const

/** As big as fits the window (up to a quarter over the design's size) */
const fit = () => Math.min((innerHeight * 0.86) / DESIGN[1], (innerWidth * 0.92) / DESIGN[0], 1.25)

/**
 * Click a note to write on it: it comes up large in front of the fridge, in
 * the same paper. The name, rating and kind of dish sit at the top with the
 * times and servings; ingredients and steps side by side; notes in a box at
 * the bottom. Long recipes scroll. Saves when you close it.
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

  const [u, setU] = useState(fit)
  useEffect(() => {
    const r = () => setU(fit())
    addEventListener('resize', r)
    return () => removeEventListener('resize', r)
  }, [])
  const ink = recipeLayout(paper.kind, paper.style).ink

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
    focus(paper.title ? 'ing-0-amount' : 'title')
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
          width: DESIGN[0] * u,
          height: DESIGN[1] * u,
          backgroundImage: `url(${paperBackground(paper.kind, paper.style, SHEET)})`,
          color: ink,
          fontFamily: BODY_FONT,
          ['--u' as string]: `${u}px`,
          ['--serif' as string]: TITLE_FONT,
        }}
      >
        <div className="recipe-scroll">
          <div className="recipe-head">
            <div>
              <input
                data-focus="title"
                className="recipe-title"
                value={r.title}
                maxLength={80}
                placeholder="Recipe Name"
                onChange={(e) => set({ title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  focus('ing-0-amount')
                }}
              />
              <div className="recipe-rating" role="radiogroup" aria-label="rating">
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
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 2.8l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.6l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z" />
                    </svg>
                  </button>
                ))}
              </div>
            </div>
            <label className={`recipe-category${r.category ? '' : ' is-empty'}`}>
              <svg viewBox="0 0 12 12" aria-hidden="true">
                <path d="M3 4.5l3 3 3-3" />
              </svg>
              <select value={r.category} aria-label="what kind of dish" onChange={(e) => set({ category: e.target.value })}>
                <option value="">Category</option>
                {DISH_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c[0].toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="recipe-facts">
            <Fact label="prep">
              <Minutes value={r.prep} onChange={(prep) => set({ prep })} />
            </Fact>
            <Fact label="cook">
              <Minutes value={r.cook} onChange={(cook) => set({ cook })} />
            </Fact>
            <Fact label="total">
              <span className={total ? '' : 'recipe-faint'}>{total || '# min'}</span>
            </Fact>
            <div className="recipe-scales">
              {SCALES.map(([k, label]) => (
                <button key={k} className={`recipe-chip${scale === k ? ' is-on' : ''}`} onClick={() => setScale(k)}>
                  {label}
                </button>
              ))}
            </div>
            <Fact label="serves" end>
              <label className="recipe-unit">
                <input
                  value={scaled ? scaleAmount(r.serves, scale) : r.serves}
                  readOnly={scaled}
                  maxLength={12}
                  inputMode="numeric"
                  placeholder="#"
                  aria-label="serves"
                  size={Math.max(1, (scaled ? scaleAmount(r.serves, scale) : r.serves).length)}
                  onChange={(e) => set({ serves: e.target.value })}
                />
                <span>people</span>
              </label>
            </Fact>
          </div>

          <div className="recipe-columns">
            <section>
              <h3 className="recipe-label">ingredients</h3>
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
                    placeholder="1 cup"
                    maxLength={40}
                    size={Math.max(5, (scaled ? scaleAmount(g.amount, scale) : g.amount).length)}
                    onChange={(e) => setIng(i, { amount: e.target.value })}
                    onKeyDown={rowKeys(() => focus(`ing-${i}-name`), !g.amount && !g.name, () => removeIng(i))}
                  />
                  <span className="recipe-faint">/</span>
                  <input
                    data-focus={`ing-${i}-name`}
                    className="recipe-name"
                    value={g.name}
                    placeholder="milk"
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
                + ingredient
              </button>
            </section>

            <section>
              <h3 className="recipe-label">steps</h3>
              {r.steps.map((t, i) => (
                <div className="recipe-step" key={i}>
                  <span className="recipe-num">{i + 1}.</span>
                  <AutoText
                    id={`step-${i}`}
                    value={t}
                    placeholder="Add the milk to a bowl..."
                    onChange={(v) => set({ steps: r.steps.map((x, j) => (j === i ? v.replace(/\n/g, ' ') : x)) })}
                    onKeyDown={rowKeys(() => addStep(i + 1), !t, () => removeStep(i))}
                  />
                  <button className="recipe-remove" aria-label="remove step" tabIndex={-1} onClick={() => removeStep(i)}>
                    ×
                  </button>
                </div>
              ))}
              <button className="recipe-add" onClick={() => addStep(r.steps.length)}>
                + step
              </button>
            </section>
          </div>

          <label className="recipe-notes">
            <span className="recipe-label">extra notes</span>
            <BulletText value={r.notes} onChange={(notes) => set({ notes })} />
          </label>
        </div>
        <button className="recipe-close" aria-label="close" onClick={done}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M2 2l12 12M14 2L2 14" />
          </svg>
        </button>
      </div>
    </div>
  )
}

/** A small label over its value (prep, cook, total, serves) */
function Fact({ label, end, children }: { label: string; end?: boolean; children: React.ReactNode }) {
  return (
    <div className={`recipe-fact${end ? ' is-end' : ''}`}>
      <span className="recipe-label">{label}</span>
      {children}
    </div>
  )
}

/** A time in minutes */
function Minutes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="recipe-unit">
      <input
        value={value}
        maxLength={4}
        inputMode="numeric"
        placeholder="#"
        size={Math.max(1, value.length)}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
      />
      <span className={value ? '' : 'recipe-faint'}>min</span>
    </label>
  )
}

/** Writing that grows to fit what's in it (steps, notes) */
function AutoText({
  id,
  value,
  placeholder,
  maxLength = 600,
  onChange,
  onKeyDown,
}: {
  id: string
  value: string
  placeholder: string
  maxLength?: number
  onChange: (v: string) => void
  onKeyDown?: (e: KeyboardEvent) => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const t = ref.current!
    t.style.height = '0px'
    t.style.height = `${t.scrollHeight}px`
  })
  return (
    <textarea
      ref={ref}
      data-focus={id}
      rows={1}
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
    />
  )
}

const BULLET = '• '
const unbullet = (s: string) => s.split('\n').map((l) => l.replace(/^•\s?/, '')).join('\n')

/** Notes as a bulleted list: every line shows a bullet, but the notes are saved as plain lines */
function BulletText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const caret = useRef<number | null>(null)
  const shown = value ? value.split('\n').map((l) => BULLET + l).join('\n') : ''
  useLayoutEffect(() => {
    const t = ref.current!
    t.style.height = '0px'
    t.style.height = `${t.scrollHeight}px`
    if (caret.current !== null) {
      t.setSelectionRange(caret.current, caret.current)
      caret.current = null
    }
  })
  // `text` as typed (bullets and all), `at` the caret in it
  const update = (text: string, at: number) => {
    const plain = unbullet(text).slice(0, 2000)
    // the caret, once every line has its bullet back
    const before = unbullet(text.slice(0, at))
    caret.current = plain ? before.length + before.split('\n').length * BULLET.length : 0
    onChange(plain)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    const t = e.currentTarget
    const at = t.selectionStart
    if (at !== t.selectionEnd) return
    const lineStart = shown.lastIndexOf('\n', at - 1) + 1
    if (e.key === 'Backspace' && at - lineStart <= BULLET.length) {
      // backspacing into a bullet joins the line onto the one above (or clears an empty first line)
      e.preventDefault()
      if (lineStart > 0) update(shown.slice(0, lineStart - 1) + shown.slice(lineStart + BULLET.length), lineStart - 1)
      else if (!value.split('\n')[0]) update(shown.slice(shown.indexOf('\n') + 1), 0)
    } else if (e.key === 'Delete' && shown[at] === '\n') {
      // deleting at a line's end pulls the next line up, without its bullet
      e.preventDefault()
      update(shown.slice(0, at) + shown.slice(at + 1 + BULLET.length), at)
    }
  }
  return (
    <textarea
      ref={ref}
      data-focus="notes"
      rows={1}
      value={shown}
      onChange={(e) => update(e.target.value, e.target.selectionStart)}
      onKeyDown={onKeyDown}
    />
  )
}
