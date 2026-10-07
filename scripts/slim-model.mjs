// 全身図の 3D モデルを軽くする。元ファイル（Mixamo の X Bot。three.js の examples から取得）を
// public/models/xbot.glb に書き出す。実行は必要なときだけ:
//   npx -y -p @gltf-transform/core@4 -p @gltf-transform/functions@4 -p @gltf-transform/extensions@4 node scripts/slim-model.mjs <元の glb>
// 量子化（quantize）はしない。スキン付きメッシュの頂点は骨の空間にあり、量子化すると寸法が狂う
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup, quantize } from '@gltf-transform/functions'
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(process.argv[2] ?? 'xbot.orig.glb')
const root = doc.getRoot()
// 骨の名前とメッシュ名を表示
console.log('nodes:', root.listNodes().map((n) => n.getName()).join(', '))
console.log('meshes:', root.listMeshes().map((m) => m.getName() + ':' + m.listPrimitives().reduce((s, p) => s + p.getIndices().getCount() / 3, 0)).join(', '))
// 使うアニメーションだけ残す。スケールのトラックは捨てる（骨の太さをこちらで決めるため）
for (const a of root.listAnimations()) {
  if (!['idle', 'walk'].includes(a.getName())) { a.dispose(); continue }
  for (const ch of a.listChannels()) if (ch.getTargetPath() === 'scale') ch.dispose()
}
// ワイヤーフレーム表示に不要な属性を捨てる
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  p.setAttribute('NORMAL', null); p.setAttribute('TEXCOORD_0', null)
}
await doc.transform(prune(), dedup())
await io.write('public/models/xbot.glb', doc)
