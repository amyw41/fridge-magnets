import * as THREE from 'three'
import { magnetMaterial, makeGeometry } from './components/Magnet'
import { FRIDGE_STYLE as S } from './fridgeStyle'
import { MAGNET_SIZE, type MagnetFinish, type MagnetShape } from './magnetLayout'

/**
 * Menu thumbnails rendered from the real magnet models, lit by a copy of the
 * studio reflections, so the menu shows exactly what lands on the fridge.
 * One small offscreen renderer draws each kind once and caches the image.
 */
const PX = 192
const cache = new Map<string, string>()
let renderer: THREE.WebGLRenderer | null = null
let envMap: THREE.Texture | null = null

/** Same softboxes as Studio.tsx, as plain glowing panels */
const PANELS: { intensity: number; position: [number, number, number]; scale: [number, number] }[] = [
  { intensity: 2, position: [0, 6, 1], scale: [8, 4] },
  { intensity: 3, position: [-5, 1, 3], scale: [1.5, 8] },
  { intensity: 2, position: [5, 1, 2], scale: [1, 8] },
  { intensity: 0.8, position: [0, 0, 6], scale: [5, 3] },
  { intensity: 1.5, position: [0, 2, -6], scale: [6, 3] },
  { intensity: 0.5, position: [0, -6, 0], scale: [10, 10] },
]

function setup() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setSize(PX, PX, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping

  const studio = new THREE.Scene()
  studio.background = new THREE.Color(S.scene.environmentBase)
  for (const p of PANELS) {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(p.scale[0], p.scale[1]),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 1, 1).multiplyScalar(p.intensity), side: THREE.DoubleSide, toneMapped: false }),
    )
    m.position.set(...p.position)
    m.lookAt(0, 0, 0)
    studio.add(m)
  }
  const pmrem = new THREE.PMREMGenerator(renderer)
  envMap = pmrem.fromScene(studio, 0.02).texture
  pmrem.dispose()
}

export function magnetThumb(shape: MagnetShape, color: string, finish: MagnetFinish): string {
  const key = `${shape}|${color}|${finish}`
  const hit = cache.get(key)
  if (hit) return hit
  try {
    if (!renderer) setup()
  } catch {
    return '' // no WebGL: the menu falls back to an empty tile
  }

  const scene = new THREE.Scene()
  scene.environment = envMap
  scene.environmentIntensity = S.scene.environmentIntensity
  scene.add(new THREE.AmbientLight(0xffffff, 0.25))
  const sun = new THREE.DirectionalLight(0xffffff, 1.2)
  sun.position.set(3, 5, 4)
  scene.add(sun)

  const mesh = new THREE.Mesh(makeGeometry(shape), new THREE.MeshPhysicalMaterial(magnetMaterial(color, finish)))
  mesh.rotation.x = -0.3 // tipped back a little so the puffiness and rim show
  scene.add(mesh)

  const half = MAGNET_SIZE * 0.62
  const camera = new THREE.OrthographicCamera(-half, half, half, -half, 0.01, 10)
  camera.position.set(0, 0, 2)
  camera.lookAt(0, 0, 0)

  renderer!.render(scene, camera)
  const url = renderer!.domElement.toDataURL('image/png')
  mesh.geometry.dispose()
  ;(mesh.material as THREE.Material).dispose()
  cache.set(key, url)
  return url
}
