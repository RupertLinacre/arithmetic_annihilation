import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { getBaseFootprint } from '../../src/map/BaseFootprint';
import { Grid, cellCenter, countBuildableCells, terrainMovementCost } from '../../src/map/Grid';
import { hasLineOfSight } from '../../src/map/LineOfSight';
import { generateMap, generateMultiplayerMap, hasPathToBase } from '../../src/map/MapGenerator';

describe('map generation and grid rules', () => {
    it('generates a valid map with reachable spawn points and build space', () => {
        const map = generateMap(12345);
        expect(map.spawns.every((spawn) => hasPathToBase(map.grid, spawn, map.base))).toBe(true);
        expect(countBuildableCells(map.grid)).toBeGreaterThan(Math.floor(map.grid.cols * map.grid.rows * 0.6));
    });

    it('keeps the multiplayer arena 24x14, mirrored, and reachable between both bases', () => {
        const map = generateMultiplayerMap(24680);
        expect(map.grid.cols).toBe(24);
        expect(map.grid.rows).toBe(14);
        expect(map.bases).toEqual({ solar: { x: 1, y: 7 }, lunar: { x: 22, y: 7 } });
        expect(hasPathToBase(map.grid, map.bases!.solar, map.bases!.lunar)).toBe(true);
        expect(hasPathToBase(map.grid, map.bases!.lunar, map.bases!.solar)).toBe(true);
        map.grid.forEachCell((x, y, terrain) => {
            expect(map.grid.getTerrain(map.grid.cols - 1 - x, y)).toBe(terrain);
        });
    });

    it('treats the base as a 3x3 footprint for reachability', () => {
        const grid = new Grid(7, 5, 'grass');
        const base = { x: 5, y: 2 };
        const footprint = getBaseFootprint(base, grid);

        expect(footprint).toHaveLength(9);
        expect(hasPathToBase(grid, { x: 0, y: 0 }, base)).toBe(true);

        grid.setTerrain(5, 2, 'tree');
        expect(hasPathToBase(grid, { x: 0, y: 0 }, base)).toBe(true);
    });

    it('uses terrain movement costs for grass, tarmac, and trees', () => {
        expect(terrainMovementCost('tarmac')).toBeLessThan(terrainMovementCost('grass'));
        expect(terrainMovementCost('tree')).toBe(Number.POSITIVE_INFINITY);
    });

    it('blocks line of sight through trees', () => {
        const grid = new Grid(5, 3, 'grass');
        grid.setTerrain(2, 1, 'tree');
        const from = cellCenter({ x: 0, y: 1 }, GAME_CONFIG.map);
        const blockedTo = cellCenter({ x: 4, y: 1 }, GAME_CONFIG.map);
        const clearFrom = cellCenter({ x: 0, y: 0 }, GAME_CONFIG.map);
        const clearTo = cellCenter({ x: 4, y: 0 }, GAME_CONFIG.map);
        expect(hasLineOfSight(grid, from, blockedTo, GAME_CONFIG.map)).toBe(false);
        expect(hasLineOfSight(grid, clearFrom, clearTo, GAME_CONFIG.map)).toBe(true);
    });
});
