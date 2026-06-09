import type { GridPoint, MapGeometry, Vec2 } from '../types';
import { Grid, worldToGrid } from './Grid';

function intBound(start: number, delta: number): number {
    if (delta > 0) {
        return (Math.floor(start + 1) - start) / delta;
    }
    if (delta < 0) {
        return (start - Math.floor(start)) / -delta;
    }
    return Number.POSITIVE_INFINITY;
}

export function raycastGridCells(grid: Grid, from: Vec2, to: Vec2, geometry: MapGeometry): GridPoint[] {
    const start = worldToGrid(from, grid, geometry);
    const end = worldToGrid(to, grid, geometry);
    if (!start || !end) {
        return [];
    }

    const fromGridX = (from.x - geometry.originX) / geometry.cellSize;
    const fromGridY = (from.y - geometry.originY) / geometry.cellSize;
    const toGridX = (to.x - geometry.originX) / geometry.cellSize;
    const toGridY = (to.y - geometry.originY) / geometry.cellSize;
    const dx = toGridX - fromGridX;
    const dy = toGridY - fromGridY;
    const stepX = Math.sign(dx);
    const stepY = Math.sign(dy);
    const tDeltaX = stepX === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dx);
    const tDeltaY = stepY === 0 ? Number.POSITIVE_INFINITY : Math.abs(1 / dy);
    let tMaxX = intBound(fromGridX, dx);
    let tMaxY = intBound(fromGridY, dy);
    let x = start.x;
    let y = start.y;
    const cells: GridPoint[] = [{ x, y }];
    const maxSteps = grid.cols * grid.rows * 2;

    for (let steps = 0; steps < maxSteps && (x !== end.x || y !== end.y); steps += 1) {
        if (tMaxX < tMaxY) {
            tMaxX += tDeltaX;
            x += stepX;
        } else if (tMaxY < tMaxX) {
            tMaxY += tDeltaY;
            y += stepY;
        } else {
            tMaxX += tDeltaX;
            tMaxY += tDeltaY;
            x += stepX;
            y += stepY;
        }
        if (!grid.inBounds(x, y)) {
            break;
        }
        cells.push({ x, y });
    }

    return cells;
}

export function hasLineOfSight(grid: Grid, from: Vec2, to: Vec2, geometry: MapGeometry): boolean {
    const cells = raycastGridCells(grid, from, to, geometry);
    if (cells.length === 0) {
        return false;
    }
    return cells.every((cell) => grid.getTerrain(cell.x, cell.y) !== 'tree');
}

export function segmentCrossesTree(grid: Grid, from: Vec2, to: Vec2, geometry: MapGeometry): boolean {
    return raycastGridCells(grid, from, to, geometry).some((cell) => grid.getTerrain(cell.x, cell.y) === 'tree');
}