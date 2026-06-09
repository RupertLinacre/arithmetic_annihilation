import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');
const sourceSprite = path.join(repoRoot, 'public', 'sprites', 'turret_sidewinder.png');
const outputDir = path.join(repoRoot, 'public', 'icons');

const BACKGROUND = { r: 19, g: 33, b: 25, alpha: 1 };
const ACCENT = { r: 79, g: 180, b: 119, alpha: 1 };

async function renderIcon({ size, fileName, safeAreaRatio }) {
    const canvas = sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: BACKGROUND,
        },
    });

    const ringRadius = Math.round(size * 0.46);
    const ring = Buffer.from(
        `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${ringRadius}" fill="none" ` +
        `stroke="rgb(${ACCENT.r},${ACCENT.g},${ACCENT.b})" stroke-width="${Math.max(4, Math.round(size * 0.03))}" stroke-opacity="0.6"/>` +
        `</svg>`,
    );

    const spriteSize = Math.round(size * safeAreaRatio);
    const sprite = await sharp(sourceSprite)
        .resize(spriteSize, spriteSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toBuffer();

    const offset = Math.round((size - spriteSize) / 2);

    return canvas
        .composite([
            { input: ring, top: 0, left: 0 },
            { input: sprite, top: offset, left: offset },
        ])
        .png()
        .toFile(path.join(outputDir, fileName));
}

await mkdir(outputDir, { recursive: true });

await renderIcon({ size: 192, fileName: 'icon-192.png', safeAreaRatio: 0.64 });
await renderIcon({ size: 512, fileName: 'icon-512.png', safeAreaRatio: 0.64 });
// Maskable icons keep content inside the inner ~80% safe zone.
await renderIcon({ size: 512, fileName: 'icon-maskable-512.png', safeAreaRatio: 0.5 });

console.log('PWA icons written to public/icons');
