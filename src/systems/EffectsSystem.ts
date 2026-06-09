import type { EnemyState, ProjectileState, ProjectileType } from '../types';
import type { FlameJet } from './TowerSystem';

// Lightweight, allocation-free particle system rendered in immediate mode into the
// scene's shared Graphics object. A fixed pool plus a free-list keeps per-frame work
// bounded and avoids creating Phaser GameObjects per particle, so heavy projectile
// activity stays cheap.

const MAX_PARTICLES = 1400;

interface Particle {
    active: boolean;
    x: number;
    y: number;
    vx: number;
    vy: number;
    ageMs: number;
    lifeMs: number;
    startSize: number;
    endSize: number;
    startColor: number;
    endColor: number;
    startAlpha: number;
    endAlpha: number;
    drag: number;
    gravity: number;
    glow: boolean;
}

function createBlankParticle(): Particle {
    return {
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        ageMs: 0,
        lifeMs: 1,
        startSize: 1,
        endSize: 1,
        startColor: 0xffffff,
        endColor: 0xffffff,
        startAlpha: 1,
        endAlpha: 0,
        drag: 0,
        gravity: 0,
        glow: false,
    };
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const r = (ar + (br - ar) * t) | 0;
    const g = (ag + (bg - ag) * t) | 0;
    const bl = (ab + (bb - ab) * t) | 0;
    return (r << 16) | (g << 8) | bl;
}

function randomBetween(min: number, max: number): number {
    return min + Math.random() * (max - min);
}

export interface ExplosionEffect {
    x: number;
    y: number;
    radius: number;
    lifeMs: number;
}

export class EffectsSystem {
    private readonly pool: Particle[] = [];
    private readonly free: number[] = [];

    constructor() {
        for (let index = 0; index < MAX_PARTICLES; index += 1) {
            this.pool.push(createBlankParticle());
            this.free.push(index);
        }
    }

    private spawn(
        x: number,
        y: number,
        vx: number,
        vy: number,
        lifeMs: number,
        startSize: number,
        endSize: number,
        startColor: number,
        endColor: number,
        startAlpha: number,
        endAlpha: number,
        drag: number,
        gravity: number,
        glow: boolean,
    ): void {
        const slot = this.free.pop();
        if (slot === undefined) {
            return;
        }
        const p = this.pool[slot];
        p.active = true;
        p.x = x;
        p.y = y;
        p.vx = vx;
        p.vy = vy;
        p.ageMs = 0;
        p.lifeMs = lifeMs;
        p.startSize = startSize;
        p.endSize = endSize;
        p.startColor = startColor;
        p.endColor = endColor;
        p.startAlpha = startAlpha;
        p.endAlpha = endAlpha;
        p.drag = drag;
        p.gravity = gravity;
        p.glow = glow;
    }

    /** Emit trailing particles for every live projectile based on its type. */
    emitTrails(projectiles: ProjectileState[], deltaMs: number): void {
        if (this.free.length === 0) {
            return;
        }
        for (const projectile of projectiles) {
            this.emitProjectileTrail(projectile, deltaMs);
        }
    }

    emitFlameJets(flameJets: readonly FlameJet[], deltaMs: number): void {
        if (this.free.length === 0) {
            return;
        }
        for (const jet of flameJets) {
            const particleBudgetFloat = (deltaMs / 4.5) * jet.intensity;
            const particleBudget = Math.max(2, Math.floor(particleBudgetFloat));
            const extra = Math.random() < particleBudgetFloat % 1 ? 1 : 0;
            for (let index = 0; index < particleBudget + extra; index += 1) {
                this.emitFlameParticle(jet);
                if (index % 2 === 0) {
                    this.emitFlameCoreParticle(jet);
                }
                if (this.free.length === 0) {
                    return;
                }
            }
        }
    }

    emitBurningEnemies(enemies: readonly EnemyState[], deltaMs: number): void {
        if (this.free.length === 0) {
            return;
        }
        for (const enemy of enemies) {
            if ((enemy.burnMs ?? 0) <= 0 || enemy.health <= 0) {
                continue;
            }
            const count = Math.random() < Math.min(0.9, deltaMs / 28) ? 1 : 0;
            for (let index = 0; index < count; index += 1) {
                const angle = Math.random() * Math.PI * 2;
                const offset = Math.random() * enemy.radius * 0.75;
                this.spawn(
                    enemy.x + Math.cos(angle) * offset,
                    enemy.y + Math.sin(angle) * offset,
                    randomBetween(-10, 10),
                    randomBetween(-24, -8),
                    randomBetween(210, 360),
                    randomBetween(2.2, 4.2),
                    0.4,
                    Math.random() > 0.35 ? 0xfff1a8 : 0xff7a18,
                    0xd42008,
                    0.78,
                    0,
                    1.9,
                    -18,
                    true,
                );
            }
            if (Math.random() < Math.min(0.24, deltaMs / 90)) {
                this.spawn(
                    enemy.x + randomBetween(-enemy.radius * 0.5, enemy.radius * 0.5),
                    enemy.y + randomBetween(-enemy.radius * 0.5, enemy.radius * 0.5),
                    randomBetween(-8, 8),
                    randomBetween(-18, -6),
                    randomBetween(360, 620),
                    2,
                    7,
                    0x4a372e,
                    0x120c09,
                    0.28,
                    0,
                    1.2,
                    -10,
                    false,
                );
            }
        }
    }

    private emitFlameParticle(jet: FlameJet): void {
        const angle = jet.angle + randomBetween(-jet.arcRadians * 0.24, jet.arcRadians * 0.24);
        const distanceT = Math.random() ** 0.48;
        const distance = randomBetween(8, jet.range * distanceT);
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const sideX = -dirY;
        const sideY = dirX;
        const width = lerp(1.2, 7.5, distance / Math.max(1, jet.range));
        const x = jet.x + dirX * distance + sideX * randomBetween(-width, width);
        const y = jet.y + dirY * distance + sideY * randomBetween(-width, width);
        const speed = randomBetween(54, 128) * jet.intensity;
        const heat = 1 - distance / Math.max(1, jet.range);
        const hot = heat > 0.48;
        this.spawn(
            x,
            y,
            dirX * speed + sideX * randomBetween(-8, 8),
            dirY * speed + sideY * randomBetween(-8, 8) - randomBetween(0, 12),
            randomBetween(110, 220),
            hot ? randomBetween(4.2, 7.2) : randomBetween(2.6, 5.4),
            randomBetween(0.4, 1.4),
            hot ? 0xfff9d8 : 0xff9a20,
            hot ? 0xff7420 : 0xc72208,
            hot ? 0.88 : 0.68,
            0,
            3.2,
            -10,
            true,
        );
        if (Math.random() < 0.08) {
            this.spawn(
                x - dirX * 5,
                y - dirY * 5,
                dirX * randomBetween(18, 36) + sideX * randomBetween(-5, 5),
                dirY * randomBetween(18, 36) + sideY * randomBetween(-5, 5) - 8,
                randomBetween(360, 540),
                randomBetween(1.6, 3.2),
                randomBetween(6, 10),
                0x5b473b,
                0x18100d,
                0.18,
                0,
                1.35,
                -12,
                false,
            );
        }
    }

    private emitFlameCoreParticle(jet: FlameJet): void {
        const angle = jet.angle + randomBetween(-jet.arcRadians * 0.08, jet.arcRadians * 0.08);
        const distance = randomBetween(6, jet.range * (0.18 + Math.random() * 0.78));
        const dirX = Math.cos(angle);
        const dirY = Math.sin(angle);
        const sideX = -dirY;
        const sideY = dirX;
        const width = lerp(0.4, 3.2, distance / Math.max(1, jet.range));
        const speed = randomBetween(96, 170) * jet.intensity;
        this.spawn(
            jet.x + dirX * distance + sideX * randomBetween(-width, width),
            jet.y + dirY * distance + sideY * randomBetween(-width, width),
            dirX * speed + sideX * randomBetween(-3, 3),
            dirY * speed + sideY * randomBetween(-3, 3),
            randomBetween(75, 145),
            randomBetween(2.2, 4.4),
            0.25,
            Math.random() > 0.42 ? 0xf8ffff : 0xa9ecff,
            0xffdf75,
            0.78,
            0,
            4.4,
            0,
            true,
        );
    }

    private emitProjectileTrail(projectile: ProjectileState, deltaMs: number): void {
        const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
        const dirX = projectile.vx / speed;
        const dirY = projectile.vy / speed;

        let interval: number;
        switch (projectile.type) {
            case 'missile':
                interval = 16 / (projectile.trailScale ?? 1);
                break;
            case 'cluster':
                interval = 20;
                break;
            case 'fragment':
                interval = 16;
                break;
            default:
                interval = projectile.visualType === 'spray' ? 12 : 18;
                break;
        }

        let accum = (projectile.emitAccumMs ?? 0) + deltaMs;
        while (accum >= interval) {
            accum -= interval;
            this.emitTrailParticle(projectile, dirX, dirY);
            if (this.free.length === 0) {
                accum = 0;
                break;
            }
        }
        projectile.emitAccumMs = accum;
    }

    private emitTrailParticle(projectile: ProjectileState, dirX: number, dirY: number): void {
        // Spawn slightly behind the projectile so the trail streams from its tail.
        const tailX = projectile.x - dirX * (projectile.radius + 2);
        const tailY = projectile.y - dirY * (projectile.radius + 2);
        const sideX = -dirY;
        const sideY = dirX;

        switch (projectile.type) {
            case 'missile': {
                const trailScale = projectile.trailScale ?? 1;
                // Hot exhaust flame right at the nozzle.
                this.spawn(
                    tailX,
                    tailY,
                    dirX * -24 + (Math.random() - 0.5) * 24,
                    dirY * -24 + (Math.random() - 0.5) * 24,
                    170 * trailScale,
                    4.2,
                    1.2,
                    0xffe28a,
                    0xff5a1a,
                    0.95,
                    0,
                    2.4,
                    0,
                    true,
                );
                // Drifting smoke puff that lingers behind the rocket.
                this.spawn(
                    tailX + (Math.random() - 0.5) * 3,
                    tailY + (Math.random() - 0.5) * 3,
                    dirX * -10 + (Math.random() - 0.5) * 14,
                    dirY * -10 + (Math.random() - 0.5) * 14 - 6,
                    560 * trailScale,
                    2.6,
                    8.5,
                    0xc8c2b6,
                    0x4a443d,
                    0.5,
                    0,
                    1.6,
                    -8,
                    false,
                );
                break;
            }
            case 'cluster': {
                this.spawn(
                    tailX,
                    tailY,
                    (Math.random() - 0.5) * 26,
                    (Math.random() - 0.5) * 26,
                    320,
                    3.4,
                    0.6,
                    0xffa8e6,
                    0x7a2f8f,
                    0.85,
                    0,
                    1.8,
                    0,
                    true,
                );
                break;
            }
            case 'fragment': {
                const heat = Math.max(0, Math.min(1, projectile.lifeMs / (projectile.maxLifeMs ?? 620)));
                const hotColor = heat > 0.66 ? 0xffffff : heat > 0.38 ? 0xff8a16 : heat > 0.16 ? 0xd82712 : 0x15100d;
                const coolColor = heat > 0.66 ? 0xffb32b : heat > 0.38 ? 0xe13012 : heat > 0.16 ? 0x220d08 : 0x050403;
                this.spawn(
                    tailX,
                    tailY,
                    dirX * randomBetween(-18, -4) + (Math.random() - 0.5) * 18,
                    dirY * randomBetween(-18, -4) + (Math.random() - 0.5) * 18,
                    190,
                    2.8,
                    0.5,
                    hotColor,
                    coolColor,
                    0.9,
                    0,
                    2,
                    0,
                    heat > 0.25,
                );
                if (heat < 0.35) {
                    this.spawn(
                        tailX + (Math.random() - 0.5) * 3,
                        tailY + (Math.random() - 0.5) * 3,
                        dirX * -8 + (Math.random() - 0.5) * 12,
                        dirY * -8 + (Math.random() - 0.5) * 12 - 4,
                        300,
                        1.6,
                        5.8,
                        0x2b241f,
                        0x050403,
                        0.45,
                        0,
                        1.1,
                        -4,
                        false,
                    );
                }
                break;
            }
            default: {
                if (projectile.visualType === 'spray') {
                    const sideOffset = randomBetween(-7, 7);
                    const color = Math.random() > 0.5 ? 0x42f5ff : 0xff4fd8;
                    this.spawn(
                        tailX + sideX * sideOffset,
                        tailY + sideY * sideOffset,
                        dirX * randomBetween(-40, -16) + sideX * randomBetween(-32, 32),
                        dirY * randomBetween(-40, -16) + sideY * randomBetween(-32, 32),
                        260,
                        3.1,
                        0.4,
                        0xffffff,
                        color,
                        0.75,
                        0,
                        2.8,
                        0,
                        true,
                    );
                    this.spawn(
                        tailX - dirX * 4,
                        tailY - dirY * 4,
                        sideX * randomBetween(-16, 16),
                        sideY * randomBetween(-16, 16),
                        140,
                        5.4,
                        1.2,
                        0x6ffcff,
                        0xff5bd6,
                        0.18,
                        0,
                        1.8,
                        0,
                        true,
                    );
                    break;
                }
                // Bright tracer flare for bullet tower rounds.
                this.spawn(
                    tailX - dirX * 8,
                    tailY - dirY * 8,
                    dirX * -28 + (Math.random() - 0.5) * 12,
                    dirY * -28 + (Math.random() - 0.5) * 12,
                    165,
                    4.4,
                    0.4,
                    0xffffff,
                    0xffb300,
                    0.9,
                    0,
                    2,
                    0,
                    true,
                );
                this.spawn(
                    tailX,
                    tailY,
                    (Math.random() - 0.5) * 22,
                    (Math.random() - 0.5) * 22,
                    95,
                    1.5,
                    0.2,
                    0xfff3c4,
                    0xff6f1a,
                    0.7,
                    0,
                    2.5,
                    0,
                    false,
                );
                break;
            }
        }
    }

    /** Small spark burst when a direct-hit projectile strikes an enemy. */
    spawnImpact(x: number, y: number, type: ProjectileType): void {
        const sparks = type === 'missile' ? 10 : 6;
        for (let index = 0; index < sparks; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 70 + Math.random() * 130;
            this.spawn(
                x,
                y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                220 + Math.random() * 120,
                type === 'missile' ? 3 : 2.2,
                0.4,
                0xfff1b0,
                0xff6a1a,
                0.9,
                0,
                3,
                40,
                true,
            );
        }
        if (type === 'missile') {
            this.spawnSmoke(x, y, 4, 0.7);
        }
    }

    /** Fiery burst for cluster shells and airstrikes. */
    spawnExplosion(x: number, y: number, radius: number, big: boolean): void {
        const emberCount = big ? 30 : 16;
        const smokeCount = big ? 12 : 6;
        const reach = radius * 1.1;
        for (let index = 0; index < emberCount; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = reach * (1.4 + Math.random() * 2.2);
            this.spawn(
                x,
                y,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed,
                280 + Math.random() * 260,
                big ? 5 : 3.4,
                0.5,
                0xfff2b0,
                0xff3b00,
                0.95,
                0,
                3.2,
                90,
                true,
            );
        }
        // Bright core flash.
        this.spawn(x, y, 0, 0, big ? 180 : 130, radius * 0.5, radius * 0.18, 0xfff6cf, 0xffae3b, 0.85, 0, 0, 0, true);
        this.spawnSmoke(x, y, smokeCount, big ? 1.4 : 1);
    }

    private spawnSmoke(x: number, y: number, count: number, scale: number): void {
        for (let index = 0; index < count; index += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = (10 + Math.random() * 26) * scale;
            this.spawn(
                x + (Math.random() - 0.5) * 6,
                y + (Math.random() - 0.5) * 6,
                Math.cos(angle) * speed,
                Math.sin(angle) * speed - 12,
                620 + Math.random() * 320,
                4 * scale,
                14 * scale,
                0xb6b0a4,
                0x3a352e,
                0.5,
                0,
                1.4,
                -14,
                false,
            );
        }
    }

    update(deltaMs: number): void {
        const dt = deltaMs / 1000;
        for (let index = 0; index < this.pool.length; index += 1) {
            const p = this.pool[index];
            if (!p.active) {
                continue;
            }
            p.ageMs += deltaMs;
            if (p.ageMs >= p.lifeMs) {
                p.active = false;
                this.free.push(index);
                continue;
            }
            const dragFactor = Math.max(0, 1 - p.drag * dt);
            p.vx *= dragFactor;
            p.vy *= dragFactor;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
        }
    }

    render(graphics: Phaser.GameObjects.Graphics): void {
        for (const p of this.pool) {
            if (!p.active) {
                continue;
            }
            const t = p.ageMs / p.lifeMs;
            const size = lerp(p.startSize, p.endSize, t);
            if (size <= 0.05) {
                continue;
            }
            const alpha = lerp(p.startAlpha, p.endAlpha, t);
            if (alpha <= 0.01) {
                continue;
            }
            const color = lerpColor(p.startColor, p.endColor, t);
            if (p.glow) {
                graphics.fillStyle(color, alpha * 0.28);
                graphics.fillCircle(p.x, p.y, size * 1.9);
            }
            graphics.fillStyle(color, alpha);
            graphics.fillCircle(p.x, p.y, size);
        }
    }
}
