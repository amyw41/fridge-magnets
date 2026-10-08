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
  /** How the dot itself is painted, when a flat colour won't do */
  swatch?: string
}

/** The precious metals: magnets in these are real mirror silver, gold and rose gold */
export const SILVER = '#d9dcdf'
export const GOLD = '#d6b66c'
export const ROSE_GOLD = '#e0ab98'
export const PRECIOUS = [SILVER, GOLD, ROSE_GOLD]

export const NEUTRALS: PaletteColor[] = [
  { label: 'white', color: '#f7f7f5' },
  { label: 'beige', color: '#e8dcc4' },
  { label: 'chocolate', color: '#6b4a3a' },
  { label: 'black', color: '#1d1c1f' },
  // the metals sit together at the end
  { label: 'silver', color: SILVER, metal: true, swatch: 'linear-gradient(135deg, #f6f7f8, #b7bbc1 55%, #eceef0)' },
  { label: 'gold', color: GOLD, metal: true, swatch: 'linear-gradient(135deg, #f8e6ad, #c49a45 55%, #f0d78e)' },
  { label: 'rose gold', color: ROSE_GOLD, metal: true, swatch: 'linear-gradient(135deg, #f9ddd2, #c98a74 55%, #f1c7b8)' },
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
