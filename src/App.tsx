import { Canvas, useFrame, type RootState } from '@react-three/fiber'
import { ContactShadows, OrbitControls, PerformanceMonitor } from '@react-three/drei'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import CameraRig, { homeCamera, INTRO_POSITION } from './components/CameraRig'
import * as THREE from 'three'
import Fridge, { DOOR_Z } from './components/Fridge'
import FridgeActions from './components/FridgeActions'
import HelpCard from './components/HelpCard'
import RecipeEditor from './components/RecipeEditor'
import FridgeMenu from './components/FridgeMenu'
import GlossyFloor from './components/GlossyFloor'
import Magnet from './components/Magnet'
import PaperNote, { type PaperData } from './components/PaperNote'
import StaticShadows from './components/StaticShadows'
import Studio from './components/Studio'
import ToolMenu, { type MagnetPreset } from './components/ToolMenu'
import WheelNavigation from './components/WheelNavigation'
import { CAMERA_CONFIG, FRIDGE_STYLE, LOAD_IN } from './fridgeStyle'
import { layoutIntro, type IntroPose } from './introLayout'
import { placePaper, type PaperKind, type PaperStyleId } from './papers'
import { SILVER } from './palette'
import { DEFAULT_LOOK, doorCentre, doorFront, setDoorFront, type FridgeLook } from './fridgeModels'
import { fridgeLink, saveFridge, savedFridge } from './fridgeSave'
import { resolveDrop, type MagnetData } from './magnetLayout'

// Starting spots keep clear of the handles on the left near the door seam
const initialMagnets: MagnetData[] = [
  { id: 1, shape: 'star', color: SILVER, finish: 'chrome', position: [0.25, 1.15] },
  { id: 2, shape: 'circle', color: '#fbfaf6', finish: 'plastic', position: [0.3, 0.4] },
  { id: 3, shape: 'star', color: SILVER, finish: 'chrome', position: [-0.25, -0.05] },
  { id: 4, shape: 'star', color: SILVER, finish: 'chrome', position: [0.3, -0.6] },
  { id: 5, shape: 'circle', color: '#fbfaf6', finish: 'plastic', position: [-0.3, -1.1] },
]

/** Reports once the scene has actually been drawn a couple of times (environment and shadows included). */
function SceneDrawn({ onDrawn }: { onDrawn: () => void }) {
  const frames = useRef(0)
  useFrame(() => {
    if (++frames.current === 3) onDrawn()
  })
  return null
}

export default function App() {
  // Picks up where you left off last visit (saved in this browser), else the starter fridge
  const [magnets, setMagnets] = useState(() => savedFridge()?.magnets ?? initialMagnets)
  const [papers, setPapers] = useState<PaperData[]>(() => savedFridge()?.papers ?? [])
  // The note open for writing a recipe on, if any
  const [writing, setWriting] = useState<number | null>(null)
  const writingPaper = papers.find((p) => p.id === writing)
  // The fridge itself: which model and colour, and where its pop-up menu is open
  const [look, setLook] = useState<FridgeLook>(() => savedFridge()?.look ?? DEFAULT_LOOK)
  useEffect(() => saveFridge({ look, magnets, papers }), [look, magnets, papers])
  const [fridgeMenuAt, setFridgeMenuAt] = useState<{ x: number; y: number } | null>(null)
  const openFridgeMenu = useCallback((x: number, y: number) => setFridgeMenuAt({ x, y }), [])
  const closeFridgeMenu = useCallback(() => setFridgeMenuAt(null), [])
  const [dragging, setDragging] = useState(false)
  const [gliding, setGliding] = useState(false)
  // Lighter drawing for slower computers: switched on automatically when the
  // frame rate drops (or forced with ?quality=low / ?quality=high in the URL)
  const [lowPower, setLowPower] = useState(() => new URLSearchParams(location.search).get('quality') === 'low')
  const forcedQuality = new URLSearchParams(location.search).has('quality')
  // The glide in from the title screen: the sidebar waits for it. Later glides
  // (switching fridge) leave the sidebar where it is.
  const [entering, setEntering] = useState(false)
  const onGlideChange = useCallback((g: boolean) => {
    setGliding(g)
    if (!g) setEntering(false)
  }, [])
  // Landing screen: close-up of the fridge with the title. Any click, scroll or
  // swipe pulls back to the full fridge (a reset glide from the intro shot).
  const [intro, setIntro] = useState(true)
  const [resetSignal, setResetSignal] = useState(0)
  // Whether the camera has been moved off the front view ("reset view" is only clickable then)
  const [awayFromFront, setAwayFromFront] = useState(false)
  const introRef = useRef(true)
  const readyRef = useRef(false) // no starting the app while the load-in curtain is still up
  // The magnets there at load snap on one by one; once that's over, this is cleared so magnets
  // added later (whose ids can match theirs, since saves renumber) always pop straight in
  const loadIn = useRef<Map<number, number> | null>(new Map(magnets.map((m, i) => [m.id, i])))

  // Load-in: a white curtain stays up until the scene has drawn and the fonts
  // are in, so nothing pops in half-built. Then everything plays in together.
  const [sceneDrawn, setSceneDrawn] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    document.fonts?.ready.then(() => setFontsReady(true))
    // Never leave someone staring at the curtain if a font or frame is slow
    const fallback = setTimeout(() => {
      setFontsReady(true)
      setSceneDrawn(true)
    }, 5000)
    return () => clearTimeout(fallback)
  }, [])

  const start = useCallback(() => {
    if (!introRef.current || !readyRef.current) return
    introRef.current = false
    setIntro(false)
    setEntering(true)
    setResetSignal((n) => n + 1)
  }, [])
  // Center the title + fridge as one group, and re-center on resize / once fonts load
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [introPose, setIntroPose] = useState<IntroPose | null>(null)
  useLayoutEffect(() => {
    if (!intro) return
    const update = () => {
      if (titleRef.current) setIntroPose(layoutIntro(titleRef.current, window.innerWidth, window.innerHeight))
    }
    update()
    document.fonts?.ready.then(update)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [intro])

  // the title only needs its font and its spot; the fridge waits for the scene too
  const titleReady = fontsReady && introPose !== null
  const ready = sceneDrawn && titleReady
  useEffect(() => {
    if (!ready || !loadIn.current) return
    const n = loadIn.current.size
    const t = window.setTimeout(() => (loadIn.current = null), (LOAD_IN.magnetsStart + n * LOAD_IN.magnetsStagger) * 1000)
    return () => window.clearTimeout(t)
  }, [ready])
  readyRef.current = ready

  useEffect(() => {
    if (!intro) return
    const onKey = (e: KeyboardEvent) => {
      if (['ArrowDown', 'PageDown', 'Space', 'Enter'].includes(e.code)) start()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [intro, start])

  // Put a new magnet from the menu in the nearest free spot to the middle of the door
  const addMagnet = useCallback((p: MagnetPreset) => {
    setMagnets((ms) => {
      const spot = resolveDrop({ x: 0, y: 0 }, p.shape, ms)
      if (!spot) return ms
      const id = Math.max(0, ...ms.map((m) => m.id)) + 1
      return [...ms, { id, shape: p.shape, color: p.color, finish: p.finish, position: spot }]
    })
  }, [])

  // Things dragged out of the menu land where the cursor points on the fridge, whichever side
  const three = useRef<RootState | null>(null)
  const doorPoint = useCallback((clientX: number, clientY: number) => {
    const st = three.current
    if (!st) return null
    const r = st.gl.domElement.getBoundingClientRect()
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, st.camera)
    const hit = doorFront().surface.hit(ray.ray, 0)
    return hit && { x: hit.s, y: hit.y }
  }, [])

  const dropMagnet = useCallback(
    (p: MagnetPreset, clientX: number, clientY: number) => {
      const hit = doorPoint(clientX, clientY)
      if (!hit) return
      setMagnets((ms) => {
        const spot = resolveDrop({ x: hit.x, y: hit.y }, p.shape, ms)
        if (!spot) return ms // let go off the fridge
        const id = Math.max(0, ...ms.map((m) => m.id)) + 1
        return [...ms, { id, shape: p.shape, color: p.color, finish: p.finish, position: spot }]
      })
    },
    [doorPoint],
  )

  // Paper notes: new ones go on top of the pile, and so does any note you move
  const newPaper = (ps: PaperData[], kind: PaperKind, style: PaperStyleId, position: [number, number]): PaperData[] => {
    const id = Math.max(0, ...ps.map((p) => p.id)) + 1
    const tilt = (((id * 97) % 9) - 4) * (Math.PI / 180)
    return [...ps, { id, kind, style, position, tilt }]
  }
  const addPaper = useCallback((kind: PaperKind, style: PaperStyleId) => {
    setPapers((ps) => {
      // middle of the main door, nudged along for each one so they don't stack exactly
      const spot = placePaper(kind, -0.25 + (ps.length % 4) * 0.12, 0.3 - (ps.length % 4) * 0.08)
      return spot ? newPaper(ps, kind, style, spot) : ps
    })
  }, [])
  const dropPaper = useCallback(
    (kind: PaperKind, style: PaperStyleId, clientX: number, clientY: number) => {
      const hit = doorPoint(clientX, clientY)
      const spot = hit && placePaper(kind, hit.x, hit.y)
      if (spot) setPapers((ps) => newPaper(ps, kind, style, spot))
    },
    [doorPoint],
  )
  const handlePaperDrop = useCallback((id: number, x: number, y: number) => {
    setPapers((ps) => {
      const me = ps.find((p) => p.id === id)!
      const spot = placePaper(me.kind, x, y)
      const moved = spot ? { ...me, position: spot, floor: undefined } : me // nowhere it fits: back where it was
      return [...ps.filter((p) => p.id !== id), moved]
    })
  }, [])
  // Let go in the open: it fell to the floor, and stays there until picked up
  const handlePaperFloor = useCallback((id: number, x: number, z: number, yaw: number) => {
    setPapers((ps) => ps.map((p) => (p.id === id ? { ...p, floor: [x, z, yaw] } : p)))
  }, [])
  const handleFloor = useCallback((id: number, x: number, z: number, yaw: number) => {
    setMagnets((ms) => ms.map((m) => (m.id === id ? { ...m, floor: [x, z, yaw] } : m)))
  }, [])

  // Switching fridge model moves the doors, so re-seat everything on the new ones
  // Share as a picture: the fridge from the front view (wherever you've moved), downloaded as an image
  const savePicture = useCallback(async (): Promise<'done' | 'cancelled'> => {
    const st = three.current
    if (!st) return 'cancelled'
    st.gl.render(st.scene, homeCamera(st.camera))
    // the picture is taken the moment toBlob is called, then the screen goes back to your view
    const blob = new Promise<Blob | null>((ok) => st.gl.domElement.toBlob(ok, 'image/png'))
    st.gl.render(st.scene, st.camera)
    const png = await blob
    if (!png) return 'cancelled'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(png)
    a.download = 'my-fridge.png'
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    return 'done'
  }, [])

  // Share as a link that opens this exact fridge. Phones get the share sheet;
  // elsewhere it's copied to paste wherever.
  const shareLink = useCallback(async (): Promise<'shared' | 'copied' | 'cancelled'> => {
    const url = fridgeLink({ look, magnets, papers })
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share({ url, title: 'my fridge' })
        return 'shared'
      } catch {
        return 'cancelled'
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      return 'copied'
    } catch {
      prompt('copy your fridge link', url)
      return 'cancelled'
    }
  }, [look, magnets, papers])

  const changeLook = useCallback(
    (next: FridgeLook) => {
      if (next.model !== look.model) {
        // keep things on the same face of the new fridge
        const from = doorFront().surface
        setDoorFront(next.model)
        const to = doorFront().surface
        const moved = <T extends { position: [number, number] }>(o: T): T => ({
          ...o,
          position: [to.from(from, o.position[0]), o.position[1]],
        })
        setMagnets((ms) =>
          ms.map(moved).reduce<MagnetData[]>((placed, m) => {
            if (m.floor) return [...placed, { ...m, floor: [...to.clearOf(m.floor[0], m.floor[1], 0.08), m.floor[2]] }] // on the floor: stays there (clear of a bigger fridge)
            const spot =
              resolveDrop({ x: m.position[0], y: m.position[1] }, m.shape, placed) ??
              resolveDrop(doorCentre(), m.shape, placed)
            return spot ? [...placed, { ...m, position: spot }] : placed
          }, []),
        )
        setPapers((ps) =>
          ps.map(moved).flatMap((p) => {
            if (p.floor) return [{ ...p, floor: [...to.clearOf(p.floor[0], p.floor[1], 0.2), p.floor[2]] }]
            const spot = placePaper(p.kind, p.position[0], p.position[1]) ?? placePaper(p.kind, doorCentre().x, doorCentre().y)
            return spot ? [{ ...p, position: spot }] : []
          }),
        )
      }
      setLook(next)
      // swing round to frame the new fridge, once it's built
      if (next.model !== look.model) requestAnimationFrame(() => setResetSignal((n) => n + 1))
    },
    [look.model],
  )

  // Screen pixels per world unit at the door right now, so dragged copies match their real size
  const pxPerUnit = useCallback(() => {
    const st = three.current
    if (!st) return 0
    const a = new THREE.Vector3(0, 0, DOOR_Z).project(st.camera)
    const b = new THREE.Vector3(1, 0, DOOR_Z).project(st.camera)
    return (Math.abs(b.x - a.x) / 2) * st.gl.domElement.clientWidth
  }, [])

  // Settle a dropped magnet: keep it, nudge it to the nearest free spot, or
  // (dropped off the door / nowhere free) leave its old position so it slides back
  const handleDrop = useCallback((id: number, x: number, y: number) => {
    setMagnets((ms) => {
      const me = ms.find((m) => m.id === id)!
      const spot = resolveDrop({ x, y }, me.shape, ms.filter((m) => m.id !== id))
      return spot ? ms.map((m) => (m.id === id ? { ...m, position: spot, floor: undefined } : m)) : ms
    })
  }, [])

  return (
    <>
      <Canvas
        shadows
        camera={{ position: INTRO_POSITION.toArray(), fov: 40, near: 0.05 }}
        dpr={lowPower ? 1 : [1, 2]}
        onContextMenu={(e) => e.preventDefault()}
        onCreated={(st) => (three.current = st)}
      >
        <color attach="background" args={[FRIDGE_STYLE.scene.background]} />
        <fog attach="fog" args={[FRIDGE_STYLE.scene.background, FRIDGE_STYLE.scene.fogNear, FRIDGE_STYLE.scene.fogFar]} />
        <ambientLight intensity={0.25} />
        <directionalLight
          position={[3, 5, 4]}
          intensity={1.2}
          castShadow
          shadow-mapSize={lowPower ? [512, 512] : [1024, 1024]}
        />
        {/* Soft fill so the back isn't lit by the environment alone */}
        <directionalLight position={[-3, 4, -5]} intensity={0.5} />
        <Studio resolution={lowPower ? 128 : 256} />
        {!forcedQuality && !lowPower && <PerformanceMonitor onDecline={() => setLowPower(true)} />}

        <Fridge look={look} onOpenMenu={intro ? undefined : openFridgeMenu} />
        {papers.map((p, i) => (
          <PaperNote
            key={p.id}
            data={p}
            stack={i}
            onDragChange={setDragging}
            onDrop={handlePaperDrop}
            onFloor={handlePaperFloor}
            onTrash={(id) => setPapers((ps) => ps.filter((q) => q.id !== id))}
            onOpen={setWriting}
          />
        ))}
        {magnets.map((m) => {
          // Starting magnets snap on one by one after the reveal; ones added later pop straight in
          const order = loadIn.current?.get(m.id)
          const delay = order === undefined ? 0 : LOAD_IN.magnetsStart + order * LOAD_IN.magnetsStagger
          return (
            <Magnet
              key={m.id}
              data={m}
              onDragChange={setDragging}
              onDrop={handleDrop}
              onFloor={handleFloor}
              onTrash={(id) => setMagnets((ms) => ms.filter((q) => q.id !== id))}
              appearDelay={ready ? delay : null}
            />
          )
        })}
        <SceneDrawn onDrawn={() => setSceneDrawn(true)} />

        {/* Floor shadow is baked on the first frame: only the static fridge reaches the floor */}
        <GlossyFloor y={-2.2} simple={lowPower} />
        <ContactShadows key={look.model} position={[0, -2.195, 0]} opacity={0.4} scale={8} blur={2.5} frames={1} />
        <StaticShadows />
        <OrbitControls
          makeDefault
          enabled={!dragging && !intro}
          enableRotate={!gliding}
          enablePan={!gliding}
          enableZoom={false} // replaced by WheelNavigation
          minDistance={CAMERA_CONFIG.minDistance}
          maxDistance={CAMERA_CONFIG.maxDistance}
          minPolarAngle={CAMERA_CONFIG.minPolarAngle}
          maxPolarAngle={CAMERA_CONFIG.maxPolarAngle}
        />
        <WheelNavigation disabled={gliding || intro} />
        <CameraRig
          resetSignal={resetSignal}
          onGlideChange={onGlideChange}
          startAtIntro
          introPose={intro ? introPose : null}
          revealed={ready}
          onAwayChange={setAwayFromFront}
        />
      </Canvas>
      {/* Load-in curtain over the fridge only: the title shows on it straight away */}
      <div className={`loader${ready ? ' is-done' : ''}`} role="status" aria-label={ready ? undefined : 'Loading'} />
      {/* Intro overlay: sits above the canvas so the first gesture starts the app */}
      <div
        className={`intro${intro ? '' : ' is-gone'}${titleReady ? '' : ' is-loading'}${ready ? '' : ' is-waiting'}`}
        onClick={start}
        onWheel={start}
        onTouchMove={start}
        aria-hidden={!intro}
      >
        <h1 ref={titleRef} className="intro-title" aria-label="fridge magnet recipes">
          <span className="intro-line intro-fridge">
            fridge <span className="scroll-hint">(scroll down to start!)</span>
          </span>
          <span className="intro-line intro-magnet">magnet</span>{' '}
          <span className="intro-line intro-recipes">recipes</span>
        </h1>
      </div>
      <div className={`tool-menu-wrap${intro || entering ? ' is-hidden' : ''}`}>
        <ToolMenu
          onAddMagnet={addMagnet}
          onDropMagnet={dropMagnet}
          onAddPaper={addPaper}
          onDropPaper={dropPaper}
          pxPerUnit={pxPerUnit}
          onClearAll={() => {
            setMagnets([])
            setPapers([])
          }}
          canClear={magnets.length > 0 || papers.length > 0}
        />
      </div>
      <HelpCard hidden={intro || entering} />
      {writingPaper && (
        <RecipeEditor
          key={writingPaper.id}
          paper={writingPaper}
          onSave={(recipe) => setPapers((ps) => ps.map((p) => (p.id === writingPaper.id ? { ...p, ...recipe } : p)))}
          onClose={() => setWriting(null)}
        />
      )}
      <FridgeActions
        hidden={intro || entering}
        onPicture={savePicture}
        onLink={shareLink}
        onResetView={() => setResetSignal((n) => n + 1)}
        canResetView={awayFromFront}
      />
      {fridgeMenuAt && !intro && (
        <FridgeMenu at={fridgeMenuAt} look={look} onChange={changeLook} onClose={closeFridgeMenu} />
      )}
    </>
  )
}
