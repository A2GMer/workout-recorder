// アイコン生成: node scripts/icons.mjs
// 黒地に白い線画（円の中で交差する2本の波 = 筋線維の束）。ブラウザのタブ用 SVG と、iOS / PWA 用 PNG を出力する。
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

/** scale: 線画の大きさ（maskable は端が切られるので小さめ） */
function svg({ rounded, scale = 1 }) {
  const t = (n) => (256 + (n - 256) * scale).toFixed(1)
  const w = (20 * scale).toFixed(1)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#000"/>
  <g fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round">
    <circle cx="256" cy="256" r="${(170 * scale).toFixed(1)}"/>
    <path d="M${t(256)} ${t(86)}C${t(390)} ${t(196)} ${t(122)} ${t(316)} ${t(256)} ${t(426)}"/>
    <path d="M${t(256)} ${t(86)}C${t(122)} ${t(196)} ${t(390)} ${t(316)} ${t(256)} ${t(426)}"/>
  </g>
</svg>
`
}

const png = (src, size) => new Resvg(src, { fitTo: { mode: 'width', value: size } }).render().asPng()

writeFileSync('public/favicon.svg', svg({ rounded: true }))
writeFileSync('public/apple-touch-icon.png', png(svg({ rounded: false }), 180))
writeFileSync('public/icon-192.png', png(svg({ rounded: false }), 192))
writeFileSync('public/icon-512.png', png(svg({ rounded: false }), 512))
writeFileSync('public/icon-maskable-512.png', png(svg({ rounded: false, scale: 0.78 }), 512))
console.log('icons written')
