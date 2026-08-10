import { GAME_CONFIG } from '../config/gameConfig';
import { SeededRandom } from '../core/SeededRandom';
import { createEnemy, updateEnemy } from '../entities/Enemy';
import { canUpgradeTower, createTower, upgradeTower } from '../entities/Tower';
import { isBaseFootprintCell } from '../map/BaseFootprint';
import { cellCenter } from '../map/Grid';
import { hasLineOfSight } from '../map/LineOfSight';
import { generateMultiplayerMap, type GeneratedMap } from '../map/MapGenerator';
import { buildFlowField, type FlowField } from '../pathfinding/FlowField';
import { calculateTowerThreatCosts, createEmptyCostGrid, getTowerStats, type CostGrid } from '../pathfinding/ThreatMap';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TowerSystem } from '../systems/TowerSystem';
import type {
    EnemyState,
    GridPoint,
    MonsterGeneratorState,
    MonsterGeneratorTrack,
    ProjectileState,
    TeamId,
    TowerState,
    TowerType,
} from '../types';
import { getMultiplayerTowerQuestionValue, MULTIPLAYER_BASE_HEALTH } from './BalanceConfig';
import { getStrengthAdjustedSpawnPeriodMs, normalizePlayerStrength } from './PlayerStrength';
import {
    chooseMonsterType,
    getGeneratorDamageScale,
    getGeneratorHealthScale,
    getGeneratorQuestionValue,
    getGeneratorSpawnPeriodMs,
} from './MonsterGenerator';

export type CombatTowerType = Exclude<TowerType, 'wall' | 'airstrike'>;

export interface RealisticSelfPlayStrategy {
    name: string;
    offenseShare: number;
    advancedShare: number;
    minimumOffensePoints: number;
    minimumDefensePoints: number;
    maximumOffensePoints?: number;
    maximumDefensePoints?: number;
    newTowerShare: number;
    answerSeconds: number;
    weaponWeights: Partial<Record<CombatTowerType, number>>;
    strength?: number;
}

export interface RealisticSelfPlayResult {
    winner: TeamId | null;
    durationSeconds: number;
    baseHealth: Record<TeamId, number>;
    questionPoints: Record<TeamId, number>;
    offensePoints: Record<TeamId, number>;
    defensePoints: Record<TeamId, number>;
    generatorLevels: Record<TeamId, Record<MonsterGeneratorTrack, number>>;
    monstersSpawned: Record<TeamId, number>;
    monstersLeaked: Record<TeamId, number>;
    damageDealtByDefense: Record<TeamId, number>;
    peakAttackersAlive: Record<TeamId, number>;
    towers: Record<TeamId, Array<{ type: CombatTowerType; level: number }>>;
}

interface SimPlayer {
    teamId: TeamId;
    nextAnswerAtMs: number;
    questionPoints: number;
    offensePoints: number;
    defensePoints: number;
    monstersSpawned: number;
    monstersLeaked: number;
    damageDealtByDefense: number;
    peakAttackersAlive: number;
}

interface FlowState {
    flow: Record<TeamId, FlowField>;
    emergency: Record<TeamId, FlowField>;
}

const TEAMS: readonly TeamId[] = ['solar', 'lunar'];
const TRACKS: readonly MonsterGeneratorTrack[] = ['nibble', 'advanced'];
const COMBAT_TOWERS: readonly CombatTowerType[] = ['easy', 'spray', 'missile', 'flamethrower', 'cluster'];
const STEP_MS = 40;
const LANE_ROWS = [
    Math.floor(GAME_CONFIG.map.rows * 0.3),
    Math.floor(GAME_CONFIG.map.rows / 2),
    Math.floor(GAME_CONFIG.map.rows * 0.72),
];

function opponentOf(teamId: TeamId): TeamId {
    return teamId === 'solar' ? 'lunar' : 'solar';
}

function createPlayer(teamId: TeamId, initialAnswerAtMs: number): SimPlayer {
    return {
        teamId,
        nextAnswerAtMs: initialAnswerAtMs,
        questionPoints: 0,
        offensePoints: 0,
        defensePoints: 0,
        monstersSpawned: 0,
        monstersLeaked: 0,
        damageDealtByDefense: 0,
        peakAttackersAlive: 0,
    };
}

function rebuildFlows(map: GeneratedMap, towers: readonly TowerState[]): FlowState {
    const threat = Object.fromEntries(TEAMS.map((teamId) => [
        teamId,
        calculateTowerThreatCosts(map.grid, towers.filter((tower) => tower.teamId === teamId), GAME_CONFIG.map),
    ])) as Record<TeamId, CostGrid>;
    const flow = Object.fromEntries(TEAMS.map((teamId) => [
        teamId,
        buildFlowField(map.grid, map.bases![teamId], threat[teamId]),
    ])) as Record<TeamId, FlowField>;
    const emergency = Object.fromEntries(TEAMS.map((teamId) => [
        teamId,
        buildFlowField(map.grid, map.bases![teamId], createEmptyCostGrid(map.grid)),
    ])) as Record<TeamId, FlowField>;
    return { flow, emergency };
}

function traceAttackPaths(map: GeneratedMap, targetTeam: TeamId, flow: FlowField): Array<{ x: number; y: number }> {
    const attackerTeam = opponentOf(targetTeam);
    const samples: Array<{ x: number; y: number }> = [];
    for (const [laneIndex, row] of LANE_ROWS.entries()) {
        const start = cellCenter({ x: map.bases![attackerTeam].x, y: row }, GAME_CONFIG.map);
        const enemy = createEnemy(laneIndex + 1, 'scout', start.x, start.y, 1, attackerTeam);
        for (let elapsedMs = 0; elapsedMs < 24_000; elapsedMs += 100) {
            samples.push({ x: enemy.x, y: enemy.y });
            if (updateEnemy(enemy, 0.1, flow, flow, map.grid, GAME_CONFIG.map, [enemy])) break;
        }
    }
    return samples;
}

function weightedTowerChoice(strategy: RealisticSelfPlayStrategy, rng: SeededRandom): CombatTowerType {
    return rng.weightedChoice(COMBAT_TOWERS, COMBAT_TOWERS.map((type) => strategy.weaponWeights[type] ?? 0));
}

function chooseTowerCell(
    map: GeneratedMap,
    teamId: TeamId,
    towerType: CombatTowerType,
    occupied: ReadonlySet<string>,
    pathSamples: readonly { x: number; y: number }[],
): GridPoint | undefined {
    const stats = getTowerStats({ type: towerType, level: 1, teamId });
    const midpoint = map.grid.cols / 2;
    let best: { cell: GridPoint; score: number } | undefined;
    map.grid.forEachCell((x, y) => {
        const cell = { x, y };
        const onOwnHalf = teamId === 'solar' ? x < midpoint : x >= midpoint;
        if (!onOwnHalf || !map.grid.isBuildable(x, y) || occupied.has(`${x},${y}`)
            || TEAMS.some((candidate) => isBaseFootprintCell(map.bases![candidate], cell, map.grid))) return;
        const center = cellCenter(cell, GAME_CONFIG.map);
        const coverage = pathSamples.reduce((sum, point) => {
            const distance = Math.hypot(point.x - center.x, point.y - center.y);
            if (distance > stats.range || !hasLineOfSight(map.grid, center, point, GAME_CONFIG.map)) return sum;
            return sum + 1 - distance / stats.range * 0.42;
        }, 0);
        const base = cellCenter(map.bases![teamId], GAME_CONFIG.map);
        const baseDistance = Math.hypot(center.x - base.x, center.y - base.y);
        const score = coverage - baseDistance / (GAME_CONFIG.map.cellSize * 80);
        if (!best || score > best.score) best = { cell, score };
    });
    return best?.cell;
}

function chooseOffenseTrack(strategy: RealisticSelfPlayStrategy, rng: SeededRandom): MonsterGeneratorTrack {
    return rng.chance(strategy.advancedShare) ? 'advanced' : 'nibble';
}

function shouldInvestInOffense(player: SimPlayer, strategy: RealisticSelfPlayStrategy, rng: SeededRandom): boolean {
    if (player.offensePoints < strategy.minimumOffensePoints) return true;
    if (player.defensePoints < strategy.minimumDefensePoints) return false;
    const total = player.offensePoints + player.defensePoints;
    const currentShare = total === 0 ? 0 : player.offensePoints / total;
    return currentShare < strategy.offenseShare + (rng.next() - 0.5) * 0.08;
}

function addGeneratorUpgrade(
    player: SimPlayer,
    track: MonsterGeneratorTrack,
    generators: MonsterGeneratorState[],
    strength: number,
): 1 | 2 {
    const generator = generators.find((candidate) => candidate.teamId === player.teamId && candidate.track === track)!;
    const wasOff = generator.level === 0;
    generator.level += 1;
    if (wasOff) generator.progress = normalizePlayerStrength(strength);
    const value = getGeneratorQuestionValue(track);
    player.offensePoints += value;
    player.questionPoints += value;
    return value;
}

function addTowerInvestment(
    player: SimPlayer,
    strategy: RealisticSelfPlayStrategy,
    rng: SeededRandom,
    map: GeneratedMap,
    towers: TowerState[],
    flow: FlowField,
    nextTowerId: () => number,
): 1 | 2 {
    const towerType = weightedTowerChoice(strategy, rng);
    const sameType = towers.filter((tower) => tower.teamId === player.teamId && tower.type === towerType);
    const upgradable = sameType.filter(canUpgradeTower).sort((a, b) => a.level - b.level || a.id - b.id);
    const shouldBuild = sameType.length === 0 || upgradable.length === 0 || rng.chance(strategy.newTowerShare);
    if (shouldBuild) {
        const occupied = new Set(towers.map((tower) => `${tower.gridX},${tower.gridY}`));
        const cell = chooseTowerCell(map, player.teamId, towerType, occupied, traceAttackPaths(map, player.teamId, flow));
        if (cell) towers.push(createTower(nextTowerId(), cell.x, cell.y, towerType, player.teamId));
        else if (upgradable[0]) upgradeTower(upgradable[0]);
    } else {
        upgradeTower(upgradable[0]);
    }
    const value = getMultiplayerTowerQuestionValue(towerType);
    player.defensePoints += value;
    player.questionPoints += value;
    return value;
}

export function simulateRealisticSelfPlay(
    seed: number | string,
    strategies: Readonly<Record<TeamId, RealisticSelfPlayStrategy>>,
    maximumSeconds = 8 * 60,
): RealisticSelfPlayResult {
    const seedNumber = typeof seed === 'number' ? seed : SeededRandom.hash(seed);
    const map = generateMultiplayerMap(seedNumber);
    const rng = new SeededRandom(`${seed}:decisions`);
    const spawnRng = new SeededRandom(`${seed}:spawns`);
    const players: Record<TeamId, SimPlayer> = {
        solar: createPlayer('solar', rng.next() * 1_500),
        lunar: createPlayer('lunar', rng.next() * 1_500),
    };
    const generators = TEAMS.flatMap((teamId) => TRACKS.map((track) => ({ teamId, track, level: 0, progress: 0, spawnCount: 0 })));
    const baseHealth: Record<TeamId, number> = { solar: MULTIPLAYER_BASE_HEALTH, lunar: MULTIPLAYER_BASE_HEALTH };
    let towers: TowerState[] = [];
    let enemies: EnemyState[] = [];
    let projectiles: ProjectileState[] = [];
    let flows = rebuildFlows(map, towers);
    let nextEnemyId = 1;
    let nextTowerIdValue = 1;
    const towerSystem = new TowerSystem();
    const projectileSystem = new ProjectileSystem();

    const spawnEnemy = (generator: MonsterGeneratorState) => {
        const monsterType = chooseMonsterType(generator.track, generator.level, spawnRng);
        const enemyType = monsterType === 'titan' ? 'tank' : monsterType;
        const lane = spawnRng.choice(LANE_ROWS);
        const origin = cellCenter({ x: map.bases![generator.teamId].x, y: lane }, GAME_CONFIG.map);
        const jitter = GAME_CONFIG.map.cellSize * 0.12;
        const enemy = createEnemy(
            nextEnemyId++,
            enemyType,
            origin.x + (spawnRng.next() - 0.5) * jitter,
            origin.y + (spawnRng.next() - 0.5) * jitter,
            getGeneratorHealthScale(generator.track, monsterType),
            generator.teamId,
        );
        enemy.baseDamage *= getGeneratorDamageScale(generator.track, monsterType);
        enemies.push(enemy);
        generator.spawnCount += 1;
        players[generator.teamId].monstersSpawned += 1;
    };

    let elapsedMs = 0;
    for (; elapsedMs < maximumSeconds * 1000 && TEAMS.every((teamId) => baseHealth[teamId] > 0); elapsedMs += STEP_MS) {
        let flowsDirty = false;
        for (const teamId of TEAMS) {
            const player = players[teamId];
            while (player.nextAnswerAtMs <= elapsedMs) {
                const strategy = strategies[teamId];
                const canInvestInOffense = player.offensePoints < (strategy.maximumOffensePoints ?? Number.POSITIVE_INFINITY);
                const canInvestInDefense = player.defensePoints < (strategy.maximumDefensePoints ?? Number.POSITIVE_INFINITY);
                if (!canInvestInOffense && !canInvestInDefense) {
                    player.nextAnswerAtMs = Number.POSITIVE_INFINITY;
                    break;
                }
                const offense = canInvestInOffense && (!canInvestInDefense || shouldInvestInOffense(player, strategy, rng));
                const value = offense
                    ? addGeneratorUpgrade(player, chooseOffenseTrack(strategy, rng), generators, strategy.strength ?? 1)
                    : addTowerInvestment(player, strategy, rng, map, towers, flows.flow[player.teamId], () => nextTowerIdValue++);
                flowsDirty ||= !offense;
                const difficultyMultiplier = value === 2 ? 1.45 : 1;
                player.nextAnswerAtMs += strategy.answerSeconds * 1000 * difficultyMultiplier * (0.86 + rng.next() * 0.28);
            }
        }
        if (flowsDirty) flows = rebuildFlows(map, towers);

        for (const generator of generators) {
            if (generator.level <= 0) continue;
            generator.progress += STEP_MS / getStrengthAdjustedSpawnPeriodMs(
                getGeneratorSpawnPeriodMs(generator.track, generator.level),
                strategies[generator.teamId].strength ?? 1,
            );
            while (generator.progress >= 1) {
                generator.progress -= 1;
                spawnEnemy(generator);
            }
        }

        const survivors: EnemyState[] = [];
        for (const enemy of enemies) {
            if (enemy.health <= 0 || enemy.teamId === undefined) continue;
            const targetTeam = opponentOf(enemy.teamId);
            const reachedBase = updateEnemy(
                enemy,
                STEP_MS / 1000,
                flows.flow[targetTeam],
                flows.emergency[targetTeam],
                map.grid,
                GAME_CONFIG.map,
                enemies,
            );
            if (reachedBase) {
                baseHealth[targetTeam] = Math.max(0, baseHealth[targetTeam] - enemy.baseDamage);
                players[enemy.teamId].monstersLeaked += 1;
            } else {
                survivors.push(enemy);
            }
        }
        enemies = survivors;

        for (const teamId of TEAMS) {
            players[teamId].peakAttackersAlive = Math.max(
                players[teamId].peakAttackersAlive,
                enemies.filter((enemy) => enemy.teamId === teamId).length,
            );
        }

        const healthBefore = Object.fromEntries(TEAMS.map((teamId) => [
            teamId,
            enemies.filter((enemy) => enemy.teamId === teamId).reduce((sum, enemy) => sum + Math.max(0, enemy.health), 0),
        ])) as Record<TeamId, number>;
        const towerResult = towerSystem.update(
            STEP_MS,
            towers,
            enemies,
            map.grid,
            GAME_CONFIG.map,
            (tower) => flows.flow[tower.teamId!],
            (teamId) => strategies[teamId].strength ?? 1,
        );
        projectiles.push(...towerResult.projectiles);
        projectiles = projectileSystem.update(STEP_MS, projectiles, enemies, map.grid, GAME_CONFIG.map).projectiles;
        const healthAfter = Object.fromEntries(TEAMS.map((teamId) => [
            teamId,
            enemies.filter((enemy) => enemy.teamId === teamId).reduce((sum, enemy) => sum + Math.max(0, enemy.health), 0),
        ])) as Record<TeamId, number>;
        for (const attackingTeam of TEAMS) {
            players[opponentOf(attackingTeam)].damageDealtByDefense += Math.max(0, healthBefore[attackingTeam] - healthAfter[attackingTeam]);
        }
        enemies = enemies.filter((enemy) => enemy.health > 0);
    }

    const winner = baseHealth.solar <= 0 && baseHealth.lunar <= 0
        ? null
        : baseHealth.solar <= 0 ? 'lunar' : baseHealth.lunar <= 0 ? 'solar' : null;
    const generatorLevels = Object.fromEntries(TEAMS.map((teamId) => [teamId, Object.fromEntries(TRACKS.map((track) => [
        track,
        generators.find((generator) => generator.teamId === teamId && generator.track === track)!.level,
    ]))])) as Record<TeamId, Record<MonsterGeneratorTrack, number>>;
    const towerReport = Object.fromEntries(TEAMS.map((teamId) => [teamId, towers
        .filter((tower) => tower.teamId === teamId && tower.type !== 'wall' && tower.type !== 'airstrike')
        .map((tower) => ({ type: tower.type as CombatTowerType, level: tower.level }))])) as RealisticSelfPlayResult['towers'];

    return {
        winner,
        durationSeconds: Math.min(maximumSeconds, elapsedMs / 1000),
        baseHealth,
        questionPoints: { solar: players.solar.questionPoints, lunar: players.lunar.questionPoints },
        offensePoints: { solar: players.solar.offensePoints, lunar: players.lunar.offensePoints },
        defensePoints: { solar: players.solar.defensePoints, lunar: players.lunar.defensePoints },
        generatorLevels,
        monstersSpawned: { solar: players.solar.monstersSpawned, lunar: players.lunar.monstersSpawned },
        monstersLeaked: { solar: players.solar.monstersLeaked, lunar: players.lunar.monstersLeaked },
        damageDealtByDefense: { solar: players.solar.damageDealtByDefense, lunar: players.lunar.damageDealtByDefense },
        peakAttackersAlive: { solar: players.solar.peakAttackersAlive, lunar: players.lunar.peakAttackersAlive },
        towers: towerReport,
    };
}

export const DEFAULT_REALISTIC_STRATEGIES = {
    balanced: {
        name: 'balanced', offenseShare: 0.5, advancedShare: 0.4, minimumOffensePoints: 1, minimumDefensePoints: 1,
        newTowerShare: 0.3, answerSeconds: 8, weaponWeights: { easy: 1, spray: 1, missile: 0.7, flamethrower: 1, cluster: 0.7 },
    },
    offenseHeavy: {
        name: 'offense-heavy', offenseShare: 0.72, advancedShare: 0.45, minimumOffensePoints: 1, minimumDefensePoints: 2,
        newTowerShare: 0.28, answerSeconds: 8, weaponWeights: { easy: 1, spray: 1, missile: 0.7, flamethrower: 1, cluster: 0.7 },
    },
    defenseHeavy: {
        name: 'defense-heavy', offenseShare: 0.28, advancedShare: 0.4, minimumOffensePoints: 2, minimumDefensePoints: 1,
        newTowerShare: 0.32, answerSeconds: 8, weaponWeights: { easy: 1, spray: 1, missile: 0.7, flamethrower: 1, cluster: 0.7 },
    },
} satisfies Record<string, RealisticSelfPlayStrategy>;

export function singleWeaponStrategy(type: CombatTowerType, offenseShare = 0.5): RealisticSelfPlayStrategy {
    return {
        ...DEFAULT_REALISTIC_STRATEGIES.balanced,
        name: `${type}-${offenseShare}`,
        offenseShare,
        weaponWeights: { [type]: 1 },
    };
}
