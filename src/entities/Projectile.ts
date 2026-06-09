import type { ProjectileState, ProjectileType } from '../types';

export function createProjectile(id: number, type: ProjectileType, x: number, y: number, vx: number, vy: number, damage: number, radius: number, lifeMs: number): ProjectileState {
    return {
        id,
        type,
        x,
        y,
        previousX: x,
        previousY: y,
        vx,
        vy,
        damage,
        radius,
        lifeMs,
        maxLifeMs: lifeMs,
    };
}
