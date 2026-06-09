import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../src/config/gameConfig';
import { cellCenter, Grid } from '../../src/map/Grid';
import { buildFlowField, sampleFlowDirection } from '../../src/pathfinding/FlowField';
import { calculateTowerThreatCosts, createEmptyCostGrid } from '../../src/pathfinding/ThreatMap';
import type { TowerState } from '../../src/types';

describe('threat maps and flow fields', () => {
    it('applies tower threat only through clear line of sight', () => {
        const grid = new Grid(6, 3, 'grass');
        grid.setTerrain(2, 1, 'tree');
        const tower: TowerState = { id: 1, gridX: 1, gridY: 1, type: 'easy', level: 5, cooldownMs: 0 };
        const threat = calculateTowerThreatCosts(grid, [tower], GAME_CONFIG.map);
        expect(threat[1][3]).toBe(0);
        expect(threat[0][1]).toBeGreaterThan(0);
    });

    it('caps stacked tower threat costs to keep threat as a soft cost', () => {
        const grid = new Grid(5, 5, 'grass');
        const towers: TowerState[] = [
            { id: 1, gridX: 2, gridY: 2, type: 'cluster', level: 5, cooldownMs: 0 },
            { id: 2, gridX: 2, gridY: 2, type: 'cluster', level: 5, cooldownMs: 0 },
            { id: 3, gridX: 2, gridY: 2, type: 'cluster', level: 5, cooldownMs: 0 },
        ];
        const threat = calculateTowerThreatCosts(grid, towers, GAME_CONFIG.map);
        const highestThreat = Math.max(...threat.flat());

        expect(highestThreat).toBe(GAME_CONFIG.maxTowerThreatCost);
    });

    it('builds a reverse flow field with finite costs and preferred directions', () => {
        const grid = new Grid(6, 3, 'grass');
        grid.setTerrain(2, 1, 'tarmac');
        grid.setTerrain(3, 1, 'tarmac');
        const base = { x: 5, y: 1 };
        const field = buildFlowField(grid, base, createEmptyCostGrid(grid));
        expect(field.costToBase[1][0]).toBeLessThan(Number.POSITIVE_INFINITY);
        expect(field.direction[1][0].x).toBeGreaterThan(0);
        expect(field.costToBase[0][4]).toBe(0);
        expect(field.costToBase[1][5]).toBe(0);
    });

    it('keeps blocked cells unreachable in the cost field', () => {
        const grid = new Grid(4, 3, 'grass');
        grid.setTerrain(1, 1, 'tree');
        const field = buildFlowField(grid, { x: 3, y: 1 }, createEmptyCostGrid(grid));
        expect(field.costToBase[1][1]).toBe(Number.POSITIVE_INFINITY);
    });

    it('does not path through blocked diagonal corners', () => {
        const grid = new Grid(3, 3, 'grass');
        grid.setTerrain(1, 0, 'tree');
        grid.setTerrain(0, 1, 'tree');
        const field = buildFlowField(grid, { x: 2, y: 2 }, createEmptyCostGrid(grid));

        expect(field.costToBase[0][0]).toBe(Number.POSITIVE_INFINITY);
        expect(field.direction[0][0]).toEqual({ x: 0, y: 0 });
    });

    it('does not point straight at the base when no path exists through terrain', () => {
        const grid = new Grid(5, 3, 'grass');
        for (let y = 0; y < grid.rows; y += 1) {
            grid.setTerrain(2, y, 'tree');
        }
        const field = buildFlowField(grid, { x: 4, y: 1 }, createEmptyCostGrid(grid));
        const direction = sampleFlowDirection(field, grid, cellCenter({ x: 0, y: 1 }, GAME_CONFIG.map), GAME_CONFIG.map);

        expect(direction).toEqual({ x: 0, y: 0 });
    });
});