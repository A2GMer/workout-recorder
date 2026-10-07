// アイコン生成: node scripts/icons.mjs
// 黒地に白い線画の胸像。頭の円、上に凸の肩の弧、ウエストへ絞れる V、胸の線。
// ブラウザのタブ用 SVG と、iOS / PWA 用 PNG を出力する。
import { writeFileSync } from 'node:fs'
import { Resvg } from '@resvg/resvg-js'

/** scale: 線画の大きさ（maskable は端が切られるので小さめ） */
function svg({ rounded, scale = 1 }) {
  const t = (n) => (256 + (n - 256) * scale).toFixed(1)
  const k = (n) => (n * scale).toFixed(1)
  const w = k(17)
  // 胸像: 頭の円、上に凸の肩の弧、ウエストへ絞れる V、ウエストの短い弧
  const head = `<circle cx="256" cy="${t(124)}" r="${k(40)}"/>`
  const torso =
    `<path d="M${t(92)} ${t(246)}` +
    `Q${t(256)} ${t(190)} ${t(420)} ${t(246)}` + // 肩
    `L${t(336)} ${t(392)}` + // 右脇
    `Q${t(256)} ${t(416)} ${t(176)} ${t(392)}` + // ウエスト
    `Z"/>`
  // 胸の線（肩の弧と平行に、少し下）
  const chest = `<path d="M${t(150)} ${t(300)}Q${t(256)} ${t(262)} ${t(362)} ${t(300)}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="#000"/>
  <g fill="none" stroke="#fff" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round">
    ${head}
    ${torso}
    ${chest}
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
