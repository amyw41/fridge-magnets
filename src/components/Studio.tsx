import { Environment, Lightformer } from '@react-three/drei'
import { FRIDGE_STYLE as S } from '../fridgeStyle'

/**
 * Soft photo-studio reflections built from a few glowing panels, so the
 * clearcoat and chrome pick up clean highlights. Rendered once into a cube
 * map; nothing is downloaded.
 */
export default function Studio() {
  return (
    <Environment resolution={256} environmentIntensity={S.scene.environmentIntensity}>
      <color attach="background" args={[S.scene.environmentBase]} />
      {/* Big overhead softbox */}
      <Lightformer form="rect" intensity={2} position={[0, 6, 1]} scale={[8, 4, 1]} />
      {/* Tall strip lights left and right, drawing long highlights down the sides */}
      <Lightformer form="rect" intensity={3} position={[-5, 1, 3]} scale={[1.5, 8, 1]} />
      <Lightformer form="rect" intensity={2} position={[5, 1, 2]} scale={[1, 8, 1]} />
      {/* Gentle front fill and a rim from behind for the back view */}
      <Lightformer form="rect" intensity={0.8} position={[0, 0, 6]} scale={[5, 3, 1]} />
      <Lightformer form="rect" intensity={1.5} position={[0, 2, -6]} scale={[6, 3, 1]} />
      {/* Warm floor bounce */}
      <Lightformer form="rect" intensity={0.6} color="#ffd9c7" position={[0, -6, 0]} scale={[10, 10, 1]} />
    </Environment>
  )
}
