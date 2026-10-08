import { MeshReflectorMaterial } from '@react-three/drei'
import { FRIDGE_STYLE as S } from '../fridgeStyle'

/**
 * A big glossy white floor under the fridge that mirrors it softly, like a
 * white photo studio. Fog (set in App) fades its far edge into the background
 * so there is no visible horizon line.
 */
export default function GlossyFloor({ y, simple = false }: { y: number; simple?: boolean }) {
  // The mirror redraws the whole scene a second time every frame. On slower
  // computers the floor is plain gloss-free white instead, which looks almost
  // the same from the front.
  if (simple) {
    return (
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={S.floor.color} emissive={S.floor.color} emissiveIntensity={S.floor.brightness} roughness={1} />
      </mesh>
    )
  }
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} receiveShadow>
      <planeGeometry args={[80, 80]} />
      <MeshReflectorMaterial
        color={S.floor.color}
        emissive={S.floor.color}
        emissiveIntensity={S.floor.brightness}
        mirror={S.floor.mirror}
        blur={[S.floor.blur, S.floor.blur / 4]}
        mixBlur={1}
        mixStrength={0.8}
        resolution={S.floor.resolution}
        roughness={S.floor.roughness}
        metalness={0}
        depthScale={0.6}
        minDepthThreshold={0.4}
        maxDepthThreshold={1.2}
      />
    </mesh>
  )
}
