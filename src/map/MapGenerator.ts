import { GAME_CONFIG } from '../config/gameConfig';
import { SeededRandom } from '../core/SeededRandom';
import type { GridPoint } from '../types';
import { getBaseFootprint } from './BaseFootprint';
import { cardinalNeighbors, countBuildableCells, Grid, pointKey } from './Grid';

export interface GeneratedMap {
    grid: Grid;
    base: GridPoint;
    spawns: GridPoint[];
    seed: number;
    usedFallback: boolean;
}

export function hasPathToBase(grid: Grid, start: GridPoint, base: GridPoint): boolean {
    const baseCells = getBaseFootprint(base, grid);
    if (grid.isBlocked(start.x, start.y) || baseCells.every((cell) => grid.isBlocked(cell.x, cell.y))) {
        return false;
    }
    const baseKeys = new Set(baseCells.map((cell) => pointKey(cell)));
    const visited = new Set<string>([pointKey(start)]);
    const queue: GridPoint[] = [start];
    while (queue.length > 0) {
        const point = queue.shift()!;
        if (baseKeys.has(pointKey(point))) {
            return true;
        }
        for (const neighbor of cardinalNeighbors(point, grid)) {
            const key = pointKey(neighbor);
            if (!visited.has(key) && !grid.isBlocked(neighbor.x, neighbor.y)) {
                visited.add(key);
                queue.push(neighbor);
            }
        }
    }
    return false;
}

function markProtected(protectedCells: Set<string>, point: GridPoint, radius = 0): void {
    for (let y = point.y - radius; y <= point.y + radius; y += 1) {
        for (let x = point.x - radius; x <= point.x + radius; x += 1) {
            protectedCells.add(`${x},${y}`);
        }
    }
}

function carveCorridor(grid: Grid, from: GridPoint, to: GridPoint, protectedCells: Set<string>, rng: SeededRandom): void {
    let x = from.x;
    let y = from.y;
    const middleX = rng.int(Math.floor(grid.cols * 0.38), Math.floor(grid.cols * 0.62));
    const waypoints: GridPoint[] = [
        { x: middleX, y },
        { x: middleX, y: to.y + rng.int(-1, 1) },
        to,
    ];

    for (const waypoint of waypoints) {
        while (x !== waypoint.x || y !== waypoint.y) {
            markProtected(protectedCells, { x, y }, 1);
            grid.setTerrain(x, y, rng.chance(0.82) ? 'tarmac' : 'grass');
            const moveHorizontally = x !== waypoint.x && (y === waypoint.y || rng.chance(0.62));
            if (moveHorizontally) {
                x += Math.sign(waypoint.x - x);
            } else if (y !== waypoint.y) {
                y += Math.sign(waypoint.y - y);
            }
        }
    }
    markProtected(protectedCells, to, 1);
}

function createCandidate(seed: number, attempt: number): GeneratedMap {
    const rng = new SeededRandom(seed + attempt * 7919);
    const { cols, rows } = GAME_CONFIG.map;
    const grid = new Grid(cols, rows, 'grass');
    const base = { x: cols - 2, y: Math.floor(rows / 2) };
    const spawns = [
        { x: 1, y: Math.floor(rows * 0.3) },
        { x: 1, y: Math.floor(rows * 0.72) },
    ];
    const protectedCells = new Set<string>();

    markProtected(protectedCells, base, 2);
    spawns.forEach((spawn) => markProtected(protectedCells, spawn, 2));
    spawns.forEach((spawn) => carveCorridor(grid, spawn, base, protectedCells, rng));

    grid.forEachCell((x, y) => {
        const key = `${x},${y}`;
        if (protectedCells.has(key)) {
            return;
        }
        const edgePenalty = x <= 1 || x >= cols - 2 ? 0.08 : 0;
        if (rng.chance(0.18 - edgePenalty)) {
            grid.setTerrain(x, y, 'tree');
            return;
        }
        if (rng.chance(0.16)) {
            grid.setTerrain(x, y, 'tarmac');
        }
    });

    for (let patch = 0; patch < 5; patch += 1) {
        const center = { x: rng.int(3, cols - 5), y: rng.int(2, rows - 3) };
        for (let y = center.y - 1; y <= center.y + 1; y += 1) {
            for (let x = center.x - 2; x <= center.x + 2; x += 1) {
                if (grid.inBounds(x, y) && !protectedCells.has(`${x},${y}`) && grid.getTerrain(x, y) !== 'tree' && rng.chance(0.62)) {
                    grid.setTerrain(x, y, 'tarmac');
                }
            }
        }
    }

    return { grid, base, spawns, seed, usedFallback: false };
}

function isValidGeneratedMap(map: GeneratedMap): boolean {
    const buildableCount = countBuildableCells(map.grid);
    const minimumBuildable = Math.floor(map.grid.cols * map.grid.rows * 0.62);
    return buildableCount >= minimumBuildable && map.spawns.every((spawn) => hasPathToBase(map.grid, spawn, map.base));
}

export function createFallbackMap(seed = 1): GeneratedMap {
    const { cols, rows } = GAME_CONFIG.map;
    const grid = new Grid(cols, rows, 'grass');
    const base = { x: cols - 2, y: Math.floor(rows / 2) };
    const spawns = [
        { x: 1, y: Math.floor(rows * 0.3) },
        { x: 1, y: Math.floor(rows * 0.72) },
    ];
    const protectedCells = new Set<string>();
    spawns.forEach((spawn) => {
        for (let x = spawn.x; x <= base.x; x += 1) {
            const upperLane = spawn.y;
            const lowerLane = base.y;
            grid.setTerrain(x, upperLane, 'tarmac');
            grid.setTerrain(x, lowerLane, 'tarmac');
            protectedCells.add(`${x},${upperLane}`);
            protectedCells.add(`${x},${lowerLane}`);
        }
        const minY = Math.min(spawn.y, base.y);
        const maxY = Math.max(spawn.y, base.y);
        for (let y = minY; y <= maxY; y += 1) {
            grid.setTerrain(Math.floor(cols / 2), y, 'tarmac');
            protectedCells.add(`${Math.floor(cols / 2)},${y}`);
        }
    });
    for (let y = 1; y < rows - 1; y += 3) {
        for (let x = 4; x < cols - 4; x += 5) {
            if (!protectedCells.has(`${x},${y}`)) {
                grid.setTerrain(x, y, 'tree');
            }
        }
    }
    return { grid, base, spawns, seed, usedFallback: true };
}

export function generateMap(seed = Date.now()): GeneratedMap {
    for (let attempt = 0; attempt < GAME_CONFIG.mapGenerationAttempts; attempt += 1) {
        const candidate = createCandidate(seed, attempt);
        if (isValidGeneratedMap(candidate)) {
            return candidate;
        }
    }
    return createFallbackMap(seed);
}