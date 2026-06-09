import { GAME_CONFIG } from '../config/gameConfig';
import type { GridPoint, MapGeometry, TerrainType, Vec2 } from '../types';

export class Grid {
    readonly cols: number;
    readonly rows: number;
    private cells: TerrainType[];

    constructor(cols: number, rows: number, fill: TerrainType = 'grass') {
        this.cols = cols;
        this.rows = rows;
        this.cells = Array.from({ length: cols * rows }, () => fill);
    }

    static fromRows(rows: TerrainType[][]): Grid {
        const grid = new Grid(rows[0]?.length ?? 0, rows.length, 'grass');
        rows.forEach((row, y) => {
            row.forEach((terrain, x) => grid.setTerrain(x, y, terrain));
        });
        return grid;
    }

    clone(): Grid {
        const grid = new Grid(this.cols, this.rows, 'grass');
        grid.cells = [...this.cells];
        return grid;
    }

    inBounds(x: number, y: number): boolean {
        return x >= 0 && y >= 0 && x < this.cols && y < this.rows;
    }

    index(x: number, y: number): number {
        return y * this.cols + x;
    }

    getTerrain(x: number, y: number): TerrainType {
        if (!this.inBounds(x, y)) {
            return 'tree';
        }
        return this.cells[this.index(x, y)];
    }

    setTerrain(x: number, y: number, terrain: TerrainType): void {
        if (this.inBounds(x, y)) {
            this.cells[this.index(x, y)] = terrain;
        }
    }

    isBlocked(x: number, y: number): boolean {
        return this.getTerrain(x, y) === 'tree';
    }

    isBuildable(x: number, y: number): boolean {
        const terrain = this.getTerrain(x, y);
        return terrain === 'grass' || terrain === 'tarmac';
    }

    forEachCell(callback: (x: number, y: number, terrain: TerrainType) => void): void {
        for (let y = 0; y < this.rows; y += 1) {
            for (let x = 0; x < this.cols; x += 1) {
                callback(x, y, this.getTerrain(x, y));
            }
        }
    }
}

export function pointKey(point: GridPoint): string {
    return `${point.x},${point.y}`;
}

export function cellCenter(point: GridPoint, geometry: MapGeometry = GAME_CONFIG.map): Vec2 {
    return {
        x: geometry.originX + point.x * geometry.cellSize + geometry.cellSize / 2,
        y: geometry.originY + point.y * geometry.cellSize + geometry.cellSize / 2,
    };
}

export function worldToGrid(position: Vec2, grid: Grid, geometry: MapGeometry = GAME_CONFIG.map): GridPoint | null {
    const x = Math.floor((position.x - geometry.originX) / geometry.cellSize);
    const y = Math.floor((position.y - geometry.originY) / geometry.cellSize);
    return grid.inBounds(x, y) ? { x, y } : null;
}

export function terrainMovementCost(terrain: TerrainType): number {
    return GAME_CONFIG.terrainCosts[terrain];
}

export function cardinalNeighbors(point: GridPoint, grid: Grid): GridPoint[] {
    const offsets = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
    ];
    return offsets
        .map((offset) => ({ x: point.x + offset.x, y: point.y + offset.y }))
        .filter((neighbor) => grid.inBounds(neighbor.x, neighbor.y));
}

export function eightNeighbors(point: GridPoint, grid: Grid): GridPoint[] {
    const neighbors: GridPoint[] = [];
    for (let y = -1; y <= 1; y += 1) {
        for (let x = -1; x <= 1; x += 1) {
            if (x === 0 && y === 0) {
                continue;
            }
            const neighbor = { x: point.x + x, y: point.y + y };
            if (grid.inBounds(neighbor.x, neighbor.y)) {
                neighbors.push(neighbor);
            }
        }
    }
    return neighbors;
}

export function countBuildableCells(grid: Grid): number {
    let count = 0;
    grid.forEachCell((x, y) => {
        if (grid.isBuildable(x, y)) {
            count += 1;
        }
    });
    return count;
}