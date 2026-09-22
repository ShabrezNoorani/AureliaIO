// One-off generator for PWA icon PNGs, rasterized from the app's existing hexagon brand mark
// (src/components/Logo.tsx) via sharp. Not part of the app bundle or build — run manually
// whenever the brand mark changes: `node scripts/gen-pwa-icons.mjs`.
import sharp from 'sharp';
import { mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = '#0a0a0f';
const GOLD = '#f5a623';

// Same paths as Logo.tsx's hexagon mark, in its native 0-40 viewBox. Hexagon center is (20,20).
const hexagonGroup = `
  <path d="M20 2L36.66 11V29L20 38L3.34 29V11L20 2Z" stroke="${GOLD}" stroke-width="2" fill="${GOLD}" fill-opacity="0.15" />
  <path d="M12 26L18 19L23 23L29 14" stroke="${BG}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
  <path d="M12 26L18 19L23 23L29 14" stroke="${GOLD}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" />
  <circle cx="29" cy="14" r="2.8" fill="${GOLD}" />
`;

// scale: how large the (40x40-space) hexagon renders within the `size` canvas. Larger scale = less
// padding. Maskable icons need generous padding (OS applies circle/squircle/rounded-square masks
// that crop toward the center) — the hexagon's own farthest vertex is ~18.9 units from its center,
// so scale 8 keeps it inside the standard 80%-safe-zone circle with margin to spare.
const svgFor = (size, scale) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="${BG}" />
  <g transform="translate(${size / 2},${size / 2}) scale(${scale}) translate(-20,-20)">
    ${hexagonGroup}
  </g>
</svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, scale: 9.6 },
  { file: 'icon-512.png', size: 512, scale: 9.6 },
  { file: 'icon-maskable-192.png', size: 192, scale: 8 },
  { file: 'icon-maskable-512.png', size: 512, scale: 8 },
  { file: 'apple-touch-icon.png', size: 180, scale: 9.6 },
];

for (const t of targets) {
  const svg = svgFor(t.size, t.scale);
  await sharp(Buffer.from(svg)).png().toFile(path.join(outDir, t.file));
  console.log('wrote', t.file);
}
