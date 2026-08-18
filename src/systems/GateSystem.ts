import { updateEnemy, type EnemySpatialIndex } from '../entities/Enemy';
import { getGateDirection, isGateTower, isOpenGate } from '../entities/Tower';
import { cellCenter, eightNeighbors, Grid, pointKey, worldToGrid } from '../map/Grid';
import { buildFlowFieldToCell, type FlowField } from '../pathfinding/FlowField';
import type { CostGrid } from '../pathfinding/ThreatMap';
import type { EnemyState, GridPoint, MapGeometry, TeamId, TowerState } from '../types';

export interface GateRoutingObjective {
    gate: TowerState;
    flowField: FlowField;
    holdingFlowField: FlowField;
    insideCell: GridPoint;
    outsideCell: GridPoint;
    insideCells: ReadonlySet<string>;
}

export interface GateRoutingCache {
    objectives: readonly GateRoutingObjective[];
}

export interface GateUpdateResult {
    handled: boolean;
    captured?: boolean;
    released?: boolean;
}

function canStepBetween(from: GridPoint, to: GridPoint, grid: Grid): boolean {
    if (grid.isBlocked(to.x, to.y)) return false;
    const diagonal = from.x !== to.x && from.y !== to.y;
    if (!diagonal) return true;
    return !grid.isBlocked(from.x, to.y) && !grid.isBlocked(to.x, from.y);
}

function collectComponent(start: GridPoint, grid: Grid): GridPoint[] {
    const queue = [start];
    const visited = new Set([pointKey(start)]);
    const cells: GridPoint[] = [];
    for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        cells.push(current);
        for (const neighbor of eightNeighbors(current, grid)) {
            const key = pointKey(neighbor);
            if (visited.has(key) || !canStepBetween(current, neighbor, grid)) continue;
            visited.add(key);
            queue.push(neighbor);
        }
    }
    return cells;
}

function findGateSides(gate: TowerState, grid: Grid): Pick<GateRoutingObjective, 'insideCell' | 'outsideCell' | 'insideCells'> | undefined {
    const blockedGrid = grid.clone();
    blockedGrid.setTerrain(gate.gridX, gate.gridY, 'tree');
    const adjacent = [
        { x: gate.gridX - 1, y: gate.gridY },
        { x: gate.gridX + 1, y: gate.gridY },
        { x: gate.gridX, y: gate.gridY - 1 },
        { x: gate.gridX, y: gate.gridY + 1 },
    ].filter((cell) => blockedGrid.inBounds(cell.x, cell.y) && !blockedGrid.isBlocked(cell.x, cell.y));
    const components: Array<{ cells: GridPoint[]; keys: Set<string> }> = [];
    const assigned = new Set<string>();
    for (const neighbor of adjacent) {
        if (assigned.has(pointKey(neighbor))) continue;
        const cells = collectComponent(neighbor, blockedGrid);
        const keys = new Set(cells.map(pointKey));
        for (const key of keys) assigned.add(key);
        components.push({ cells, keys });
    }
    if (components.length < 2) return undefined;
    components.sort((left, right) => left.cells.length - right.cells.length || pointKey(left.cells[0]).localeCompare(pointKey(right.cells[0])));
    const inside = components[0];
    const outside = components[components.length - 1];
    const insideCell = adjacent.find((cell) => inside.keys.has(pointKey(cell)));
    const outsideCell = adjacent.find((cell) => outside.keys.has(pointKey(cell)));
    if (!insideCell || !outsideCell) return undefined;
    return { insideCell, outsideCell, insideCells: inside.keys };
}

function createHoldingFlowField(flowField: FlowField): FlowField {
    return {
        base: flowField.base,
        costToBase: flowField.costToBase,
        direction: flowField.direction.map((row) => row.map(() => ({ x: 0, y: 0 }))),
    };
}

export function buildGateRoutingCache(towers: readonly TowerState[], grid: Grid, threatCosts: CostGrid, teamId: TeamId): GateRoutingCache {
    const objectives: GateRoutingObjective[] = [];
    for (const gate of towers) {
        if (!isGateTower(gate) || gate.teamId !== teamId) continue;
        const sides = findGateSides(gate, grid);
        if (!sides) continue;
        const flowField = buildFlowFieldToCell(grid, { x: gate.gridX, y: gate.gridY }, threatCosts);
        objectives.push({ gate, flowField, holdingFlowField: createHoldingFlowField(flowField), ...sides });
    }
    return { objectives };
}

function objectiveCost(enemy: EnemyState, objective: GateRoutingObjective, grid: Grid, geometry: MapGeometry): number {
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    return cell ? objective.flowField.costToBase[cell.y][cell.x] : Number.POSITIVE_INFINITY;
}

function moveToSide(enemy: EnemyState, cell: GridPoint, geometry: MapGeometry): void {
    const center = cellCenter(cell, geometry);
    enemy.x = center.x;
    enemy.y = center.y;
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.lastMoveSpeed = 0;
    enemy.stalledSeconds = 0;
}

function holdInsidePen(enemy: EnemyState, objective: GateRoutingObjective, dtSeconds: number, grid: Grid, geometry: MapGeometry, enemyNeighbors: readonly EnemyState[] | EnemySpatialIndex): void {
    const previousX = enemy.x;
    const previousY = enemy.y;
    updateEnemy(enemy, dtSeconds, objective.holdingFlowField, objective.holdingFlowField, grid, geometry, enemyNeighbors);
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    if (!cell || !objective.insideCells.has(pointKey(cell))) {
        enemy.x = previousX;
        enemy.y = previousY;
        enemy.vx = 0;
        enemy.vy = 0;
        enemy.lastMoveSpeed = 0;
    }
}

export function updateEnemyGateObjective(enemy: EnemyState, dtSeconds: number, routingCache: GateRoutingCache, grid: Grid, geometry: MapGeometry, enemyNeighbors: readonly EnemyState[] | EnemySpatialIndex): GateUpdateResult {
    if (enemy.pennedByGateId !== undefined) {
        const objective = routingCache.objectives.find(({ gate }) => gate.id === enemy.pennedByGateId);
        if (!objective) {
            enemy.pennedByGateId = undefined;
            return { handled: false };
        }
        if (isOpenGate(objective.gate) && getGateDirection(objective.gate) === 'out') {
            const reachedGate = updateEnemy(enemy, dtSeconds, objective.flowField, objective.flowField, grid, geometry, enemyNeighbors, true);
            if (reachedGate) {
                moveToSide(enemy, objective.outsideCell, geometry);
                enemy.pennedByGateId = undefined;
                return { handled: true, released: true };
            }
            return { handled: true };
        }
        holdInsidePen(enemy, objective, dtSeconds, grid, geometry, enemyNeighbors);
        return { handled: true };
    }

    let target: GateRoutingObjective | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    for (const objective of routingCache.objectives) {
        if (!isOpenGate(objective.gate) || getGateDirection(objective.gate) !== 'in') continue;
        const cost = objectiveCost(enemy, objective, grid, geometry);
        if (cost < bestCost) {
            target = objective;
            bestCost = cost;
        }
    }
    if (!target || !Number.isFinite(bestCost)) return { handled: false };
    const reachedGate = updateEnemy(enemy, dtSeconds, target.flowField, target.flowField, grid, geometry, enemyNeighbors, true);
    if (reachedGate) {
        moveToSide(enemy, target.insideCell, geometry);
        enemy.pennedByGateId = target.gate.id;
        return { handled: true, captured: true };
    }
    return { handled: true };
}
