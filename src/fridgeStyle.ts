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

/** How magnets look and move. */
export const MAGNET_CONFIG = {
  /** Magnet width as a fraction of the door width (0.05–0.07 is realistic) */
  sizeFraction: 0.06,
  /** Thickness as a fraction of the magnet's width */
  thickness: 0.22,
  /** How far a held magnet lifts off the door, in world units */
  liftHeight: 0.035,
  /** How fast magnets lift, settle flat and slide into place (higher = snappier) */
  snapSpeed: 16,
  /** Minimum gap kept between a magnet and anything else on the door */
  gap: 0.006,
  /** Soft contact shadow: tight and dark at rest, bigger and fainter while held */
  shadow: {
    restScale: 1.25,
    liftScale: 1.9,
    restOpacity: 0.45,
    liftOpacity: 0.25,
  },
} as const

/** Camera zoom, pan and orbit limits. */
export const CAMERA_CONFIG = {
  /** Closest / farthest orbit distance from the point being looked at */
  minDistance: 0.8,
  maxDistance: 11,
  /** Closest the camera may get to any part of the fridge */
  clearance: 0.3,
  /** Lowest the camera may go, measured above the floor */
  floorClearance: 0.3,
  /** Vertical orbit range in radians from straight overhead (π/2 = level) */
  minPolarAngle: Math.PI * 0.3,
  maxPolarAngle: Math.PI * 0.52,
  /** How far past the fridge's sides the view can be panned */
  panMargin: 0.2,

  /**
   * Zoom is exponential: each wheel event scales the distance to the point
   * under the cursor by exp(deltaY × speed). Mouse notches are ~100 px of
   * delta; trackpad pinch deltas are much smaller, hence the bigger speed.
   */
  wheelZoomSpeed: 0.0015,
  pinchZoomSpeed: 0.01,
  /** Mouse-wheel zoom eases over roughly this long; trackpad input is instant */
  wheelEaseMs: 80,
} as const
