import { mkdir, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const sourceDir = path.resolve('assets/sprites/source');
const outputDir = path.resolve('public/sprites');

const TILE_MAX = 84;
const ENEMY_MAX = 116;
const TOWER_AND_SELECTOR_MAX = 150;
const BASE_MAX = 252;

const targets = {
    base_1: BASE_MAX,
    grass_1: TILE_MAX,
    grass_2: TILE_MAX,
    grass_3: TILE_MAX,
    grass_4: TILE_MAX,
    grass_5: TILE_MAX,
    tarmac_1: TILE_MAX,
    tarmac_2: TILE_MAX,
    tarmac_3: TILE_MAX,
    tree_1: TILE_MAX,
    tree_2: TILE_MAX,
    monster_1_hurt: ENEMY_MAX,
    monster_1_run: ENEMY_MAX,
    monster_1_stop: ENEMY_MAX,
    monster_2_hurt: ENEMY_MAX,
    monster_2_run: ENEMY_MAX,
    monster_2_stop: ENEMY_MAX,
    monster_3_hurt: ENEMY_MAX,
    monster_3_run: ENEMY_MAX,
    monster_3_stop: ENEMY_MAX,
    monster_4_hurt: ENEMY_MAX,
    monster_4_run: ENEMY_MAX,
    monster_4_stop: ENEMY_MAX,
    turrent_cluster_bomb: TOWER_AND_SELECTOR_MAX,
    turret_basic: TOWER_AND_SELECTOR_MAX,
    turret_cluster: TOWER_AND_SELECTOR_MAX,
    turret_sidewinder: TOWER_AND_SELECTOR_MAX,
    wall: TOWER_AND_SELECTOR_MAX,
};

function formatBytes(bytes) {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KiB`;
    }
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}

const files = (await readdir(sourceDir)).filter((file) => file.endsWith('.png')).sort();
const configuredFiles = new Set(Object.keys(targets).map((name) => `${name}.png`));
const unknownFiles = files.filter((file) => !configuredFiles.has(file));
const missingFiles = [...configuredFiles].filter((file) => !files.includes(file));

if (unknownFiles.length || missingFiles.length) {
    if (unknownFiles.length) {
        console.error(`Missing optimization target for: ${unknownFiles.join(', ')}`);
    }
    if (missingFiles.length) {
        console.error(`Configured target has no source image: ${missingFiles.join(', ')}`);
    }
    process.exit(1);
}

await mkdir(outputDir, { recursive: true });

let beforeBytes = 0;
let afterBytes = 0;
const rows = [];

for (const file of files) {
    const basename = path.basename(file, '.png');
    const inputPath = path.join(sourceDir, file);
    const outputPath = path.join(outputDir, file);
    const maxDimension = targets[basename];
    const before = await stat(inputPath);
    const original = await sharp(inputPath).metadata();

    await sharp(inputPath)
        .resize({
            width: maxDimension,
            height: maxDimension,
            fit: 'inside',
            withoutEnlargement: true,
            kernel: sharp.kernel.lanczos3,
        })
        .png({
            compressionLevel: 9,
            effort: 10,
            palette: true,
            quality: 95,
        })
        .toFile(outputPath);

    const optimized = await sharp(outputPath).metadata();
    const after = await stat(outputPath);
    beforeBytes += before.size;
    afterBytes += after.size;
    rows.push({
        file,
        before: before.size,
        after: after.size,
        originalSize: `${original.width}x${original.height}`,
        optimizedSize: `${optimized.width}x${optimized.height}`,
    });
}

for (const row of rows) {
    const saving = row.before ? Math.round((1 - row.after / row.before) * 100) : 0;
    console.log(
        `${row.file.padEnd(26)} ${row.originalSize.padStart(8)} -> ${row.optimizedSize.padEnd(8)} ` +
            `${formatBytes(row.before).padStart(9)} -> ${formatBytes(row.after).padStart(9)} (${saving}% smaller)`,
    );
}

const totalSaving = beforeBytes ? Math.round((1 - afterBytes / beforeBytes) * 100) : 0;
console.log(`Sprites optimized: ${formatBytes(beforeBytes)} -> ${formatBytes(afterBytes)} (${totalSaving}% smaller)`);
