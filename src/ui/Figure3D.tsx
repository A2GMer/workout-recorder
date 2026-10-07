import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'
import type { DimKey, Figure } from '../lib/ideal'
import type { BodyPart, Sex } from '../lib/types'

/**
 * 全身の 3D ワイヤーフレーム。リグ付きの人体モデル（Mixamo X Bot）を白い線で描き、動かす。
 * - 左右のスワイプで回転、放すと惰性、触らなければゆっくり自転
 * - タップでモーションを切り替える（idle → walk → run）
 * - 奥は霧で薄く、手前は濃く
 * - 性別は骨の太さの「体型プリセット」。男性は肩幅・胸・腕を太く、腰を細く
 * - 計測値も骨の太さに写す（目標との差を EXAGGERATE 倍に誇張。近似）
 * - 強調する部位（足りない部位、または今日鍛える部位）は白く明滅し、ほかは灰
 */
const MODEL_URL = '/models/xbot.glb'
const EXAGGERATE = 1.5
const FPS = 30
export const MOTIONS = ['idle', 'walk', 'run'] as const
export type Motion = (typeof MOTIONS)[number]

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

/** 鍛える部位 → 強調する骨の部位 */
export const DIMS_OF_PART: Record<BodyPart, DimKey[]> = {
  chest: ['chest'],
  back: ['shoulders', 'chest'],
  shoulders: ['shoulders'],
  arms: ['arm', 'forearm'],
  legs: ['thigh', 'calf'],
  core: ['waist'],
}

/**
 * 体型プリセット: 骨ごとの [X, Y, Z] スケール。Y は骨の軸（長さ）、X/Z が太さ。
 * X Bot は中性的でやや女性的なので、男性は肩を広く厚く、胸・首・腕・脚を太く、腰を細くする
 */
const PRESET: Record<Sex, Record<string, [number, number, number]>> = {
  male: {
    mixamorigLeftShoulder: [1.3, 1.18, 1.3],
    mixamorigRightShoulder: [1.3, 1.18, 1.3],
    mixamorigSpine2: [1.22, 1, 1.15],
    mixamorigSpine1: [1.1, 1, 1.1],
    mixamorigSpine: [1.0, 1, 1.02],
    mixamorigHips: [0.92, 1, 0.96],
    mixamorigNeck: [1.25, 1, 1.25],
    mixamorigLeftArm: [1.25, 1, 1.25],
    mixamorigRightArm: [1.25, 1, 1.25],
    mixamorigLeftForeArm: [1.18, 1, 1.18],
    mixamorigRightForeArm: [1.18, 1, 1.18],
    mixamorigLeftUpLeg: [1.1, 1, 1.1],
    mixamorigRightUpLeg: [1.1, 1, 1.1],
    mixamorigLeftLeg: [1.12, 1, 1.12],
    mixamorigRightLeg: [1.12, 1, 1.12],
  },
  female: {},
}

// モデルは1回だけ読み、表示ごとに複製する
let loading: Promise<GLTF> | null = null
function loadModel(): Promise<GLTF> {
  loading ??= new GLTFLoader().loadAsync(MODEL_URL)
  return loading
}

export function Figure3D({
  figure,
  showTarget = true,
  emphasis,
  sex,
  motion = 'walk',
  className,
}: {
  /** 計測から出した今の体と目標。なければ体型プリセットだけ */
  figure?: Figure | null
  /** 計測と目標の差を太さに反映するか（身長がなければ false） */
  showTarget?: boolean
  /** 強調する部位。省略時は figure の足りない部位 */
  emphasis?: Set<DimKey>
  sex: Sex
  /** 最初のモーション。タップで次へ */
  motion?: Motion
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  const yaw = useRef(-0.5)
  const velocity = useRef(0)
  const dragging = useRef(false)
  const lastX = useRef(0)
  const downAt = useRef({ x: 0, t: 0 })
  const cycle = useRef<() => void>(() => {})

  const emphasisKey = [...(emphasis ?? (showTarget ? figure?.lacking : null) ?? [])].sort().join(',')

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
    const emphasized = new Set(emphasisKey ? (emphasisKey.split(',') as DimKey[]) : [])

    loadModel()
      .then((gltf) => {
        if (disposed) return
        const model = cloneSkeleton(gltf.scene)
        root.add(model)
        const scaled = new Set<THREE.Bone>()

        model.traverse((o) => {
          if (!(o as THREE.SkinnedMesh).isSkinnedMesh) return
          const mesh = o as THREE.SkinnedMesh
          mesh.frustumCulled = false
          // 関節の球（マネキンの継ぎ目）は隠し、体の表面だけを描く
          if (mesh.name === 'Beta_Joints') {
            mesh.visible = false
            return
          }
          // 三角形を「強調する部位」と「それ以外」に分け、材質を2つに
          const geo = mesh.geometry.clone()
          disposables.push(geo)
          const names = mesh.skeleton.bones.map((b) => b.name)
          const idx = geo.getIndex()!
          const joints = geo.getAttribute('skinIndex') as THREE.BufferAttribute
          const weights = geo.getAttribute('skinWeight') as THREE.BufferAttribute
          const vertexHit = (v: number) => {
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
            return !!part && emphasized.has(part)
          }
          const normal: number[] = []
          const hit: number[] = []
          for (let t = 0; t < idx.count; t += 3) {
            const a = idx.getX(t)
            const b = idx.getX(t + 1)
            const c = idx.getX(t + 2)
            const n = Number(vertexHit(a)) + Number(vertexHit(b)) + Number(vertexHit(c))
            ;(n >= 2 ? hit : normal).push(a, b, c)
          }
          geo.setIndex([...normal, ...hit])
          geo.clearGroups()
          geo.addGroup(0, normal.length, 0)
          geo.addGroup(normal.length, hit.length, 1)
          mesh.geometry = geo
          mesh.material = [normalMat, lackMat]

          // 太さ: 体型プリセット × 計測の比。子の骨は親の分を打ち消す（軸ごと）
          const own = new Map<THREE.Bone, THREE.Vector3>()
          for (const bone of mesh.skeleton.bones) {
            const v = new THREE.Vector3(...(PRESET[sex][bone.name] ?? [1, 1, 1]))
            const part = partOfBone.get(bone.name)
            if (part && figure && showTarget) {
              const ratio = figure.current[part] / figure.target[part]
              let k = Math.min(1.2, Math.max(0.85, 1 + (ratio - 1) * EXAGGERATE))
              // ウエストと腰は目標より大きくても太らせない（細くする方向だけ写す）
              if (part === 'waist' || part === 'hip') k = Math.min(1, k)
              v.x *= k
              v.z *= k
            }
            own.set(bone, v)
          }
          const one = new THREE.Vector3(1, 1, 1)
          for (const bone of mesh.skeleton.bones) {
            if (scaled.has(bone)) continue // 2つのメッシュが同じ骨格を使う
            scaled.add(bone)
            const mine = own.get(bone) ?? one
            const parent = bone.parent && (bone.parent as THREE.Bone).isBone ? (own.get(bone.parent as THREE.Bone) ?? one) : one
            bone.scale.set((bone.scale.x * mine.x) / parent.x, (bone.scale.y * mine.y) / parent.y, (bone.scale.z * mine.z) / parent.z)
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

        // モーション。タップで次へ（減速モーション設定では立ち姿で止める）
        mixer = new THREE.AnimationMixer(model)
        const actions = new Map<Motion, THREE.AnimationAction>()
        for (const name of MOTIONS) {
          const clip = gltf.animations.find((c) => c.name.toLowerCase() === name)
          if (clip) actions.set(name, mixer.clipAction(clip))
        }
        let current: Motion = still ? 'idle' : motion
        let active = actions.get(current) ?? [...actions.values()][0]
        active?.play()
        if (still && active) active.paused = true
        cycle.current = () => {
          if (still) return
          const order = MOTIONS.filter((m) => actions.has(m))
          const next = order[(order.indexOf(current) + 1) % order.length]
          const nextAction = actions.get(next)!
          nextAction.reset().play()
          if (active && active !== nextAction) active.crossFadeTo(nextAction, 0.4, false)
          active = nextAction
          current = next
        }
        if (import.meta.env.DEV) (window as unknown as { __fig: unknown }).__fig = { scene, camera, renderer, root, mixer, cycle: cycle.current }
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
      cycle.current = () => {}
    }
  }, [figure, showTarget, emphasisKey, sex, motion])

  // スワイプで回す。動かさずに放したらタップ＝モーション切り替え（縦のスクロールは邪魔しない）
  function down(e: React.PointerEvent) {
    dragging.current = true
    lastX.current = e.clientX
    downAt.current = { x: e.clientX, t: performance.now() }
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
  function up(e: React.PointerEvent) {
    if (!dragging.current) return
    dragging.current = false
    const moved = Math.abs(e.clientX - downAt.current.x)
    if (moved < 8 && performance.now() - downAt.current.t < 400) cycle.current()
  }

  if (failed) return <p className={`flex items-center justify-center text-xs text-faint ${className ?? ''}`}>全身図を読み込めませんでした</p>
  return (
    <div
      ref={box}
      className={`touch-pan-y cursor-grab select-none active:cursor-grabbing ${className ?? ''}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={() => (dragging.current = false)}
      role="img"
      aria-label="全身図。左右にスワイプで回転、タップで動きが変わる"
    />
  )
}

export default Figure3D
