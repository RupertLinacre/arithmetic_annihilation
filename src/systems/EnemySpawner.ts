import { GAME_CONFIG } from '../config/gameConfig';
import { SeededRandom } from '../core/SeededRandom';
import { createEnemy } from '../entities/Enemy';
import { calculateTotalTowerDamagePerSecond } from '../entities/Tower';
import { cellCenter } from '../map/Grid';
import type { EnemyState, EnemyType, GridPoint, MapGeometry, TowerState } from '../types';

const INITIAL_SPAWN_DELAY_MS = 2800;
const MAX_SPAWN_INTERVAL_MS = 5200;

export type GameDifficulty = 'veryEasy' | 'easy' | 'medium' | 'hard' | 'veryHard';

interface DifficultyTuning {
    rampMultiplier: number;
    towerMultiplier: number;
    minSpawnIntervalMs: number;
    enemyPressureMultiplier: number;
    healthMultiplier: number;
}

const DIFFICULTY_TUNING: Record<GameDifficulty, DifficultyTuning> = {
    veryEasy: { rampMultiplier: 0.55, towerMultiplier: 0.58, minSpawnIntervalMs: 820, enemyPressureMultiplier: 0.62, healthMultiplier: 0.62 },
    easy: { rampMultiplier: 0.76, towerMultiplier: 0.76, minSpawnIntervalMs: 660, enemyPressureMultiplier: 0.8, healthMultiplier: 0.8 },
    medium: { rampMultiplier: 0.92, towerMultiplier: 0.88, minSpawnIntervalMs: 540, enemyPressureMultiplier: 0.92, healthMultiplier: 0.9 },
    hard: { rampMultiplier: 1.16, towerMultiplier: 1.12, minSpawnIntervalMs: 450, enemyPressureMultiplier: 1.14, healthMultiplier: 1.1 },
    veryHard: { rampMultiplier: 1.42, towerMultiplier: 1.34, minSpawnIntervalMs: 360, enemyPressureMultiplier: 1.35, healthMultiplier: 1.3 },
};

export interface SpawnPressure {
    totalTowerDps: number;
    baseSpawnRatePerSecond: number;
    towerSpawnRateBonusPerSecond: number;
    performanceMultiplier: number;
    spawnRatePerSecond: number;
    intervalMs: number;
    enemyPressure: number;
}

export interface SpawnPressureContext {
    difficulty?: GameDifficulty;
    baseHealthPercent?: number;
    activeEnemyCount?: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export function isGameDifficulty(value: string): value is GameDifficulty {
    return value in DIFFICULTY_TUNING;
}

export function calculateSpawnPressure(elapsedSeconds: number, totalTowerDps: number, context: SpawnPressureContext = {}): SpawnPressure {
    const safeElapsedSeconds = Math.max(0, elapsedSeconds);
    const safeTowerDps = Math.max(0, totalTowerDps);
    const difficulty = DIFFICULTY_TUNING[context.difficulty ?? 'medium'];
    const healthPercent = clamp(context.baseHealthPercent ?? 1, 0, 1);
    const activeEnemyCount = Math.max(0, context.activeEnemyCount ?? 0);
    const healthRelief = (1 - healthPercent) * 0.38;
    const crowdRelief = clamp((activeEnemyCount - 11) / 24, 0, 0.34);
    const cruisingBonus = healthPercent > 0.86 && activeEnemyCount < 7 ? 0.12 : 0;
    const performanceMultiplier = clamp(1 + cruisingBonus - healthRelief - crowdRelief, 0.48, 1.18);
    const earlyTimeRamp = 0.34 * (1 - Math.exp(-safeElapsedSeconds / 44));
    const longTimeRamp = safeElapsedSeconds * 0.00165;
    const baseSpawnRatePerSecond = 0.22 + earlyTimeRamp + longTimeRamp;
    const towerReadiness = 1 - Math.exp(-safeElapsedSeconds / 12);
    const towerPressure = safeTowerDps / (safeTowerDps + 280) * 0.58 + safeTowerDps * 0.00022;
    const towerSpawnRateBonusPerSecond = towerReadiness * Math.min(0.86, towerPressure) * difficulty.towerMultiplier * performanceMultiplier;
    const spawnRatePerSecond = baseSpawnRatePerSecond * difficulty.rampMultiplier + towerSpawnRateBonusPerSecond;
    const intervalMs = clamp(1000 / spawnRatePerSecond, difficulty.minSpawnIntervalMs, MAX_SPAWN_INTERVAL_MS);
    const enemyPressure = (safeElapsedSeconds / 72 + safeTowerDps / 155 * performanceMultiplier) * difficulty.enemyPressureMultiplier;
    return { totalTowerDps: safeTowerDps, baseSpawnRatePerSecond, towerSpawnRateBonusPerSecond, performanceMultiplier, spawnRatePerSecond, intervalMs, enemyPressure };
}

export class EnemySpawner {
    private elapsedSeconds = 0;
    private spawnTimerMs = INITIAL_SPAWN_DELAY_MS;
    private nextEnemyId = 1;
    private currentTowerDps = 0;

    constructor(private readonly spawns: readonly GridPoint[], private readonly geometry: MapGeometry, private readonly rng: SeededRandom) { }

    update(deltaMs: number, towers: readonly Pick<TowerState, 'type' | 'level'>[] = [], context: SpawnPressureContext = {}): EnemyState[] {
        this.elapsedSeconds += deltaMs / 1000;
        this.currentTowerDps = calculateTotalTowerDamagePerSecond(towers);
        this.spawnTimerMs -= deltaMs;
        const spawned: EnemyState[] = [];
        const pressure = calculateSpawnPressure(this.elapsedSeconds, this.currentTowerDps, context);
        while (this.spawnTimerMs <= 0) {
            this.spawnTimerMs += pressure.intervalMs * (0.78 + this.rng.next() * 0.45);
            spawned.push(this.createScaledEnemy(context));
        }
        return spawned;
    }

    private createScaledEnemy(context: SpawnPressureContext): EnemyState {
        const spawn = this.rng.choice(this.spawns);
        const center = cellCenter(spawn, this.geometry);
        const type = this.chooseEnemyType(context);
        const pressure = calculateSpawnPressure(this.elapsedSeconds, this.currentTowerDps, context);
        const difficulty = DIFFICULTY_TUNING[context.difficulty ?? 'medium'];
        const towerHealthPressure = Math.min(0.18, this.currentTowerDps / (this.currentTowerDps + 520) * 0.22 * pressure.performanceMultiplier);
        const healthScale = 1 + (this.elapsedSeconds / 230 + Math.floor(this.elapsedSeconds / 125) * 0.08 + towerHealthPressure) * difficulty.healthMultiplier;
        const jitter = GAME_CONFIG.map.cellSize * 0.18;
        return createEnemy(
            this.nextEnemyId++,
            type,
            center.x + (this.rng.next() - 0.5) * jitter,
            center.y + (this.rng.next() - 0.5) * jitter,
            healthScale,
        );
    }

    private chooseEnemyType(context: SpawnPressureContext): EnemyType {
        const pressure = calculateSpawnPressure(this.elapsedSeconds, this.currentTowerDps, context);
        if (this.elapsedSeconds < 24) {
            return 'scout';
        }
        const scoutWeight = clamp(0.82 - pressure.enemyPressure * 0.14, 0.2, 0.82);
        const gruntWeight = clamp(0.2 + pressure.enemyPressure * 0.15, 0.18, 0.62);
        const tankWeight = this.elapsedSeconds < 55 ? 0 : clamp((pressure.enemyPressure - 0.9) * 0.16, 0, 0.48);
        if (Math.floor(this.elapsedSeconds) % 95 === 0 && this.elapsedSeconds > 55 && this.rng.chance(0.14)) {
            return 'tank';
        }
        return this.rng.weightedChoice(['scout', 'grunt', 'tank'], [scoutWeight, gruntWeight, tankWeight]);
    }
}
