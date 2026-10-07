import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'

/**
 * Dev-only performance readout: FPS, worst frame time, and what the last
 * frame drew. Writes straight to a DOM node so it never re-renders React.
 */
export default function DevStats() {
  const gl = useThree((s) => s.gl)
  const el = useMemo(() => {
    const d = document.createElement('div')
    d.className = 'dev-stats'
    return d
  }, [])
  const acc = useRef({ frames: 0, time: 0, worst: 0 })

  useEffect(() => {
    document.body.appendChild(el)
    return () => el.remove()
  }, [el])

  // Console benchmark: `__fridgeBench()` renders frames back to back, waiting
  // for the GPU to finish each one, so it measures true per-frame cost even
  // when the tab's animation loop is throttled.
  const get = useThree((s) => s.get)
  useEffect(() => {
    const w = window as unknown as { __fridgeBench?: (n?: number) => object; __r3f?: typeof get }
    w.__r3f = get // renderer/scene access for poking at things from the console
    w.__fridgeBench = (n = 60) => {
      const { advance, gl: renderer } = get()
      const ctx = renderer.getContext()
      const pixel = new Uint8Array(4)
      const times: number[] = []
      for (let i = 0; i < n; i++) {
        const t0 = performance.now()
        advance(t0)
        ctx.readPixels(0, 0, 1, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, pixel) // blocks until the GPU is done
        times.push(performance.now() - t0)
      }
      times.sort((a, b) => a - b)
      const ms = (v: number) => Math.round(v * 100) / 100
      return {
        medianMs: ms(times[n >> 1]),
        p95Ms: ms(times[Math.floor(n * 0.95)]),
        size: `${renderer.domElement.width}x${renderer.domElement.height}`,
        draws: renderer.info.render.calls,
      }
    }
    return () => {
      delete w.__fridgeBench
      delete w.__r3f
    }
  }, [get])

  useFrame((_, dt) => {
    const a = acc.current
    a.frames++
    a.time += dt
    a.worst = Math.max(a.worst, dt)
    if (a.time < 0.5) return
    // gl.info covers the most recent render call, i.e. the main scene pass
    const { calls, triangles } = gl.info.render
    el.textContent =
      `${Math.round(a.frames / a.time)} fps · worst ${(a.worst * 1000).toFixed(1)} ms\n` +
      `${calls} draws · ${Math.round(triangles / 1000)}k tris · dpr ${gl.getPixelRatio()}`
    a.frames = 0
    a.time = 0
    a.worst = 0
  })

  return null
}
