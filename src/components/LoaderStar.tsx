import { useState } from 'react'
import { magnetThumb } from '../magnetThumbs'
import { SILVER } from '../palette'

/**
 * The loading-screen star: a flat SVG twin of the puffy chrome star magnet.
 * It has to be plain HTML because it shows before the 3D scene exists, so the
 * outline is built with the same numbers as roundedStarOutline() in Magnet.tsx
 * (points at radius 0.52 / 0.3, corners rounded by 0.13 / 0.08).
 */
function roundedStarPath() {
  const corners = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 0.52 : 0.3
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2
    return [Math.cos(a) * r, -Math.sin(a) * r] as const // SVG y points down
  })
  const toward = (from: readonly number[], to: readonly number[], len: number) => {
    const dx = to[0] - from[0]
    const dy = to[1] - from[1]
    const k = len / Math.hypot(dx, dy)
    return `${(from[0] + dx * k).toFixed(4)} ${(from[1] + dy * k).toFixed(4)}`
  }
  let d = ''
  corners.forEach((c, i) => {
    const prev = corners[(i + 9) % 10]
    const next = corners[(i + 1) % 10]
    const round = i % 2 === 0 ? 0.13 : 0.08
    d += `${i === 0 ? 'M' : 'L'}${toward(c, prev, round)} Q${c[0].toFixed(4)} ${c[1].toFixed(4)} ${toward(c, next, round)} `
  })
  return d + 'Z'
}

const STAR_PATH = roundedStarPath()

export default function LoaderStar() {
  // The real 3D chrome star, rendered to a picture (the same one the magnet
  // menu shows); the flat drawing below is only a fallback without 3D
  const [picture] = useState(() => magnetThumb('star', SILVER, 'chrome'))
  if (picture) {
    // (the picture has a little margin round the star, so it's drawn larger to match)
    return <img className="loader-star" src={picture} alt="" aria-hidden="true" draggable={false} style={{ width: 55, height: 55, margin: -5.5 }} />
  }
  return (
    <svg className="loader-star" viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
      <defs>
        {/* Polished chrome: bright and dark bands like a reflected studio */}
        <linearGradient id="loader-chrome" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.28" stopColor="#c9cdd3" />
          <stop offset="0.48" stopColor="#f6f7f9" />
          <stop offset="0.66" stopColor="#8f959d" />
          <stop offset="0.86" stopColor="#dfe2e6" />
          <stop offset="1" stopColor="#a7acb3" />
        </linearGradient>
        {/* Domed highlight that makes it read as puffy */}
        <radialGradient id="loader-dome" cx="0.38" cy="0.32" r="0.55">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.25" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path d={STAR_PATH} fill="url(#loader-chrome)" stroke="#9ea3aa" strokeWidth="0.012" strokeLinejoin="round" />
      <path d={STAR_PATH} fill="url(#loader-dome)" />
    </svg>
  )
}
