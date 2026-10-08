/**
 * The one colour palette shared by the fridge, magnets and paper, so every
 * picker shows the same dots in the same places: a row of neutrals on top,
 * then bold colours, then their pastel partners right underneath them.
 */
export interface PaletteColor {
  label: string
  color: string
  /** Brushed metal (the fridge gets a steel finish for these) */
  metal?: boolean
}

export const NEUTRALS: PaletteColor[] = [
  { label: 'white', color: '#f7f7f5' },
  { label: 'cream', color: '#f3ecdf' },
  { label: 'sand', color: '#dccfb6' },
  { label: 'stainless', color: '#d9dcdf', metal: true },
  { label: 'graphite', color: '#5a5d63', metal: true },
  { label: 'black stainless', color: '#3b3c40', metal: true },
  { label: 'black', color: '#1d1c1f' },
]

export const VIBRANTS: PaletteColor[] = [
  { label: 'red', color: '#d8403a' },
  { label: 'orange', color: '#ee8a2d' },
  { label: 'yellow', color: '#f4c92f' },
  { label: 'green', color: '#3f9b5c' },
  { label: 'blue', color: '#2f6fc4' },
  { label: 'purple', color: '#7d4fb8' },
  { label: 'magenta', color: '#d6457f' },
]

export const PASTELS: PaletteColor[] = [
  { label: 'coral', color: '#f6b3ab' },
  { label: 'peach', color: '#ffcfb0' },
  { label: 'butter', color: '#f7e1a0' },
  { label: 'mint', color: '#a8dcc5' },
  { label: 'powder blue', color: '#a9c8ea' },
  { label: 'lilac', color: '#d5c4ef' },
  { label: 'pink', color: '#ffb1c6' },
]

export const PALETTE: PaletteColor[] = [...NEUTRALS, ...VIBRANTS, ...PASTELS]
