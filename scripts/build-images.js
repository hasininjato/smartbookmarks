const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BLUE = '#2196F3';

const LOGO_PATH = `
  M4.3 13.1 V2.6 Q4.3 2 4.9 2 H11.1 Q11.7 2 11.7 2.6 V13.1 L8 10.8 Z
  M7.1 5.3 L5.5 6.5 L7.1 7.7 L7.1 7.1 L6.3 6.5 L7.1 5.9 Z
  M8.9 5.3 L10.5 6.5 L8.9 7.7 L8.9 7.1 L9.7 6.5 L8.9 5.9 Z
  M8.3 5.2 L9 5.2 L7.7 7.7 L7 7.7 Z`;

// Bannière README : icône + nom + slogan
const bannerSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 160">
  <svg x="28" y="18" width="82" height="124" viewBox="4.3 2 7.4 11.1">
    <path fill="${BLUE}" fill-rule="evenodd" d="${LOGO_PATH}"/>
  </svg>
  <text x="140" y="92" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="46" font-weight="700" fill="#1F2328">Smart Bookmarks</text>
  <text x="142" y="130" font-family="Segoe UI, Helvetica, Arial, sans-serif"
        font-size="25" fill="#57606A">Code moves. Bookmarks follow.</text>
</svg>`;

async function main() {
  fs.mkdirSync('resources', { recursive: true });

  // 1. Bannière README (1000 x 250)
  await sharp(Buffer.from(bannerSvg), { density: 200 })
    .resize({ width: 1000 })
    .png()
    .toFile(path.join('resources', 'smartbookmarks-readme.png'));
  console.log('OK  resources/smartbookmarks-readme.png (1000x250)');

  // 2. Icône Marketplace : gutter.svg agrandi en 128x128, fond transparent
  await sharp('resources/gutter.svg', { density: 600 })
    .resize(128, 128, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join('resources', 'icon.png'));
  console.log('OK  resources/icon.png (128x128, issu de gutter.svg)');
}

main().catch((err) => { console.error(err); process.exit(1); });