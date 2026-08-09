import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy } from '../../src/entities/Enemy';
import { createTower } from '../../src/entities/Tower';
import { cellCenter, Grid } from '../../src/map/Grid';
import { buildFlowField } from '../../src/pathfinding/FlowField';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import { DEFENSE_DAMAGE_PER_MINUTE_PER_POINT, getMultiplayerTowerQuestionValue, OFFENSE_HEALTH_PER_MINUTE_PER_POINT } from '../../src/multiplayer/BalanceConfig';
import { simulateSelfPlay, type SelfPlayStrategy } from '../../src/multiplayer/BalanceSimulation';
import { ProjectileSystem } from '../../src/systems/ProjectileSystem';
import { TowerSystem } from '../../src/systems/TowerSystem';
import type { EnemyState, ProjectileState, TowerType } from '../../src/types';

type CombatTowerType = Exclude<TowerType, 'wall' | 'airstrike'>;
type Formation = 'focused' | 'clustered' | 'distributed';

const COMBAT_TOWERS: CombatTowerType[] = ['easy', 'spray', 'missile', 'flamethrower', 'cluster'];
const FORMATIONS: Formation[] = ['focused', 'clustered', 'distributed'];
const STEP_MS = 25;
const DURATION_MS = 30_000;
const BENCHMARK_HEALTH = 1_000_000;
const BALANCED_STRATEGY: SelfPlayStrategy = {
    name: 'weapon-balance', offenseShare: 0.52, advancedShare: 0.42, highTowerShare: 0.42, utilization: 0.8, answerSeconds: 8,
};

function formationOffsets(formation: Formation): Array<{ x: number; y: number }> {
    if (formation === 'focused') {
        return [{ x: 72, y: 0 }];
    }
    if (formation === 'clustered') {
        return Array.from({ length: 8 }, (_, index) => ({
            x: 72 + (index % 2) * 9,
            y: (index - 3.5) * 13,
        }));
    }
    return Array.from({ length: 12 }, (_, index) => {
        const angle = index / 12 * Math.PI * 2;
        return { x: Math.cos(angle) * 76, y: Math.sin(angle) * 76 };
    });
}

function createBenchmarkEnemies(center: { x: number; y: number }, formation: Formation): EnemyState[] {
    return formationOffsets(formation).map((offset, index) => {
        const enemy = createEnemy(index + 1, 'tank', center.x + offset.x, center.y + offset.y, 1, 'lunar');
        enemy.health = BENCHMARK_HEALTH;
        enemy.maxHealth = BENCHMARK_HEALTH;
        return enemy;
    });
}

function simulateDamagePerMinute(type: CombatTowerType, level: number, formation: Formation): number {
    const grid = new Grid(GAME_CONFIG.map.cols, GAME_CONFIG.map.rows, 'grass');
    const towerCell = { x: 8, y: 7 };
    const center = cellCenter(towerCell, GAME_CONFIG.map);
    const flow = buildFlowField(grid, { x: 22, y: 7 }, createEmptyCostGrid(grid));
    const tower = createTower(1, towerCell.x, towerCell.y, type, 'solar');
    tower.level = level;
    tower.flameAngleRadians = 0;
    const enemies = createBenchmarkEnemies(center, formation);
    const towerSystem = new TowerSystem();
    const projectileSystem = new ProjectileSystem();
    let projectiles: ProjectileState[] = [];
    const initialHealth = enemies.reduce((sum, enemy) => sum + enemy.health, 0);

    for (let elapsed = 0; elapsed < DURATION_MS; elapsed += STEP_MS) {
        const towerResult = towerSystem.update(STEP_MS, [tower], enemies, grid, GAME_CONFIG.map, flow);
        projectiles.push(...towerResult.projectiles);
        projectiles = projectileSystem.update(STEP_MS, projectiles, enemies, grid, GAME_CONFIG.map).projectiles;
    }

    const remainingHealth = enemies.reduce((sum, enemy) => sum + enemy.health, 0);
    return (initialHealth - remainingHealth) * (60_000 / DURATION_MS);
}

function createWeaponReport() {
    return COMBAT_TOWERS.flatMap((type) => [1, 4, 8].map((level) => {
        const expected = DEFENSE_DAMAGE_PER_MINUTE_PER_POINT * getMultiplayerTowerQuestionValue(type) * level;
        const results = Object.fromEntries(FORMATIONS.map((formation) => [formation, simulateDamagePerMinute(type, level, formation)]));
        const composite = results.focused * 0.3 + results.clustered * 0.4 + results.distributed * 0.3;
        return {
            weapon: type,
            level,
            focused: Math.round(results.focused / expected * 100) / 100,
            clustered: Math.round(results.clustered / expected * 100) / 100,
            distributed: Math.round(results.distributed / expected * 100) / 100,
            composite: Math.round(composite / expected * 100) / 100,
        };
    }));
}

describe('multiplayer weapon combat benchmark', () => {
    it('keeps each weapon competitive across representative enemy formations', () => {
        const report = createWeaponReport();

        expect(report).toHaveLength(COMBAT_TOWERS.length * 3);
        expect(Math.min(...report.map((row) => row.composite))).toBeGreaterThanOrEqual(0.85);
        expect(Math.max(...report.map((row) => row.composite))).toBeLessThanOrEqual(1.2);
        const averagePracticalOutput = report.reduce((sum, row) => sum + row.composite, 0) / report.length;
        expect(averagePracticalOutput).toBeGreaterThanOrEqual(0.97);
        expect(averagePracticalOutput).toBeLessThanOrEqual(1.05);
    });

    it('keeps single-weapon defensive loadouts competitive in self-play', () => {
        const report = createWeaponReport();
        const practicalScale = Object.fromEntries(COMBAT_TOWERS.map((type) => {
            const rows = report.filter((row) => row.weapon === type);
            return [type, rows.reduce((sum, row) => sum + row.composite, 0) / rows.length];
        })) as Record<CombatTowerType, number>;

        for (let firstIndex = 0; firstIndex < COMBAT_TOWERS.length; firstIndex += 1) {
            for (let secondIndex = firstIndex + 1; secondIndex < COMBAT_TOWERS.length; secondIndex += 1) {
                const firstWeapon = COMBAT_TOWERS[firstIndex];
                const secondWeapon = COMBAT_TOWERS[secondIndex];
                let firstWins = 0;
                let secondWins = 0;
                for (let game = 0; game < 120; game += 1) {
                    const reversed = game % 2 === 1;
                    const scales: [number, number] = reversed
                        ? [practicalScale[secondWeapon], practicalScale[firstWeapon]]
                        : [practicalScale[firstWeapon], practicalScale[secondWeapon]];
                    const result = simulateSelfPlay(`weapons-${firstWeapon}-${secondWeapon}-${game}`, [BALANCED_STRATEGY, BALANCED_STRATEGY], 12 * 60, scales);
                    if (result.winner === null) continue;
                    const firstWeaponWon = result.winner === (reversed ? 1 : 0);
                    if (firstWeaponWon) firstWins += 1;
                    else secondWins += 1;
                }
                const completed = firstWins + secondWins;
                const matchup = `${firstWeapon} (${practicalScale[firstWeapon].toFixed(2)}) vs ${secondWeapon} (${practicalScale[secondWeapon].toFixed(2)})`;
                expect(completed).toBeGreaterThan(45);
                expect(firstWins / completed, matchup).toBeGreaterThan(0.18);
                expect(firstWins / completed, matchup).toBeLessThan(0.82);
            }
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
