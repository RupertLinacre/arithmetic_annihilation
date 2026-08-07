import Phaser from 'phaser';
import { ENEMY_STATS, GAME_CONFIG, TOWER_COLORS } from '../config/gameConfig';
import { SeededRandom } from '../core/SeededRandom';
import { canUpgradeTower, createTower, isWallTower, upgradeTower } from '../entities/Tower';
import { createEnemy, updateEnemy } from '../entities/Enemy';
import { isBaseFootprintCell } from '../map/BaseFootprint';
import { cellCenter, Grid, worldToGrid } from '../map/Grid';
import { hasLineOfSight } from '../map/LineOfSight';
import { generateMap, generateMultiplayerMap, type GeneratedMap } from '../map/MapGenerator';
import { multiplayerSession } from '../multiplayer/MultiplayerSession';
import {
    chooseMonsterType,
    getGeneratorHealthScale,
    getGeneratorSpawnPeriodMs,
    getGeneratorUpgradeDifficulty,
    getMonsterMix,
    MAX_MONSTER_GENERATOR_LEVEL,
} from '../multiplayer/MonsterGenerator';
import { buildFlowField, type FlowField } from '../pathfinding/FlowField';
import { calculateTowerThreatCosts, createEmptyCostGrid, type CostGrid, getTowerStats } from '../pathfinding/ThreatMap';
import { EnemySpawner, isGameDifficulty, type GameDifficulty } from '../systems/EnemySpawner';
import { EffectsSystem } from '../systems/EffectsSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TowerSystem, type AirstrikeImpactCell } from '../systems/TowerSystem';
import { updateEnemyWallObjective } from '../systems/WallSystem';
import {
    BASE_MATHS_DIFFICULTY_LABELS,
    normalizeBaseMathsDifficulty,
    type BaseMathsDifficulty,
    MathsQuestionSystem,
} from '../systems/MathsQuestionSystem';
import { BottomPanel, type BuildTowerSelection, type MobileAnswerMode } from '../ui/BottomPanel';
import { isMobileLayout, MobileLayout } from '../ui/mobile';
import type {
    EnemyState,
    GridPoint,
    MonsterGeneratorState,
    MonsterGeneratorType,
    MultiplayerCommand,
    MultiplayerSnapshot,
    MultiplayerStats,
    ProjectileState,
    ScheduledMultiplayerCommand,
    TeamId,
    TerrainType,
    TowerState,
    TowerType,
    Vec2,
} from '../types';

const SPRITE_PATHS = {
    base: 'sprites/base_1.png',
    grass1: 'sprites/grass_1.png',
    grass2: 'sprites/grass_2.png',
    grass3: 'sprites/grass_3.png',
    grass4: 'sprites/grass_4.png',
    grass5: 'sprites/grass_5.png',
    tree1: 'sprites/tree_1.png',
    tree2: 'sprites/tree_2.png',
    tarmac1: 'sprites/tarmac_1.png',
    tarmac2: 'sprites/tarmac_2.png',
    tarmac3: 'sprites/tarmac_3.png',
    towerBasic: 'sprites/turret_basic.png',
    towerCluster: 'sprites/turret_cluster.png',
    towerClusterBomb: 'sprites/turrent_cluster_bomb.png',
    towerSidewinder: 'sprites/turret_sidewinder.png',
    wall: 'sprites/wall.png',
    monster1Run: 'sprites/monster_1_run.png',
    monster1Stop: 'sprites/monster_1_stop.png',
    monster1Hurt: 'sprites/monster_1_hurt.png',
    monster2Run: 'sprites/monster_2_run.png',
    monster2Stop: 'sprites/monster_2_stop.png',
    monster2Hurt: 'sprites/monster_2_hurt.png',
    monster3Run: 'sprites/monster_3_run.png',
    monster3Stop: 'sprites/monster_3_stop.png',
    monster3Hurt: 'sprites/monster_3_hurt.png',
    monster4Run: 'sprites/monster_4_run.png',
    monster4Stop: 'sprites/monster_4_stop.png',
    monster4Hurt: 'sprites/monster_4_hurt.png',
} as const;

const SOUND_PATHS = {
    pop: 'audio/pop.mp3',
    owHurt: 'audio/ow_hurt.mp3',
    owDeath: 'audio/ow_death.mp3',
    music: 'audio/music.m4a',
} as const;

const SOUND_KEYS = {
    pop: 'sound-pop',
    owHurt: 'sound-ow-hurt',
    owDeath: 'sound-ow-death',
    music: 'sound-music',
} as const;

const TERRAIN_TEXTURES: Record<TerrainType, readonly string[]> = {
    grass: [SPRITE_PATHS.grass1, SPRITE_PATHS.grass2, SPRITE_PATHS.grass3, SPRITE_PATHS.grass4, SPRITE_PATHS.grass5],
    tree: [SPRITE_PATHS.tree1, SPRITE_PATHS.tree2],
    tarmac: [SPRITE_PATHS.tarmac1, SPRITE_PATHS.tarmac2, SPRITE_PATHS.tarmac3],
};

const TOWER_TEXTURES: Record<TowerType, string> = {
    easy: SPRITE_PATHS.towerBasic,
    spray: SPRITE_PATHS.towerCluster,
    missile: SPRITE_PATHS.towerSidewinder,
    flamethrower: SPRITE_PATHS.wall,
    cluster: SPRITE_PATHS.towerClusterBomb,
    wall: SPRITE_PATHS.wall,
    airstrike: SPRITE_PATHS.wall,
};

const ENEMY_TEXTURES = {
    1: { run: SPRITE_PATHS.monster1Run, stop: SPRITE_PATHS.monster1Stop, hurt: SPRITE_PATHS.monster1Hurt },
    2: { run: SPRITE_PATHS.monster2Run, stop: SPRITE_PATHS.monster2Stop, hurt: SPRITE_PATHS.monster2Hurt },
    3: { run: SPRITE_PATHS.monster3Run, stop: SPRITE_PATHS.monster3Stop, hurt: SPRITE_PATHS.monster3Hurt },
    4: { run: SPRITE_PATHS.monster4Run, stop: SPRITE_PATHS.monster4Stop, hurt: SPRITE_PATHS.monster4Hurt },
} as const;

const TOWER_SPRITE_MAX_SIZE = GAME_CONFIG.map.cellSize * 1.2;
const ENEMY_SPRITE_MIN_SIZE = GAME_CONFIG.map.cellSize * 0.9;
const ENEMY_SPRITE_MAX_SIZE = GAME_CONFIG.map.cellSize * 1.28;
const AIRSTRIKE_DELAY_MS = 500;
const AIRSTRIKE_IMPACT_LIFE_MS = 640;
const MULTIPLAYER_STEP_MS = 40;
const MULTIPLAYER_COMMAND_DELAY_TICKS = 12;
const MULTIPLAYER_CHECKSUM_INTERVAL_TICKS = 50;
const COMPUTER_ACTION_INTERVAL_TICKS = 225;
const COMPUTER_TOWER_TYPES: TowerType[] = ['easy', 'spray', 'missile', 'flamethrower', 'cluster', 'wall'];
const LEGACY_DIFFICULTY_STORAGE_KEY = 'vocab-annihilation:difficulty';
const SPAWN_RATE_STORAGE_KEY = 'arithmetic-annihilation:spawn-rate';
const BASE_DIFFICULTY_STORAGE_KEY = 'arithmetic-annihilation:base-difficulty';
const ANSWER_MODE_STORAGE_KEY = 'arithmetic-annihilation:answer-mode';
const MUSIC_VOLUME_STORAGE_KEY = 'arithmetic-annihilation:music-volume';
const MUSIC_MUTED_STORAGE_KEY = 'arithmetic-annihilation:music-muted';
const URL_OPTION_KEYS = {
    spawnRate: 'spawn-rate',
    baseDifficulty: 'base-difficulty',
    answerMode: 'answer-mode',
    musicVolume: 'music-volume',
    musicMuted: 'music-muted',
} as const;

const SPAWN_RATE_LABELS: Record<GameDifficulty, string> = {
    veryEasy: 'Very low',
    easy: 'Low',
    medium: 'Medium',
    hard: 'High',
    veryHard: 'Very high',
};

const ANSWER_MODE_LABELS: Record<MobileAnswerMode, string> = {
    'multiple-choice': 'multiple choice',
    'type-answer': 'type the answer',
};

function isBaseMathsDifficulty(value: string): value is BaseMathsDifficulty {
    return normalizeBaseMathsDifficulty(value) === value;
}

function isMobileAnswerMode(value: string): value is MobileAnswerMode {
    return value === 'multiple-choice' || value === 'type-answer';
}

type EnemyTextureTier = keyof typeof ENEMY_TEXTURES;
type EnemyTextureState = keyof (typeof ENEMY_TEXTURES)[EnemyTextureTier];

interface DebugToggles {
    grid: boolean;
    ranges: boolean;
    flow: boolean;
    costs: boolean;
    los: boolean;
}

interface ExplosionVisual {
    x: number;
    y: number;
    radius: number;
    lifeMs: number;
}

interface AirstrikeImpactVisual extends AirstrikeImpactCell {
    lifeMs: number;
    seed: number;
}

interface PendingAirstrike {
    id: number;
    target: GridPoint;
    elapsedMs: number;
    delayMs: number;
    start: Vec2;
    end: Vec2;
    teamId?: TeamId;
}

const TEAMS: TeamId[] = ['solar', 'lunar'];
const MONSTER_CONFIG: Record<MonsterGeneratorType, {
    label: string;
    enemyType: EnemyState['type'];
    sprite: string;
    visualTier: 1 | 2 | 3 | 4;
}> = {
    scout: { label: 'Nibble', enemyType: 'scout', sprite: SPRITE_PATHS.monster1Run, visualTier: 1 },
    grunt: { label: 'Zapper', enemyType: 'grunt', sprite: SPRITE_PATHS.monster2Run, visualTier: 2 },
    tank: { label: 'Chomper', enemyType: 'tank', sprite: SPRITE_PATHS.monster3Run, visualTier: 3 },
    titan: { label: 'Mega Moo', enemyType: 'tank', sprite: SPRITE_PATHS.monster4Run, visualTier: 4 },
};

function opponentOf(teamId: TeamId): TeamId {
    return teamId === 'solar' ? 'lunar' : 'solar';
}

function checksumHash(value: string): string {
    let hash = 2166136261;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36);
}

function stableNumber(value: number): number {
    if (!Number.isFinite(value)) {
        return 1_000_000_000;
    }
    return Math.round(value * 10_000) / 10_000;
}

export class GameScene extends Phaser.Scene {
    private generatedMap!: GeneratedMap;
    private flowField!: FlowField;
    private emergencyFlowField!: FlowField;
    private threatCosts!: CostGrid;
    private graphics!: Phaser.GameObjects.Graphics;
    private debugGraphics!: Phaser.GameObjects.Graphics;
    private towerSprites = new Map<number, Phaser.GameObjects.Image>();
    private terrainSprites: Phaser.GameObjects.Image[] = [];
    private enemyShadows = new Map<number, Phaser.GameObjects.Image>();
    private enemySprites = new Map<number, Phaser.GameObjects.Image>();
    private costTexts: Phaser.GameObjects.Text[] = [];
    private panel!: BottomPanel;
    private mobileLayout?: MobileLayout;
    private mathsSystem!: MathsQuestionSystem;
    private spawner!: EnemySpawner;
    private towerSystem = new TowerSystem();
    private projectileSystem = new ProjectileSystem();
    private effects = new EffectsSystem();
    private baseSprite!: Phaser.GameObjects.Image;
    private baseSprites = new Map<TeamId, Phaser.GameObjects.Image>();
    private towers: TowerState[] = [];
    private enemies: EnemyState[] = [];
    private projectiles: ProjectileState[] = [];
    private explosions: ExplosionVisual[] = [];
    private airstrikeImpacts: AirstrikeImpactVisual[] = [];
    private pendingAirstrikes: PendingAirstrike[] = [];
    private baseHealth = GAME_CONFIG.baseHealth;
    private baseHealthByTeam: Record<TeamId, number> = { solar: GAME_CONFIG.baseHealth, lunar: GAME_CONFIG.baseHealth };
    private statsByTeam: Record<TeamId, MultiplayerStats> = {
        solar: { kills: 0, answered: 0, correctAnswers: 0 },
        lunar: { kills: 0, answered: 0, correctAnswers: 0 },
    };
    private generators: MonsterGeneratorState[] = [];
    private multiplayerSpawnRng!: SeededRandom;
    private nextMultiplayerEnemyId = 1_000_000;
    private multiplayerTick = 0;
    private multiplayerAccumulatorMs = 0;
    private multiplayerCommandSequence = 1;
    private pendingMultiplayerCommands: ScheduledMultiplayerCommand[] = [];
    private multiplayerChecksums = new Map<number, string>();
    private pendingRemoteChecksums = new Map<number, string>();
    private lastResyncRequestedTick = -1;
    private multiplayerResyncCount = 0;
    private nextComputerActionTick = 0;
    private computerActionIndex = 0;
    private computerBuildCursor = 0;
    private opponentTextureKeys = new Map<string, string>();
    private isMultiplayer = false;
    private localTeamId: TeamId = 'solar';
    private flowFields?: Record<TeamId, FlowField>;
    private emergencyFlowFields?: Record<TeamId, FlowField>;
    private threatCostsByTeam?: Record<TeamId, CostGrid>;
    private baseDamageFlashMs = 0;
    private spawnRate: GameDifficulty = 'medium';
    private baseDifficulty: BaseMathsDifficulty = 'year3';
    private mobileAnswerMode: MobileAnswerMode = 'multiple-choice';
    private elapsedMs = 0;
    private kills = 0;
    private answered = 0;
    private correctAnswers = 0;
    private backgroundMusic?: HTMLAudioElement;
    private musicVolume = 0.1;
    private musicMuted = false;
    private nextTowerId = 1;
    private nextAirstrikeId = 1;
    private selectedCell: GridPoint | undefined;
    private selectedTower: TowerState | undefined;
    private gameOver = false;
    private isPaused = false;
    private manualPauseRequested = false;
    private questionPauseActive = false;
    private spawningUnlocked = false;
    private debug: DebugToggles = { grid: true, ranges: false, flow: false, costs: false, los: false };

    constructor() {
        super('GameScene');
    }

    preload(): void {
        for (const path of Object.values(SPRITE_PATHS)) {
            this.load.image(path, path);
        }
        this.load.audio(SOUND_KEYS.pop, SOUND_PATHS.pop);
        this.load.audio(SOUND_KEYS.owHurt, SOUND_PATHS.owHurt);
        this.load.audio(SOUND_KEYS.owDeath, SOUND_PATHS.owDeath);
        this.load.audio(SOUND_KEYS.music, SOUND_PATHS.music);
    }

    create(): void {
        const seedParam = new URLSearchParams(window.location.search).get('seed');
        this.isMultiplayer = multiplayerSession.isMultiplayer;
        this.localTeamId = multiplayerSession.localTeamId;
        const seed = this.isMultiplayer
            ? multiplayerSession.seed
            : seedParam ? SeededRandom.hash(seedParam) : Date.now() % 1000000000;
        this.spawnRate = this.readSavedSpawnRate();
        this.baseDifficulty = this.readSavedBaseDifficulty();
        this.mobileAnswerMode = this.readSavedMobileAnswerMode();
        this.musicVolume = this.readSavedMusicVolume();
        this.musicMuted = this.readSavedMusicMuted();
        this.syncUrlOptions();
        this.backgroundMusic = this.createBackgroundMusic();
        this.generatedMap = this.isMultiplayer ? generateMultiplayerMap(seed) : generateMap(seed);
        this.rebuildFlowField();
        this.graphics = this.add.graphics().setDepth(3);
        this.debugGraphics = this.add.graphics().setDepth(5);
        this.createOpponentTextureVariants();
        this.createMapSprites();
        this.spawner = new EnemySpawner(this.generatedMap.spawns, GAME_CONFIG.map, new SeededRandom(`${seed}:spawns`));
        this.multiplayerSpawnRng = new SeededRandom(`${seed}:multiplayer-spawns`);
        this.generators = TEAMS.map((teamId) => ({ teamId, level: 0, progress: 0, spawnCount: 0 }));
        this.mathsSystem = new MathsQuestionSystem(new SeededRandom(`${seed}:maths`), this.baseDifficulty);
        if (isMobileLayout()) {
            this.mobileLayout = new MobileLayout();
        }
        this.panel = new BottomPanel(this.mathsSystem, {
            onBuild: (cell, towerType) => this.requestCommand({ kind: 'build', teamId: this.localTeamId, cell, towerType }),
            onUpgrade: (tower) => this.requestCommand({ kind: 'upgrade', teamId: this.localTeamId, towerId: tower.id }),
            onAnswered: (correct) => this.recordAnswer(correct),
            onQuestionStateChange: (isActive) => this.setQuestionPause(isActive),
            onClose: () => this.clearSelection(),
        }, this.mobileLayout ? { infoHost: this.mobileLayout.getInfoHost(), answerMode: this.mobileAnswerMode } : undefined);
        this.setupMusicControls();
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => this.handlePointerDown(pointer));
        this.registerDebugKeys();
        this.setupSettingsControls();
        this.setupPauseControls();
        this.setupGameOverControls();
        this.setupMultiplayerControls();
        this.installBrowserHooks();
        this.applyMobileCamera();
        this.updateHud();
        this.syncStatusMessage();
        this.render();
    }

    update(_time: number, deltaMs: number): void {
        if (this.gameOver) {
            this.render();
            return;
        }

        if (this.isMultiplayer) {
            this.multiplayerAccumulatorMs += Math.min(deltaMs, 2_000);
            while (this.multiplayerAccumulatorMs >= MULTIPLAYER_STEP_MS && !this.gameOver) {
                this.multiplayerTick += 1;
                this.updateComputerOpponent();
                this.applyDueMultiplayerCommands();
                this.advanceSimulation(MULTIPLAYER_STEP_MS);
                this.multiplayerAccumulatorMs -= MULTIPLAYER_STEP_MS;
                this.recordMultiplayerChecksum();
            }
        } else if (!this.isPaused) {
            this.advanceSimulation(deltaMs);
        }

        this.updateHud();
        this.render();
    }

    private advanceSimulation(deltaMs: number): void {
        this.elapsedMs = this.isMultiplayer ? this.multiplayerTick * MULTIPLAYER_STEP_MS : this.elapsedMs + deltaMs;
        this.baseDamageFlashMs = Math.max(0, this.baseDamageFlashMs - deltaMs);
        if (this.isMultiplayer) {
            this.updateMonsterGenerators(deltaMs);
        } else if (this.spawningUnlocked) {
            this.enemies.push(...this.spawner.update(deltaMs, this.towers, {
                difficulty: this.spawnRate,
                baseHealthPercent: this.baseHealth / GAME_CONFIG.baseHealth,
                activeEnemyCount: this.enemies.length,
            }));
        }
        for (const enemy of this.enemies) {
            enemy.hurtFlashMs = Math.max(0, enemy.hurtFlashMs - deltaMs);
        }
        this.updateAirstrikes(deltaMs);
        this.enemies = this.enemies.filter((enemy) => enemy.health > 0);

        const enemySurvivors: EnemyState[] = [];
        let baseDamageTaken = 0;
        let wallDestroyed = false;
        for (const enemy of this.enemies) {
            const targetTeam = this.isMultiplayer ? opponentOf(enemy.teamId ?? 'solar') : 'lunar';
            const flowField = this.isMultiplayer ? this.flowFields![targetTeam] : this.flowField;
            const emergencyFlowField = this.isMultiplayer ? this.emergencyFlowFields![targetTeam] : this.emergencyFlowField;
            const threatCosts = this.isMultiplayer ? this.threatCostsByTeam![targetTeam] : this.threatCosts;
            const wallAttack = updateEnemyWallObjective(enemy, deltaMs / 1000, this.towers, flowField, this.generatedMap.grid, GAME_CONFIG.map, this.enemies, threatCosts);
            if (wallAttack.targetedWall) {
                if (wallAttack.destroyedWall) {
                    this.destroyTower(wallAttack.destroyedWall);
                    wallDestroyed = true;
                }
                if (enemy.health > 0) {
                    enemySurvivors.push(enemy);
                }
                continue;
            }
            const reachedBase = updateEnemy(enemy, deltaMs / 1000, flowField, emergencyFlowField, this.generatedMap.grid, GAME_CONFIG.map, this.enemies);
            if (reachedBase) {
                if (this.isMultiplayer) {
                    const previousHealth = this.baseHealthByTeam[targetTeam];
                    this.baseHealthByTeam[targetTeam] = Math.max(0, previousHealth - enemy.baseDamage);
                    baseDamageTaken += previousHealth - this.baseHealthByTeam[targetTeam];
                } else {
                    const previousHealth = this.baseHealth;
                    this.baseHealth = Math.max(0, this.baseHealth - enemy.baseDamage);
                    baseDamageTaken += previousHealth - this.baseHealth;
                }
            } else if (enemy.health > 0) {
                enemySurvivors.push(enemy);
            }
        }
        this.enemies = enemySurvivors;
        if (wallDestroyed) {
            this.rebuildFlowField();
        }
        if (baseDamageTaken > 0) {
            this.flashBaseDamage();
        }

        const towerResult = this.towerSystem.update(
            deltaMs,
            this.towers,
            this.enemies,
            this.generatedMap.grid,
            GAME_CONFIG.map,
            this.isMultiplayer ? (tower) => this.flowFields![tower.teamId ?? 'lunar'] : this.flowField,
        );
        this.projectiles.push(...towerResult.projectiles);
        this.kills += towerResult.kills;
        this.explosions.push(...towerResult.explosions);
        for (const explosion of towerResult.explosions) {
            this.effects.spawnExplosion(explosion.x, explosion.y, explosion.radius, false);
        }
        this.effects.emitFlameJets(towerResult.flameJets, deltaMs);
        this.playRepeatedSound(SOUND_KEYS.pop, towerResult.shotsFired, 0.18);
        this.playRepeatedSound(SOUND_KEYS.owHurt, towerResult.hurtSounds, 0.2);
        this.playRepeatedSound(SOUND_KEYS.owDeath, towerResult.deathSounds, 0.28);
        if (towerResult.detonatedTowerIds.length > 0) {
            for (const towerId of towerResult.detonatedTowerIds) {
                const tower = this.towers.find((candidate) => candidate.id === towerId);
                if (tower) {
                    this.destroyTower(tower);
                }
            }
            this.rebuildFlowField();
        }

        const projectileResult = this.projectileSystem.update(deltaMs, this.projectiles, this.enemies, this.generatedMap.grid, GAME_CONFIG.map);
        this.projectiles = projectileResult.projectiles;
        this.kills += projectileResult.kills;
        this.explosions.push(...projectileResult.explosions);
        for (const explosion of projectileResult.explosions) {
            this.effects.spawnExplosion(explosion.x, explosion.y, explosion.radius, false);
        }
        for (const impact of projectileResult.impacts) {
            this.effects.spawnImpact(impact.x, impact.y, impact.type);
        }
        this.effects.emitTrails(this.projectiles, deltaMs);
        this.effects.emitBurningEnemies(this.enemies, deltaMs);
        this.effects.update(deltaMs);
        this.playRepeatedSound(SOUND_KEYS.owHurt, projectileResult.hurtSounds, 0.2);
        this.playRepeatedSound(SOUND_KEYS.owDeath, projectileResult.deathSounds, 0.28);
        this.enemies = this.enemies.filter((enemy) => enemy.health > 0);
        this.explosions = this.explosions
            .map((explosion) => ({ ...explosion, lifeMs: explosion.lifeMs - deltaMs }))
            .filter((explosion) => explosion.lifeMs > 0);
        this.airstrikeImpacts = this.airstrikeImpacts
            .map((impact) => ({ ...impact, lifeMs: impact.lifeMs - deltaMs }))
            .filter((impact) => impact.lifeMs > 0);

        if (this.isMultiplayer && TEAMS.some((teamId) => this.baseHealthByTeam[teamId] <= 0)) {
            this.endGame();
        } else if (!this.isMultiplayer && this.baseHealth <= 0) {
            this.endGame();
        }
    }

    private handlePointerDown(pointer: Phaser.Input.Pointer): void {
        this.tryStartMusicPlayback();
        if (this.gameOver) {
            return;
        }
        const cell = worldToGrid(this.toWorldPoint(pointer), this.generatedMap.grid, GAME_CONFIG.map);
        if (!cell) {
            this.panel.close();
            this.render();
            return;
        }
        const tower = this.findTowerAt(cell.x, cell.y);
        const pointerPosition = this.getPointerClientPosition(pointer);
        const wantsAirstrike = this.panel.getSelectedBuildTower() === 'airstrike';
        this.selectedCell = cell;
        this.selectedTower = tower;
        if (tower && (!this.isMultiplayer || tower.teamId === this.localTeamId) && !wantsAirstrike) {
            this.panel.openUpgrade(tower, pointerPosition);
        } else if (wantsAirstrike || this.canBuildOnCell(cell)) {
            this.panel.openBuild(cell, pointerPosition);
        } else {
            this.panel.close();
        }
        this.render();
    }

    private buildTower(cell: GridPoint, towerType: TowerType, teamId = this.localTeamId): void {
        if (towerType === 'airstrike') {
            this.scheduleAirstrike(cell, teamId);
            this.spawningUnlocked = true;
            this.syncStatusMessage();
            return;
        }
        if (!this.canBuildOnCell(cell, teamId) || this.findTowerAt(cell.x, cell.y)) {
            return;
        }
        const tower = createTower(this.nextTowerId++, cell.x, cell.y, towerType, this.isMultiplayer ? teamId : undefined);
        if (isWallTower(tower)) {
            tower.baseTerrain = this.generatedMap.grid.getTerrain(cell.x, cell.y);
            this.generatedMap.grid.setTerrain(cell.x, cell.y, 'tree');
        }
        this.towers.push(tower);
        this.spawningUnlocked = true;
        this.rebuildFlowField();
        this.syncStatusMessage();
    }

    private scheduleAirstrike(cell: GridPoint, teamId?: TeamId): void {
        if (!this.generatedMap.grid.inBounds(cell.x, cell.y)) {
            return;
        }
        const center = cellCenter(cell, GAME_CONFIG.map);
        const { cellSize } = GAME_CONFIG.map;
        this.pendingAirstrikes.push({
            id: this.nextAirstrikeId++,
            target: { ...cell },
            elapsedMs: 0,
            delayMs: AIRSTRIKE_DELAY_MS,
            start: { x: center.x - cellSize * 7, y: center.y - cellSize * 4 },
            end: { x: center.x + cellSize * 0.25, y: center.y - cellSize * 0.15 },
            teamId,
        });
    }

    private updateAirstrikes(deltaMs: number): void {
        if (this.pendingAirstrikes.length === 0) {
            return;
        }

        const active: PendingAirstrike[] = [];
        for (const airstrike of this.pendingAirstrikes) {
            airstrike.elapsedMs += deltaMs;
            if (airstrike.elapsedMs < airstrike.delayMs) {
                active.push(airstrike);
                continue;
            }

            const result = this.towerSystem.detonateAirstrike(airstrike.target, this.enemies, this.generatedMap.grid, GAME_CONFIG.map, airstrike.teamId);
            this.kills += result.kills;
            this.explosions.push(result.explosion);
            this.effects.spawnExplosion(result.explosion.x, result.explosion.y, result.explosion.radius, true);
            this.airstrikeImpacts.push(...result.airstrikeImpacts.map((impact) => ({
                ...impact,
                lifeMs: AIRSTRIKE_IMPACT_LIFE_MS,
                seed: this.createAirstrikeImpactSeed(airstrike.id, impact),
            })));
            this.playRepeatedSound(SOUND_KEYS.pop, 1, 0.24);
            this.playRepeatedSound(SOUND_KEYS.owHurt, result.hurtSounds, 0.22);
            this.playRepeatedSound(SOUND_KEYS.owDeath, result.deathSounds, 0.32);
            this.cameras.main.shake(430, 0.014);
        }
        this.pendingAirstrikes = active;
    }

    private createAirstrikeImpactSeed(airstrikeId: number, impact: AirstrikeImpactCell): number {
        return ((airstrikeId + 1) * 73856093) ^ ((impact.x + 1) * 19349663) ^ ((impact.y + 1) * 83492791);
    }

    private canBuildOnCell(cell: GridPoint, teamId = this.localTeamId): boolean {
        const onOwnHalf = !this.isMultiplayer
            || (teamId === 'solar' ? cell.x < this.generatedMap.grid.cols / 2 : cell.x >= this.generatedMap.grid.cols / 2);
        const outsideBases = this.isMultiplayer
            ? TEAMS.every((candidate) => !isBaseFootprintCell(this.generatedMap.bases![candidate], cell, this.generatedMap.grid))
            : !isBaseFootprintCell(this.generatedMap.base, cell, this.generatedMap.grid);
        return onOwnHalf && outsideBases && this.generatedMap.grid.isBuildable(cell.x, cell.y);
    }

    private upgradeExistingTower(tower: TowerState, teamId = this.localTeamId): void {
        if (this.isMultiplayer && tower.teamId !== teamId) {
            return;
        }
        if (upgradeTower(tower)) {
            this.rebuildFlowField();
        }
    }

    private destroyTower(tower: TowerState): void {
        const index = this.towers.findIndex((candidate) => candidate.id === tower.id);
        if (index === -1) {
            return;
        }
        this.towers.splice(index, 1);
        if (tower.type === 'wall') {
            this.generatedMap.grid.setTerrain(tower.gridX, tower.gridY, tower.baseTerrain ?? 'grass');
        }
        if (this.selectedTower?.id === tower.id) {
            this.panel.close();
        }
    }

    private recordAnswer(correct: boolean): void {
        if (this.isMultiplayer) {
            this.requestCommand({ kind: 'answer', teamId: this.localTeamId, correct });
        } else {
            this.answered += 1;
            if (correct) {
                this.correctAnswers += 1;
            }
        }
        this.updateHud();
    }

    private requestCommand(command: MultiplayerCommand): void {
        if (this.isMultiplayer) {
            multiplayerSession.sendAction(command);
            return;
        }
        if (command.kind === 'build') {
            this.buildTower(command.cell, command.towerType);
        } else if (command.kind === 'upgrade') {
            const tower = this.towers.find((candidate) => candidate.id === command.towerId);
            if (tower) {
                this.upgradeExistingTower(tower);
            }
        }
    }

    private applyMultiplayerCommand(command: MultiplayerCommand): void {
        if (!this.isMultiplayer || this.gameOver) {
            return;
        }
        if (command.kind === 'build') {
            this.buildTower(command.cell, command.towerType, command.teamId);
            return;
        }
        if (command.kind === 'upgrade') {
            const tower = this.towers.find((candidate) => candidate.id === command.towerId);
            if (tower) {
                this.upgradeExistingTower(tower, command.teamId);
            }
            return;
        }
        if (command.kind === 'upgradeGenerator') {
            const generator = this.generators.find((candidate) => candidate.teamId === command.teamId);
            if (generator && generator.level < MAX_MONSTER_GENERATOR_LEVEL) {
                const wasOff = generator.level === 0;
                generator.level += 1;
                if (wasOff) {
                    this.spawnMultiplayerEnemy(generator);
                }
                this.renderMonsterGeneratorControls();
            }
            return;
        }
        const stats = this.statsByTeam[command.teamId];
        stats.answered += 1;
        if (command.correct) {
            stats.correctAnswers += 1;
        } else {
            const rivalGenerator = this.generators.find((candidate) => candidate.teamId === opponentOf(command.teamId));
            if (rivalGenerator) {
                rivalGenerator.level = Math.min(MAX_MONSTER_GENERATOR_LEVEL, rivalGenerator.level + 1);
            }
        }
    }

    private scheduleMultiplayerCommand(command: MultiplayerCommand): void {
        if (multiplayerSession.role !== 'host' || this.gameOver) {
            return;
        }
        const scheduled: ScheduledMultiplayerCommand = {
            id: `${this.multiplayerTick.toString(36)}-${(this.multiplayerCommandSequence++).toString(36)}`,
            tick: this.multiplayerTick + MULTIPLAYER_COMMAND_DELAY_TICKS,
            command,
        };
        if (this.queueMultiplayerCommand(scheduled)) {
            multiplayerSession.broadcastCommand(scheduled);
        }
    }

    private initializeComputerOpponent(): void {
        if (!multiplayerSession.isComputerOpponent) {
            return;
        }
        this.scheduleMultiplayerCommand({ kind: 'upgradeGenerator', teamId: 'lunar' });
        const firstCell = this.findComputerBuildCell();
        if (firstCell) {
            this.scheduleMultiplayerCommand({ kind: 'build', teamId: 'lunar', cell: firstCell, towerType: 'easy' });
        }
        this.nextComputerActionTick = this.multiplayerTick + COMPUTER_ACTION_INTERVAL_TICKS;
    }

    private updateComputerOpponent(): void {
        if (!multiplayerSession.isComputerOpponent || this.multiplayerTick < this.nextComputerActionTick) {
            return;
        }
        this.nextComputerActionTick += COMPUTER_ACTION_INTERVAL_TICKS;
        this.computerActionIndex += 1;

        const generator = this.generators.find((candidate) => candidate.teamId === 'lunar');
        if (this.computerActionIndex % 3 === 1 && generator && generator.level < MAX_MONSTER_GENERATOR_LEVEL) {
            this.scheduleMultiplayerCommand({ kind: 'upgradeGenerator', teamId: 'lunar' });
            return;
        }

        const buildCell = this.findComputerBuildCell();
        const computerTowers = this.towers.filter((tower) => tower.teamId === 'lunar');
        if (buildCell && computerTowers.length < 10) {
            const towerType = COMPUTER_TOWER_TYPES[this.computerActionIndex % COMPUTER_TOWER_TYPES.length];
            this.scheduleMultiplayerCommand({ kind: 'build', teamId: 'lunar', cell: buildCell, towerType });
            return;
        }

        const upgrade = computerTowers
            .filter((tower) => canUpgradeTower(tower))
            .sort((a, b) => a.level - b.level || a.id - b.id)[0];
        if (upgrade) {
            this.scheduleMultiplayerCommand({ kind: 'upgrade', teamId: 'lunar', towerId: upgrade.id });
        }
    }

    private findComputerBuildCell(): GridPoint | undefined {
        const candidates: GridPoint[] = [];
        const { cols, rows } = this.generatedMap.grid;
        for (let x = cols - 3; x >= cols / 2; x -= 1) {
            for (let y = 2; y < rows - 2; y += 1) {
                const cell = { x, y };
                if (this.canBuildOnCell(cell, 'lunar') && !this.findTowerAt(x, y)) {
                    candidates.push(cell);
                }
            }
        }
        if (candidates.length === 0) {
            return undefined;
        }
        const cell = candidates[this.computerBuildCursor % candidates.length];
        this.computerBuildCursor += 1;
        return { ...cell };
    }

    private queueMultiplayerCommand(scheduled: ScheduledMultiplayerCommand): boolean {
        if (this.pendingMultiplayerCommands.some((candidate) => candidate.id === scheduled.id)) {
            return false;
        }
        if (scheduled.tick <= this.multiplayerTick) {
            if (multiplayerSession.role === 'guest') {
                this.requestMultiplayerResync(scheduled.tick);
            }
            return false;
        }
        this.pendingMultiplayerCommands.push({
            ...scheduled,
            command: { ...scheduled.command },
        });
        this.pendingMultiplayerCommands.sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id));
        return true;
    }

    private applyDueMultiplayerCommands(): void {
        let dueCount = 0;
        while (dueCount < this.pendingMultiplayerCommands.length && this.pendingMultiplayerCommands[dueCount].tick <= this.multiplayerTick) {
            this.applyMultiplayerCommand(this.pendingMultiplayerCommands[dueCount].command);
            dueCount += 1;
        }
        if (dueCount > 0) {
            this.pendingMultiplayerCommands.splice(0, dueCount);
        }
    }

    private createMultiplayerChecksum(): string {
        const state = {
            tick: this.multiplayerTick,
            health: this.baseHealthByTeam,
            towers: this.towers.map((tower) => ({
                id: tower.id,
                type: tower.type,
                teamId: tower.teamId,
                x: tower.gridX,
                y: tower.gridY,
                level: tower.level,
                cooldownMs: stableNumber(tower.cooldownMs),
            })),
            enemies: this.enemies.map((enemy) => ({
                id: enemy.id,
                type: enemy.type,
                teamId: enemy.teamId,
                x: stableNumber(enemy.x),
                y: stableNumber(enemy.y),
                vx: stableNumber(enemy.vx),
                vy: stableNumber(enemy.vy),
                health: stableNumber(enemy.health),
                burnMs: stableNumber(enemy.burnMs ?? 0),
            })),
            projectiles: this.projectiles.map((projectile) => ({
                id: projectile.id,
                type: projectile.type,
                teamId: projectile.teamId,
                x: stableNumber(projectile.x),
                y: stableNumber(projectile.y),
                vx: stableNumber(projectile.vx),
                vy: stableNumber(projectile.vy),
                lifeMs: stableNumber(projectile.lifeMs),
            })),
            generators: this.generators.map((generator) => ({
                ...generator,
                progress: stableNumber(generator.progress),
            })),
            pendingCommands: this.pendingMultiplayerCommands,
            pendingAirstrikes: this.pendingAirstrikes.map((airstrike) => ({
                id: airstrike.id,
                elapsedMs: stableNumber(airstrike.elapsedMs),
                target: airstrike.target,
                teamId: airstrike.teamId,
            })),
            rngState: this.multiplayerSpawnRng.getState(),
            nextIds: {
                tower: this.nextTowerId,
                airstrike: this.nextAirstrikeId,
                enemy: this.nextMultiplayerEnemyId,
                towerProjectile: this.towerSystem.getNextProjectileId(),
                fragmentProjectile: this.projectileSystem.getNextProjectileId(),
            },
        };
        return checksumHash(JSON.stringify(state));
    }

    private recordMultiplayerChecksum(): void {
        if (this.multiplayerTick % MULTIPLAYER_CHECKSUM_INTERVAL_TICKS !== 0) {
            return;
        }
        const checksum = this.createMultiplayerChecksum();
        this.multiplayerChecksums.set(this.multiplayerTick, checksum);
        for (const tick of this.multiplayerChecksums.keys()) {
            if (tick < this.multiplayerTick - MULTIPLAYER_CHECKSUM_INTERVAL_TICKS * 4) {
                this.multiplayerChecksums.delete(tick);
            }
        }
        if (multiplayerSession.role === 'host') {
            multiplayerSession.sendChecksum(this.multiplayerTick, checksum);
        }
        this.comparePendingMultiplayerChecksums();
    }

    private receiveMultiplayerChecksum(tick: number, checksum: string): void {
        this.pendingRemoteChecksums.set(tick, checksum);
        this.comparePendingMultiplayerChecksums();
    }

    private comparePendingMultiplayerChecksums(): void {
        for (const [tick, remoteChecksum] of this.pendingRemoteChecksums) {
            const localChecksum = this.multiplayerChecksums.get(tick);
            if (!localChecksum) {
                if (tick < this.multiplayerTick - MULTIPLAYER_CHECKSUM_INTERVAL_TICKS) {
                    this.requestMultiplayerResync(tick);
                    this.pendingRemoteChecksums.delete(tick);
                }
                continue;
            }
            this.pendingRemoteChecksums.delete(tick);
            if (localChecksum !== remoteChecksum) {
                this.requestMultiplayerResync(tick);
            }
        }
    }

    private requestMultiplayerResync(tick: number): void {
        if (multiplayerSession.role !== 'guest' || tick <= this.lastResyncRequestedTick) {
            return;
        }
        this.lastResyncRequestedTick = tick;
        multiplayerSession.requestResync(tick);
    }

    private setupMultiplayerControls(): void {
        document.querySelector<HTMLElement>('[data-stat="rival-base-status"]')!.hidden = !this.isMultiplayer;
        if (!this.isMultiplayer) {
            return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'difficulty-button difficulty-selector-button tower-selector-button monster-generator-button';
        button.dataset.generatorButton = '';
        button.setAttribute('aria-label', 'Upgrade monster generator');
        const icons = document.createElement('span');
        icons.className = 'monster-generator-icons';
        for (const type of ['scout', 'grunt', 'tank', 'titan'] as MonsterGeneratorType[]) {
            const meta = MONSTER_CONFIG[type];
            const image = document.createElement('img');
            image.src = meta.sprite;
            image.alt = meta.label;
            image.title = meta.label;
            icons.append(image);
        }
        const copy = document.createElement('span');
        copy.className = 'tower-selector-content monster-generator-copy';
        const label = document.createElement('strong');
        label.className = 'tower-selector-label';
        label.textContent = 'Send monsters';
        const level = document.createElement('small');
        level.dataset.generatorLevel = '';
        copy.append(label, level);
        const progress = document.createElement('i');
        progress.className = 'generator-progress';
        progress.dataset.generatorProgress = '';
        button.append(icons, copy, progress);
        button.addEventListener('click', () => {
            const generator = this.generators.find((candidate) => candidate.teamId === this.localTeamId);
            if (!generator || generator.level >= MAX_MONSTER_GENERATOR_LEVEL || this.gameOver) {
                return;
            }
            const rect = button.getBoundingClientRect();
            this.panel.openCustomQuestion(getGeneratorUpgradeDifficulty(generator.level), { x: rect.left + rect.width / 2, y: rect.top }, () => {
                this.requestCommand({ kind: 'upgradeGenerator', teamId: this.localTeamId });
            });
        });
        this.panel.setExtraSelectorControl(button);
        this.renderMonsterGeneratorControls();

        const removeActionListener = multiplayerSession.onAction((command) => this.scheduleMultiplayerCommand(command));
        const removeCommandListener = multiplayerSession.onCommand((command) => this.queueMultiplayerCommand(command));
        const removeChecksumListener = multiplayerSession.onChecksum((tick, checksum) => this.receiveMultiplayerChecksum(tick, checksum));
        const removeResyncRequestListener = multiplayerSession.onResyncRequest(() => {
            multiplayerSession.sendResync(this.createMultiplayerSnapshot());
        });
        const removeResyncListener = multiplayerSession.onResync((snapshot) => this.applyMultiplayerSnapshot(snapshot));
        const removeGameEndListener = multiplayerSession.onGameEnd((_tick, winner) => this.endGame(winner));
        this.initializeComputerOpponent();
        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
            removeActionListener();
            removeCommandListener();
            removeChecksumListener();
            removeResyncRequestListener();
            removeResyncListener();
            removeGameEndListener();
        });
    }

    private renderMonsterGeneratorControls(): void {
        if (!this.isMultiplayer) {
            return;
        }
        const generator = this.generators.find((candidate) => candidate.teamId === this.localTeamId);
        const level = document.querySelector<HTMLElement>('[data-generator-level]');
        const progress = document.querySelector<HTMLElement>('[data-generator-progress]');
        const button = document.querySelector<HTMLButtonElement>('[data-generator-button]');
        if (!generator || !level || !progress || !button) {
            return;
        }
        const mix = getMonsterMix(generator.level);
        level.textContent = generator.level === 0 ? 'Off · unlock Nibbles' : `L${generator.level} · ${mix.description}`;
        progress.style.transform = `scaleX(${generator.progress})`;
        button.disabled = generator.level >= MAX_MONSTER_GENERATOR_LEVEL || this.gameOver;
        button.title = generator.level === 0 ? 'Answer a question to start sending Nibbles' : `Level ${generator.level}: ${mix.description}`;
    }

    private updateMonsterGenerators(deltaMs: number): void {
        for (const generator of this.generators) {
            if (generator.level <= 0) {
                continue;
            }
            const periodMs = getGeneratorSpawnPeriodMs(generator.level);
            generator.progress += deltaMs / periodMs;
            while (generator.progress >= 1) {
                generator.progress -= 1;
                generator.spawnCount += 1;
                this.spawnMultiplayerEnemy(generator);
            }
        }
        this.renderMonsterGeneratorControls();
    }

    private spawnMultiplayerEnemy(generator: MonsterGeneratorState): void {
        const type = chooseMonsterType(generator.level, this.multiplayerSpawnRng);
        const meta = MONSTER_CONFIG[type];
        const base = this.generatedMap.bases![generator.teamId];
        const laneRows = [Math.floor(this.generatedMap.grid.rows * 0.3), Math.floor(this.generatedMap.grid.rows / 2), Math.floor(this.generatedMap.grid.rows * 0.72)];
        const lane = this.multiplayerSpawnRng.choice(laneRows);
        const center = cellCenter({ x: base.x, y: lane }, GAME_CONFIG.map);
        const jitter = GAME_CONFIG.map.cellSize * 0.12;
        const enemy = createEnemy(
            this.nextMultiplayerEnemyId++,
            meta.enemyType,
            center.x + (this.multiplayerSpawnRng.next() - 0.5) * jitter,
            center.y + (this.multiplayerSpawnRng.next() - 0.5) * jitter,
            getGeneratorHealthScale(generator.level, type),
            generator.teamId,
        );
        enemy.visualTier = meta.visualTier;
        this.enemies.push(enemy);
    }

    private createMultiplayerSnapshot(): MultiplayerSnapshot {
        const destroyedTeam = TEAMS.find((teamId) => this.baseHealthByTeam[teamId] <= 0);
        return {
            tick: this.multiplayerTick,
            elapsedMs: this.elapsedMs,
            baseHealth: { ...this.baseHealthByTeam },
            towers: this.towers.map((tower) => ({ ...tower })),
            enemies: this.enemies.map((enemy) => ({
                ...enemy,
                lastProgressDistance: Number.isFinite(enemy.lastProgressDistance) ? enemy.lastProgressDistance : 1_000_000_000,
                panicStartDistance: Number.isFinite(enemy.panicStartDistance) ? enemy.panicStartDistance : 1_000_000_000,
            })),
            projectiles: this.projectiles.map((projectile) => ({ ...projectile })),
            explosions: this.explosions.map((explosion) => ({ ...explosion })),
            generators: this.generators.map((generator) => ({ ...generator })),
            stats: {
                solar: { ...this.statsByTeam.solar },
                lunar: { ...this.statsByTeam.lunar },
            },
            pendingCommands: this.pendingMultiplayerCommands.map((scheduled) => ({
                ...scheduled,
                command: { ...scheduled.command },
            })),
            pendingAirstrikes: this.pendingAirstrikes.map((airstrike) => ({
                ...airstrike,
                target: { ...airstrike.target },
                start: { ...airstrike.start },
                end: { ...airstrike.end },
            })),
            rngState: this.multiplayerSpawnRng.getState(),
            nextIds: {
                tower: this.nextTowerId,
                airstrike: this.nextAirstrikeId,
                enemy: this.nextMultiplayerEnemyId,
                towerProjectile: this.towerSystem.getNextProjectileId(),
                fragmentProjectile: this.projectileSystem.getNextProjectileId(),
            },
            gameOver: this.gameOver,
            winner: destroyedTeam ? opponentOf(destroyedTeam) : undefined,
        };
    }

    private applyMultiplayerSnapshot(snapshot: MultiplayerSnapshot): void {
        this.multiplayerResyncCount += 1;
        for (const tower of this.towers) {
            if (tower.type === 'wall') {
                this.generatedMap.grid.setTerrain(tower.gridX, tower.gridY, tower.baseTerrain ?? 'grass');
            }
        }
        this.multiplayerTick = snapshot.tick;
        this.multiplayerAccumulatorMs = 0;
        this.elapsedMs = snapshot.elapsedMs;
        this.baseHealthByTeam = { ...snapshot.baseHealth };
        this.towers = snapshot.towers.map((tower) => ({ ...tower }));
        for (const tower of this.towers) {
            if (tower.type === 'wall') {
                this.generatedMap.grid.setTerrain(tower.gridX, tower.gridY, 'tree');
            }
        }
        this.enemies = snapshot.enemies.map((enemy) => ({ ...enemy }));
        this.projectiles = snapshot.projectiles.map((projectile) => ({ ...projectile }));
        this.explosions = snapshot.explosions.map((explosion) => ({ ...explosion }));
        this.generators = snapshot.generators.map((generator) => ({ ...generator }));
        this.pendingMultiplayerCommands = snapshot.pendingCommands.map((scheduled) => ({
            ...scheduled,
            command: { ...scheduled.command },
        }));
        this.pendingAirstrikes = snapshot.pendingAirstrikes.map((airstrike) => ({
            ...airstrike,
            target: { ...airstrike.target },
            start: { ...airstrike.start },
            end: { ...airstrike.end },
        }));
        this.multiplayerSpawnRng.restoreState(snapshot.rngState);
        this.nextTowerId = snapshot.nextIds.tower;
        this.nextAirstrikeId = snapshot.nextIds.airstrike;
        this.nextMultiplayerEnemyId = snapshot.nextIds.enemy;
        this.towerSystem.setNextProjectileId(snapshot.nextIds.towerProjectile);
        this.projectileSystem.setNextProjectileId(snapshot.nextIds.fragmentProjectile);
        this.statsByTeam = {
            solar: { ...snapshot.stats.solar },
            lunar: { ...snapshot.stats.lunar },
        };
        this.multiplayerChecksums.clear();
        this.pendingRemoteChecksums.clear();
        this.lastResyncRequestedTick = -1;
        this.rebuildFlowField();
        if (snapshot.gameOver && !this.gameOver) {
            this.endGame(snapshot.winner);
        } else if (!snapshot.gameOver && this.gameOver) {
            this.gameOver = false;
            document.querySelector<HTMLElement>('[data-testid="game-over"]')!.hidden = true;
        }
        this.renderMonsterGeneratorControls();
        this.updateHud();
        this.render();
    }

    private playRepeatedSound(key: string, count: number, volume: number): void {
        if (count <= 0 || this.sound.locked) {
            return;
        }
        const playCount = Math.min(count, 4);
        for (let index = 0; index < playCount; index += 1) {
            this.sound.play(key, { volume });
        }
    }

    private rebuildFlowField(): void {
        if (this.isMultiplayer && this.generatedMap.bases) {
            this.threatCostsByTeam = {
                solar: calculateTowerThreatCosts(this.generatedMap.grid, this.towers.filter((tower) => tower.teamId === 'solar'), GAME_CONFIG.map),
                lunar: calculateTowerThreatCosts(this.generatedMap.grid, this.towers.filter((tower) => tower.teamId === 'lunar'), GAME_CONFIG.map),
            };
            this.flowFields = {
                solar: buildFlowField(this.generatedMap.grid, this.generatedMap.bases.solar, this.threatCostsByTeam.solar),
                lunar: buildFlowField(this.generatedMap.grid, this.generatedMap.bases.lunar, this.threatCostsByTeam.lunar),
            };
            this.emergencyFlowFields = {
                solar: buildFlowField(this.generatedMap.grid, this.generatedMap.bases.solar, createEmptyCostGrid(this.generatedMap.grid)),
                lunar: buildFlowField(this.generatedMap.grid, this.generatedMap.bases.lunar, createEmptyCostGrid(this.generatedMap.grid)),
            };
            this.flowField = this.flowFields[this.localTeamId];
            this.emergencyFlowField = this.emergencyFlowFields[this.localTeamId];
            this.threatCosts = this.threatCostsByTeam[this.localTeamId];
            return;
        }
        this.threatCosts = calculateTowerThreatCosts(this.generatedMap.grid, this.towers, GAME_CONFIG.map);
        this.flowField = buildFlowField(this.generatedMap.grid, this.generatedMap.base, this.threatCosts);
        this.emergencyFlowField = buildFlowField(this.generatedMap.grid, this.generatedMap.base, createEmptyCostGrid(this.generatedMap.grid));
    }

    private findTowerAt(x: number, y: number): TowerState | undefined {
        return this.towers.find((tower) => tower.gridX === x && tower.gridY === y);
    }

    private clearSelection(): void {
        this.selectedCell = undefined;
        this.selectedTower = undefined;
    }

    private getPointerClientPosition(pointer: Phaser.Input.Pointer): Vec2 {
        const canvas = this.scale.canvas;
        const bounds = canvas.getBoundingClientRect();
        return {
            x: bounds.left + pointer.x * (bounds.width / canvas.width),
            y: bounds.top + pointer.y * (bounds.height / canvas.height),
        };
    }

    private toWorldPoint(pointer: Phaser.Input.Pointer): Vec2 {
        // On mobile the camera is zoomed onto the map, so use camera-adjusted
        // world coordinates; desktop keeps the default 1:1 mapping.
        if (this.mobileLayout) {
            return { x: pointer.worldX, y: pointer.worldY };
        }
        return { x: pointer.x, y: pointer.y };
    }

    private applyMobileCamera(): void {
        if (!this.mobileLayout) {
            return;
        }
        const camera = this.cameras.main;
        const { originX, originY, cols, rows, cellSize } = GAME_CONFIG.map;
        const mapWidth = cols * cellSize;
        const mapHeight = rows * cellSize;
        const padding = 10;
        const fit = () => {
            const zoom = Math.min(
                GAME_CONFIG.canvasWidth / (mapWidth + padding * 2),
                GAME_CONFIG.canvasHeight / (mapHeight + padding * 2),
            );
            camera.setZoom(zoom);
            camera.centerOn(
                originX + mapWidth / 2,
                originY + camera.displayHeight / 2,
            );
        };
        fit();
        this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    }

    private registerDebugKeys(): void {
        const keyboard = this.input.keyboard;
        keyboard?.on('keydown-G', () => { this.debug.grid = !this.debug.grid; });
        keyboard?.on('keydown-R', () => { this.debug.ranges = !this.debug.ranges; });
        keyboard?.on('keydown-L', () => { this.debug.los = !this.debug.los; });
    }

    private setupSettingsControls(): void {
        const button = document.querySelector<HTMLButtonElement>('[data-testid="settings-button"]')!;
        const popup = document.querySelector<HTMLElement>('[data-testid="settings-popup"]')!;
        const spawnRateSelect = document.querySelector<HTMLSelectElement>('[data-testid="spawn-rate-select"]')!;
        const baseDifficultySelect = document.querySelector<HTMLSelectElement>('[data-testid="base-difficulty-select"]')!;
        const answerModeSelect = document.querySelector<HTMLSelectElement>('[data-testid="answer-mode-select"]')!;
        this.mobileLayout?.attachSettingsPopup(popup);
        const setPopupOpen = (open: boolean) => {
            if (this.mobileLayout) {
                this.mobileLayout.setSettingsOpen(open);
            } else {
                popup.hidden = !open;
            }
            button.setAttribute('aria-expanded', String(open));
        };
        const closePopup = () => {
            setPopupOpen(false);
        };
        const restartGame = () => {
            closePopup();
            if (this.isMultiplayer) {
                return;
            }
            window.sessionStorage.setItem('arithmetic-annihilation:resume-single', 'true');
            window.location.reload();
        };

        button.addEventListener('click', () => {
            const shouldOpen = popup.hidden === true;
            setPopupOpen(shouldOpen);
        });
        spawnRateSelect.addEventListener('change', () => {
            const value = spawnRateSelect.value;
            if (isGameDifficulty(value) && value !== this.spawnRate) {
                this.setSpawnRate(value);
                restartGame();
            }
        });
        baseDifficultySelect.addEventListener('change', () => {
            const value = baseDifficultySelect.value;
            if (isBaseMathsDifficulty(value) && value !== this.baseDifficulty) {
                this.setBaseDifficulty(value);
                if (!this.isMultiplayer) {
                    restartGame();
                }
            }
        });
        answerModeSelect.addEventListener('change', () => {
            const value = answerModeSelect.value;
            if (isMobileAnswerMode(value) && value !== this.mobileAnswerMode) {
                this.setMobileAnswerMode(value);
            }
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closePopup();
                if (!event.repeat) {
                    this.togglePause();
                }
            }
        });
        this.syncSettingsControls();
    }

    private togglePause(): void {
        if (this.gameOver) {
            return;
        }
        this.setManualPause(!this.manualPauseRequested);
    }

    private setManualPause(isPaused: boolean): void {
        this.manualPauseRequested = isPaused;
        this.syncPauseState();
    }

    private setQuestionPause(isPaused: boolean): void {
        this.questionPauseActive = isPaused;
        this.mobileLayout?.setQuestionActive(isPaused);
        this.syncPauseState();
    }

    private syncPauseState(): void {
        this.isPaused = this.isMultiplayer ? false : this.manualPauseRequested || this.questionPauseActive;
        const pausedOverlay = document.querySelector<HTMLElement>('[data-testid="pause-overlay"]');
        if (pausedOverlay) {
            pausedOverlay.hidden = !this.manualPauseRequested;
        }
        this.syncStatusMessage();
    }

    private setupPauseControls(): void {
        document.querySelector<HTMLButtonElement>('[data-testid="resume-button"]')?.addEventListener('click', () => this.setManualPause(false));
        this.manualPauseRequested = false;
        this.questionPauseActive = false;
        this.syncPauseState();
    }

    private setupGameOverControls(): void {
        document.querySelector<HTMLButtonElement>('[data-testid="restart-game-button"]')?.addEventListener('click', () => {
            if (!this.isMultiplayer) {
                window.sessionStorage.setItem('arithmetic-annihilation:resume-single', 'true');
            }
            window.location.reload();
        });
    }

    private readSavedSpawnRate(): GameDifficulty {
        const savedSpawnRate = this.readUrlOption(URL_OPTION_KEYS.spawnRate)
            ?? window.localStorage.getItem(SPAWN_RATE_STORAGE_KEY)
            ?? window.localStorage.getItem(LEGACY_DIFFICULTY_STORAGE_KEY);
        return savedSpawnRate && isGameDifficulty(savedSpawnRate) ? savedSpawnRate : 'medium';
    }

    private readSavedBaseDifficulty(): BaseMathsDifficulty {
        const savedBaseDifficulty = this.readUrlOption(URL_OPTION_KEYS.baseDifficulty)
            ?? window.localStorage.getItem(BASE_DIFFICULTY_STORAGE_KEY);
        return savedBaseDifficulty ? normalizeBaseMathsDifficulty(savedBaseDifficulty) ?? 'year3' : 'year3';
    }

    private readSavedMobileAnswerMode(): MobileAnswerMode {
        const savedAnswerMode = this.readUrlOption(URL_OPTION_KEYS.answerMode)
            ?? window.localStorage.getItem(ANSWER_MODE_STORAGE_KEY);
        return savedAnswerMode && isMobileAnswerMode(savedAnswerMode) ? savedAnswerMode : 'multiple-choice';
    }

    private readSavedMusicVolume(): number {
        const savedMusicVolumeText = this.readUrlOption(URL_OPTION_KEYS.musicVolume) ?? window.localStorage.getItem(MUSIC_VOLUME_STORAGE_KEY);
        if (savedMusicVolumeText === null) {
            return 0.1;
        }
        const savedMusicVolume = Number(savedMusicVolumeText);
        if (!Number.isFinite(savedMusicVolume)) {
            return 0.1;
        }
        return Phaser.Math.Clamp(savedMusicVolume, 0, 1);
    }

    private readSavedMusicMuted(): boolean {
        return (this.readUrlOption(URL_OPTION_KEYS.musicMuted) ?? window.localStorage.getItem(MUSIC_MUTED_STORAGE_KEY)) === 'true';
    }

    private readUrlOption(key: string): string | null {
        return new URLSearchParams(window.location.search).get(key);
    }

    private syncUrlOptions(): void {
        const params = new URLSearchParams(window.location.search);
        params.set(URL_OPTION_KEYS.spawnRate, this.spawnRate);
        params.set(URL_OPTION_KEYS.baseDifficulty, this.baseDifficulty);
        params.set(URL_OPTION_KEYS.answerMode, this.mobileAnswerMode);
        params.set(URL_OPTION_KEYS.musicVolume, String(this.musicVolume));
        params.set(URL_OPTION_KEYS.musicMuted, String(this.musicMuted));
        const query = params.toString();
        window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }

    private setSpawnRate(spawnRate: GameDifficulty): void {
        this.spawnRate = spawnRate;
        window.localStorage.setItem(SPAWN_RATE_STORAGE_KEY, spawnRate);
        this.syncSettingsControls();
        this.syncUrlOptions();
    }

    private setBaseDifficulty(baseDifficulty: BaseMathsDifficulty): void {
        this.baseDifficulty = baseDifficulty;
        window.localStorage.setItem(BASE_DIFFICULTY_STORAGE_KEY, baseDifficulty);
        this.mathsSystem.setBaseDifficulty(baseDifficulty);
        this.panel.close();
        this.syncSettingsControls();
        this.syncUrlOptions();
    }

    private setMobileAnswerMode(answerMode: MobileAnswerMode): void {
        this.mobileAnswerMode = answerMode;
        window.localStorage.setItem(ANSWER_MODE_STORAGE_KEY, answerMode);
        this.panel.setMobileAnswerMode(answerMode);
        this.syncSettingsControls();
        this.syncUrlOptions();
    }

    private createBackgroundMusic(): HTMLAudioElement {
        const audio = new Audio(`${import.meta.env.BASE_URL}${SOUND_PATHS.music}`);
        audio.loop = true;
        audio.preload = 'auto';
        this.applyMusicState(audio);
        return audio;
    }

    private setupMusicControls(): void {
        const muteButton = document.querySelector<HTMLButtonElement>('[data-testid="music-mute-button"]');
        const volumeSlider = document.querySelector<HTMLInputElement>('[data-testid="music-volume-slider"]');
        muteButton?.addEventListener('click', () => {
            this.setMusicMuted(!this.musicMuted);
            this.tryStartMusicPlayback();
        });
        volumeSlider?.addEventListener('input', () => {
            const nextVolume = Number(volumeSlider.value) / 100;
            this.setMusicVolume(nextVolume);
            if (this.musicMuted && nextVolume > 0) {
                this.setMusicMuted(false);
            }
            this.tryStartMusicPlayback();
        });
        this.syncMusicControls();
    }

    private setMusicMuted(muted: boolean): void {
        this.musicMuted = muted;
        window.localStorage.setItem(MUSIC_MUTED_STORAGE_KEY, String(muted));
        this.applyMusicState();
        this.syncMusicControls();
        this.syncUrlOptions();
    }

    private setMusicVolume(volume: number): void {
        this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
        window.localStorage.setItem(MUSIC_VOLUME_STORAGE_KEY, String(this.musicVolume));
        this.applyMusicState();
        this.syncMusicControls();
        this.syncUrlOptions();
    }

    private applyMusicState(audio = this.backgroundMusic): void {
        if (!audio) {
            return;
        }
        audio.volume = this.musicVolume;
        audio.muted = this.musicMuted;
    }

    private tryStartMusicPlayback(): void {
        if (!this.backgroundMusic || this.musicMuted || !this.backgroundMusic.paused) {
            return;
        }
        void this.backgroundMusic.play().catch(() => undefined);
    }

    private syncMusicControls(): void {
        const muteButton = document.querySelector<HTMLButtonElement>('[data-testid="music-mute-button"]');
        if (muteButton) {
            const isEffectivelyMuted = this.musicMuted || this.musicVolume <= 0;
            muteButton.textContent = isEffectivelyMuted ? '🔇' : this.musicVolume < 0.45 ? '🔉' : '🔊';
            muteButton.setAttribute('aria-label', isEffectivelyMuted ? 'Unmute music' : 'Mute music');
            muteButton.setAttribute('aria-pressed', String(this.musicMuted));
            muteButton.title = isEffectivelyMuted ? 'Unmute music' : 'Mute music';
        }
        const volumeSlider = document.querySelector<HTMLInputElement>('[data-testid="music-volume-slider"]');
        if (volumeSlider) {
            volumeSlider.value = String(Math.round(this.musicVolume * 100));
        }
    }

    private syncStatusMessage(): void {
        const message = document.querySelector<HTMLElement>('[data-testid="game-status-message"]');
        if (!message) {
            return;
        }

        let text = '';
        let state = 'idle';

        if (this.gameOver) {
            text = '';
        } else if (this.isMultiplayer && this.questionPauseActive) {
            text = 'The battle continues while you answer.';
            state = 'instruction';
        } else if (this.questionPauseActive && this.mobileLayout) {
            text = '';
        } else if (this.questionPauseActive) {
            text = 'Game paused while you answer the question.';
            state = 'paused';
        } else if (this.manualPauseRequested) {
            text = 'Game paused.';
            state = 'paused';
        } else if (this.isMultiplayer && this.towers.every((tower) => tower.teamId !== this.localTeamId)) {
            text = 'Build on your half, or unlock a monster generator below.';
            state = 'instruction';
        } else if (this.towers.length === 0) {
            text = 'Click on a square to place a tower to start game.';
            state = 'instruction';
        } else {
            text = 'Click a tower to upgrade, or a blank square to place a new tower.';
            state = 'instruction';
        }

        message.hidden = text.length === 0;
        message.textContent = text;
        if (text.length === 0) {
            delete message.dataset.state;
            return;
        }
        message.dataset.state = state;
    }

    private syncSettingsControls(): void {
        const spawnRateSelect = document.querySelector<HTMLSelectElement>('[data-testid="spawn-rate-select"]');
        if (spawnRateSelect) {
            spawnRateSelect.value = this.spawnRate;
        }
        const baseDifficultySelect = document.querySelector<HTMLSelectElement>('[data-testid="base-difficulty-select"]');
        if (baseDifficultySelect) {
            baseDifficultySelect.value = this.baseDifficulty;
        }
        const answerModeSelect = document.querySelector<HTMLSelectElement>('[data-testid="answer-mode-select"]');
        if (answerModeSelect) {
            answerModeSelect.value = this.mobileAnswerMode;
        }
        const popup = document.querySelector<HTMLElement>('[data-testid="settings-popup"]');
        if (popup) {
            popup.setAttribute(
                'aria-label',
                `Settings, spawn rate ${SPAWN_RATE_LABELS[this.spawnRate]}, base difficulty ${BASE_MATHS_DIFFICULTY_LABELS[this.baseDifficulty]}, mobile answers ${ANSWER_MODE_LABELS[this.mobileAnswerMode]}`,
            );
        }
    }

    private updateHud(): void {
        const localHealth = this.isMultiplayer ? this.baseHealthByTeam[this.localTeamId] : this.baseHealth;
        const healthPercent = Math.max(0, Math.min(1, localHealth / GAME_CONFIG.baseHealth));
        const baseHealthColor = this.formatBaseHealthColor(healthPercent);
        const hud = document.querySelector<HTMLElement>('#hud')!;
        document.querySelector('[data-stat="health"]')!.textContent = `${Math.ceil(localHealth)}`;
        document.querySelector<HTMLElement>('[data-stat="base-fill"]')!.style.transform = `scaleX(${healthPercent})`;
        document.querySelector<HTMLElement>('[data-stat="base-meter"]')!.setAttribute('aria-valuenow', `${Math.ceil(localHealth)}`);
        hud.style.setProperty('--base-health-color', baseHealthColor);
        document.querySelector('[data-stat="time"]')!.textContent = this.formatTime(this.elapsedMs);
        const localStats = this.isMultiplayer ? this.statsByTeam[this.localTeamId] : { kills: this.kills, answered: this.answered, correctAnswers: this.correctAnswers };
        document.querySelector('[data-stat="kills"]')!.textContent = `${this.isMultiplayer ? localStats.kills : this.kills}`;
        const accuracy = localStats.answered === 0 ? '0/0' : `${localStats.correctAnswers}/${localStats.answered} (${Math.round((localStats.correctAnswers / localStats.answered) * 100)}%)`;
        document.querySelector('[data-stat="accuracy"]')!.textContent = accuracy;
        if (this.isMultiplayer) {
            document.querySelector<HTMLElement>('[data-stat="base-label"]')!.textContent = 'You';
            document.querySelector<HTMLElement>('[data-stat="rival-base-status"]')!.hidden = false;
            document.querySelector<HTMLElement>('[data-stat="rival-health"]')!.textContent = `${Math.ceil(this.baseHealthByTeam[opponentOf(this.localTeamId)])}`;
        }
    }

    private formatBaseHealthColor(healthPercent: number): string {
        const red = { r: 232, g: 93, b: 117 };
        const amber = { r: 243, g: 182, b: 75 };
        const green = { r: 79, g: 180, b: 119 };
        const start = healthPercent < 0.5 ? red : amber;
        const end = healthPercent < 0.5 ? amber : green;
        const mix = healthPercent < 0.5 ? healthPercent * 2 : (healthPercent - 0.5) * 2;
        const channel = (from: number, to: number) => Math.round(from + (to - from) * mix);

        return `rgb(${channel(start.r, end.r)}, ${channel(start.g, end.g)}, ${channel(start.b, end.b)})`;
    }

    private flashBaseDamage(): void {
        this.baseDamageFlashMs = 360;
        const hud = document.querySelector<HTMLElement>('#hud')!;
        hud.classList.remove('base-hit');
        void hud.offsetWidth;
        hud.classList.add('base-hit');
    }

    private endGame(winner?: TeamId): void {
        const wasGameOver = this.gameOver;
        this.gameOver = true;
        const gameOver = document.querySelector<HTMLElement>('[data-testid="game-over"]')!;
        gameOver.hidden = false;
        if (this.isMultiplayer) {
            const resolvedWinner = winner ?? (this.baseHealthByTeam.solar <= 0 ? 'lunar' : 'solar');
            document.querySelector<HTMLElement>('[data-game-over-message]')!.textContent = resolvedWinner === this.localTeamId ? 'You win!' : 'Your base was destroyed';
            this.renderMonsterGeneratorControls();
            if (multiplayerSession.isAuthoritative && !wasGameOver) {
                multiplayerSession.announceGameEnd(this.multiplayerTick, resolvedWinner);
            }
        }
        document.querySelector('[data-game-over-time]')!.textContent = this.formatTime(this.elapsedMs);
        this.syncStatusMessage();
    }

    private formatTime(milliseconds: number): string {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

    private render(): void {
        this.graphics.clear();
        this.debugGraphics.clear();
        this.renderMap();
        this.renderBaseDamageFlash();
        this.renderDebugLosBlocks();
        this.renderTowerRanges();
        this.renderFlowDebug();
        this.renderTowers();
        this.effects.render(this.graphics);
        this.renderProjectiles();
        this.renderEnemies();
        this.renderExplosions();
        this.renderAirstrikeImpacts();
        this.renderAirstrikes();
        this.renderSelection();
        this.renderCostDebug();
    }

    private renderMap(): void {
        const { grid, spawns, base } = this.generatedMap;
        const { originX, originY, cellSize } = GAME_CONFIG.map;
        if (this.debug.grid) {
            this.graphics.lineStyle(1, 0xf7f0d6, 0.16);
            for (let x = 0; x <= grid.cols; x += 1) {
                const worldX = originX + x * cellSize;
                this.graphics.lineBetween(worldX, originY, worldX, originY + grid.rows * cellSize);
            }
            for (let y = 0; y <= grid.rows; y += 1) {
                const worldY = originY + y * cellSize;
                this.graphics.lineBetween(originX, worldY, originX + grid.cols * cellSize, worldY);
            }
        }
        for (const [index, spawn] of spawns.entries()) {
            const center = cellCenter(spawn, GAME_CONFIG.map);
            const spawnTeam: TeamId = index === 0 ? 'solar' : 'lunar';
            this.graphics.fillStyle(this.isOpponentTeam(spawnTeam) ? 0x969696 : 0xf3b64b, 1);
            if (this.isMultiplayer && index === 1) {
                this.graphics.fillTriangle(center.x + 14, center.y - 14, center.x + 14, center.y + 14, center.x - 16, center.y);
            } else {
                this.graphics.fillTriangle(center.x - 14, center.y - 14, center.x - 14, center.y + 14, center.x + 16, center.y);
            }
            this.graphics.lineStyle(2, this.isOpponentTeam(spawnTeam) ? 0x3f3f3f : 0x3b2106, 0.7);
            this.graphics.strokeCircle(center.x, center.y, 18);
        }
        this.graphics.lineStyle(2, 0x132119, 0.28);
        const bases = this.isMultiplayer ? Object.values(this.generatedMap.bases!) : [base];
        for (const renderedBase of bases) {
            this.graphics.strokeRect(
                originX + (renderedBase.x - 1) * cellSize + 1,
                originY + (renderedBase.y - 1) * cellSize + 1,
                cellSize * 3 - 2,
                cellSize * 3 - 2,
            );
        }
        if (this.isMultiplayer) {
            const splitX = originX + grid.cols / 2 * cellSize;
            this.graphics.lineStyle(3, 0xf7f0d6, 0.32);
            this.graphics.lineBetween(splitX, originY, splitX, originY + grid.rows * cellSize);
        }
    }

    private renderBaseDamageFlash(): void {
        if (this.baseDamageFlashMs <= 0) {
            this.baseSprite.clearTint();
            return;
        }
        const base = this.isMultiplayer ? this.generatedMap.bases![this.localTeamId] : this.generatedMap.base;
        const { originX, originY, cellSize } = GAME_CONFIG.map;
        const alpha = Math.max(0, Math.min(1, this.baseDamageFlashMs / 360));
        this.baseSprite.setTint(0xff6b6b);
        this.graphics.fillStyle(0xe85d75, alpha * 0.26);
        this.graphics.fillRect(originX + (base.x - 1) * cellSize, originY + (base.y - 1) * cellSize, cellSize * 3, cellSize * 3);
        this.graphics.lineStyle(4, 0xff2d55, alpha * 0.9);
        this.graphics.strokeRect(originX + (base.x - 1) * cellSize + 2, originY + (base.y - 1) * cellSize + 2, cellSize * 3 - 4, cellSize * 3 - 4);
    }

    private renderTowerRanges(): void {
        const towersToShow = this.debug.ranges ? this.towers : this.selectedTower ? [this.selectedTower] : [];
        for (const tower of towersToShow) {
            if (isWallTower(tower) || tower.type === 'airstrike') {
                continue;
            }
            const center = cellCenter({ x: tower.gridX, y: tower.gridY }, GAME_CONFIG.map);
            const stats = getTowerStats(tower);
            const rangeColor = this.isOpponentTeam(tower.teamId) ? 0x969696 : TOWER_COLORS[tower.type];
            this.graphics.lineStyle(2, rangeColor, tower === this.selectedTower ? 0.54 : 0.24);
            this.graphics.strokeCircle(center.x, center.y, stats.range);
        }
    }

    private renderTowers(): void {
        const activeIds = new Set<number>();
        const { cellSize } = GAME_CONFIG.map;
        for (const tower of this.towers) {
            activeIds.add(tower.id);
            const center = cellCenter({ x: tower.gridX, y: tower.gridY }, GAME_CONFIG.map);
            if (tower.type === 'airstrike') {
                const existingSprite = this.towerSprites.get(tower.id);
                if (existingSprite) {
                    existingSprite.destroy();
                    this.towerSprites.delete(tower.id);
                }
                continue;
            }
            if (tower.type === 'flamethrower') {
                const existingSprite = this.towerSprites.get(tower.id);
                if (existingSprite) {
                    existingSprite.destroy();
                    this.towerSprites.delete(tower.id);
                }
                this.renderFlamethrowerTower(tower, center);
                continue;
            }
            let sprite = this.towerSprites.get(tower.id);
            if (!sprite) {
                sprite = this.add.image(center.x, center.y, this.getTeamTextureKey(TOWER_TEXTURES[tower.type], tower.teamId)).setDepth(2);
                this.towerSprites.set(tower.id, sprite);
            }
            sprite.setTexture(this.getTeamTextureKey(TOWER_TEXTURES[tower.type], tower.teamId));
            sprite.setPosition(center.x, center.y);
            this.setSpriteMaxSize(sprite, TOWER_SPRITE_MAX_SIZE);
            sprite.setAlpha(tower === this.selectedTower ? 1 : 0.96);

            if (isWallTower(tower)) {
                this.renderWallHealth(tower, center);
                continue;
            }

            this.graphics.fillStyle(0x101614, 0.9);
            const levelMarkerColumns = 4;
            const levelMarkerSpacing = 5;
            const levelMarkerStartX = center.x - ((levelMarkerColumns - 1) * levelMarkerSpacing) / 2;
            const levelMarkerStartY = center.y + 7;
            for (let level = 0; level < tower.level; level += 1) {
                const markerColumn = level % levelMarkerColumns;
                const markerRow = Math.floor(level / levelMarkerColumns);
                this.graphics.fillCircle(levelMarkerStartX + markerColumn * levelMarkerSpacing, levelMarkerStartY + markerRow * levelMarkerSpacing, 1.8);
            }
        }

        for (const [towerId, sprite] of this.towerSprites) {
            if (!activeIds.has(towerId)) {
                sprite.destroy();
                this.towerSprites.delete(towerId);
            }
        }
    }

    private renderFlamethrowerTower(tower: TowerState, center: Vec2): void {
        const radius = GAME_CONFIG.map.cellSize * 0.34;
        const angle = tower.flameAngleRadians ?? 0;
        const opponent = this.isOpponentTeam(tower.teamId);
        this.graphics.fillStyle(opponent ? 0x303030 : 0x3a0c08, 0.64);
        this.graphics.fillCircle(center.x + 2, center.y + 3, radius * 1.12);
        this.graphics.fillStyle(opponent ? 0x858585 : 0xff3030, tower === this.selectedTower ? 1 : 0.94);
        this.graphics.fillCircle(center.x, center.y, radius);
        this.graphics.fillStyle(opponent ? 0xb8b8b8 : 0xff8a16, 0.82);
        this.graphics.fillCircle(center.x - radius * 0.22, center.y - radius * 0.24, radius * 0.28);
        this.graphics.lineStyle(4, opponent ? 0xe0e0e0 : 0xfff1a8, 0.95);
        this.graphics.beginPath();
        this.graphics.moveTo(center.x + Math.cos(angle) * radius * 0.2, center.y + Math.sin(angle) * radius * 0.2);
        this.graphics.lineTo(center.x + Math.cos(angle) * radius * 1.18, center.y + Math.sin(angle) * radius * 1.18);
        this.graphics.strokePath();

        this.graphics.fillStyle(0x101614, 0.9);
        const levelMarkerColumns = 4;
        const levelMarkerSpacing = 5;
        const levelMarkerStartX = center.x - ((levelMarkerColumns - 1) * levelMarkerSpacing) / 2;
        const levelMarkerStartY = center.y + 7;
        for (let level = 0; level < tower.level; level += 1) {
            const markerColumn = level % levelMarkerColumns;
            const markerRow = Math.floor(level / levelMarkerColumns);
            this.graphics.fillCircle(levelMarkerStartX + markerColumn * levelMarkerSpacing, levelMarkerStartY + markerRow * levelMarkerSpacing, 1.8);
        }
    }

    private renderWallHealth(tower: TowerState, center: Vec2): void {
        const maxHealth = tower.maxHealth ?? GAME_CONFIG.wall.health;
        const healthPercent = Math.max(0, Math.min(1, (tower.health ?? maxHealth) / maxHealth));
        const barWidth = GAME_CONFIG.map.cellSize * 0.64;
        this.graphics.fillStyle(0x101614, 0.9);
        this.graphics.fillRect(center.x - barWidth / 2, center.y + 16, barWidth, 4);
        this.graphics.fillStyle(healthPercent > 0.4 ? 0xf7f0d6 : 0xff9f1c, 1);
        this.graphics.fillRect(center.x - barWidth / 2, center.y + 16, barWidth * healthPercent, 4);
    }

    private renderEnemies(): void {
        const activeIds = new Set<number>();
        const { cellSize } = GAME_CONFIG.map;
        for (const enemy of this.enemies) {
            activeIds.add(enemy.id);
            const textureKey = this.getEnemyTextureKey(enemy);
            const spriteSize = this.getEnemySpriteMaxSize(enemy, cellSize);
            const shadowOffsetX = Math.max(4, enemy.radius * 0.18);
            const shadowOffsetY = Math.max(5, enemy.radius * 0.24);
            const depth = 2 + enemy.y / 10000;
            let shadow = this.enemyShadows.get(enemy.id);
            if (!shadow) {
                shadow = this.add.image(enemy.x + shadowOffsetX, enemy.y + shadowOffsetY, textureKey);
                shadow.setTint(0x000000);
                shadow.setAlpha(0.32);
                this.enemyShadows.set(enemy.id, shadow);
            }
            let sprite = this.enemySprites.get(enemy.id);
            if (!sprite) {
                sprite = this.add.image(enemy.x, enemy.y, textureKey);
                this.enemySprites.set(enemy.id, sprite);
            }
            shadow.setTexture(textureKey);
            shadow.setPosition(enemy.x + shadowOffsetX, enemy.y + shadowOffsetY);
            this.setEnemySpriteSize(shadow, spriteSize * 1.08);
            shadow.setFlipX(enemy.teamId === 'lunar');
            shadow.setDepth(depth - 0.01);

            sprite.setTexture(textureKey);
            sprite.setPosition(enemy.x, enemy.y);
            this.setEnemySpriteSize(sprite, spriteSize);
            sprite.setFlipX(enemy.teamId === 'lunar');
            sprite.setDepth(depth);

            const barWidth = enemy.radius * 2.1;
            const healthPercent = Math.max(0, enemy.health / enemy.maxHealth);
            this.graphics.fillStyle(0x111611, 0.88);
            this.graphics.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth, 4);
            const healthyColor = this.isOpponentTeam(enemy.teamId) ? 0xa8a8a8 : 0x66d17a;
            this.graphics.fillStyle(healthPercent > 0.45 ? healthyColor : 0xe85d75, 1);
            this.graphics.fillRect(enemy.x - barWidth / 2, enemy.y - enemy.radius - 8, barWidth * healthPercent, 4);
        }

        for (const [enemyId, sprite] of this.enemySprites) {
            if (!activeIds.has(enemyId)) {
                sprite.destroy();
                this.enemySprites.delete(enemyId);
            }
        }
        for (const [enemyId, shadow] of this.enemyShadows) {
            if (!activeIds.has(enemyId)) {
                shadow.destroy();
                this.enemyShadows.delete(enemyId);
            }
        }
    }

    private setEnemySpriteSize(sprite: Phaser.GameObjects.Image, maxSize: number): void {
        this.setSpriteMaxSize(sprite, maxSize);
    }

    private getEnemySpriteMaxSize(enemy: EnemyState, cellSize: number): number {
        return Math.max(ENEMY_SPRITE_MIN_SIZE, Math.min(ENEMY_SPRITE_MAX_SIZE, enemy.radius * 3.1, cellSize * 1.3));
    }

    private setSpriteMaxSize(sprite: Phaser.GameObjects.Image, maxSize: number): void {
        sprite.setScale(1);
        const scale = maxSize / Math.max(sprite.width, sprite.height, 1);
        sprite.setScale(scale);
    }

    private renderProjectiles(): void {
        for (const projectile of this.projectiles) {
            if (projectile.type === 'missile') {
                const angle = Math.atan2(projectile.vy, projectile.vx);
                this.graphics.fillStyle(0xbde0fe, 1);
                this.graphics.save();
                this.graphics.translateCanvas(projectile.x, projectile.y);
                this.graphics.rotateCanvas(angle);
                this.graphics.fillTriangle(8, 0, -6, -5, -6, 5);
                this.graphics.restore();
            } else if (projectile.type === 'fragment') {
                const color = this.fragmentHeatColor(projectile);
                const heat = Math.max(0, Math.min(1, projectile.lifeMs / (projectile.maxLifeMs ?? 620)));
                this.graphics.lineStyle(2, color, 0.7);
                this.graphics.beginPath();
                this.graphics.moveTo(projectile.previousX, projectile.previousY);
                this.graphics.lineTo(projectile.x, projectile.y);
                this.graphics.strokePath();
                if (heat > 0.35) {
                    this.graphics.fillStyle(color, 0.22);
                    this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 2.2);
                }
                this.graphics.fillStyle(color, 1);
                this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius * (0.75 + heat * 0.55));
            } else if (projectile.type === 'cluster') {
                this.graphics.fillStyle(0xf15bb5, 0.24);
                this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 2.2);
                this.graphics.fillStyle(0xffc2f4, 1);
                this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
            } else if (projectile.visualType === 'spray') {
                const angle = Math.atan2(projectile.vy, projectile.vx);
                this.graphics.lineStyle(2, 0x42f5ff, 0.42);
                this.graphics.beginPath();
                this.graphics.moveTo(projectile.previousX, projectile.previousY);
                this.graphics.lineTo(projectile.x, projectile.y);
                this.graphics.strokePath();
                this.graphics.save();
                this.graphics.translateCanvas(projectile.x, projectile.y);
                this.graphics.rotateCanvas(angle);
                this.graphics.fillStyle(0xff4fd8, 0.24);
                this.graphics.fillEllipse(0, 0, projectile.radius * 4.2, projectile.radius * 2.4);
                this.graphics.fillStyle(0xe7ffff, 1);
                this.graphics.fillEllipse(0, 0, projectile.radius * 2.1, projectile.radius * 1.15);
                this.graphics.restore();
            } else {
                const speed = Math.hypot(projectile.vx, projectile.vy) || 1;
                const dirX = projectile.vx / speed;
                const dirY = projectile.vy / speed;
                this.graphics.lineStyle(3, 0xfff7ce, 0.64);
                this.graphics.beginPath();
                this.graphics.moveTo(projectile.x - dirX * 20, projectile.y - dirY * 20);
                this.graphics.lineTo(projectile.x, projectile.y);
                this.graphics.strokePath();
                this.graphics.fillStyle(0xfffdf3, 0.28);
                this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius * 2.1);
                this.graphics.fillStyle(0xf7f0d6, 1);
                this.graphics.fillCircle(projectile.x, projectile.y, projectile.radius);
            }
        }
    }

    private fragmentHeatColor(projectile: ProjectileState): number {
        const heat = Math.max(0, Math.min(1, projectile.lifeMs / (projectile.maxLifeMs ?? 620)));
        if (heat > 0.72) {
            return 0xffffff;
        }
        if (heat > 0.44) {
            return 0xff8a16;
        }
        if (heat > 0.18) {
            return 0xd82712;
        }
        return 0x0b0908;
    }

    private renderExplosions(): void {
        for (const explosion of this.explosions) {
            const fullLifeMs = explosion.radius > GAME_CONFIG.map.cellSize * 4 ? 520 : 260;
            const alpha = Math.max(0, Math.min(1, explosion.lifeMs / fullLifeMs));
            this.graphics.lineStyle(3, 0xffe66d, alpha);
            this.graphics.strokeCircle(explosion.x, explosion.y, explosion.radius * (1.05 - alpha * 0.2));
            this.graphics.fillStyle(0xff9f1c, alpha * 0.16);
            this.graphics.fillCircle(explosion.x, explosion.y, explosion.radius);
        }
    }

    private renderAirstrikeImpacts(): void {
        const { originX, originY, cellSize } = GAME_CONFIG.map;
        for (const impact of this.airstrikeImpacts) {
            const life = Phaser.Math.Clamp(impact.lifeMs / AIRSTRIKE_IMPACT_LIFE_MS, 0, 1);
            const bloom = Math.sin((1 - life) * Math.PI);
            const intensity = Phaser.Math.Clamp(impact.intensity, 0.08, 1);
            const left = originX + impact.x * cellSize;
            const top = originY + impact.y * cellSize;
            const centerX = left + cellSize * (0.42 + this.seededUnit(impact.seed, 1) * 0.16);
            const centerY = top + cellSize * (0.42 + this.seededUnit(impact.seed, 2) * 0.16);
            const radius = cellSize * (0.2 + intensity * 0.32) * (0.82 + bloom * 0.32);
            const alpha = life * (0.14 + intensity * 0.42);

            this.graphics.fillStyle(0x1d1510, alpha * 0.62);
            this.graphics.fillRect(left + 1, top + 1, cellSize - 2, cellSize - 2);

            this.graphics.fillStyle(0xfff0a8, alpha * 0.9);
            this.graphics.fillCircle(centerX, centerY, radius * 0.38);
            this.graphics.fillStyle(0xff7a1a, alpha * 0.74);
            this.graphics.fillCircle(centerX, centerY, radius * 0.66);

            const spikes = 5 + Math.floor(intensity * 5);
            for (let index = 0; index < spikes; index += 1) {
                const angle = (Math.PI * 2 * index) / spikes + this.seededUnit(impact.seed, index + 10) * 0.8;
                const halfWidth = 0.17 + this.seededUnit(impact.seed, index + 30) * 0.16;
                const outer = radius * (0.9 + this.seededUnit(impact.seed, index + 50) * 0.72);
                const inner = radius * (0.18 + this.seededUnit(impact.seed, index + 70) * 0.12);
                this.graphics.fillStyle(index % 2 === 0 ? 0xffd166 : 0xff4d00, alpha * (0.52 + intensity * 0.34));
                this.graphics.fillTriangle(
                    centerX + Math.cos(angle - halfWidth) * inner,
                    centerY + Math.sin(angle - halfWidth) * inner,
                    centerX + Math.cos(angle) * outer,
                    centerY + Math.sin(angle) * outer,
                    centerX + Math.cos(angle + halfWidth) * inner,
                    centerY + Math.sin(angle + halfWidth) * inner,
                );
            }

            const smokePuffs = 2 + Math.floor(intensity * 3);
            for (let index = 0; index < smokePuffs; index += 1) {
                const angle = this.seededUnit(impact.seed, index + 90) * Math.PI * 2;
                const distance = radius * (0.28 + this.seededUnit(impact.seed, index + 110) * 0.8) * (1.15 - life * 0.45);
                const puffRadius = radius * (0.16 + this.seededUnit(impact.seed, index + 130) * 0.2);
                this.graphics.fillStyle(0x3b332c, life * intensity * 0.36);
                this.graphics.fillCircle(centerX + Math.cos(angle) * distance, centerY + Math.sin(angle) * distance, puffRadius);
            }
        }
    }

    private seededUnit(seed: number, salt: number): number {
        const value = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
        return value - Math.floor(value);
    }

    private renderAirstrikes(): void {
        const { cellSize, originX, originY } = GAME_CONFIG.map;
        for (const airstrike of this.pendingAirstrikes) {
            const targetCenter = cellCenter(airstrike.target, GAME_CONFIG.map);
            const progress = Phaser.Math.Clamp(airstrike.elapsedMs / airstrike.delayMs, 0, 1);
            const planeX = Phaser.Math.Linear(airstrike.start.x, airstrike.end.x, progress);
            const planeY = Phaser.Math.Linear(airstrike.start.y, airstrike.end.y, progress);
            const angle = Math.atan2(airstrike.end.y - airstrike.start.y, airstrike.end.x - airstrike.start.x);
            const targetLeft = originX + airstrike.target.x * cellSize;
            const targetTop = originY + airstrike.target.y * cellSize;

            this.graphics.lineStyle(2, 0xf7f0d6, 0.86);
            this.graphics.strokeCircle(targetCenter.x, targetCenter.y, cellSize * 0.34);
            this.graphics.lineBetween(targetCenter.x - cellSize * 0.46, targetCenter.y, targetCenter.x + cellSize * 0.46, targetCenter.y);
            this.graphics.lineBetween(targetCenter.x, targetCenter.y - cellSize * 0.46, targetCenter.x, targetCenter.y + cellSize * 0.46);
            this.graphics.lineStyle(2, 0xffe66d, 0.72);
            this.graphics.strokeRect(targetLeft + 2, targetTop + 2, cellSize - 4, cellSize - 4);

            this.graphics.save();
            this.graphics.translateCanvas(planeX, planeY);
            this.graphics.rotateCanvas(angle);
            this.graphics.fillStyle(0x101614, 0.96);
            this.graphics.fillTriangle(cellSize * 0.48, 0, -cellSize * 0.34, -cellSize * 0.26, -cellSize * 0.34, cellSize * 0.26);
            this.graphics.lineStyle(2, 0xf7f0d6, 0.68);
            this.graphics.lineBetween(-cellSize * 0.5, 0, -cellSize * 1.05, 0);
            this.graphics.restore();
        }
    }

    private renderSelection(): void {
        if (!this.selectedCell) {
            return;
        }
        const { originX, originY, cellSize } = GAME_CONFIG.map;
        const blocked = this.panel.getSelectedBuildTower() !== 'airstrike' && !this.canBuildOnCell(this.selectedCell) && !this.selectedTower;
        this.graphics.lineStyle(3, blocked ? 0xe85d75 : 0xffe66d, 0.95);
        this.graphics.strokeRect(originX + this.selectedCell.x * cellSize + 2, originY + this.selectedCell.y * cellSize + 2, cellSize - 4, cellSize - 4);
    }

    private renderFlowDebug(): void {
        if (!this.debug.flow) {
            return;
        }
        const { grid } = this.generatedMap;
        for (let y = 0; y < grid.rows; y += 1) {
            for (let x = 0; x < grid.cols; x += 1) {
                if (grid.isBlocked(x, y) || (x + y) % 2 === 1) {
                    continue;
                }
                const center = cellCenter({ x, y }, GAME_CONFIG.map);
                const direction = this.flowField.direction[y][x];
                this.debugGraphics.lineStyle(1, 0x0b1dff, 0.6);
                this.debugGraphics.lineBetween(center.x, center.y, center.x + direction.x * 13, center.y + direction.y * 13);
                this.debugGraphics.fillStyle(0x0b1dff, 0.8);
                this.debugGraphics.fillCircle(center.x + direction.x * 13, center.y + direction.y * 13, 2);
            }
        }
    }

    private renderDebugLosBlocks(): void {
        if (!this.debug.los || !this.selectedTower) {
            return;
        }
        const tower = this.selectedTower;
        const stats = getTowerStats(tower);
        if (stats.range <= 0) {
            return;
        }
        const towerCenter = cellCenter({ x: tower.gridX, y: tower.gridY }, GAME_CONFIG.map);
        const cellRadius = Math.ceil(stats.range / GAME_CONFIG.map.cellSize);
        const { originX, originY, cellSize } = GAME_CONFIG.map;
        for (let y = tower.gridY - cellRadius; y <= tower.gridY + cellRadius; y += 1) {
            for (let x = tower.gridX - cellRadius; x <= tower.gridX + cellRadius; x += 1) {
                if (!this.generatedMap.grid.inBounds(x, y) || this.generatedMap.grid.isBlocked(x, y)) {
                    continue;
                }
                const center = cellCenter({ x, y }, GAME_CONFIG.map);
                if (Math.hypot(center.x - towerCenter.x, center.y - towerCenter.y) <= stats.range && !hasLineOfSight(this.generatedMap.grid, towerCenter, center, GAME_CONFIG.map)) {
                    this.debugGraphics.fillStyle(0xe85d75, 0.28);
                    this.debugGraphics.fillRect(originX + x * cellSize, originY + y * cellSize, cellSize, cellSize);
                }
            }
        }
    }

    private renderCostDebug(): void {
        if (!this.debug.costs) {
            this.costTexts.forEach((text) => text.setVisible(false));
            return;
        }
        const { grid } = this.generatedMap;
        const required = grid.cols * grid.rows;
        while (this.costTexts.length < required) {
            this.costTexts.push(this.add.text(0, 0, '', { fontFamily: 'Verdana', fontSize: '9px', color: '#101614' }).setDepth(4));
        }
        let index = 0;
        for (let y = 0; y < grid.rows; y += 1) {
            for (let x = 0; x < grid.cols; x += 1) {
                const text = this.costTexts[index++];
                const center = cellCenter({ x, y }, GAME_CONFIG.map);
                const value = this.flowField.costToBase[y][x];
                text.setVisible(true);
                text.setPosition(center.x - 13, center.y - 7);
                text.setText(Number.isFinite(value) ? `${Math.round(value)}` : 'X');
            }
        }
    }

    private createMapSprites(): void {
        const { grid, base } = this.generatedMap;
        const { originX, originY, cellSize } = GAME_CONFIG.map;

        grid.forEachCell((x, y, terrain) => {
            const cellTeam: TeamId = x < grid.cols / 2 ? 'solar' : 'lunar';
            const textureKey = this.getTeamTextureKey(this.getTerrainTextureKey(terrain, x, y), cellTeam);
            const sprite = this.add
                .image(originX + x * cellSize + cellSize / 2, originY + y * cellSize + cellSize / 2, textureKey)
                .setDisplaySize(cellSize, cellSize)
                .setDepth(0);
            this.terrainSprites.push(sprite);
        });

        if (this.isMultiplayer) {
            for (const teamId of TEAMS) {
                const baseCenter = cellCenter(this.generatedMap.bases![teamId], GAME_CONFIG.map);
                const sprite = this.add.image(baseCenter.x, baseCenter.y, this.getTeamTextureKey(SPRITE_PATHS.base, teamId)).setDisplaySize(cellSize * 3, cellSize * 3).setDepth(1);
                this.baseSprites.set(teamId, sprite);
            }
            this.baseSprite = this.baseSprites.get(this.localTeamId)!;
        } else {
            const baseCenter = cellCenter(base, GAME_CONFIG.map);
            this.baseSprite = this.add.image(baseCenter.x, baseCenter.y, SPRITE_PATHS.base).setDisplaySize(cellSize * 3, cellSize * 3).setDepth(1);
        }
    }

    private getTerrainTextureKey(terrain: TerrainType, x: number, y: number): string {
        const variants = TERRAIN_TEXTURES[terrain];
        const seedHash = (this.generatedMap.seed >>> 0) ^ ((x + 1) * 73856093) ^ ((y + 1) * 19349663);
        return variants[seedHash % variants.length];
    }

    private getEnemyTextureKey(enemy: EnemyState): string {
        const tier = this.getEnemyTextureTier(enemy);
        const state = this.getEnemyTextureState(enemy);
        return this.getTeamTextureKey(ENEMY_TEXTURES[tier][state], enemy.teamId);
    }

    private createOpponentTextureVariants(): void {
        if (!this.isMultiplayer) {
            return;
        }
        const sourceKeys = new Set<string>(Object.values(SPRITE_PATHS));
        for (const sourceKey of sourceKeys) {
            const opponentKey = `opponent:${sourceKey}`;
            this.opponentTextureKeys.set(sourceKey, opponentKey);
            if (this.textures.exists(opponentKey)) {
                continue;
            }
            const source = this.textures.get(sourceKey).getSourceImage() as CanvasImageSource & { width: number; height: number };
            const texture = this.textures.createCanvas(opponentKey, source.width, source.height);
            if (!texture) {
                continue;
            }
            const context = texture.context;
            context.save();
            context.filter = 'grayscale(1)';
            context.drawImage(source, 0, 0, source.width, source.height);
            context.restore();
            texture.refresh();
        }
    }

    private getTeamTextureKey(sourceKey: string, teamId?: TeamId): string {
        if (!this.isOpponentTeam(teamId)) {
            return sourceKey;
        }
        return this.opponentTextureKeys.get(sourceKey) ?? sourceKey;
    }

    private isOpponentTeam(teamId?: TeamId): boolean {
        return this.isMultiplayer && teamId !== undefined && teamId !== this.localTeamId;
    }

    private getEnemyTextureTier(enemy: EnemyState): EnemyTextureTier {
        if (enemy.visualTier) {
            return enemy.visualTier;
        }
        const healthScale = enemy.maxHealth / ENEMY_STATS[enemy.type].health;
        if (enemy.type === 'scout') {
            return healthScale >= 2.35 ? 2 : 1;
        }
        if (enemy.type === 'grunt') {
            return healthScale >= 2.1 ? 3 : 2;
        }
        return healthScale >= 1.6 ? 4 : 3;
    }

    private getEnemyTextureState(enemy: EnemyState): EnemyTextureState {
        if (enemy.hurtFlashMs > 0) {
            return 'hurt';
        }
        return enemy.lastMoveSpeed > enemy.speed * 0.12 ? 'run' : 'stop';
    }

    private installBrowserHooks(): void {
        const getFirstBuildableCell = () => {
            for (let y = 3; y < this.generatedMap.grid.rows; y += 1) {
                for (let x = 3; x < this.generatedMap.grid.cols; x += 1) {
                    if (this.canBuildOnCell({ x, y }) && !this.findTowerAt(x, y)) {
                        const center = cellCenter({ x, y }, GAME_CONFIG.map);
                        return { x, y, worldX: center.x, worldY: center.y };
                    }
                }
            }
            return null;
        };
        const hooks = {
            getFirstBuildableCell,
            getBaseCell: () => {
                const center = cellCenter(this.generatedMap.base, GAME_CONFIG.map);
                return { ...this.generatedMap.base, worldX: center.x, worldY: center.y };
            },
            getCanvasPointForWorldPoint: (worldX: number, worldY: number) => {
                const camera = this.cameras.main;
                return {
                    x: (worldX - camera.worldView.x) * camera.zoom,
                    y: (worldY - camera.worldView.y) * camera.zoom,
                };
            },
            getMapViewportBounds: () => {
                const camera = this.cameras.main;
                const { originX, originY, cols, rows, cellSize } = GAME_CONFIG.map;
                return {
                    left: (originX - camera.worldView.x) * camera.zoom,
                    top: (originY - camera.worldView.y) * camera.zoom,
                    right: (originX + cols * cellSize - camera.worldView.x) * camera.zoom,
                    bottom: (originY + rows * cellSize - camera.worldView.y) * camera.zoom,
                };
            },
            getTowerCount: () => this.towers.length,
            getTowerTypes: () => this.towers.map((tower) => tower.type),
            getEnemyCount: () => this.enemies.length,
            getEnemySnapshot: () => this.enemies.map((enemy) => ({ id: enemy.id, x: enemy.x, y: enemy.y, health: enemy.health })),
            getGeneratorLevel: () => this.generators.find((generator) => generator.teamId === this.localTeamId)?.level ?? 0,
            getGeneratorLevels: () => ({
                solar: this.generators.find((generator) => generator.teamId === 'solar')?.level ?? 0,
                lunar: this.generators.find((generator) => generator.teamId === 'lunar')?.level ?? 0,
            }),
            getMultiplayerResyncCount: () => this.multiplayerResyncCount,
            isComputerOpponent: () => multiplayerSession.isComputerOpponent,
            getTerrainTextureKeys: () => this.terrainSprites.map((sprite) => sprite.texture.key),
            getBaseTextureKeys: () => ({
                solar: this.baseSprites.get('solar')?.texture.key ?? '',
                lunar: this.baseSprites.get('lunar')?.texture.key ?? '',
            }),
            getTowerTextureKeys: () => [...this.towerSprites.values()].map((sprite) => sprite.texture.key),
            getEnemyTextureKeys: () => [...this.enemySprites.values()].map((sprite) => sprite.texture.key),
            getBaseHealth: () => this.baseHealth,
            getElapsedMs: () => this.elapsedMs,
            isPaused: () => this.isPaused,
            getCurrentQuestionAnswer: () => this.panel.getCurrentQuestionAnswer(),
            getSpawnRate: () => this.spawnRate,
            setSpawnRate: (spawnRate: GameDifficulty) => this.setSpawnRate(spawnRate),
            getBaseDifficulty: () => this.baseDifficulty,
            setBaseDifficulty: (baseDifficulty: BaseMathsDifficulty) => this.setBaseDifficulty(baseDifficulty),
            getMobileAnswerMode: () => this.mobileAnswerMode,
            setMobileAnswerMode: (answerMode: MobileAnswerMode) => this.setMobileAnswerMode(answerMode),
            getMusicMuted: () => this.musicMuted,
            setMusicMuted: (muted: boolean) => this.setMusicMuted(muted),
            getMusicVolume: () => this.musicVolume,
            setMusicVolume: (volume: number) => this.setMusicVolume(volume),
            getDifficulty: () => this.spawnRate,
            setDifficulty: (difficulty: GameDifficulty) => this.setSpawnRate(difficulty),
            spawnEnemyNearBase: () => this.spawnEnemyNearBase(),
            openFirstBuildQuestion: () => {
                const cell = getFirstBuildableCell();
                if (!cell) {
                    return false;
                }
                this.panel.openBuild({ x: cell.x, y: cell.y }, { x: 0, y: 0 });
                this.render();
                return true;
            },
        };
        (window as unknown as { arithmeticAnnihilation: typeof hooks }).arithmeticAnnihilation = hooks;
    }

    private spawnEnemyNearBase(): void {
        const center = cellCenter(this.generatedMap.base, GAME_CONFIG.map);
        this.enemies.push({
            id: 900000 + this.enemies.length,
            type: 'scout',
            x: center.x - GAME_CONFIG.map.cellSize * 0.7,
            y: center.y,
            vx: 0,
            vy: 0,
            health: 10,
            maxHealth: 10,
            speed: 90,
            radius: 10,
            baseDamage: 4,
            hurtFlashMs: 0,
            lastProgressDistance: Number.POSITIVE_INFINITY,
            stalledSeconds: 0,
            panicSecondsRemaining: 0,
            panicStartDistance: Number.POSITIVE_INFINITY,
            isStuck: false,
            lastMoveSpeed: 0,
        });
    }
}
