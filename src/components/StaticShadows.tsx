import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'

/**
 * Render the shadow map once instead of every frame. Everything that casts a
 * shadow (the fridge body, handles, dials, coils) is static, and magnets
 * use their own fake contact shadow, so re-rendering it per frame was pure
 * cost. If you add something that moves *and* casts shadows, set
 * `gl.shadowMap.needsUpdate = true` whenever it moves.
 */
export default function StaticShadows() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.shadowMap.autoUpdate = false
    gl.shadowMap.needsUpdate = true
    return () => {
      gl.shadowMap.autoUpdate = true
    }
  }, [gl])
  return null
}
