import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy } from '../../src/entities/Enemy';
import { createTower } from '../../src/entities/Tower';
import { cellCenter, Grid, worldToGrid } from '../../src/map/Grid';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import { advanceGateRoutingCache, buildGateRoutingCache, updateEnemyGateObjective } from '../../src/systems/GateSystem';

function createPen() {
    const grid = new Grid(7, 7, 'grass');
    const wallCells = [
        { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
        { x: 2, y: 3 },                 { x: 4, y: 3 },
        { x: 2, y: 4 },                 { x: 4, y: 4 },
    ];
    for (const wall of wallCells) grid.setTerrain(wall.x, wall.y, 'tree');
    const gate = createTower(10, 3, 4, 'wall', 'solar');
    gate.level = 2;
    gate.gateOpen = true;
    gate.gateDirection = 'in';
    gate.baseTerrain = 'grass';
    return { grid, gate };
}

describe('directional gates', () => {
    it('collects friendly monsters into the enclosed side in IN mode', () => {
        const { grid, gate } = createPen();
        const cache = buildGateRoutingCache([gate], grid, createEmptyCostGrid(grid), 'solar');
        const start = cellCenter({ x: 3, y: 5 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'scout', start.x, start.y, 1, 'solar');

        let result = updateEnemyGateObjective(enemy, 0.1, cache, grid, GAME_CONFIG.map, [enemy]);
        for (let step = 0; step < 20 && !result.captured; step += 1) {
            result = updateEnemyGateObjective(enemy, 0.1, cache, grid, GAME_CONFIG.map, [enemy]);
        }

        expect(cache.objectives).toHaveLength(1);
        expect(result.captured).toBe(true);
        expect(enemy.pennedByGateId).toBe(gate.id);
        expect(worldToGrid(enemy, grid, GAME_CONFIG.map)).toEqual({ x: 3, y: 3 });
    });

    it('releases penned monsters to the outside in OUT mode', () => {
        const { grid, gate } = createPen();
        gate.gateDirection = 'out';
        const cache = buildGateRoutingCache([gate], grid, createEmptyCostGrid(grid), 'solar');
        const start = cellCenter({ x: 3, y: 3 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'scout', start.x, start.y, 1, 'solar');
        enemy.pennedByGateId = gate.id;

        let result = updateEnemyGateObjective(enemy, 0.1, cache, grid, GAME_CONFIG.map, [enemy]);
        for (let step = 0; step < 20 && !result.released; step += 1) {
            result = updateEnemyGateObjective(enemy, 0.1, cache, grid, GAME_CONFIG.map, [enemy]);
        }

        expect(result.released).toBe(true);
        expect(enemy.pennedByGateId).toBeUndefined();
        expect(worldToGrid(enemy, grid, GAME_CONFIG.map)).toEqual({ x: 3, y: 5 });
    });

    it('keeps the gate directional setting independent from open and shut', () => {
        const { grid, gate } = createPen();
        gate.gateOpen = false;
        grid.setTerrain(gate.gridX, gate.gridY, 'tree');
        const cache = buildGateRoutingCache([gate], grid, createEmptyCostGrid(grid), 'solar');
        const start = cellCenter({ x: 3, y: 5 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'scout', start.x, start.y, 1, 'solar');

        const result = updateEnemyGateObjective(enemy, 0, cache, grid, GAME_CONFIG.map, [enemy]);

        expect(gate.gateDirection).toBe('in');
        expect(result.handled).toBe(false);
        expect(enemy.pennedByGateId).toBeUndefined();
    });

    it('does not collect more monsters than the configured pen capacity', () => {
        const { grid, gate } = createPen();
        const cache = buildGateRoutingCache([gate], grid, createEmptyCostGrid(grid), 'solar');
        const inside = cellCenter({ x: 3, y: 3 }, GAME_CONFIG.map);
        const outside = cellCenter({ x: 3, y: 5 }, GAME_CONFIG.map);
        const configuredCapacity = 3;
        const penned = Array.from({ length: configuredCapacity }, (_, index) => {
            const enemy = createEnemy(index + 1, 'scout', inside.x, inside.y, 1, 'solar');
            enemy.pennedByGateId = gate.id;
            return enemy;
        });
        const extra = createEnemy(100, 'scout', outside.x, outside.y, 1, 'solar');

        const result = updateEnemyGateObjective(extra, 0.1, cache, grid, GAME_CONFIG.map, [...penned, extra], configuredCapacity);

        expect(result.handled).toBe(false);
        expect(extra.pennedByGateId).toBeUndefined();
    });

    it('allows only one monster out per 50ms release interval', () => {
        const { grid, gate } = createPen();
        gate.gateDirection = 'out';
        const cache = buildGateRoutingCache([gate], grid, createEmptyCostGrid(grid), 'solar');
        const gateCenter = cellCenter({ x: gate.gridX, y: gate.gridY }, GAME_CONFIG.map);
        const first = createEnemy(1, 'scout', gateCenter.x, gateCenter.y, 1, 'solar');
        const second = createEnemy(2, 'scout', gateCenter.x, gateCenter.y, 1, 'solar');
        first.pennedByGateId = gate.id;
        second.pennedByGateId = gate.id;
        const enemies = [first, second];

        expect(updateEnemyGateObjective(first, 0, cache, grid, GAME_CONFIG.map, enemies).released).toBe(true);
        expect(updateEnemyGateObjective(second, 0, cache, grid, GAME_CONFIG.map, enemies).released).not.toBe(true);

        advanceGateRoutingCache(cache, GAME_CONFIG.pen.releaseIntervalMs - 1);
        expect(updateEnemyGateObjective(second, 0, cache, grid, GAME_CONFIG.map, enemies).released).not.toBe(true);

        advanceGateRoutingCache(cache, 1);
        expect(updateEnemyGateObjective(second, 0, cache, grid, GAME_CONFIG.map, enemies).released).toBe(true);
    });
});
