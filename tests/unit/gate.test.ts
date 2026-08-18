import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy } from '../../src/entities/Enemy';
import { createTower } from '../../src/entities/Tower';
import { cellCenter, Grid, worldToGrid } from '../../src/map/Grid';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import { buildGateRoutingCache, updateEnemyGateObjective } from '../../src/systems/GateSystem';

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
});
