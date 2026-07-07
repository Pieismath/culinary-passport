import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/**
 * Little stylized 3D figures of the two of us — chibi proportions built from
 * primitives, with idle bobbing, blinking, and a wave on hover.
 *
 * Modelled on the reference photos:
 *  - jason: 5'10" — short black hair with a swept fringe, tan skin, heather-grey
 *    Patagonia-style quarter-zip fleece over a white tee. No scarf.
 *  - jenn: 5'2" — long near-black hair with face-framing strands, pearl drop
 *    earrings, brown leather jacket over a cream top, sunglasses parked on her head.
 */
export type FigurePerson = 'jason' | 'jenn'

export function Figure3D({
  person,
  width = 150,
  height = 190,
  wave = false,
}: {
  person: FigurePerson
  width?: number
  height?: number
  wave?: boolean
}) {
  const mountRef = useRef<HTMLDivElement>(null)
  const waveRef = useRef(wave)
  waveRef.current = wave

  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
    renderer.setSize(width, height)
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 50)
    camera.position.set(0, 1.6, 6.1)
    camera.lookAt(0, 1.28, 0)

    scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc6b8, 1.4))
    const key = new THREE.DirectionalLight(0xfff1de, 2.1)
    key.position.set(2.5, 4, 3.5)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xdce8ff, 0.75)
    rim.position.set(-3, 3, -2.5)
    scene.add(rim)

    const { group, rightArm, head, eyes } = buildFigure(person)
    scene.add(group)
    scene.add(makeShadowBlob())

    let raf = 0
    const t0 = performance.now()
    const tick = (now: number) => {
      const t = (now - t0) / 1000
      group.position.y = Math.sin(t * 1.8) * 0.035
      group.rotation.y = Math.sin(t * 0.6) * 0.09
      head.rotation.z = Math.sin(t * 1.1) * 0.04
      const targetZ = waveRef.current ? -2.35 + Math.sin(t * 9) * 0.25 : -0.35
      rightArm.rotation.z += (targetZ - rightArm.rotation.z) * 0.14
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)

    // blink every few seconds
    let blinkTimeout = 0
    const blinkLoop = window.setInterval(() => {
      eyes.forEach((e) => e.scale.setY(0.1))
      blinkTimeout = window.setTimeout(() => eyes.forEach((e) => e.scale.setY(1)), 130)
    }, 3200 + Math.random() * 1600)

    return () => {
      cancelAnimationFrame(raf)
      window.clearInterval(blinkLoop)
      window.clearTimeout(blinkTimeout)
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      renderer.dispose()
      el.removeChild(renderer.domElement)
    }
  }, [person, width, height])

  return <div ref={mountRef} style={{ width, height }} aria-hidden />
}

// ------------------------------------------------------------------ builders

function mat(color: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...opts })
}

function sphere(r: number, m: THREE.Material, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 20), m)
  mesh.position.set(x, y, z)
  mesh.scale.set(sx, sy, sz)
  return mesh
}

function capsule(r: number, len: number, m: THREE.Material) {
  return new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 6, 16), m)
}

function box(w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m)
  mesh.position.set(x, y, z)
  return mesh
}

const FLEECE_GREY = 0x9a9d99 // heather grey
const LEATHER = 0x6b4a30
const CREAM = 0xf2ead9

function buildFigure(person: FigurePerson) {
  const group = new THREE.Group()
  const isJason = person === 'jason'

  const skinTone = isJason ? 0xe8b98c : 0xf3cba6 // he runs tanner
  const skin = mat(skinTone)
  const noseTone = isJason ? 0xdca878 : 0xe5bb94
  const hairColor = isJason ? 0x221d19 : 0x1c1512 // both near-black
  const hair = mat(hairColor, { roughness: 0.75 })
  const gold = mat(0xd9a441, { metalness: 0.75, roughness: 0.3 })

  // ---- legs + shoes
  const pants = mat(isJason ? 0x2c2a30 : 0x4a4238)
  const shoes = mat(isJason ? 0x3a3733 : 0x6b5d4f)
  for (const side of [-1, 1]) {
    const leg = capsule(0.11, 0.22, pants)
    leg.position.set(0.13 * side, 0.28, 0)
    group.add(leg)
    group.add(sphere(0.12, shoes, 0.13 * side, 0.08, 0.05, 1, 0.55, 1.35))
  }

  // ---- body + outfit
  const bodyColor = isJason ? FLEECE_GREY : LEATHER
  const bodyMat = isJason
    ? mat(FLEECE_GREY, { roughness: 1 })
    : mat(LEATHER, { roughness: 0.45, metalness: 0.08 }) // leather sheen
  const body = capsule(0.36, 0.5, bodyMat)
  body.position.y = 0.92
  body.scale.x = isJason ? 1.12 : 0.95 // broader him, petite her
  group.add(body)

  if (isJason) {
    // heather-grey quarter-zip fleece: same-tone stand collar, zip tape down the chest,
    // white tee peeking out where the zip sits slightly open
    const fleece = mat(FLEECE_GREY, { roughness: 1 })
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.31, 0.14, 20), fleece)
    collar.position.y = 1.45
    group.add(collar)
    group.add(sphere(0.08, mat(0xf4f1ea), 0, 1.41, 0.27, 1.25, 0.5, 0.6)) // white tee wedge
    group.add(box(0.05, 0.34, 0.05, mat(0x70766f), 0, 1.21, 0.345)) // zip tape (quarter length)
    group.add(sphere(0.026, mat(0xc9ced0, { metalness: 0.7, roughness: 0.35 }), 0, 1.36, 0.37)) // zipper pull
  } else {
    // brown leather jacket, open over a cream top, tiny gold pendant
    group.add(box(0.22, 0.34, 0.05, mat(CREAM), 0, 1.05, 0.322))
    const leatherTrim = mat(0x543823, { roughness: 0.4, metalness: 0.08 })
    for (const side of [-1, 1]) {
      const edge = box(0.08, 0.42, 0.055, leatherTrim, 0.18 * side, 1.04, 0.328)
      edge.rotation.z = -0.08 * side // slight V opening at the collar
      group.add(edge)
      const lapel = box(0.13, 0.14, 0.05, leatherTrim, 0.2 * side, 1.32, 0.33)
      lapel.rotation.z = 0.55 * side // folded-back collar points
      group.add(lapel)
      // silver zip teeth along the jacket opening
      group.add(box(0.016, 0.3, 0.058, mat(0xb9bcc0, { metalness: 0.6, roughness: 0.35 }), 0.13 * side, 1.0, 0.33))
    }
    group.add(sphere(0.035, gold, 0, 1.1, 0.365))
  }

  // ---- arms (right arm grouped at the shoulder so it can wave)
  const sleeve = mat(bodyColor, { roughness: 1 })
  const leftArm = new THREE.Group()
  leftArm.position.set(-0.42, 1.18, 0)
  const lMesh = capsule(0.095, 0.3, sleeve)
  lMesh.position.y = -0.2
  leftArm.add(lMesh)
  leftArm.add(sphere(0.095, skin, 0, -0.42, 0))
  leftArm.rotation.z = 0.35
  group.add(leftArm)

  const rightArm = new THREE.Group()
  rightArm.position.set(0.42, 1.18, 0)
  const rMesh = capsule(0.095, 0.3, sleeve)
  rMesh.position.y = -0.2
  rightArm.add(rMesh)
  rightArm.add(sphere(0.095, skin, 0, -0.42, 0))
  rightArm.rotation.z = -0.35
  group.add(rightArm)

  // ---- head + face
  const head = new THREE.Group()
  head.position.y = 1.98
  group.add(head)
  head.add(sphere(0.6, skin))

  const eyeMat = mat(0x241a14, { roughness: 0.35 })
  const highlight = mat(0xffffff, { roughness: 0.2 })
  const eyes: THREE.Mesh[] = []
  for (const side of [-1, 1]) {
    const eye = sphere(0.06, eyeMat, 0.21 * side, 0.05, 0.53, 1, 1.25, 0.5)
    eyes.push(eye)
    head.add(eye)
    head.add(sphere(0.02, highlight, 0.21 * side + 0.025, 0.09, 0.572)) // catchlight
    const brow = box(isJason ? 0.16 : 0.15, isJason ? 0.035 : 0.028, 0.02, hair)
    brow.position.set(0.21 * side, 0.24, 0.52)
    brow.rotation.z = (isJason ? -0.06 : -0.14) * side // his straighter, hers softly arched
    head.add(brow)
    head.add(
      sphere(0.07, mat(0xf0a08a, { transparent: true, opacity: 0.45 }), 0.34 * side, -0.08, 0.45, 1, 0.6, 0.4),
    )
  }
  head.add(sphere(0.045, mat(noseTone), 0, -0.05, 0.585, 0.8, 0.55, 0.5)) // subtle nose

  // big grin: white teeth outlined by a smile arc
  head.add(box(0.16, 0.05, 0.02, mat(0xfaf7f0, { roughness: 0.3 }), 0, -0.14, 0.545))
  const smile = new THREE.Mesh(
    new THREE.TorusGeometry(0.1, 0.018, 8, 20, Math.PI * 0.8),
    mat(0x8a4a3a, { roughness: 0.5 }),
  )
  smile.position.set(0, -0.11, 0.552)
  smile.rotation.z = Math.PI * 1.1
  head.add(smile)

  // ---- hair (caps sit up and back so the face hemisphere stays exposed)
  if (isJason) {
    head.add(sphere(0.62, hair, 0, 0.15, -0.17, 1.0, 1.02, 1.0))
    // swept fringe tufts
    const tufts: [number, number, number, number][] = [
      [-0.26, 0.43, 0.4, 0.22],
      [-0.02, 0.48, 0.44, 0.12],
      [0.22, 0.44, 0.41, -0.18],
    ]
    for (const [x, y, z, rz] of tufts) {
      const tuft = sphere(0.16, hair, x, y, z, 1.25, 0.55, 0.6)
      tuft.rotation.z = rz
      head.add(tuft)
    }
  } else {
    head.add(sphere(0.63, hair, 0, 0.12, -0.16, 1.02, 0.98, 0.98))
    // long hair falling past the shoulders + face-framing strands
    head.add(sphere(0.6, hair, 0, -0.66, -0.38, 0.95, 1.6, 0.55))
    for (const side of [-1, 1]) {
      const strand = capsule(0.13, 0.58, hair)
      strand.position.set(0.5 * side, -0.4, 0.14)
      strand.rotation.z = 0.1 * side
      head.add(strand)
    }
    // swept middle-part fringe
    head.add(sphere(0.16, hair, -0.2, 0.44, 0.4, 1.4, 0.5, 0.6))
    head.add(sphere(0.16, hair, 0.2, 0.44, 0.4, 1.4, 0.5, 0.6))
    // pearl drop earrings
    const pearl = mat(0xf5f1e8, { roughness: 0.25, metalness: 0.05 })
    for (const side of [-1, 1]) {
      head.add(sphere(0.018, gold, 0.57 * side, -0.09, 0.04))
      head.add(sphere(0.045, pearl, 0.575 * side, -0.19, 0.04))
    }
    // sunglasses parked on top of her head, tilted back into the hair
    const shade = mat(0x26201c, { roughness: 0.25, metalness: 0.2 })
    const glasses = new THREE.Group()
    glasses.position.set(0, 0.56, 0.3)
    glasses.rotation.x = -0.62
    for (const side of [-1, 1]) {
      glasses.add(sphere(0.1, shade, 0.14 * side, 0, 0.02, 1, 0.72, 0.4)) // lenses
      glasses.add(box(0.026, 0.026, 0.34, shade, 0.23 * side, 0.01, -0.15)) // temple arms
    }
    glasses.add(box(0.09, 0.03, 0.03, shade, 0, 0.03, 0.02)) // bridge
    head.add(glasses)
  }

  // ---- height: he's 5'10", she's 5'2" — shrink her frame but keep the head chibi-big
  if (!isJason) {
    group.scale.setScalar(0.885)
    head.scale.setScalar(1.09)
  }

  return { group, rightArm, head, eyes }
}

function makeShadowBlob() {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 62)
  g.addColorStop(0, 'rgba(42,39,35,0.28)')
  g.addColorStop(1, 'rgba(42,39,35,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 128, 128)
  const tex = new THREE.CanvasTexture(c)
  const blob = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  )
  blob.rotation.x = -Math.PI / 2
  blob.position.y = 0.005
  return blob
}
