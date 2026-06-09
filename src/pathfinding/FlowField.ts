import { GAME_CONFIG } from '../config/gameConfig';
import type { GridPoint, MapGeometry, Vec2 } from '../types';
import { getBaseFootprint } from '../map/BaseFootprint';
import { eightNeighbors, Grid, terrainMovementCost, worldToGrid } from '../map/Grid';
import type { CostGrid } from './ThreatMap';

export interface FlowField {
    base: GridPoint;
    costToBase: number[][];
    direction: Vec2[][];
}

interface QueueNode {
    point: GridPoint;
    cost: number;
}

function canStepBetween(from: GridPoint, to: GridPoint, grid: Grid): boolean {
    if (grid.isBlocked(to.x, to.y)) {
        return false;
    }
    const diagonal = from.x !== to.x && from.y !== to.y;
    if (!diagonal) {
        return true;
    }
    return !grid.isBlocked(from.x, to.y) && !grid.isBlocked(to.x, from.y);
}

function popCheapest(queue: QueueNode[]): QueueNode {
    let bestIndex = 0;
    for (let index = 1; index < queue.length; index += 1) {
        if (queue[index].cost < queue[bestIndex].cost) {
            bestIndex = index;
        }
    }
    const [node] = queue.splice(bestIndex, 1);
    return node;
}

export function buildFlowField(grid: Grid, base: GridPoint, threatCosts: CostGrid): FlowField {
    const costToBase = Array.from({ length: grid.rows }, () => Array.from({ length: grid.cols }, () => Number.POSITIVE_INFINITY));
    const direction = Array.from({ length: grid.rows }, () => Array.from({ length: grid.cols }, () => ({ x: 0, y: 0 })));
    const baseCells = getBaseFootprint(base, grid).filter((cell) => !grid.isBlocked(cell.x, cell.y));
    const queue: QueueNode[] = [];
    for (const cell of baseCells) {
        costToBase[cell.y][cell.x] = 0;
        queue.push({ point: cell, cost: 0 });
    }

    while (queue.length > 0) {
        const current = popCheapest(queue);
        if (current.cost !== costToBase[current.point.y][current.point.x]) {
            continue;
        }
        for (const neighbor of eightNeighbors(current.point, grid)) {
            if (!canStepBetween(current.point, neighbor, grid)) {
                continue;
            }
            const diagonal = neighbor.x !== current.point.x && neighbor.y !== current.point.y;
            const moveCost = terrainMovementCost(grid.getTerrain(neighbor.x, neighbor.y)) + threatCosts[neighbor.y][neighbor.x];
            const newCost = current.cost + moveCost * (diagonal ? Math.SQRT2 : 1);
            if (newCost < costToBase[neighbor.y][neighbor.x]) {
                costToBase[neighbor.y][neighbor.x] = newCost;
                queue.push({ point: neighbor, cost: newCost });
            }
        }
    }

    for (let y = 0; y < grid.rows; y += 1) {
        for (let x = 0; x < grid.cols; x += 1) {
            if (grid.isBlocked(x, y) || !Number.isFinite(costToBase[y][x])) {
                continue;
            }
            let best = { x, y };
            let bestCost = costToBase[y][x];
            for (const neighbor of eightNeighbors({ x, y }, grid)) {
                if (!canStepBetween({ x, y }, neighbor, grid)) {
                    continue;
                }
                if (costToBase[neighbor.y][neighbor.x] < bestCost) {
                    best = neighbor;
                    bestCost = costToBase[neighbor.y][neighbor.x];
                }
            }
            const dx = best.x - x;
            const dy = best.y - y;
            const length = Math.hypot(dx, dy) || 1;
            direction[y][x] = { x: dx / length, y: dy / length };
        }
    }

    return { base, costToBase, direction };
}

export function sampleFlowDirection(flowField: FlowField, grid: Grid, worldPosition: Vec2, geometry: MapGeometry = GAME_CONFIG.map): Vec2 {
    const cell = worldToGrid(worldPosition, grid, geometry);
    if (!cell) {
        return { x: 0, y: 0 };
    }
    const sampled = flowField.direction[cell.y][cell.x];
    if (sampled.x !== 0 || sampled.y !== 0) {
        return sampled;
    }
    return { x: 0, y: 0 };
}

export function costAtWorldPosition(flowField: FlowField, grid: Grid, worldPosition: Vec2, geometry: MapGeometry = GAME_CONFIG.map): number {
    const cell = worldToGrid(worldPosition, grid, geometry);
    return cell ? flowField.costToBase[cell.y][cell.x] : Number.POSITIVE_INFINITY;
}