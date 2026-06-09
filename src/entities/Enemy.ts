import { ENEMY_STATS, GAME_CONFIG } from '../config/gameConfig';
import type { EnemyState, EnemyType, GridPoint, MapGeometry, Vec2 } from '../types';
import { getBaseFootprint, isBaseFootprintCell } from '../map/BaseFootprint';
import type { FlowField } from '../pathfinding/FlowField';
import { sampleFlowDirection } from '../pathfinding/FlowField';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';

export function createEnemy(id: number, type: EnemyType, x: number, y: number, healthScale = 1): EnemyState {
    const stats = ENEMY_STATS[type];
    return {
        id,
        type,
        x,
        y,
        vx: 0,
        vy: 0,
        health: stats.health * healthScale,
        maxHealth: stats.health * healthScale,
        speed: stats.speed,
        radius: stats.radius,
        baseDamage: stats.baseDamage,
        hurtFlashMs: 0,
        lastProgressDistance: Number.POSITIVE_INFINITY,
        stalledSeconds: 0,
        panicSecondsRemaining: 0,
        panicStartDistance: Number.POSITIVE_INFINITY,
        isStuck: false,
        lastMoveSpeed: 0,
    };
}

function distanceToBaseFootprint(base: GridPoint, position: Vec2, grid: Grid, geometry: MapGeometry): number {
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const cell of getBaseFootprint(base, grid)) {
        const center = cellCenter(cell, geometry);
        closestDistance = Math.min(closestDistance, Math.hypot(center.x - position.x, center.y - position.y));
    }
    return closestDistance;
}

function resetProgressTracking(enemy: EnemyState, progressDistance: number): void {
    enemy.lastProgressDistance = progressDistance;
    enemy.stalledSeconds = 0;
}

function enterPanicMode(enemy: EnemyState, progressDistance: number): void {
    enemy.isStuck = true;
    enemy.panicSecondsRemaining = GAME_CONFIG.enemyStuck.panicSeconds;
    enemy.panicStartDistance = progressDistance;
    enemy.stalledSeconds = 0;
    enemy.lastProgressDistance = progressDistance;
}

function updateProgressTracking(enemy: EnemyState, dtSeconds: number, flowField: FlowField, grid: Grid, geometry: MapGeometry): void {
    const progressDistance = distanceToBaseFootprint(flowField.base, { x: enemy.x, y: enemy.y }, grid, geometry);
    if (enemy.isStuck) {
        enemy.panicSecondsRemaining = Math.max(0, enemy.panicSecondsRemaining - dtSeconds);
        const madePanicProgress = progressDistance < enemy.panicStartDistance - GAME_CONFIG.enemyStuck.meaningfulProgressPixels;
        if (enemy.panicSecondsRemaining <= 0 && madePanicProgress) {
            enemy.isStuck = false;
            enemy.panicStartDistance = Number.POSITIVE_INFINITY;
            resetProgressTracking(enemy, progressDistance);
        }
        return;
    }
    if (!Number.isFinite(progressDistance)) {
        resetProgressTracking(enemy, progressDistance);
        return;
    }
    if (!Number.isFinite(enemy.lastProgressDistance) || progressDistance < enemy.lastProgressDistance - GAME_CONFIG.enemyStuck.meaningfulProgressPixels) {
        resetProgressTracking(enemy, progressDistance);
        return;
    }
    enemy.stalledSeconds += dtSeconds;
    if (enemy.stalledSeconds >= GAME_CONFIG.enemyStuck.stuckAfterSeconds) {
        enterPanicMode(enemy, progressDistance);
    }
}

export function updateEnemy(enemy: EnemyState, dtSeconds: number, flowField: FlowField, emergencyFlowField: FlowField, grid: Grid, geometry: MapGeometry, enemies: readonly EnemyState[]): boolean {
    const activeFlowField = enemy.isStuck ? emergencyFlowField : flowField;
    const desired = sampleFlowDirection(activeFlowField, grid, { x: enemy.x, y: enemy.y }, geometry);
    const cell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    const terrain = cell ? grid.getTerrain(cell.x, cell.y) : 'grass';
    const speedMultiplier = GAME_CONFIG.terrainSpeedMultiplier[terrain];
    const desiredSpeed = enemy.speed * speedMultiplier;
    enemy.vx += (desired.x * desiredSpeed - enemy.vx) * Math.min(1, dtSeconds * 4.2);
    enemy.vy += (desired.y * desiredSpeed - enemy.vy) * Math.min(1, dtSeconds * 4.2);

    let separationX = 0;
    let separationY = 0;
    for (const other of enemies) {
        if (other.id === enemy.id || other.health <= 0) {
            continue;
        }
        const dx = enemy.x - other.x;
        const dy = enemy.y - other.y;
        const distance = Math.hypot(dx, dy);
        const minimum = (enemy.radius + other.radius) * 1.04;
        if (distance > 0.001 && distance < minimum) {
            const push = (minimum - distance) / minimum;
            separationX += (dx / distance) * push * enemy.speed * 0.56;
            separationY += (dy / distance) * push * enemy.speed * 0.56;
        }
    }

    const previousX = enemy.x;
    const previousY = enemy.y;
    enemy.x += (enemy.vx + separationX) * dtSeconds;
    enemy.y += (enemy.vy + separationY) * dtSeconds;

    const newCell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
    if (newCell && grid.isBlocked(newCell.x, newCell.y)) {
        enemy.x = previousX;
        enemy.y = previousY;
        enemy.vx *= -0.18;
        enemy.vy *= -0.18;
    }
    const moveDistance = Math.hypot(enemy.x - previousX, enemy.y - previousY);
    enemy.lastMoveSpeed = dtSeconds > 0 ? moveDistance / dtSeconds : 0;

    updateProgressTracking(enemy, dtSeconds, flowField, grid, geometry);
    return newCell ? isBaseFootprintCell(flowField.base, newCell, grid) : false;
}