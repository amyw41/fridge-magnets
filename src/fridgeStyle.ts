/**
 * Every tunable look value for the fridge and its studio lighting, in one place.
 *
 * Material quick reference:
 *   roughness           0 = mirror, 1 = chalky. Under a clearcoat this is the "paint" layer.
 *   clearcoat           0–1 strength of the glossy lacquer layer on top.
 *   clearcoatRoughness  0 = wet-look lacquer, higher = satin.
 *   metalness           1 for chrome, 0 for paint/plastic.
 */
export const FRIDGE_STYLE = {
  // Candy-enamel pink body: soft pastel base under a glassy clearcoat
  body: {
    color: '#ffb1c6',
    roughness: 0.35,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
  },
  // Thin gap between freezer and main door
  seam: {
    color: '#3a2228',
    roughness: 0.7,
  },
  // Handles and dial bumps
  chrome: {
    color: '#ffffff',
    metalness: 1,
    roughness: 0.08,
  },

  // Back of the fridge
  backPanel: {
    color: '#5c5458',
    roughness: 0.85,
  },
  coils: {
    color: '#141414',
    metalness: 0.6,
    roughness: 0.45,
  },
  labelPlate: {
    color: '#9da3a9',
    metalness: 0.7,
    roughness: 0.35,
  },

  // Scene and studio lighting
  scene: {
    background: '#f3ece2',
    /** Overall strength of the studio reflections on the pink and chrome */
    environmentIntensity: 1.3,
    /** Base colour behind the softboxes; shows up in chrome as the "dark" areas */
    environmentBase: '#4a3f44',
  },
} as const
