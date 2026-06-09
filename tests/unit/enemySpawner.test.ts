import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { SeededRandom } from '../../src/core/SeededRandom';
import { EnemySpawner, calculateSpawnPressure } from '../../src/systems/EnemySpawner';
import type { TowerState } from '../../src/types';

describe('enemy spawn pressure', () => {
    it('starts slowly, then keeps increasing over time even without towers', () => {
        const opening = calculateSpawnPressure(0, 0);
        const firstMinute = calculateSpawnPressure(60, 0);
        const thirdMinute = calculateSpawnPressure(180, 0);

        expect(opening.intervalMs).toBeGreaterThan(4000);
        expect(firstMinute.spawnRatePerSecond).toBeGreaterThan(opening.spawnRatePerSecond);
        expect(thirdMinute.spawnRatePerSecond).toBeGreaterThan(firstMinute.spawnRatePerSecond);
    });

    it('raises pressure when the player has built high damage towers', () => {
        const noTowers = calculateSpawnPressure(60, 0);
        const defended = calculateSpawnPressure(60, 180);

        expect(defended.totalTowerDps).toBe(180);
        expect(defended.spawnRatePerSecond).toBeGreaterThan(noTowers.spawnRatePerSecond);
        expect(defended.intervalMs).toBeLessThan(noTowers.intervalMs);
        expect(defended.enemyPressure).toBeGreaterThan(noTowers.enemyPressure);
    });

    it('uses difficulty to control how quickly pressure ramps', () => {
        const veryEasy = calculateSpawnPressure(90, 120, { difficulty: 'veryEasy' });
        const medium = calculateSpawnPressure(90, 120, { difficulty: 'medium' });
        const veryHard = calculateSpawnPressure(90, 120, { difficulty: 'veryHard' });

        expect(medium.spawnRatePerSecond).toBeGreaterThan(veryEasy.spawnRatePerSecond);
        expect(veryHard.spawnRatePerSecond).toBeGreaterThan(medium.spawnRatePerSecond);
        expect(veryHard.intervalMs).toBeLessThan(veryEasy.intervalMs);
    });

    it('backs off tower pressure when the base is damaged or enemies are crowding the map', () => {
        const cruising = calculateSpawnPressure(90, 180, { baseHealthPercent: 1, activeEnemyCount: 2 });
        const struggling = calculateSpawnPressure(90, 180, { baseHealthPercent: 0.42, activeEnemyCount: 24 });

        expect(struggling.performanceMultiplier).toBeLessThan(cruising.performanceMultiplier);
        expect(struggling.towerSpawnRateBonusPerSecond).toBeLessThan(cruising.towerSpawnRateBonusPerSecond);
        expect(struggling.baseSpawnRatePerSecond).toBe(cruising.baseSpawnRatePerSecond);
    });

    it('spawns only scouts in the opening seconds', () => {
        const spawner = new EnemySpawner([{ x: 0, y: 0 }], GAME_CONFIG.map, new SeededRandom('opening-spawns'));
        const heavyDefense: TowerState[] = [
            { id: 1, gridX: 1, gridY: 1, type: 'cluster', level: 8, cooldownMs: 0 },
            { id: 2, gridX: 2, gridY: 1, type: 'missile', level: 8, cooldownMs: 0 },
        ];
        const spawned = [];

        for (let i = 0; i < 23; i += 1) {
            spawned.push(...spawner.update(1000, heavyDefense));
        }

        expect(spawned.length).toBeGreaterThan(0);
        expect(spawned.every((enemy) => enemy.type === 'scout')).toBe(true);
    });
});
