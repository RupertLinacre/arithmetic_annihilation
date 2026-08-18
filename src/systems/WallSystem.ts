import { GAME_CONFIG } from '../config/gameConfig';
import { updateEnemy, type EnemySpatialIndex } from '../entities/Enemy';
import { isBlockingWallTower } from '../entities/Tower';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';
import { buildFlowField, type FlowField } from '../pathfinding/FlowField';
import type { CostGrid } from '../pathfinding/ThreatMap';
import type { EnemyState, MapGeometry, TeamId, TowerState } from '../types';

export interface WallAttackResult {
    targetedWall?: TowerState;
    attacked: boolean;
    destroyedWall?: TowerState;
}

export interface WallObjective {
    wall: TowerState;
    flowField: FlowField;
}

export interface WallRoutingCache {
    objectives: readonly WallObjective[];
}

export function enemyHasPathToBase(enemy: EnemyState, flowField: FlowField, grid: Grid, geometry: MapGeometry): boolean {
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    return !cell || Number.isFinite(flowField.costToBase[cell.y][cell.x]);
}

export function findNearestWallTower(enemy: EnemyState, towers: readonly TowerState[], geometry: MapGeometry): TowerState | undefined {
    let nearestWall: TowerState | undefined;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const tower of towers) {
        if (!isBlockingWallTower(tower) || (enemy.teamId !== undefined && tower.teamId === enemy.teamId)) {
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

export function buildWallRoutingCache(towers: readonly TowerState[], grid: Grid, threatCosts: CostGrid, attackingTeamId?: TeamId): WallRoutingCache {
    return {
        objectives: towers
            .filter((wall) => isBlockingWallTower(wall) && (attackingTeamId === undefined || wall.teamId !== attackingTeamId))
            .map((wall) => ({
                wall,
                flowField: buildFlowField(grid, { x: wall.gridX, y: wall.gridY }, threatCosts),
            })),
    };
}

function findWallObjective(enemy: EnemyState, routingCache: WallRoutingCache, grid: Grid, geometry: MapGeometry): WallObjective | undefined {
    let bestObjective: WallObjective | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const objective of routingCache.objectives) {
        const { wall, flowField } = objective;
        const cost = getEnemyFlowCost(enemy, flowField, grid, geometry);
        if (!Number.isFinite(cost)) {
            continue;
        }
        const center = cellCenter({ x: wall.gridX, y: wall.gridY }, geometry);
        const distance = Math.hypot(center.x - enemy.x, center.y - enemy.y);
        if (cost < bestCost || (cost === bestCost && distance < bestDistance)) {
            bestObjective = objective;
            bestCost = cost;
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

export function updateEnemyWallObjective(enemy: EnemyState, dtSeconds: number, routingCache: WallRoutingCache, baseFlowField: FlowField, grid: Grid, geometry: MapGeometry, enemyNeighbors: readonly EnemyState[] | EnemySpatialIndex): WallAttackResult {
    if (enemyHasPathToBase(enemy, baseFlowField, grid, geometry)) {
        return { attacked: false };
    }

    const objective = findWallObjective(enemy, routingCache, grid, geometry);
    if (!objective) {
        return { attacked: false };
    }

    const reachedWall = updateEnemy(enemy, dtSeconds, objective.flowField, objective.flowField, grid, geometry, enemyNeighbors);
    if (!reachedWall) {
        return { targetedWall: objective.wall, attacked: false };
    }

    return attackWall(enemy, dtSeconds, objective.wall);
}
