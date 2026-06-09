import { createProjectile } from '../entities/Projectile';
import { raycastGridCells } from '../map/LineOfSight';
import type { EnemyState, GridPoint, MapGeometry, ProjectileState, ProjectileType, Vec2 } from '../types';
import { Grid } from '../map/Grid';

export interface ProjectileImpact {
    x: number;
    y: number;
    type: ProjectileType;
}

export interface ProjectileUpdateResult {
    projectiles: ProjectileState[];
    kills: number;
    explosions: { x: number; y: number; radius: number; lifeMs: number }[];
    impacts: ProjectileImpact[];
    hurtSounds: number;
    deathSounds: number;
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

interface TreeCollision {
    hitX: number;
    hitY: number;
    normalX: number;
    normalY: number;
}

const TREE_BOUNCE_OFFSET = 0.5;

function isTreeBounceable(projectile: ProjectileState): boolean {
    return projectile.type === 'bullet' || projectile.type === 'fragment';
}

function clampUnit(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function collisionTime(from: Vec2, to: Vec2, cell: GridPoint, normalX: number, normalY: number, geometry: MapGeometry): number {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const candidates: number[] = [];

    if (normalX !== 0 && dx !== 0) {
        const boundaryX = normalX < 0
            ? geometry.originX + cell.x * geometry.cellSize
            : geometry.originX + (cell.x + 1) * geometry.cellSize;
        candidates.push((boundaryX - from.x) / dx);
    }
    if (normalY !== 0 && dy !== 0) {
        const boundaryY = normalY < 0
            ? geometry.originY + cell.y * geometry.cellSize
            : geometry.originY + (cell.y + 1) * geometry.cellSize;
        candidates.push((boundaryY - from.y) / dy);
    }

    const validCandidates = candidates.filter((candidate) => Number.isFinite(candidate));
    return validCandidates.length > 0 ? clampUnit(Math.min(...validCandidates)) : 0;
}

function findFirstTreeCollision(grid: Grid, from: Vec2, to: Vec2, geometry: MapGeometry): TreeCollision | undefined {
    const crossedCells = raycastGridCells(grid, from, to, geometry);
    const dx = to.x - from.x;
    const dy = to.y - from.y;

    for (let index = 0; index < crossedCells.length; index += 1) {
        const cell = crossedCells[index];
        if (grid.getTerrain(cell.x, cell.y) !== 'tree') {
            continue;
        }

        if (index === 0) {
            const normalX = Math.abs(dx) >= Math.abs(dy) ? -Math.sign(dx) : 0;
            const normalY = Math.abs(dy) > Math.abs(dx) ? -Math.sign(dy) : 0;
            return { hitX: from.x, hitY: from.y, normalX, normalY };
        }

        const previousCell = crossedCells[index - 1];
        const normalX = previousCell.x < cell.x ? -1 : previousCell.x > cell.x ? 1 : 0;
        const normalY = previousCell.y < cell.y ? -1 : previousCell.y > cell.y ? 1 : 0;
        const hitTime = collisionTime(from, to, cell, normalX, normalY, geometry);
        return {
            hitX: from.x + dx * hitTime,
            hitY: from.y + dy * hitTime,
            normalX,
            normalY,
        };
    }

    return undefined;
}

function bounceProjectile(projectile: ProjectileState, collision: TreeCollision): void {
    if (collision.normalX !== 0) {
        projectile.vx *= -1;
    }
    if (collision.normalY !== 0) {
        projectile.vy *= -1;
    }
    projectile.x = collision.hitX + collision.normalX * TREE_BOUNCE_OFFSET;
    projectile.y = collision.hitY + collision.normalY * TREE_BOUNCE_OFFSET;
}

export class ProjectileSystem {
    private nextProjectileId = 100000;

    update(deltaMs: number, projectiles: ProjectileState[], enemies: EnemyState[], grid: Grid, geometry: MapGeometry): ProjectileUpdateResult {
        const aliveProjectiles: ProjectileState[] = [];
        const spawnedFragments: ProjectileState[] = [];
        const explosions: { x: number; y: number; radius: number; lifeMs: number }[] = [];
        const impacts: ProjectileImpact[] = [];
        let kills = 0;
        let hurtSounds = 0;
        let deathSounds = 0;

        for (const projectile of projectiles) {
            projectile.lifeMs -= deltaMs;
            projectile.previousX = projectile.x;
            projectile.previousY = projectile.y;
            if (projectile.type === 'missile') {
                if ((projectile.homingDelayMs ?? 0) > 0) {
                    projectile.homingDelayMs = Math.max(0, (projectile.homingDelayMs ?? 0) - deltaMs);
                } else {
                    this.updateMissileVelocity(projectile, enemies, deltaMs);
                }
            }
            projectile.x += projectile.vx * (deltaMs / 1000);
            projectile.y += projectile.vy * (deltaMs / 1000);

            if (projectile.lifeMs <= 0) {
                continue;
            }
            const treeCollision = findFirstTreeCollision(grid, { x: projectile.previousX, y: projectile.previousY }, { x: projectile.x, y: projectile.y }, geometry);
            if (treeCollision) {
                if (!isTreeBounceable(projectile)) {
                    continue;
                }
                bounceProjectile(projectile, treeCollision);
            }

            const hit = this.findHitEnemy(projectile, enemies);
            if (hit) {
                if (projectile.type === 'cluster') {
                    const result = this.explodeCluster(projectile, enemies, spawnedFragments, explosions);
                    kills += result.kills;
                    hurtSounds += result.hurtSounds;
                    deathSounds += result.deathSounds;
                } else {
                    impacts.push({ x: projectile.x, y: projectile.y, type: projectile.type });
                    hurtSounds += 1;
                    if (applyDamage(hit, projectile.damage)) {
                        kills += 1;
                        deathSounds += 1;
                    }
                }
                continue;
            }

            aliveProjectiles.push(projectile);
        }

        return { projectiles: [...aliveProjectiles, ...spawnedFragments], kills, explosions, impacts, hurtSounds, deathSounds };
    }

    private updateMissileVelocity(projectile: ProjectileState, enemies: readonly EnemyState[], deltaMs: number): void {
        let target = enemies.find((enemy) => enemy.id === projectile.targetId && enemy.health > 0);
        if (!target) {
            target = enemies.filter((enemy) => enemy.health > 0).sort((a, b) => Math.hypot(a.x - projectile.x, a.y - projectile.y) - Math.hypot(b.x - projectile.x, b.y - projectile.y))[0];
            projectile.targetId = target?.id;
        }
        if (!target) {
            return;
        }
        const desired = normalize(target.x - projectile.x, target.y - projectile.y);
        const currentAngle = Math.atan2(projectile.vy, projectile.vx);
        const desiredAngle = Math.atan2(desired.y, desired.x);
        let angleDelta = desiredAngle - currentAngle;
        while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
        while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
        const maxTurn = (projectile.turnRate ?? 2.2) * (deltaMs / 1000);
        const newAngle = currentAngle + Math.max(-maxTurn, Math.min(maxTurn, angleDelta));
        const speed = projectile.speed ?? Math.hypot(projectile.vx, projectile.vy);
        projectile.vx = Math.cos(newAngle) * speed;
        projectile.vy = Math.sin(newAngle) * speed;
    }

    private findHitEnemy(projectile: ProjectileState, enemies: readonly EnemyState[]): EnemyState | undefined {
        return enemies.find((enemy) => enemy.health > 0 && Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y) <= enemy.radius + projectile.radius);
    }

    private explodeCluster(projectile: ProjectileState, enemies: EnemyState[], fragments: ProjectileState[], explosions: { x: number; y: number; radius: number; lifeMs: number }[]): { kills: number; hurtSounds: number; deathSounds: number } {
        const radius = projectile.explosionRadius ?? 64;
        let kills = 0;
        let hurtSounds = 0;
        let deathSounds = 0;
        for (const enemy of enemies) {
            if (enemy.health <= 0) {
                continue;
            }
            const distance = Math.hypot(enemy.x - projectile.x, enemy.y - projectile.y);
            if (distance <= radius) {
                const falloff = 1 - distance / radius * 0.45;
                hurtSounds += 1;
                if (applyDamage(enemy, projectile.damage * falloff)) {
                    kills += 1;
                    deathSounds += 1;
                }
            }
        }
        explosions.push({ x: projectile.x, y: projectile.y, radius, lifeMs: 260 });
        const fragmentCount = projectile.fragmentCount ?? 6;
        for (let index = 0; index < fragmentCount; index += 1) {
            const angle = (Math.PI * 2 * index) / fragmentCount;
            const speed = 260;
            const fragment = createProjectile(this.nextProjectileId++, 'fragment', projectile.x, projectile.y, Math.cos(angle) * speed, Math.sin(angle) * speed, projectile.fragmentDamage ?? 7, 3.2, 620);
            fragments.push(fragment);
        }
        return { kills, hurtSounds, deathSounds };
    }
}
