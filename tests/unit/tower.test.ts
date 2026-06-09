import { describe, expect, it } from 'vitest';
import { GAME_CONFIG, TOWER_STATS } from '../../src/config/gameConfig';
import { createEnemy } from '../../src/entities/Enemy';
import { calculateTotalTowerDamagePerSecond, calculateTowerDamagePerSecond, canUpgradeTower, createTower, selectTowerTarget } from '../../src/entities/Tower';
import { cellCenter, Grid } from '../../src/map/Grid';
import { buildFlowField } from '../../src/pathfinding/FlowField';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import { TowerSystem } from '../../src/systems/TowerSystem';
import type { TowerState } from '../../src/types';

describe('tower target selection', () => {
    it('targets the enemy closest to the base among valid enemies', () => {
        const grid = new Grid(6, 3, 'grass');
        const base = { x: 5, y: 1 };
        const flow = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const tower: TowerState = { id: 1, gridX: 1, gridY: 1, type: 'easy', level: 5, cooldownMs: 0 };
        const nearTower = createEnemy(1, 'grunt', cellCenter({ x: 2, y: 1 }, GAME_CONFIG.map).x, cellCenter({ x: 2, y: 1 }, GAME_CONFIG.map).y);
        const nearBase = createEnemy(2, 'grunt', cellCenter({ x: 4, y: 1 }, GAME_CONFIG.map).x, cellCenter({ x: 4, y: 1 }, GAME_CONFIG.map).y);
        expect(selectTowerTarget(tower, [nearTower, nearBase], grid, GAME_CONFIG.map, flow)?.id).toBe(2);
    });

    it('ignores enemies hidden behind tree-blocked line of sight', () => {
        const grid = new Grid(6, 3, 'grass');
        grid.setTerrain(3, 1, 'tree');
        const base = { x: 5, y: 1 };
        const flow = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const tower: TowerState = { id: 1, gridX: 1, gridY: 1, type: 'easy', level: 5, cooldownMs: 0 };
        const visible = createEnemy(1, 'grunt', cellCenter({ x: 2, y: 1 }, GAME_CONFIG.map).x, cellCenter({ x: 2, y: 1 }, GAME_CONFIG.map).y);
        const hidden = createEnemy(2, 'grunt', cellCenter({ x: 4, y: 1 }, GAME_CONFIG.map).x, cellCenter({ x: 4, y: 1 }, GAME_CONFIG.map).y);
        expect(selectTowerTarget(tower, [visible, hidden], grid, GAME_CONFIG.map, flow)?.id).toBe(1);
    });

    it('calculates total theoretical tower damage per second from full volleys', () => {
        const easy: TowerState = { id: 1, gridX: 1, gridY: 1, type: 'easy', level: 1, cooldownMs: 0 };
        const spray: TowerState = { id: 2, gridX: 2, gridY: 1, type: 'spray', level: 1, cooldownMs: 0 };
        const cluster: TowerState = { id: 3, gridX: 3, gridY: 1, type: 'cluster', level: 1, cooldownMs: 0 };

        expect(calculateTowerDamagePerSecond(easy)).toBeCloseTo(13 / 0.66);
        expect(calculateTowerDamagePerSecond(spray)).toBeCloseTo(24 / 1);
        expect(calculateTowerDamagePerSecond(cluster)).toBeCloseTo(49 / 1.6);
        expect(calculateTotalTowerDamagePerSecond([easy, spray, cluster])).toBeCloseTo(13 / 0.66 + 24 + 49 / 1.6);
    });

    it('rotates flamethrowers and gives monsters infectious burns', () => {
        const grid = new Grid(8, 4, 'grass');
        const base = { x: 7, y: 1 };
        const flow = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const center = cellCenter({ x: 2, y: 1 }, GAME_CONFIG.map);
        const target = createEnemy(1, 'grunt', center.x + 80, center.y);
        const nearby = createEnemy(2, 'grunt', target.x + 20, target.y);
        const tower: TowerState = { id: 1, gridX: 2, gridY: 1, type: 'flamethrower', level: 1, cooldownMs: 0, flameAngleRadians: 0 };

        const result = new TowerSystem().update(100, [tower], [target, nearby], grid, GAME_CONFIG.map, flow);

        expect(result.projectiles).toHaveLength(0);
        expect(result.flameJets).toHaveLength(1);
        expect(tower.flameAngleRadians).toBeGreaterThan(0);
        expect(target.health).toBeLessThan(target.maxHealth);
        expect(target.burnMs).toBeGreaterThan(0);

        new TowerSystem().update(300, [], [target, nearby], grid, GAME_CONFIG.map, flow);
        expect(nearby.burnMs).toBeGreaterThan(0);
    });

    it('creates non-upgradable utility options with no combat DPS', () => {
        const wall = createTower(1, 1, 1, 'wall');
        const airstrike = createTower(2, 2, 1, 'airstrike');

        expect(wall.health).toBe(GAME_CONFIG.wall.health);
        expect(wall.maxHealth).toBe(GAME_CONFIG.wall.health);
        expect(canUpgradeTower(wall)).toBe(false);
        expect(calculateTowerDamagePerSecond(wall)).toBe(0);
        expect(canUpgradeTower(airstrike)).toBe(false);
        expect(calculateTowerDamagePerSecond(airstrike)).toBe(0);
        expect(calculateTotalTowerDamagePerSecond([wall, airstrike])).toBe(0);
    });

    it('launches upgraded missile volleys on separate headings with upgrade-scaled trails', () => {
        const grid = new Grid(6, 3, 'grass');
        const base = { x: 5, y: 1 };
        const flow = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const target = createEnemy(1, 'grunt', cellCenter({ x: 3, y: 1 }, GAME_CONFIG.map).x, cellCenter({ x: 3, y: 1 }, GAME_CONFIG.map).y);
        const tower: TowerState = { id: 1, gridX: 1, gridY: 1, type: 'missile', level: 3, cooldownMs: 0 };

        const result = new TowerSystem().update(0, [tower], [target], grid, GAME_CONFIG.map, flow);

        expect(result.projectiles).toHaveLength(2);
        expect(new Set(result.projectiles.map((projectile) => Math.atan2(projectile.vy, projectile.vx)))).toHaveLength(2);
        expect(result.projectiles.every((projectile) => projectile.homingDelayMs === 160)).toBe(true);
        expect(result.projectiles.every((projectile) => (projectile.trailScale ?? 0) > 1)).toBe(true);

        const maxTower: TowerState = { id: 2, gridX: 1, gridY: 1, type: 'missile', level: TOWER_STATS.missile.length, cooldownMs: 0 };
        const maxResult = new TowerSystem().update(0, [maxTower], [target], grid, GAME_CONFIG.map, flow);
        expect(maxResult.projectiles[0].trailScale).toBe(2);
    });

    it('detonates airstrikes with a 3x3 kill zone and map-wide falloff knockback', () => {
        const grid = new Grid(14, 8, 'grass');
        const target = { x: 3, y: 3 };
        const center = cellCenter(target, GAME_CONFIG.map);
        const primary = createEnemy(1, 'tank', center.x, center.y);
        const corner = createEnemy(2, 'grunt', center.x + GAME_CONFIG.map.cellSize, center.y + GAME_CONFIG.map.cellSize);
        const near = createEnemy(3, 'tank', center.x + GAME_CONFIG.map.cellSize * 2, center.y);
        const far = createEnemy(4, 'grunt', center.x + GAME_CONFIG.map.cellSize * 8, center.y);
        const nearStartX = near.x;
        const farStartX = far.x;

        const result = new TowerSystem().detonateAirstrike(target, [primary, corner, near, far], grid, GAME_CONFIG.map);

        expect(result.kills).toBe(2);
        expect(result.explosion.radius).toBeGreaterThan(GAME_CONFIG.map.cellSize * 10);
        expect(result.airstrikeImpacts).toHaveLength(grid.cols * grid.rows);
        expect(result.airstrikeImpacts.find((impact) => impact.x === target.x && impact.y === target.y)?.intensity).toBe(1);
        expect(result.airstrikeImpacts.find((impact) => impact.x === 0 && impact.y === 0)?.intensity).toBeLessThan(1);
        expect(primary.health).toBeLessThanOrEqual(0);
        expect(corner.health).toBeLessThanOrEqual(0);
        expect(near.health).toBe(1);
        expect(far.health).toBeGreaterThan(0);
        expect(far.health).toBeLessThan(far.maxHealth);
        expect(near.health).toBeLessThan(far.health);
        expect(near.x).toBeGreaterThan(nearStartX);
        expect(far.x).toBeGreaterThan(farStartX);
    });
});
