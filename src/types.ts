export type TerrainType = 'tree' | 'grass' | 'tarmac';

export type TeamId = 'solar' | 'lunar';

export type MonsterGeneratorType = 'scout' | 'grunt' | 'tank' | 'titan';

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
    teamId?: TeamId;
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
    teamId?: TeamId;
    visualTier?: 1 | 2 | 3 | 4;
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
    teamId?: TeamId;
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

export interface MonsterGeneratorState {
    teamId: TeamId;
    level: number;
    progress: number;
    spawnCount: number;
}

export interface MultiplayerStats {
    kills: number;
    answered: number;
    correctAnswers: number;
}

export interface MultiplayerSnapshot {
    tick: number;
    elapsedMs: number;
    baseHealth: Record<TeamId, number>;
    towers: TowerState[];
    enemies: EnemyState[];
    projectiles: ProjectileState[];
    explosions: Array<{ x: number; y: number; radius: number; lifeMs: number }>;
    generators: MonsterGeneratorState[];
    stats: Record<TeamId, MultiplayerStats>;
    gameOver: boolean;
    winner?: TeamId;
    pendingCommands: ScheduledMultiplayerCommand[];
    pendingAirstrikes: Array<{
        id: number;
        target: GridPoint;
        elapsedMs: number;
        delayMs: number;
        start: Vec2;
        end: Vec2;
        teamId?: TeamId;
    }>;
    rngState: number;
    nextIds: {
        tower: number;
        airstrike: number;
        enemy: number;
        towerProjectile: number;
        fragmentProjectile: number;
    };
}

export type MultiplayerCommand =
    | { kind: 'build'; teamId: TeamId; cell: GridPoint; towerType: TowerType }
    | { kind: 'upgrade'; teamId: TeamId; towerId: number }
    | { kind: 'upgradeGenerator'; teamId: TeamId }
    | { kind: 'answer'; teamId: TeamId; correct: boolean };

export interface ScheduledMultiplayerCommand {
    id: string;
    tick: number;
    command: MultiplayerCommand;
}
