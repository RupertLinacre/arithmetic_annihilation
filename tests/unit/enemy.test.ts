import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy, updateEnemy } from '../../src/entities/Enemy';
import { cellCenter, Grid } from '../../src/map/Grid';
import { buildFlowField, type FlowField } from '../../src/pathfinding/FlowField';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';

function createStoppedField(flowField: FlowField): FlowField {
    return {
        base: flowField.base,
        costToBase: flowField.costToBase,
        direction: flowField.direction.map((row) => row.map(() => ({ x: 0, y: 0 }))),
    };
}

describe('enemy base interaction', () => {
    it('damages the base when entering any square in the 3x3 base footprint', () => {
        const grid = new Grid(8, 5, 'grass');
        const base = { x: 6, y: 2 };
        const flowField = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const emergencyFlowField = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const topLeftBaseCell = cellCenter({ x: 5, y: 1 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'scout', topLeftBaseCell.x, topLeftBaseCell.y);

        expect(updateEnemy(enemy, 0, flowField, emergencyFlowField, grid, GAME_CONFIG.map, [enemy])).toBe(true);
    });

    it('uses the terrain-only emergency field after stalled path progress', () => {
        const grid = new Grid(8, 3, 'grass');
        const base = { x: 7, y: 1 };
        const emergencyFlowField = buildFlowField(grid, base, createEmptyCostGrid(grid));
        const stoppedField = createStoppedField(emergencyFlowField);
        const start = cellCenter({ x: 1, y: 1 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'scout', start.x, start.y);
        const stepSeconds = 0.5;
        const stalledUpdates = Math.ceil(GAME_CONFIG.enemyStuck.stuckAfterSeconds / stepSeconds) + 1;

        for (let updateIndex = 0; updateIndex < stalledUpdates; updateIndex += 1) {
            updateEnemy(enemy, stepSeconds, stoppedField, emergencyFlowField, grid, GAME_CONFIG.map, [enemy]);
        }

        expect(enemy.isStuck).toBe(true);
        const previousX = enemy.x;
        updateEnemy(enemy, 0.25, stoppedField, emergencyFlowField, grid, GAME_CONFIG.map, [enemy]);

        expect(enemy.x).toBeGreaterThan(previousX);
        expect(enemy.panicSecondsRemaining).toBeLessThan(GAME_CONFIG.enemyStuck.panicSeconds);
    });

    it('records no movement when blocked so stopped sprites can render', () => {
        const grid = new Grid(6, 3, 'grass');
        grid.setTerrain(1, 1, 'tree');
        const base = { x: 4, y: 1 };
        const flowField = createStoppedField(buildFlowField(grid, base, createEmptyCostGrid(grid)));
        const enemy = createEnemy(1, 'scout', GAME_CONFIG.map.originX + GAME_CONFIG.map.cellSize - 1, cellCenter({ x: 0, y: 1 }, GAME_CONFIG.map).y);
        enemy.vx = 100;

        updateEnemy(enemy, 0.05, flowField, flowField, grid, GAME_CONFIG.map, [enemy]);

        expect(enemy.x).toBe(GAME_CONFIG.map.originX + GAME_CONFIG.map.cellSize - 1);
        expect(enemy.lastMoveSpeed).toBe(0);
    });
});