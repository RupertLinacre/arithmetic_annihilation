import type { EnemyType, TerrainType, TowerDifficulty, TowerType } from '../types';

export const GAME_CONFIG = {
    canvasWidth: 1280,
    canvasHeight: 800,
    map: {
        cols: 24,
        rows: 14,
        cellSize: 42,
        originX: 136,
        originY: 18,
    },
    baseHealth: 100,
    terrainCosts: {
        grass: 1.15,
        tarmac: 0.72,
        tree: Number.POSITIVE_INFINITY,
    } satisfies Record<TerrainType, number>,
    terrainSpeedMultiplier: {
        grass: 0.92,
        tarmac: 1.22,
        tree: 0,
    } satisfies Record<TerrainType, number>,
    threatWeight: 5.2,
    maxTowerThreatCost: 18,
    enemyStuck: {
        meaningfulProgressPixels: 8,
        stuckAfterSeconds: 2.5,
        panicSeconds: 3.25,
    },
    wall: {
        health: 10,
    },
    mapGenerationAttempts: 50,
    uiPanelHeight: 188,
};
export const TOWER_DIFFICULTY_TO_TYPE: Record<TowerDifficulty, TowerType> = {
    easy: 'easy',
    medium: 'spray',
    hard: 'missile',
    veryHard: 'cluster',
};

export const TOWER_BUILD_DIFFICULTIES: Record<TowerType, TowerDifficulty> = {
    easy: 'easy',
    spray: 'medium',
    missile: 'hard',
    flamethrower: 'hard',
    cluster: 'veryHard',
    wall: 'veryHard',
    airstrike: 'veryHard',
};

export const TOWER_UPGRADE_DIFFICULTIES: Record<TowerType, TowerDifficulty[]> = {
    easy: ['easy', 'easy', 'medium', 'medium', 'hard', 'hard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard'],
    spray: ['medium', 'medium', 'hard', 'hard', 'hard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard'],
    missile: ['hard', 'hard', 'hard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard'],
    flamethrower: ['hard', 'hard', 'hard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard'],
    cluster: ['veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard', 'veryHard'],
    wall: [],
    airstrike: [],
};

export const TOWER_LABELS: Record<TowerType, string> = {
    easy: 'Easy Bullet Tower',
    spray: 'Medium Spray Tower',
    missile: 'Hard Missile Tower',
    flamethrower: 'Hard Flamethrower Tower',
    cluster: 'Very Hard Cluster Tower',
    wall: 'Very Hard Wall',
    airstrike: 'Very Hard Airstrike',
};

export const DIFFICULTY_LABELS: Record<TowerDifficulty, string> = {
    easy: 'Easy',
    medium: 'Medium',
    hard: 'Hard',
    veryHard: 'Very Hard',
};

export interface TowerLevelStats {
    range: number;
    cooldownMs: number;
    damage: number;
    triggerRadius?: number;
    knockbackDistance?: number;
    bulletSpeed?: number;
    pelletCount?: number;
    spreadRadians?: number;
    missileCount?: number;
    missileSpeed?: number;
    missileTurnRate?: number;
    flameRotateRate?: number;
    flameArcRadians?: number;
    burnDamagePerSecond?: number;
    burnDurationMs?: number;
    burnSpreadRadius?: number;
    explosionRadius?: number;
    fragmentCount?: number;
    fragmentDamage?: number;
    threat: number;
}

export const TOWER_STATS: Record<TowerType, TowerLevelStats[]> = {
    easy: [
        { range: 150, cooldownMs: 660, damage: 13, bulletSpeed: 420, threat: 3.6 },
        { range: 168, cooldownMs: 330, damage: 13, bulletSpeed: 430, threat: 4.4 },
        { range: 186, cooldownMs: 230, damage: 14, bulletSpeed: 440, threat: 5.2 },
        { range: 205, cooldownMs: 180, damage: 16, bulletSpeed: 450, threat: 6.1 },
        { range: 225, cooldownMs: 150, damage: 18, bulletSpeed: 465, threat: 7.1 },
        { range: 246, cooldownMs: 130, damage: 20, bulletSpeed: 480, threat: 8.2 },
        { range: 268, cooldownMs: 115, damage: 22, bulletSpeed: 495, threat: 9.4 },
        { range: 291, cooldownMs: 105, damage: 24, bulletSpeed: 515, threat: 10.7 },
        { range: 315, cooldownMs: 96, damage: 27, bulletSpeed: 535, threat: 12.1 },
        { range: 340, cooldownMs: 88, damage: 30, bulletSpeed: 555, threat: 13.6 },
        { range: 366, cooldownMs: 82, damage: 33, bulletSpeed: 575, threat: 15.2 },
        { range: 393, cooldownMs: 76, damage: 36, bulletSpeed: 600, threat: 16.9 },
        { range: 421, cooldownMs: 72, damage: 40, bulletSpeed: 625, threat: 18.7 },
        { range: 450, cooldownMs: 68, damage: 44, bulletSpeed: 650, threat: 20.6 },
        { range: 480, cooldownMs: 64, damage: 48, bulletSpeed: 680, threat: 22.6 },
        { range: 512, cooldownMs: 60, damage: 52, bulletSpeed: 710, threat: 24.7 },
    ],
    spray: [
        { range: 138, cooldownMs: 1000, damage: 8, bulletSpeed: 390, pelletCount: 3, spreadRadians: 0.42, threat: 4.0 },
        { range: 158, cooldownMs: 670, damage: 8, bulletSpeed: 400, pelletCount: 4, spreadRadians: 0.48, threat: 4.8 },
        { range: 178, cooldownMs: 600, damage: 9, bulletSpeed: 410, pelletCount: 5, spreadRadians: 0.54, threat: 5.8 },
        { range: 198, cooldownMs: 550, damage: 10, bulletSpeed: 425, pelletCount: 6, spreadRadians: 0.6, threat: 6.7 },
        { range: 220, cooldownMs: 500, damage: 10, bulletSpeed: 440, pelletCount: 7, spreadRadians: 0.66, threat: 7.8 },
        { range: 242, cooldownMs: 460, damage: 10, bulletSpeed: 455, pelletCount: 8, spreadRadians: 0.72, threat: 9.0 },
        { range: 266, cooldownMs: 430, damage: 10, bulletSpeed: 475, pelletCount: 9, spreadRadians: 0.78, threat: 10.3 },
        { range: 290, cooldownMs: 410, damage: 10, bulletSpeed: 495, pelletCount: 10, spreadRadians: 0.84, threat: 11.7 },
        { range: 316, cooldownMs: 390, damage: 11, bulletSpeed: 515, pelletCount: 11, spreadRadians: 0.9, threat: 13.2 },
        { range: 342, cooldownMs: 372, damage: 11, bulletSpeed: 535, pelletCount: 12, spreadRadians: 0.96, threat: 14.8 },
        { range: 370, cooldownMs: 355, damage: 11, bulletSpeed: 560, pelletCount: 13, spreadRadians: 1.02, threat: 16.5 },
        { range: 398, cooldownMs: 338, damage: 12, bulletSpeed: 585, pelletCount: 14, spreadRadians: 1.08, threat: 18.3 },
        { range: 428, cooldownMs: 322, damage: 12, bulletSpeed: 610, pelletCount: 15, spreadRadians: 1.14, threat: 20.2 },
        { range: 458, cooldownMs: 306, damage: 12, bulletSpeed: 640, pelletCount: 16, spreadRadians: 1.2, threat: 22.2 },
        { range: 490, cooldownMs: 292, damage: 13, bulletSpeed: 670, pelletCount: 17, spreadRadians: 1.26, threat: 24.3 },
        { range: 522, cooldownMs: 278, damage: 13, bulletSpeed: 700, pelletCount: 18, spreadRadians: 1.32, threat: 26.5 },
    ],
    missile: [
        { range: 180, cooldownMs: 920, damage: 24, missileCount: 1, missileSpeed: 165, missileTurnRate: 2.0, threat: 5.0 },
        { range: 202, cooldownMs: 530, damage: 27, missileCount: 1, missileSpeed: 185, missileTurnRate: 2.25, threat: 6.2 },
        { range: 226, cooldownMs: 650, damage: 28, missileCount: 2, missileSpeed: 205, missileTurnRate: 2.55, threat: 7.5 },
        { range: 252, cooldownMs: 540, damage: 31, missileCount: 2, missileSpeed: 230, missileTurnRate: 2.85, threat: 9.0 },
        { range: 282, cooldownMs: 650, damage: 32, missileCount: 3, missileSpeed: 255, missileTurnRate: 3.15, threat: 10.7 },
        { range: 314, cooldownMs: 560, damage: 34, missileCount: 3, missileSpeed: 280, missileTurnRate: 3.45, threat: 12.6 },
        { range: 348, cooldownMs: 620, damage: 35, missileCount: 4, missileSpeed: 310, missileTurnRate: 3.8, threat: 14.8 },
        { range: 386, cooldownMs: 550, damage: 37, missileCount: 4, missileSpeed: 340, missileTurnRate: 4.15, threat: 17.2 },
        { range: 424, cooldownMs: 650, damage: 39, missileCount: 5, missileSpeed: 375, missileTurnRate: 4.55, threat: 19.8 },
        { range: 464, cooldownMs: 575, damage: 41, missileCount: 5, missileSpeed: 410, missileTurnRate: 4.95, threat: 22.7 },
        { range: 506, cooldownMs: 675, damage: 42, missileCount: 6, missileSpeed: 445, missileTurnRate: 5.35, threat: 25.8 },
        { range: 550, cooldownMs: 600, damage: 44, missileCount: 6, missileSpeed: 480, missileTurnRate: 5.75, threat: 29.1 },
        { range: 596, cooldownMs: 700, damage: 45, missileCount: 7, missileSpeed: 520, missileTurnRate: 6.2, threat: 32.6 },
        { range: 644, cooldownMs: 625, damage: 47, missileCount: 7, missileSpeed: 560, missileTurnRate: 6.65, threat: 36.3 },
        { range: 694, cooldownMs: 725, damage: 48, missileCount: 8, missileSpeed: 600, missileTurnRate: 7.1, threat: 40.2 },
        { range: 746, cooldownMs: 650, damage: 50, missileCount: 8, missileSpeed: 640, missileTurnRate: 7.55, threat: 44.3 },
    ],
    flamethrower: [
        { range: 112, cooldownMs: 1000, damage: 14, flameRotateRate: 0.9, flameArcRadians: 0.32, burnDamagePerSecond: 5, burnDurationMs: 1700, burnSpreadRadius: 34, threat: 5.0 },
        { range: 126, cooldownMs: 1000, damage: 16, flameRotateRate: 1.02, flameArcRadians: 0.32, burnDamagePerSecond: 5.8, burnDurationMs: 1750, burnSpreadRadius: 35, threat: 6.2 },
        { range: 140, cooldownMs: 1000, damage: 18, flameRotateRate: 1.14, flameArcRadians: 0.33, burnDamagePerSecond: 6.4, burnDurationMs: 1800, burnSpreadRadius: 36, threat: 7.5 },
        { range: 156, cooldownMs: 1000, damage: 20, flameRotateRate: 1.28, flameArcRadians: 0.33, burnDamagePerSecond: 7.1, burnDurationMs: 1850, burnSpreadRadius: 37, threat: 9.0 },
        { range: 172, cooldownMs: 1000, damage: 22, flameRotateRate: 1.42, flameArcRadians: 0.34, burnDamagePerSecond: 7.8, burnDurationMs: 1900, burnSpreadRadius: 38, threat: 10.7 },
        { range: 188, cooldownMs: 1000, damage: 24, flameRotateRate: 1.56, flameArcRadians: 0.34, burnDamagePerSecond: 8.6, burnDurationMs: 1950, burnSpreadRadius: 39, threat: 12.6 },
        { range: 204, cooldownMs: 1000, damage: 26, flameRotateRate: 1.7, flameArcRadians: 0.35, burnDamagePerSecond: 9.3, burnDurationMs: 2000, burnSpreadRadius: 40, threat: 14.8 },
        { range: 220, cooldownMs: 1000, damage: 28, flameRotateRate: 1.86, flameArcRadians: 0.35, burnDamagePerSecond: 10.1, burnDurationMs: 2050, burnSpreadRadius: 41, threat: 17.2 },
        { range: 238, cooldownMs: 1000, damage: 31, flameRotateRate: 2.02, flameArcRadians: 0.36, burnDamagePerSecond: 10.9, burnDurationMs: 2100, burnSpreadRadius: 42, threat: 19.8 },
        { range: 256, cooldownMs: 1000, damage: 34, flameRotateRate: 2.18, flameArcRadians: 0.36, burnDamagePerSecond: 11.8, burnDurationMs: 2150, burnSpreadRadius: 43, threat: 22.7 },
        { range: 274, cooldownMs: 1000, damage: 37, flameRotateRate: 2.34, flameArcRadians: 0.37, burnDamagePerSecond: 12.7, burnDurationMs: 2200, burnSpreadRadius: 44, threat: 25.8 },
        { range: 292, cooldownMs: 1000, damage: 40, flameRotateRate: 2.52, flameArcRadians: 0.37, burnDamagePerSecond: 13.6, burnDurationMs: 2250, burnSpreadRadius: 45, threat: 29.1 },
        { range: 310, cooldownMs: 1000, damage: 43, flameRotateRate: 2.7, flameArcRadians: 0.38, burnDamagePerSecond: 14.5, burnDurationMs: 2300, burnSpreadRadius: 46, threat: 32.6 },
        { range: 328, cooldownMs: 1000, damage: 46, flameRotateRate: 2.88, flameArcRadians: 0.38, burnDamagePerSecond: 15.5, burnDurationMs: 2350, burnSpreadRadius: 47, threat: 36.3 },
        { range: 348, cooldownMs: 1000, damage: 49, flameRotateRate: 3.06, flameArcRadians: 0.39, burnDamagePerSecond: 16.5, burnDurationMs: 2400, burnSpreadRadius: 48, threat: 40.2 },
        { range: 368, cooldownMs: 1000, damage: 52, flameRotateRate: 3.24, flameArcRadians: 0.39, burnDamagePerSecond: 17.5, burnDurationMs: 2450, burnSpreadRadius: 50, threat: 44.3 },
    ],
    cluster: [
        { range: 170, cooldownMs: 1600, damage: 19, bulletSpeed: 260, explosionRadius: 54, fragmentCount: 5, fragmentDamage: 6, threat: 5.6 },
        { range: 195, cooldownMs: 1100, damage: 24, bulletSpeed: 275, explosionRadius: 64, fragmentCount: 6, fragmentDamage: 8, threat: 7.0 },
        { range: 220, cooldownMs: 970, damage: 29, bulletSpeed: 292, explosionRadius: 74, fragmentCount: 8, fragmentDamage: 9, threat: 8.6 },
        { range: 246, cooldownMs: 930, damage: 35, bulletSpeed: 310, explosionRadius: 86, fragmentCount: 9, fragmentDamage: 11, threat: 10.4 },
        { range: 274, cooldownMs: 1050, damage: 42, bulletSpeed: 330, explosionRadius: 98, fragmentCount: 12, fragmentDamage: 13, threat: 12.5 },
        { range: 304, cooldownMs: 1060, damage: 50, bulletSpeed: 352, explosionRadius: 112, fragmentCount: 13, fragmentDamage: 15, threat: 14.9 },
        { range: 336, cooldownMs: 1040, damage: 59, bulletSpeed: 376, explosionRadius: 126, fragmentCount: 14, fragmentDamage: 16, threat: 17.4 },
        { range: 370, cooldownMs: 1100, damage: 69, bulletSpeed: 402, explosionRadius: 142, fragmentCount: 16, fragmentDamage: 18, threat: 20.2 },
        { range: 406, cooldownMs: 1120, damage: 78, bulletSpeed: 430, explosionRadius: 156, fragmentCount: 17, fragmentDamage: 19, threat: 23.1 },
        { range: 444, cooldownMs: 1140, damage: 88, bulletSpeed: 458, explosionRadius: 170, fragmentCount: 18, fragmentDamage: 20, threat: 26.2 },
        { range: 484, cooldownMs: 1160, damage: 99, bulletSpeed: 488, explosionRadius: 184, fragmentCount: 19, fragmentDamage: 21, threat: 29.5 },
        { range: 526, cooldownMs: 1180, damage: 111, bulletSpeed: 520, explosionRadius: 198, fragmentCount: 20, fragmentDamage: 22, threat: 33.0 },
        { range: 570, cooldownMs: 1200, damage: 124, bulletSpeed: 554, explosionRadius: 214, fragmentCount: 21, fragmentDamage: 24, threat: 36.8 },
        { range: 616, cooldownMs: 1220, damage: 138, bulletSpeed: 590, explosionRadius: 230, fragmentCount: 22, fragmentDamage: 25, threat: 40.8 },
        { range: 664, cooldownMs: 1240, damage: 153, bulletSpeed: 628, explosionRadius: 246, fragmentCount: 23, fragmentDamage: 27, threat: 45.1 },
        { range: 714, cooldownMs: 1260, damage: 169, bulletSpeed: 668, explosionRadius: 264, fragmentCount: 24, fragmentDamage: 29, threat: 49.6 },
    ],
    wall: [
        { range: 0, cooldownMs: 0, damage: 0, threat: 0 },
    ],
    airstrike: [
        { range: 0, cooldownMs: 0, damage: 220, knockbackDistance: 170, threat: 0 },
    ],
};

export interface EnemyStats {
    health: number;
    speed: number;
    radius: number;
    baseDamage: number;
}

export const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
    scout: { health: 34, speed: 88, radius: 10, baseDamage: 2 },
    grunt: { health: 72, speed: 61, radius: 13, baseDamage: 5 },
    tank: { health: 180, speed: 38, radius: 17, baseDamage: 12 },
};

export const ENEMY_COLORS: Record<EnemyType, number> = {
    scout: 0xffd166,
    grunt: 0xef476f,
    tank: 0x8ecae6,
};

export const TOWER_COLORS: Record<TowerType, number> = {
    easy: 0x2ec4b6,
    spray: 0xff9f1c,
    missile: 0xbde0fe,
    flamethrower: 0xff3030,
    cluster: 0xf15bb5,
    wall: 0xe53935,
    airstrike: 0xf7f0d6,
};
