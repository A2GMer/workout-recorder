import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { DimKey, Figure } from '../lib/ideal'

/**
 * 全身の 3D ワイヤーフレーム。リグ付きの人体モデル（Mixamo X Bot）を白い線で描き、歩かせる。
 * - 左右のスワイプで回転、放すと惰性、触らなければゆっくり自転
 * - 奥は霧で薄く、手前は濃く
 * - 計測値は骨の太さに写す（目標との差を EXAGGERATE 倍に誇張。近似）
 * - 足りない部位は白く明滅し、ほかは灰
 */
const MODEL_URL = '/models/xbot.glb'
const EXAGGERATE = 1.5
const FPS = 30

/** 計測の項目 → Mixamo の骨。左右は両方 */
const BONES: Record<DimKey, string[]> = {
  shoulders: ['mixamorigLeftShoulder', 'mixamorigRightShoulder', 'mixamorigSpine2'],
  chest: ['mixamorigSpine1'],
  waist: ['mixamorigSpine'],
  hip: ['mixamorigHips'],
  arm: ['mixamorigLeftArm', 'mixamorigRightArm'],
  forearm: ['mixamorigLeftForeArm', 'mixamorigRightForeArm'],
  thigh: ['mixamorigLeftUpLeg', 'mixamorigRightUpLeg'],
  calf: ['mixamorigLeftLeg', 'mixamorigRightLeg'],
}
const partOfBone = new Map<string, DimKey>()
for (const [k, names] of Object.entries(BONES) as [DimKey, string[]][]) for (const n of names) partOfBone.set(n, k)

// モデルは1回だけ読み、表示ごとに複製する
let loading: Promise<GLTF> | null = null
function loadModel(): Promise<GLTF> {
  loading ??= new GLTFLoader().loadAsync(MODEL_URL)
  return loading
}

export function Figure3D({ figure, showTarget, className }: { figure: Figure; showTarget: boolean; className?: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const yaw = useRef(-0.5)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const lastX = useRef(0)

  useEffect(() => {
    const el = box.current
    if (!el) return
    let disposed = false
    let raf = 0
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
    renderer.domElement.className = 'block h-full w-full'
    el.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.Fog(0x000000, 2.0, 3.3)
    const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 10)
    camera.position.set(0, 0.5, 2.45)
    camera.lookAt(0, 0.5, 0)
    const root = new THREE.Group()
    scene.add(root)

    const resize = () => {
      const w = el.clientWidth
      const h = el.clientHeight
      if (!w || !h) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(el)

    const normalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.26, depthWrite: false })
    const lackMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.9, depthWrite: false })
    const disposables: { dispose(): void }[] = [renderer, normalMat, lackMat]
    let mixer: THREE.AnimationMixer | null = null

    loadModel()
      .then((gltf) => {
        if (disposed) return
        const model = cloneSkeleton(gltf.scene)
        root.add(model)

        const lacking = showTarget ? figure.lacking : new Set<DimKey>()
        const scaled = new Set<THREE.Bone>()
        model.traverse((o) => {
          if (!(o as THREE.SkinnedMesh).isSkinnedMesh) return
          const mesh = o as THREE.SkinnedMesh
          mesh.frustumCulled = false
          // 三角形を「足りない部位」と「それ以外」に分け、材質を2つに
          const geo = mesh.geometry.clone()
          disposables.push(geo)
          const names = mesh.skeleton.bones.map((b) => b.name)
          const idx = geo.getIndex()!
          const joints = geo.getAttribute('skinIndex') as THREE.BufferAttribute
          const weights = geo.getAttribute('skinWeight') as THREE.BufferAttribute
          const vertexLacks = (v: number) => {
            let best = 0
            let bw = -1
            for (let j = 0; j < 4; j++) {
              const w = weights.getComponent(v, j)
              if (w > bw) {
                bw = w
                best = joints.getComponent(v, j)
              }
            }
            const part = partOfBone.get(names[best])
            return !!part && lacking.has(part)
          }
          const normal: number[] = []
          const lack: number[] = []
          for (let t = 0; t < idx.count; t += 3) {
            const a = idx.getX(t)
            const b = idx.getX(t + 1)
            const c = idx.getX(t + 2)
            const n = Number(vertexLacks(a)) + Number(vertexLacks(b)) + Number(vertexLacks(c))
            ;(n >= 2 ? lack : normal).push(a, b, c)
          }
          geo.setIndex([...normal, ...lack])
          geo.clearGroups()
          geo.addGroup(0, normal.length, 0)
          geo.addGroup(normal.length, lack.length, 1)
          mesh.geometry = geo
          mesh.material = [normalMat, lackMat]

          // 太さ: 目標に対する今の比を骨の X/Z スケールに（Y が骨の軸）。子は親の分を打ち消す。元のスケールは保つ
          const own = new Map<THREE.Bone, number>()
          for (const bone of mesh.skeleton.bones) {
            const part = partOfBone.get(bone.name)
            if (!part || !showTarget) continue
            const ratio = figure.current[part] / figure.target[part]
            own.set(bone, Math.min(1.2, Math.max(0.85, 1 + (ratio - 1) * EXAGGERATE)))
          }
          for (const bone of mesh.skeleton.bones) {
            if (scaled.has(bone)) continue // 2つのメッシュが同じ骨格を使う
            scaled.add(bone)
            const mine = own.get(bone) ?? 1
            const parent = bone.parent && (bone.parent as THREE.Bone).isBone ? (own.get(bone.parent as THREE.Bone) ?? 1) : 1
            const k = mine / parent
            bone.scale.set(bone.scale.x * k, bone.scale.y, bone.scale.z * k)
          }
        })

        // 大きさを身長 1 に揃え、足元を 0 に。スキン適用後の形で測る（素のジオメトリは骨の空間にあり寸法が違う）
        scene.updateMatrixWorld(true)
        const bbox = new THREE.Box3()
        model.traverse((o) => {
          const m = o as THREE.SkinnedMesh
          if (!m.isSkinnedMesh) return
          m.skeleton.update()
          m.computeBoundingBox()
          bbox.union(m.boundingBox!.clone().applyMatrix4(m.matrixWorld))
        })
        const size = bbox.getSize(new THREE.Vector3())
        const center = bbox.getCenter(new THREE.Vector3())
        root.scale.setScalar(1 / size.y)
        model.position.set(-center.x, -bbox.min.y, -center.z)

        // 歩く（減速モーション設定では立ち姿で止める）
        mixer = new THREE.AnimationMixer(model)
        if (import.meta.env.DEV) (window as unknown as { __fig: unknown }).__fig = { scene, camera, renderer, root, mixer }
        const clip = gltf.animations.find((c) => c.name === (still ? 'idle' : 'walk')) ?? gltf.animations[0]
        if (clip) {
          const action = mixer.clipAction(clip)
          action.play()
          if (still) action.paused = true
        }
      })
      .catch(() => setFailed(true))

    const clock = new THREE.Clock()
    let last = -1e9
    const draw = (now: number) => {
      raf = requestAnimationFrame(draw)
      if (now - last < 1000 / FPS) return
      last = now
      const dt = clock.getDelta()
      if (!dragging.current) {
        if (Math.abs(velocity.current) > 0.0005) {
          yaw.current += velocity.current
          velocity.current *= 0.94
        } else if (!still) {
          yaw.current += 0.0035
        }
      }
      root.rotation.y = yaw.current
      lackMat.opacity = still ? 0.85 : 0.55 + 0.4 * Math.sin(now / 420)
      mixer?.update(dt)
      renderer.render(scene, camera)
    }
    raf = requestAnimationFrame(draw)

    return () => {
      disposed = true
      cancelAnimationFrame(raf)
      ro.disconnect()
      for (const d of disposables) d.dispose()
      renderer.domElement.remove()
    }
  }, [figure, showTarget])

  // スワイプで回す（縦のスクロールは邪魔しない）
  function down(e: React.PointerEvent) {
    dragging.current = true
    lastX.current = e.clientX
    velocity.current = 0
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  function move(e: React.PointerEvent) {
    if (!dragging.current) return
    const w = box.current?.clientWidth || 300
    const d = ((e.clientX - lastX.current) / w) * Math.PI * 1.2
    lastX.current = e.clientX
    yaw.current += d
    velocity.current = d
  }
  function up() {
    dragging.current = false
  }

  if (failed) return <p className={`flex items-center justify-center text-xs text-faint ${className ?? ''}`}>全身図を読み込めませんでした</p>
  return (
    <div
      ref={box}
      className={`touch-pan-y cursor-grab select-none active:cursor-grabbing ${className ?? ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      role="img"
      aria-label="全身図。左右にスワイプで回転"
    />
  )
}

export default Figure3D
