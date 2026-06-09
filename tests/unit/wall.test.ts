import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { createEnemy } from '../../src/entities/Enemy';
import { createTower } from '../../src/entities/Tower';
import { cellCenter, Grid } from '../../src/map/Grid';
import { buildFlowField } from '../../src/pathfinding/FlowField';
import { createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import { enemyHasPathToBase, updateEnemyWallObjective } from '../../src/systems/WallSystem';

function makeWall(id: number, x: number, y: number) {
    const wall = createTower(id, x, y, 'wall');
    wall.baseTerrain = 'grass';
    return wall;
}

describe('wall towers', () => {
    it('moves toward a wall objective before attacking when no path to the base exists', () => {
        const grid = new Grid(7, 3, 'grass');
        const wall = makeWall(1, 2, 1);
        grid.setTerrain(2, 0, 'tree');
        grid.setTerrain(wall.gridX, wall.gridY, 'tree');
        grid.setTerrain(2, 2, 'tree');
        const emptyCosts = createEmptyCostGrid(grid);
        const flowField = buildFlowField(grid, { x: 6, y: 1 }, emptyCosts);
        const enemyPosition = cellCenter({ x: 0, y: 1 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'grunt', enemyPosition.x, enemyPosition.y);

        expect(enemyHasPathToBase(enemy, flowField, grid, GAME_CONFIG.map)).toBe(false);
        const result = updateEnemyWallObjective(enemy, 0.25, [wall], flowField, grid, GAME_CONFIG.map, [enemy], emptyCosts);

        expect(result.targetedWall).toBe(wall);
        expect(result.attacked).toBe(false);
        expect(result.destroyedWall).toBeUndefined();
        expect(wall.health).toBe(GAME_CONFIG.wall.health);
        expect(enemy.x).toBeGreaterThan(enemyPosition.x);
        expect(enemy.lastMoveSpeed).toBeGreaterThan(0);
    });

    it('reports destroyed walls once their health reaches zero', () => {
        const grid = new Grid(5, 3, 'grass');
        const wall = makeWall(1, 2, 1);
        grid.setTerrain(2, 0, 'tree');
        grid.setTerrain(wall.gridX, wall.gridY, 'tree');
        grid.setTerrain(2, 2, 'tree');
        const emptyCosts = createEmptyCostGrid(grid);
        const flowField = buildFlowField(grid, { x: 4, y: 1 }, emptyCosts);
        const enemyPosition = cellCenter({ x: 1, y: 1 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'tank', enemyPosition.x, enemyPosition.y);

        const result = updateEnemyWallObjective(enemy, 1, [wall], flowField, grid, GAME_CONFIG.map, [enemy], emptyCosts);

        expect(result.targetedWall).toBe(wall);
        expect(result.attacked).toBe(true);
        expect(result.destroyedWall).toBe(wall);
        expect(wall.health).toBe(0);
    });

    it('does not attack walls while a path to the base exists', () => {
        const grid = new Grid(5, 3, 'grass');
        const wall = makeWall(1, 2, 0);
        grid.setTerrain(wall.gridX, wall.gridY, 'tree');
        const flowField = buildFlowField(grid, { x: 4, y: 1 }, createEmptyCostGrid(grid));
        const enemyPosition = cellCenter({ x: 0, y: 1 }, GAME_CONFIG.map);
        const enemy = createEnemy(1, 'grunt', enemyPosition.x, enemyPosition.y);

        expect(enemyHasPathToBase(enemy, flowField, grid, GAME_CONFIG.map)).toBe(true);
        const result = updateEnemyWallObjective(enemy, 1, [wall], flowField, grid, GAME_CONFIG.map, [enemy], createEmptyCostGrid(grid));

        expect(result.targetedWall).toBeUndefined();
        expect(result.attacked).toBe(false);
        expect(wall.health).toBe(GAME_CONFIG.wall.health);
    });
});
