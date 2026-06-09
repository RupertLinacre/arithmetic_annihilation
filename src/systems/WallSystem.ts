import { GAME_CONFIG } from '../config/gameConfig';
import { updateEnemy } from '../entities/Enemy';
import { isWallTower } from '../entities/Tower';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';
import { buildFlowField, type FlowField } from '../pathfinding/FlowField';
import type { CostGrid } from '../pathfinding/ThreatMap';
import type { EnemyState, MapGeometry, TowerState } from '../types';

export interface WallAttackResult {
    targetedWall?: TowerState;
    attacked: boolean;
    destroyedWall?: TowerState;
}

interface WallObjective {
    wall: TowerState;
    flowField: FlowField;
    cost: number;
}

export function enemyHasPathToBase(enemy: EnemyState, flowField: FlowField, grid: Grid, geometry: MapGeometry): boolean {
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    return !cell || Number.isFinite(flowField.costToBase[cell.y][cell.x]);
}

export function findNearestWallTower(enemy: EnemyState, towers: readonly TowerState[], geometry: MapGeometry): TowerState | undefined {
    let nearestWall: TowerState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const tower of towers) {
        if (!isWallTower(tower)) {
            continue;
        }
        const center = cellCenter({ x: tower.gridX, y: tower.gridY }, geometry);
        const distance = Math.hypot(center.x - enemy.x, center.y - enemy.y);
        if (distance < nearestDistance) {
            nearestWall = tower;
            nearestDistance = distance;
        }
    }
    return nearestWall;
}

function getEnemyFlowCost(enemy: EnemyState, flowField: FlowField, grid: Grid, geometry: MapGeometry): number {
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    return cell ? flowField.costToBase[cell.y][cell.x] : Number.POSITIVE_INFINITY;
}

function findWallObjective(enemy: EnemyState, towers: readonly TowerState[], grid: Grid, geometry: MapGeometry, threatCosts: CostGrid): WallObjective | undefined {
    let bestObjective: WallObjective | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const wall of towers) {
        if (!isWallTower(wall)) {
            continue;
        }
        const wallFlowField = buildFlowField(grid, { x: wall.gridX, y: wall.gridY }, threatCosts);
        const cost = getEnemyFlowCost(enemy, wallFlowField, grid, geometry);
        if (!Number.isFinite(cost)) {
            continue;
        }
        const center = cellCenter({ x: wall.gridX, y: wall.gridY }, geometry);
        const distance = Math.hypot(center.x - enemy.x, center.y - enemy.y);
        if (cost < (bestObjective?.cost ?? Number.POSITIVE_INFINITY) || (cost === bestObjective?.cost && distance < bestDistance)) {
            bestObjective = { wall, flowField: wallFlowField, cost };
            bestDistance = distance;
        }
    }
    return bestObjective;
}

function attackWall(enemy: EnemyState, dtSeconds: number, wall: TowerState): WallAttackResult {
    enemy.vx = 0;
    enemy.vy = 0;
    enemy.lastMoveSpeed = 0;
    enemy.stalledSeconds = 0;
    wall.maxHealth = wall.maxHealth ?? GAME_CONFIG.wall.health;
    wall.health = Math.max(0, (wall.health ?? GAME_CONFIG.wall.health) - enemy.baseDamage * dtSeconds);

    return wall.health <= 0
        ? { targetedWall: wall, attacked: true, destroyedWall: wall }
        : { targetedWall: wall, attacked: true };
}

export function updateEnemyWallObjective(enemy: EnemyState, dtSeconds: number, towers: readonly TowerState[], baseFlowField: FlowField, grid: Grid, geometry: MapGeometry, enemies: readonly EnemyState[], threatCosts: CostGrid): WallAttackResult {
    if (enemyHasPathToBase(enemy, baseFlowField, grid, geometry)) {
        return { attacked: false };
    }

    const objective = findWallObjective(enemy, towers, grid, geometry, threatCosts);
    if (!objective) {
        return { attacked: false };
    }

    const reachedWall = updateEnemy(enemy, dtSeconds, objective.flowField, objective.flowField, grid, geometry, enemies);
    if (!reachedWall) {
        return { targetedWall: objective.wall, attacked: false };
    }

    return attackWall(enemy, dtSeconds, objective.wall);
}
