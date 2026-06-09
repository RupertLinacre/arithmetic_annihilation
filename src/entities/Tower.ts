import type { EnemyState, MapGeometry, TowerDifficulty, TowerState, TowerType } from '../types';
import { GAME_CONFIG, TOWER_DIFFICULTY_TO_TYPE, TOWER_STATS, TOWER_UPGRADE_DIFFICULTIES } from '../config/gameConfig';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';
import { hasLineOfSight } from '../map/LineOfSight';
import type { FlowField } from '../pathfinding/FlowField';
import { getTowerStats } from '../pathfinding/ThreatMap';

export function createTower(id: number, gridX: number, gridY: number, type: TowerType): TowerState {
    const tower: TowerState = { id, gridX, gridY, type, level: 1, cooldownMs: 0 };
    if (isWallTower(tower)) {
        tower.health = GAME_CONFIG.wall.health;
        tower.maxHealth = GAME_CONFIG.wall.health;
    }
    return tower;
}

export function isWallTower(tower: Pick<TowerState, 'type'>): boolean {
    return tower.type === 'wall';
}

export function towerTypeForDifficulty(difficulty: TowerDifficulty): TowerType {
    return TOWER_DIFFICULTY_TO_TYPE[difficulty];
}

export function getMaxTowerLevel(type: TowerType): number {
    return TOWER_STATS[type].length;
}

export function getUpgradeQuestionDifficulty(nextLevel: number): TowerDifficulty;
export function getUpgradeQuestionDifficulty(tower: Pick<TowerState, 'type'>, nextLevel: number): TowerDifficulty;
export function getUpgradeQuestionDifficulty(towerOrNextLevel: Pick<TowerState, 'type'> | number, nextLevel?: number): TowerDifficulty {
    const towerType = typeof towerOrNextLevel === 'number' ? 'easy' : towerOrNextLevel.type;
    const targetLevel = typeof towerOrNextLevel === 'number' ? towerOrNextLevel : nextLevel ?? 2;
    const difficulties = TOWER_UPGRADE_DIFFICULTIES[towerType];
    if (difficulties.length === 0) {
        return 'veryHard';
    }
    const difficultyIndex = Math.max(0, Math.min(difficulties.length - 1, targetLevel - 2));
    return difficulties[difficultyIndex];
}

export function canUpgradeTower(tower: TowerState): boolean {
    return tower.level < getMaxTowerLevel(tower.type);
}

export function upgradeTower(tower: TowerState): boolean {
    if (!canUpgradeTower(tower)) {
        return false;
    }
    tower.level += 1;
    tower.cooldownMs = Math.min(tower.cooldownMs, getTowerStats(tower).cooldownMs * 0.5);
    return true;
}

export function calculateTowerVolleyDamage(tower: Pick<TowerState, 'type' | 'level'>): number {
    const stats = getTowerStats(tower);
    if (stats.pelletCount) {
        return stats.damage * stats.pelletCount;
    }
    if (stats.missileCount) {
        return stats.damage * stats.missileCount;
    }
    if (stats.fragmentCount && stats.fragmentDamage) {
        return stats.damage + stats.fragmentCount * stats.fragmentDamage;
    }
    return stats.damage;
}

export function calculateTowerDamagePerSecond(tower: Pick<TowerState, 'type' | 'level'>): number {
    const stats = getTowerStats(tower);
    if (stats.damage <= 0 || stats.cooldownMs <= 0) {
        return 0;
    }
    return calculateTowerVolleyDamage(tower) / (stats.cooldownMs / 1000);
}

export function calculateTotalTowerDamagePerSecond(towers: readonly Pick<TowerState, 'type' | 'level'>[]): number {
    return towers.reduce((total, tower) => total + calculateTowerDamagePerSecond(tower), 0);
}

export function selectTowerTarget(tower: TowerState, enemies: readonly EnemyState[], grid: Grid, geometry: MapGeometry, flowField: FlowField): EnemyState | undefined {
    const stats = getTowerStats(tower);
    const towerCenter = cellCenter({ x: tower.gridX, y: tower.gridY }, geometry);
    let bestEnemy: EnemyState | undefined;
    let bestCost = Number.POSITIVE_INFINITY;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const enemy of enemies) {
        if (enemy.health <= 0) {
            continue;
        }
        const enemyPosition = { x: enemy.x, y: enemy.y };
        const distance = Math.hypot(enemy.x - towerCenter.x, enemy.y - towerCenter.y);
        if (distance > stats.range || !hasLineOfSight(grid, towerCenter, enemyPosition, geometry)) {
            continue;
        }
        const enemyCell = worldToGrid(enemyPosition, grid, geometry);
        const baseCost = enemyCell ? flowField.costToBase[enemyCell.y][enemyCell.x] : Number.POSITIVE_INFINITY;
        if (baseCost < bestCost || (baseCost === bestCost && distance < bestDistance)) {
            bestEnemy = enemy;
            bestCost = baseCost;
            bestDistance = distance;
        }
    }

    return bestEnemy;
}
