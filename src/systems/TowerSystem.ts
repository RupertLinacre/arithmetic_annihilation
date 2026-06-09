import type { EnemyState, GridPoint, MapGeometry, ProjectileState, TowerState } from '../types';
import { getTowerStats } from '../pathfinding/ThreatMap';
import { isWallTower, selectTowerTarget } from '../entities/Tower';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';
import type { FlowField } from '../pathfinding/FlowField';
import { createProjectile } from '../entities/Projectile';
import { TOWER_STATS } from '../config/gameConfig';
import { hasLineOfSight } from '../map/LineOfSight';

export interface TowerUpdateResult {
    projectiles: ProjectileState[];
    shotsFired: number;
    kills: number;
    explosions: { x: number; y: number; radius: number; lifeMs: number }[];
    flameJets: FlameJet[];
    hurtSounds: number;
    deathSounds: number;
    detonatedTowerIds: number[];
}

export interface FlameJet {
    x: number;
    y: number;
    angle: number;
    range: number;
    arcRadians: number;
    intensity: number;
}

export interface AirstrikeImpactCell {
    x: number;
    y: number;
    intensity: number;
}

export interface DetonationResult {
    kills: number;
    hurtSounds: number;
    deathSounds: number;
    explosion: { x: number; y: number; radius: number; lifeMs: number };
    airstrikeImpacts: AirstrikeImpactCell[];
}

function normalize(dx: number, dy: number): { x: number; y: number } {
    const length = Math.hypot(dx, dy) || 1;
    return { x: dx / length, y: dy / length };
}

function applyDamage(enemy: EnemyState, damage: number): boolean {
    const wasAlive = enemy.health > 0;
    enemy.health -= damage;
    enemy.hurtFlashMs = 120;
    return wasAlive && enemy.health <= 0;
}

function igniteEnemy(enemy: EnemyState, damagePerSecond: number, durationMs: number, spreadRadius: number): boolean {
    const wasBurning = (enemy.burnMs ?? 0) > 0;
    enemy.burnMs = Math.max(enemy.burnMs ?? 0, durationMs);
    enemy.burnDamagePerSecond = Math.max(enemy.burnDamagePerSecond ?? 0, damagePerSecond);
    enemy.burnSpreadRadius = Math.max(enemy.burnSpreadRadius ?? 0, spreadRadius);
    enemy.burnSpreadCooldownMs = Math.min(enemy.burnSpreadCooldownMs ?? 0, 140);
    return !wasBurning;
}

function applyKnockback(enemy: EnemyState, originX: number, originY: number, distance: number, grid: Grid, geometry: MapGeometry): void {
    if (distance <= 0 || enemy.health <= 0) {
        return;
    }

    let direction = normalize(enemy.x - originX, enemy.y - originY);
    if (Math.abs(direction.x) < 0.001 && Math.abs(direction.y) < 0.001) {
        direction = normalize(enemy.vx, enemy.vy);
    }
    if (Math.abs(direction.x) < 0.001 && Math.abs(direction.y) < 0.001) {
        direction = { x: 1, y: 0 };
    }

    const stepSize = Math.max(5, geometry.cellSize * 0.16);
    let remaining = distance;
    while (remaining > 0.001) {
        const step = Math.min(stepSize, remaining);
        const candidate = { x: enemy.x + direction.x * step, y: enemy.y + direction.y * step };
        const cell = worldToGrid(candidate, grid, geometry);
        if (!cell || grid.isBlocked(cell.x, cell.y)) {
            break;
        }
        enemy.x = candidate.x;
        enemy.y = candidate.y;
        remaining -= step;
    }

    enemy.vx *= 0.28;
    enemy.vy *= 0.28;
    enemy.lastProgressDistance = Number.POSITIVE_INFINITY;
    enemy.stalledSeconds = 0;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function missileUpgradeProgress(tower: TowerState): number {
    const maxIndex = Math.max(1, TOWER_STATS.missile.length - 1);
    return clamp((tower.level - 1) / maxIndex, 0, 1);
}

function angleDifference(a: number, b: number): number {
    let delta = a - b;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    return delta;
}

function calculateAirstrikeFalloff(x: number, y: number, center: { x: number; y: number }, explosionRadius: number, killHalfSize: number): number {
    const outsideKillBox = Math.max(0, Math.max(Math.abs(x - center.x), Math.abs(y - center.y)) - killHalfSize);
    const normalizedDistance = explosionRadius <= 0 ? 0 : Math.min(1, outsideKillBox / explosionRadius);
    return Math.max(0.06, 1 - normalizedDistance);
}

function calculateAirstrikeIntensity(cell: GridPoint, target: GridPoint, center: { x: number; y: number }, explosionRadius: number, killHalfSize: number, geometry: MapGeometry): number {
    if (Math.max(Math.abs(cell.x - target.x), Math.abs(cell.y - target.y)) <= 1) {
        return 1;
    }

    const cellWorld = cellCenter(cell, geometry);
    const falloff = calculateAirstrikeFalloff(cellWorld.x, cellWorld.y, center, explosionRadius, killHalfSize);
    return clamp(0.08 + falloff * falloff * 0.92, 0, 1);
}

export class TowerSystem {
    private nextProjectileId = 1;

    update(deltaMs: number, towers: TowerState[], enemies: EnemyState[], grid: Grid, geometry: MapGeometry, flowField: FlowField): TowerUpdateResult {
        const projectiles: ProjectileState[] = [];
        const explosions: { x: number; y: number; radius: number; lifeMs: number }[] = [];
        const flameJets: FlameJet[] = [];
        const detonatedTowerIds: number[] = [];
        let shotsFired = 0;
        let { kills, hurtSounds, deathSounds } = this.updateBurningEnemies(deltaMs, enemies);
        for (const tower of towers) {
            if (isWallTower(tower) || tower.type === 'airstrike') {
                continue;
            }
            if (tower.type === 'flamethrower') {
                const result = this.updateFlamethrower(tower, deltaMs, enemies, grid, geometry);
                kills += result.kills;
                hurtSounds += result.hurtSounds;
                deathSounds += result.deathSounds;
                flameJets.push(result.flameJet);
                continue;
            }
            tower.cooldownMs -= deltaMs;
            if (tower.cooldownMs > 0) {
                continue;
            }
            const target = selectTowerTarget(tower, enemies, grid, geometry, flowField);
            if (!target) {
                continue;
            }
            const stats = getTowerStats(tower);
            const center = cellCenter({ x: tower.gridX, y: tower.gridY }, geometry);
            const targetDirection = normalize(target.x - center.x, target.y - center.y);
            if (tower.type === 'easy') {
                const speed = stats.bulletSpeed ?? 420;
                projectiles.push(createProjectile(this.nextProjectileId++, 'bullet', center.x, center.y, targetDirection.x * speed, targetDirection.y * speed, stats.damage, 4, 1600));
            } else if (tower.type === 'spray') {
                const pelletCount = stats.pelletCount ?? 3;
                const spread = stats.spreadRadians ?? 0.42;
                const speed = stats.bulletSpeed ?? 390;
                const baseAngle = Math.atan2(targetDirection.y, targetDirection.x);
                for (let index = 0; index < pelletCount; index += 1) {
                    const t = pelletCount === 1 ? 0.5 : index / (pelletCount - 1);
                    const angle = baseAngle + (t - 0.5) * spread;
                    const projectile = createProjectile(this.nextProjectileId++, 'bullet', center.x, center.y, Math.cos(angle) * speed, Math.sin(angle) * speed, stats.damage, 3.4, 1250);
                    projectile.visualType = 'spray';
                    projectiles.push(projectile);
                }
            } else if (tower.type === 'missile') {
                const count = stats.missileCount ?? 1;
                const speed = stats.missileSpeed ?? 180;
                const baseAngle = Math.atan2(targetDirection.y, targetDirection.x);
                const upgradeProgress = missileUpgradeProgress(tower);
                const trailScale = 1 + upgradeProgress;
                const spread = count > 1 ? 0.2 : 0;
                for (let index = 0; index < count; index += 1) {
                    const angle = baseAngle + (index - (count - 1) / 2) * spread;
                    const projectile = createProjectile(this.nextProjectileId++, 'missile', center.x, center.y, Math.cos(angle) * speed * 0.55, Math.sin(angle) * speed * 0.55, stats.damage, 6, 3600);
                    projectile.targetId = target.id;
                    projectile.speed = speed;
                    projectile.turnRate = stats.missileTurnRate ?? 2.3;
                    projectile.homingDelayMs = count > 1 ? 160 : 0;
                    projectile.trailScale = trailScale;
                    projectiles.push(projectile);
                }
            } else {
                const speed = stats.bulletSpeed ?? 280;
                const projectile = createProjectile(this.nextProjectileId++, 'cluster', center.x, center.y, targetDirection.x * speed, targetDirection.y * speed, stats.damage, 8, 2100);
                projectile.targetId = target.id;
                projectile.explosionRadius = stats.explosionRadius;
                projectile.fragmentCount = stats.fragmentCount;
                projectile.fragmentDamage = stats.fragmentDamage;
                projectiles.push(projectile);
            }
            tower.cooldownMs = stats.cooldownMs;
            shotsFired += 1;
        }
        return { projectiles, shotsFired, kills, explosions, flameJets, hurtSounds, deathSounds, detonatedTowerIds };
    }

    private updateBurningEnemies(deltaMs: number, enemies: EnemyState[]): { kills: number; hurtSounds: number; deathSounds: number } {
        const dt = deltaMs / 1000;
        let kills = 0;
        let hurtSounds = 0;
        let deathSounds = 0;
        for (const enemy of enemies) {
            if (enemy.health <= 0 || (enemy.burnMs ?? 0) <= 0) {
                continue;
            }
            enemy.burnMs = Math.max(0, (enemy.burnMs ?? 0) - deltaMs);
            enemy.burnSpreadCooldownMs = Math.max(0, (enemy.burnSpreadCooldownMs ?? 0) - deltaMs);
            hurtSounds += deltaMs > 0 && Math.random() < 0.012 ? 1 : 0;
            if (applyDamage(enemy, (enemy.burnDamagePerSecond ?? 0) * dt)) {
                kills += 1;
                deathSounds += 1;
                continue;
            }
            if ((enemy.burnSpreadCooldownMs ?? 0) > 0) {
                continue;
            }
            const spreadRadius = enemy.burnSpreadRadius ?? 0;
            for (const other of enemies) {
                if (other.id === enemy.id || other.health <= 0 || (other.burnMs ?? 0) > 0) {
                    continue;
                }
                if (Math.hypot(other.x - enemy.x, other.y - enemy.y) <= spreadRadius + other.radius) {
                    if (igniteEnemy(other, (enemy.burnDamagePerSecond ?? 0) * 0.78, 1200, spreadRadius * 0.92)) {
                        hurtSounds += 1;
                    }
                }
            }
            enemy.burnSpreadCooldownMs = 260;
        }
        return { kills, hurtSounds, deathSounds };
    }

    private updateFlamethrower(tower: TowerState, deltaMs: number, enemies: EnemyState[], grid: Grid, geometry: MapGeometry): { kills: number; hurtSounds: number; deathSounds: number; flameJet: FlameJet } {
        const stats = getTowerStats(tower);
        const center = cellCenter({ x: tower.gridX, y: tower.gridY }, geometry);
        const rotateRate = stats.flameRotateRate ?? 1;
        const arcRadians = stats.flameArcRadians ?? 0.46;
        const angle = (tower.flameAngleRadians ?? (tower.id * 1.73) % (Math.PI * 2)) + rotateRate * (deltaMs / 1000);
        tower.flameAngleRadians = angle % (Math.PI * 2);

        let kills = 0;
        let hurtSounds = 0;
        let deathSounds = 0;
        for (const enemy of enemies) {
            if (enemy.health <= 0) {
                continue;
            }
            const dx = enemy.x - center.x;
            const dy = enemy.y - center.y;
            const distance = Math.hypot(dx, dy);
            if (distance > stats.range + enemy.radius) {
                continue;
            }
            const enemyAngle = Math.atan2(dy, dx);
            if (Math.abs(angleDifference(enemyAngle, tower.flameAngleRadians)) > arcRadians * 0.5) {
                continue;
            }
            if (!hasLineOfSight(grid, center, { x: enemy.x, y: enemy.y }, geometry)) {
                continue;
            }
            const falloff = 1 - Math.max(0, distance - enemy.radius) / stats.range * 0.42;
            hurtSounds += igniteEnemy(enemy, stats.burnDamagePerSecond ?? stats.damage * 0.3, stats.burnDurationMs ?? 1700, stats.burnSpreadRadius ?? 36) ? 1 : 0;
            if (applyDamage(enemy, stats.damage * falloff * (deltaMs / 1000))) {
                kills += 1;
                deathSounds += 1;
            }
        }

        return {
            kills,
            hurtSounds,
            deathSounds,
            flameJet: {
                x: center.x,
                y: center.y,
                angle: tower.flameAngleRadians,
                range: stats.range,
                arcRadians,
                intensity: 0.9 + clamp((tower.level - 1) / Math.max(1, TOWER_STATS.flamethrower.length - 1), 0, 1) * 0.55,
            },
        };
    }

    detonateAirstrike(
        target: GridPoint,
        enemies: EnemyState[],
        grid: Grid,
        geometry: MapGeometry,
    ): DetonationResult {
        const stats = getTowerStats({ type: 'airstrike', level: 1 });
        const center = cellCenter(target, geometry);
        const mapLeft = geometry.originX;
        const mapTop = geometry.originY;
        const mapRight = geometry.originX + grid.cols * geometry.cellSize;
        const mapBottom = geometry.originY + grid.rows * geometry.cellSize;
        const explosionRadius = Math.max(
            stats.explosionRadius ?? 0,
            Math.hypot(Math.max(center.x - mapLeft, mapRight - center.x), Math.max(center.y - mapTop, mapBottom - center.y)) + geometry.cellSize,
        );
        const maxKnockback = stats.knockbackDistance ?? 0;
        const killHalfSize = geometry.cellSize * 1.5;
        let kills = 0;
        let hurtSounds = 0;
        let deathSounds = 0;
        const airstrikeImpacts: AirstrikeImpactCell[] = [];

        for (let y = 0; y < grid.rows; y += 1) {
            for (let x = 0; x < grid.cols; x += 1) {
                airstrikeImpacts.push({
                    x,
                    y,
                    intensity: calculateAirstrikeIntensity({ x, y }, target, center, explosionRadius, killHalfSize, geometry),
                });
            }
        }

        for (const enemy of enemies) {
            if (enemy.health <= 0) {
                continue;
            }

            const enemyCell = worldToGrid({ x: enemy.x, y: enemy.y }, grid, geometry);
            const isInKillZone = enemyCell
                ? Math.max(Math.abs(enemyCell.x - target.x), Math.abs(enemyCell.y - target.y)) <= 1
                : Math.max(Math.abs(enemy.x - center.x), Math.abs(enemy.y - center.y)) <= killHalfSize;
            const falloff = calculateAirstrikeFalloff(enemy.x, enemy.y, center, explosionRadius, killHalfSize);
            const damage = isInKillZone
                ? Math.max(enemy.health + enemy.maxHealth, stats.damage)
                : Math.min(enemy.health - 1, stats.damage * (0.08 + falloff * falloff * 0.92));
            hurtSounds += 1;

            if (damage > 0 && applyDamage(enemy, damage)) {
                kills += 1;
                deathSounds += 1;
                continue;
            }

            applyKnockback(enemy, center.x, center.y, maxKnockback * (0.08 + falloff * 0.92), grid, geometry);
        }

        return {
            kills,
            hurtSounds,
            deathSounds,
            explosion: { x: center.x, y: center.y, radius: explosionRadius, lifeMs: 520 },
            airstrikeImpacts,
        };
    }
}
