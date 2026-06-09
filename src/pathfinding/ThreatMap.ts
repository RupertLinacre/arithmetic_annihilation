import { GAME_CONFIG, TOWER_STATS } from '../config/gameConfig';
import type { MapGeometry, TowerState } from '../types';
import { cellCenter, Grid } from '../map/Grid';
import { hasLineOfSight } from '../map/LineOfSight';

export type CostGrid = number[][];

export function createEmptyCostGrid(grid: Grid, value = 0): CostGrid {
    return Array.from({ length: grid.rows }, () => Array.from({ length: grid.cols }, () => value));
}

export function getTowerStats(tower: Pick<TowerState, 'type' | 'level'>) {
    return TOWER_STATS[tower.type][Math.max(1, Math.min(TOWER_STATS[tower.type].length, tower.level)) - 1];
}

export function calculateTowerThreatCosts(grid: Grid, towers: readonly TowerState[], geometry: MapGeometry): CostGrid {
    const threat = createEmptyCostGrid(grid, 0);
    for (const tower of towers) {
        const stats = getTowerStats(tower);
        if (stats.range <= 0 || stats.threat <= 0) {
            continue;
        }
        const towerCenter = cellCenter({ x: tower.gridX, y: tower.gridY }, geometry);
        const cellRadius = Math.ceil(stats.range / geometry.cellSize);
        for (let y = tower.gridY - cellRadius; y <= tower.gridY + cellRadius; y += 1) {
            for (let x = tower.gridX - cellRadius; x <= tower.gridX + cellRadius; x += 1) {
                if (!grid.inBounds(x, y) || grid.isBlocked(x, y)) {
                    continue;
                }
                const targetCenter = cellCenter({ x, y }, geometry);
                const distance = Math.hypot(targetCenter.x - towerCenter.x, targetCenter.y - towerCenter.y);
                if (distance > stats.range || !hasLineOfSight(grid, towerCenter, targetCenter, geometry)) {
                    continue;
                }
                const falloff = 1 - Math.min(0.55, distance / stats.range * 0.55);
                const cost = stats.threat * GAME_CONFIG.threatWeight * falloff;
                threat[y][x] = Math.min(GAME_CONFIG.maxTowerThreatCost, threat[y][x] + cost);
            }
        }
    }
    return threat;
}