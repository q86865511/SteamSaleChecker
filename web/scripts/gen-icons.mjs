// 由品牌標(降價長條)產生 PWA PNG 圖示與 OG 分享圖。
// 用 Astro already-installed 的 sharp 柵格化 SVG。產物 commit 進 web/public。
// 執行:node web/scripts/gen-icons.mjs
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PUB = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
const ICON_BG = '#16202d', ACCENT = '#66c0f4', PRICE = '#beee11';

// 全幅(無圓角)圖示,適合 maskable
const iconSvg = (s) => `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 32 32">
  <rect width="32" height="32" fill="${ICON_BG}"/>
  <rect x="6.5" y="8" width="4.2" height="16" rx="1.6" fill="${ACCENT}"/>
  <rect x="13.9" y="13" width="4.2" height="11" rx="1.6" fill="${ACCENT}"/>
  <rect x="21.3" y="17" width="4.2" height="7" rx="1.6" fill="${PRICE}"/>
</svg>`;

// OG 分享圖(1200×630):品牌長條 + 英文 wordmark(避免跨平台 CJK 字型缺字)
const ogSvg = () => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0e1622"/>
  <g transform="translate(110,232)">
    <rect x="0" y="0" width="44" height="168" rx="11" fill="${ACCENT}"/>
    <rect x="70" y="52" width="44" height="116" rx="11" fill="${ACCENT}"/>
    <rect x="140" y="100" width="44" height="68" rx="11" fill="${PRICE}"/>
  </g>
  <text x="350" y="300" font-family="Arial,Helvetica,sans-serif" font-size="82" font-weight="700" fill="#e6edf3">Steam Sale Tracker</text>
  <text x="352" y="372" font-family="Arial,Helvetica,sans-serif" font-size="34" fill="#8aa0b5">Top deals &amp; free games · self-tracked price history</text>
  <text x="352" y="430" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#66c0f4">steam.terrychou.com</text>
</svg>`;

await sharp(Buffer.from(iconSvg(512))).png().toFile(join(PUB, 'icon-512.png'));
await sharp(Buffer.from(iconSvg(192))).png().toFile(join(PUB, 'icon-192.png'));
await sharp(Buffer.from(ogSvg())).png().toFile(join(PUB, 'og-image.png'));
console.log('generated icon-192.png, icon-512.png, og-image.png in', PUB);
