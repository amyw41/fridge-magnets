/**
 * The trash button in the menu. Things dragged around on the fridge check it
 * directly (the canvas holds the pointer while dragging, so the button never
 * sees a hover of its own).
 */
const el = () => document.querySelector<HTMLElement>('.trash-btn')

export function isOverTrash(clientX: number, clientY: number) {
  const r = el()?.getBoundingClientRect()
  if (!r || r.width === 0) return false
  const pad = 10 // a little forgiving round the edge
  return clientX >= r.left - pad && clientX <= r.right + pad && clientY >= r.top - pad && clientY <= r.bottom + pad
}

/** Lid open while something held is over it; lit up while anything is being dragged */
export function setTrashState(dragging: boolean, over: boolean) {
  const b = el()
  if (!b) return
  b.classList.toggle('is-armed', dragging)
  b.classList.toggle('is-hot', over)
}
