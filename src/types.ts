export type TerrainType = 'tree' | 'grass' | 'tarmac';

export type TowerDifficulty = 'easy' | 'medium' | 'hard' | 'veryHard';

export type TowerType = 'easy' | 'spray' | 'missile' | 'flamethrower' | 'cluster' | 'wall' | 'airstrike';

export type EnemyType = 'scout' | 'grunt' | 'tank';

export type ProjectileType = 'bullet' | 'missile' | 'cluster' | 'fragment';

export interface GridPoint {
    x: number;
    y: number;
}

export interface Vec2 {
    x: number;
    y: number;
}

export interface MapGeometry {
    originX: number;
    originY: number;
    cellSize: number;
}

export interface TowerState {
    id: number;
    gridX: number;
    gridY: number;
    type: TowerType;
    level: number;
    cooldownMs: number;
    health?: number;
    maxHealth?: number;
    baseTerrain?: TerrainType;
    flameAngleRadians?: number;
}

export interface EnemyState {
    id: number;
    type: EnemyType;
    x: number;
    y: number;
    vx: number;
    vy: number;
    health: number;
    maxHealth: number;
    speed: number;
    radius: number;
    baseDamage: number;
    hurtFlashMs: number;
    lastProgressDistance: number;
    stalledSeconds: number;
    panicSecondsRemaining: number;
    panicStartDistance: number;
    isStuck: boolean;
    lastMoveSpeed: number;
    burnMs?: number;
    burnDamagePerSecond?: number;
    burnSpreadRadius?: number;
    burnSpreadCooldownMs?: number;
}

export interface ProjectileState {
    id: number;
    type: ProjectileType;
    visualType?: 'bullet' | 'spray';
    x: number;
    y: number;
    previousX: number;
    previousY: number;
    vx: number;
    vy: number;
    damage: number;
    radius: number;
    lifeMs: number;
    maxLifeMs?: number;
    targetId?: number;
    turnRate?: number;
    speed?: number;
    homingDelayMs?: number;
    trailScale?: number;
    explosionRadius?: number;
    fragmentCount?: number;
    fragmentDamage?: number;
    emitAccumMs?: number;
}

export interface MathsQuestion {
    id: string;
    difficulty: TowerDifficulty;
    yearLevel: string;
    expression: string;
    expressionShort: string;
    correctAnswer: string;
    choices: string[];
}
