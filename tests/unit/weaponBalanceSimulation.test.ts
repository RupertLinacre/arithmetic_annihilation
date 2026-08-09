import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy, updateEnemy } from '../../src/entities/Enemy';
import { createTower } from '../../src/entities/Tower';
import { isBaseFootprintCell } from '../../src/map/BaseFootprint';
import { cellCenter, Grid } from '../../src/map/Grid';
import { generateMultiplayerMap } from '../../src/map/MapGenerator';
import { hasLineOfSight } from '../../src/map/LineOfSight';
import { buildFlowField } from '../../src/pathfinding/FlowField';
import { calculateTowerThreatCosts, createEmptyCostGrid, getTowerStats } from '../../src/pathfinding/ThreatMap';
import { getMultiplayerTowerQuestionValue, OFFENSE_HEALTH_PER_MINUTE_PER_POINT } from '../../src/multiplayer/BalanceConfig';
import { ProjectileSystem } from '../../src/systems/ProjectileSystem';
import { TowerSystem } from '../../src/systems/TowerSystem';
import type { EnemyState, ProjectileState, TowerType } from '../../src/types';

type CombatTowerType = Exclude<TowerType, 'wall' | 'airstrike'>;

const COMBAT_TOWERS: CombatTowerType[] = ['easy', 'spray', 'missile', 'flamethrower', 'cluster'];
const MOVING_WAVE_STEP_MS = 50;

function traceAttackPaths(seed: number): Array<{ x: number; y: number }> {
    const map = generateMultiplayerMap(seed);
    const flow = buildFlowField(map.grid, map.bases!.solar, createEmptyCostGrid(map.grid));
    const paths: Array<{ x: number; y: number }> = [];
    const laneRows = [Math.floor(map.grid.rows * 0.3), Math.floor(map.grid.rows / 2), Math.floor(map.grid.rows * 0.72)];
    for (const [index, row] of laneRows.entries()) {
        const start = cellCenter({ x: map.bases!.lunar.x, y: row }, GAME_CONFIG.map);
        const enemy = createEnemy(index + 1, 'scout', start.x, start.y, 1, 'lunar');
        for (let elapsed = 0; elapsed < 15_000; elapsed += 100) {
            paths.push({ x: enemy.x, y: enemy.y });
            if (updateEnemy(enemy, 0.1, flow, flow, map.grid, GAME_CONFIG.map, [enemy])) break;
        }
    }
    return paths;
}

function chooseSensibleTowerCell(seed: number, type: CombatTowerType, level: number) {
    const map = generateMultiplayerMap(seed);
    const path = traceAttackPaths(seed);
    const stats = getTowerStats({ type, level, teamId: 'solar' });
    let best: { x: number; y: number; score: number } | undefined;
    map.grid.forEachCell((x, y) => {
        const cell = { x, y };
        if (x >= map.grid.cols / 2 || !map.grid.isBuildable(x, y)
            || isBaseFootprintCell(map.bases!.solar, cell, map.grid)
            || isBaseFootprintCell(map.bases!.lunar, cell, map.grid)) return;
        const center = cellCenter(cell, GAME_CONFIG.map);
        const score = path.reduce((sum, point) => {
            const distance = Math.hypot(point.x - center.x, point.y - center.y);
            return sum + (distance <= stats.range && hasLineOfSight(map.grid, center, point, GAME_CONFIG.map) ? 1 - distance / stats.range * 0.35 : 0);
        }, 0);
        if (!best || score > best.score) best = { x, y, score };
    });
    if (!best) throw new Error('No sensible multiplayer tower placement found.');
    return { x: best.x, y: best.y };
}

function simulateMovingWave(seed: number, type: CombatTowerType, questionPoints: number) {
    const map = generateMultiplayerMap(seed);
    const questionValue = getMultiplayerTowerQuestionValue(type);
    const level = Math.max(1, Math.floor(questionPoints / questionValue));
    const cell = chooseSensibleTowerCell(seed, type, level);
    const tower = createTower(1, cell.x, cell.y, type, 'solar');
    tower.level = level;
    const flow = buildFlowField(map.grid, map.bases!.solar, calculateTowerThreatCosts(map.grid, [tower], GAME_CONFIG.map));
    const emergencyFlow = buildFlowField(map.grid, map.bases!.solar, createEmptyCostGrid(map.grid));
    const towerSystem = new TowerSystem();
    const projectileSystem = new ProjectileSystem();
    const laneRows = [Math.floor(map.grid.rows * 0.3), Math.floor(map.grid.rows / 2), Math.floor(map.grid.rows * 0.72)];
    const waveTypes = ['scout', 'scout', 'grunt', 'tank'] as const;
    let enemies: EnemyState[] = [];
    let projectiles: ProjectileState[] = [];
    let nextEnemyId = 1;
    let totalHealth = 0;
    let damage = 0;
    let leakedBaseDamage = 0;

    for (let elapsed = 0; elapsed < 150_000; elapsed += MOVING_WAVE_STEP_MS) {
        if (elapsed < 90_000 && elapsed % 2_000 === 0) {
            const typeIndex = Math.floor(elapsed / 2_000) % waveTypes.length;
            const row = laneRows[Math.floor(elapsed / 2_000) % laneRows.length];
            const start = cellCenter({ x: map.bases!.lunar.x, y: row }, GAME_CONFIG.map);
            const enemy = createEnemy(nextEnemyId++, waveTypes[typeIndex], start.x, start.y, 1, 'lunar');
            enemies.push(enemy);
            totalHealth += enemy.health;
        }

        const survivors: EnemyState[] = [];
        for (const enemy of enemies) {
            if (enemy.health <= 0) continue;
            if (updateEnemy(enemy, MOVING_WAVE_STEP_MS / 1000, flow, emergencyFlow, map.grid, GAME_CONFIG.map, enemies)) {
                leakedBaseDamage += enemy.baseDamage;
            } else {
                survivors.push(enemy);
            }
        }
        enemies = survivors;
        const healthBefore = enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.health), 0);
        const towerResult = towerSystem.update(MOVING_WAVE_STEP_MS, [tower], enemies, map.grid, GAME_CONFIG.map, flow);
        projectiles.push(...towerResult.projectiles);
        projectiles = projectileSystem.update(MOVING_WAVE_STEP_MS, projectiles, enemies, map.grid, GAME_CONFIG.map).projectiles;
        const healthAfter = enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.health), 0);
        damage += healthBefore - healthAfter;
        enemies = enemies.filter((enemy) => enemy.health > 0);
    }
    return { weapon: type, level, damageShare: damage / totalHealth, leakedBaseDamage };
}

describe('multiplayer weapon moving-wave balance', () => {
    it('keeps equal-question loadouts competitive across generated maps and upgrade stages', () => {
        const questionPointLevels = [2, 4, 8] as const;
        const results = COMBAT_TOWERS.flatMap((type) => questionPointLevels.flatMap((questionPoints) => (
            Array.from({ length: 12 }, (_, seed) => ({ ...simulateMovingWave(seed + 1, type, questionPoints), questionPoints }))
        )));
        const summary = COMBAT_TOWERS.flatMap((type) => questionPointLevels.map((questionPoints) => {
            const rows = results.filter((row) => row.weapon === type && row.questionPoints === questionPoints);
            return {
                weapon: type,
                questionPoints,
                damageShare: rows.reduce((sum, row) => sum + row.damageShare, 0) / rows.length,
                leakedBaseDamage: rows.reduce((sum, row) => sum + row.leakedBaseDamage, 0) / rows.length,
            };
        }));
        expect(summary).toHaveLength(COMBAT_TOWERS.length * questionPointLevels.length);
        for (const questionPoints of questionPointLevels) {
            const stage = summary.filter((row) => row.questionPoints === questionPoints);
            const leakedDamage = stage.map((row) => row.leakedBaseDamage);
            expect(Math.max(...leakedDamage) - Math.min(...leakedDamage)).toBeLessThanOrEqual(18);
        }
    });

    it('keeps an airstrike a strong emergency action without exceeding a two-point offense wave', () => {
        const grid = new Grid(GAME_CONFIG.map.cols, GAME_CONFIG.map.rows, 'grass');
        const target = { x: 8, y: 7 };
        const center = cellCenter(target, GAME_CONFIG.map);
        const types = ['scout', 'grunt', 'tank', 'tank'] as const;
        const enemies = types.map((type, index) => {
            const enemy = createEnemy(
                index + 1,
                type,
                center.x + (index % 2) * GAME_CONFIG.map.cellSize,
                center.y + Math.floor(index / 2) * GAME_CONFIG.map.cellSize,
                index === 3 ? 1.6 : 1,
                'lunar',
            );
            return enemy;
        });
        const initialHealth = enemies.reduce((sum, enemy) => sum + enemy.health, 0);

        new TowerSystem().detonateAirstrike(target, enemies, grid, GAME_CONFIG.map, 'solar');

        const damage = initialHealth - enemies.reduce((sum, enemy) => sum + Math.max(0, enemy.health), 0);
        const twoPointOffenseMinute = OFFENSE_HEALTH_PER_MINUTE_PER_POINT * 2;
        expect(damage).toBeGreaterThan(twoPointOffenseMinute * 0.5);
        expect(damage).toBeLessThan(twoPointOffenseMinute);
    });
});
