import * as THREE from 'three'
import { DOOR_Z, FRIDGE } from './components/Fridge'

/**
 * Lays out the landing screen so the title and the fridge read as one centered
 * group, at any window size:
 * - wide screens: title on the left, fridge on the right, the pair centered
 * - narrow / portrait screens: title centered on top, fridge centered below
 *
 * The title is placed with CSS (left/top set here); the fridge is placed by
 * pointing the camera so it lands in the right spot on screen.
 */

/** Tweak these to change the composition */
export const INTRO_LAYOUT = {
  /** Below this width-to-height ratio (or this width) the stacked layout is used */
  stackBelowAspect: 1.15,
  stackBelowWidth: 760,
  side: {
    /** Fridge width on screen, as a fraction of window width / height (the smaller wins) */
    fridgeOfWidth: 0.3,
    fridgeOfHeight: 0.48,
    /** Space between title and fridge, as a fraction of window width */
    gap: 0.05,
    /** Fridge top, as a fraction of window height from the top */
    fridgeTop: 0.17,
    /** Title top, relative to the fridge top (fraction of window height) */
    titleOffset: 0.03,
  },
  stacked: {
    fridgeOfWidth: 0.62,
    fridgeOfHeight: 0.4,
    /** Title top, fraction of window height */
    titleTop: 0.07,
    /** Space between the hint under the title and the fridge top, fraction of window height */
    gap: 0.07,
  },
}

const FOV = 40
const FRIDGE_TOP_Y = 2.2

export interface IntroPose {
  position: THREE.Vector3
  target: THREE.Vector3
}

/** Places the title element and returns the camera pose that frames the fridge to match. */
export function layoutIntro(title: HTMLElement, w: number, h: number): IntroPose {
  const L = INTRO_LAYOUT
  const stacked = w / h < L.stackBelowAspect || w < L.stackBelowWidth
  title.dataset.layout = stacked ? 'stacked' : 'side'
  const rect = title.getBoundingClientRect() // size in the chosen layout

  let fridgePx: number
  let fridgeTop: number
  let fridgeCenterX: number
  if (stacked) {
    fridgePx = Math.min(L.stacked.fridgeOfWidth * w, L.stacked.fridgeOfHeight * h)
    const top = L.stacked.titleTop * h
    title.style.left = `${(w - rect.width) / 2}px`
    title.style.top = `${top}px`
    const hint = title.querySelector<HTMLElement>('.scroll-hint')
    const hintH = hint ? hint.getBoundingClientRect().height + 16 : 0
    fridgeTop = top + rect.height + hintH + L.stacked.gap * h
    fridgeCenterX = w / 2
  } else {
    fridgePx = Math.min(L.side.fridgeOfWidth * w, L.side.fridgeOfHeight * h)
    const gap = L.side.gap * w
    const left = (w - (rect.width + gap + fridgePx)) / 2
    fridgeTop = L.side.fridgeTop * h
    title.style.left = `${left}px`
    title.style.top = `${fridgeTop + L.side.titleOffset * h}px`
    fridgeCenterX = left + rect.width + gap + fridgePx / 2
  }

  // Pixels per world unit at the door's front face, then the camera distance that gives it
  const k = fridgePx / FRIDGE.width
  const dist = h / k / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)))
  const y = FRIDGE_TOP_Y - (h / 2 - fridgeTop) / k
  const x = -(fridgeCenterX - w / 2) / k
  return {
    position: new THREE.Vector3(x, y, DOOR_Z + dist),
    target: new THREE.Vector3(x, y, 0),
  }
}
