import { createRoot, type ReconcilerRoot } from '@react-three/fiber'
import { FRIDGE_MODELS } from '../fridgeModels'
import { FLOOR_Y } from './Fridge'
import Fridge from './Fridge'
import Studio from './Studio'

/** Pixels per world unit: the same for every model, so their sizes compare */
const ZOOM = 16
/** Tile grid, matching .fridge-styles in index.css */
const TILE_W = 98
const TILE_H = 92
const GAP = 6
const COLS = 2
const ROWS = Math.ceil(FRIDGE_MODELS.length / COLS)
export const PREVIEW_W = COLS * TILE_W + (COLS - 1) * GAP
export const PREVIEW_H = ROWS * TILE_H + (ROWS - 1) * GAP
/** Gap between a fridge's feet and the bottom of its tile, in px */
const FOOT = 4

/** Every model, each standing at the bottom of its own tile */
function PreviewScene({ color }: { color: string }) {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[3, 5, 4]} intensity={1.2} />
      <directionalLight position={[-3, 4, -5]} intensity={0.5} />
      <Studio resolution={64} />
      {FRIDGE_MODELS.map((m, i) => {
        // centre of this tile's bottom edge, in world units from the picture's centre
        const col = i % COLS
        const row = Math.floor(i / COLS)
        const px = col * (TILE_W + GAP) + TILE_W / 2 - PREVIEW_W / 2
        const py = row * (TILE_H + GAP) + TILE_H - FOOT - PREVIEW_H / 2
        return (
          <group key={m.id} position={[px / ZOOM, -py / ZOOM, 0]}>
            {/* turned and tipped about its own feet, so depth and handles read */}
            <group rotation={[0.1, -0.38, 0]}>
              <group position={[0, -FLOOR_Y, 0]}>
                <Fridge look={{ model: m.id, color }} preview />
              </group>
            </group>
          </group>
        )
      })}
    </>
  )
}

/*
 * The style tiles' pictures are real 3D renders of each model, made once per
 * colour into a still image, like the magnet thumbnails. One hidden 3D view
 * is kept for this (a live view per tile, or even one live view in the menu,
 * failed to draw on some computers).
 */
let root: ReconcilerRoot<HTMLCanvasElement> | null = null
let canvas: HTMLCanvasElement | null = null
const cache = new Map<string, string>()
let queue: Promise<unknown> = Promise.resolve()

const nextFrame = () => new Promise((r) => requestAnimationFrame(r))

async function draw(color: string) {
  if (!root) {
    canvas = document.createElement('canvas')
    root = createRoot(canvas)
    await root.configure({
      size: { width: PREVIEW_W, height: PREVIEW_H, top: 0, left: 0 },
      dpr: 2,
      orthographic: true,
      camera: { zoom: ZOOM, position: [0, 0, 30], near: 0.1, far: 60 },
      frameloop: 'never',
      gl: { alpha: true, antialias: true, preserveDrawingBuffer: true },
    })
  }
  const store = root.render(<PreviewScene color={color} />)
  // a few frames, so the studio reflections and the new colour are in place
  for (let i = 0; i < 4; i++) {
    await nextFrame()
    store.getState().advance(performance.now())
  }
  return canvas!.toDataURL('image/png')
}

/** Picture of every fridge style in this colour, laid out to sit over the tile grid */
export function fridgeStylesPicture(color: string): Promise<string> {
  const hit = cache.get(color)
  if (hit) return Promise.resolve(hit)
  const job = queue.then(() => cache.get(color) ?? draw(color)).then((url) => {
    cache.set(color, url)
    return url
  })
  queue = job.catch(() => undefined)
  return job
}
