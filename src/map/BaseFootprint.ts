import type { GridPoint } from '../types';
import { Grid } from './Grid';

export function getBaseFootprint(base: GridPoint, grid: Pick<Grid, 'inBounds'>): GridPoint[] {
    const cells: GridPoint[] = [];
    for (let y = base.y - 1; y <= base.y + 1; y += 1) {
        for (let x = base.x - 1; x <= base.x + 1; x += 1) {
            if (grid.inBounds(x, y)) {
                cells.push({ x, y });
            }
        }
    }
    return cells;
}

export function isBaseFootprintCell(base: GridPoint, cell: GridPoint, grid: Pick<Grid, 'inBounds'>): boolean {
    return grid.inBounds(cell.x, cell.y)
        && Math.abs(cell.x - base.x) <= 1
        && Math.abs(cell.y - base.y) <= 1;
}