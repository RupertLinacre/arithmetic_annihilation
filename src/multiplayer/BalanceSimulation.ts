import { ENEMY_STATS } from '../config/gameConfig';
import { SeededRandom } from '../core/SeededRandom';
import type { MonsterGeneratorTrack } from '../types';
import { DEFENSE_DAMAGE_PER_MINUTE_PER_POINT } from './BalanceConfig';
import {
    chooseMonsterType,
    getGeneratorHealthScale,
    getGeneratorSpawnPeriodMs,
    getGeneratorQuestionValue,
    MAX_MONSTER_GENERATOR_LEVEL,
} from './MonsterGenerator';

export interface SelfPlayStrategy {
    name: string;
    offenseShare: number;
    advancedShare: number;
    highTowerShare: number;
    utilization: number;
    answerSeconds: number;
}

export interface SelfPlayResult {
    winner: 0 | 1 | null;
    durationSeconds: number;
    baseHealth: [number, number];
    questionValue: [number, number];
    offensePoints: [number, number];
    defensePoints: [number, number];
    monstersSpawned: [number, number];
    leakedHealth: [number, number];
}

interface MonsterBatch {
    health: number;
    engageAt: number;
    baseAt: number;
}

interface SimPlayer {
    baseHealth: number;
    nextAnswerAt: number;
    questionValue: number;
    offensePoints: number;
    defensePoints: number;
    generatorLevels: Record<MonsterGeneratorTrack, number>;
    generatorProgress: Record<MonsterGeneratorTrack, number>;
    incoming: MonsterBatch[];
    monstersSpawned: number;
    leakedHealth: number;
}

const STEP_SECONDS = 0.25;
const SPAWN_TO_ENGAGEMENT_SECONDS = 7;
const DEFENSE_WINDOW_SECONDS = 12;
const BASE_DAMAGE_PER_MONSTER_HEALTH = 0.065;

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.max(minimum, Math.min(maximum, value));
}

function createPlayer(initialAnswerOffset: number): SimPlayer {
    return {
        baseHealth: 100,
        nextAnswerAt: initialAnswerOffset,
        questionValue: 0,
        offensePoints: 0,
        defensePoints: 0,
        generatorLevels: { nibble: 0, advanced: 0 },
        generatorProgress: { nibble: 0, advanced: 0 },
        incoming: [],
        monstersSpawned: 0,
        leakedHealth: 0,
    };
}

function chooseInvestment(player: SimPlayer, strategy: SelfPlayStrategy, rng: SeededRandom): { offense: boolean; value: 1 | 2; track?: MonsterGeneratorTrack } {
    const totalPoints = player.offensePoints + player.defensePoints;
    const currentOffenseShare = totalPoints === 0 ? 0 : player.offensePoints / totalPoints;
    const pressureAdjustment = (100 - player.baseHealth) / 100 * 0.08;
    const targetOffenseShare = clamp(strategy.offenseShare - pressureAdjustment, 0.35, 0.68);
    const offense = currentOffenseShare < targetOffenseShare + (rng.next() - 0.5) * 0.08;

    if (offense) {
        const wantsAdvanced = rng.next() < strategy.advancedShare;
        const preferredTrack: MonsterGeneratorTrack = wantsAdvanced ? 'advanced' : 'nibble';
        const fallbackTrack: MonsterGeneratorTrack = wantsAdvanced ? 'nibble' : 'advanced';
        const track = player.generatorLevels[preferredTrack] < MAX_MONSTER_GENERATOR_LEVEL ? preferredTrack : fallbackTrack;
        if (player.generatorLevels[track] < MAX_MONSTER_GENERATOR_LEVEL) {
            return { offense: true, value: getGeneratorQuestionValue(track), track };
        }
    }

    const highTower = rng.next() < strategy.highTowerShare;
    return { offense: false, value: highTower ? 2 : 1 };
}

function answerQuestion(player: SimPlayer, strategy: SelfPlayStrategy, rng: SeededRandom): void {
    const investment = chooseInvestment(player, strategy, rng);
    player.questionValue += investment.value;
    if (investment.offense && investment.track) {
        player.offensePoints += investment.value;
        player.generatorLevels[investment.track] += 1;
    } else {
        player.defensePoints += investment.value;
    }
    const difficultyTimeMultiplier = investment.value === 2 ? 1.45 : 1;
    player.nextAnswerAt += strategy.answerSeconds * difficultyTimeMultiplier * (0.86 + rng.next() * 0.28);
}

function spawnMonsters(attacker: SimPlayer, defender: SimPlayer, now: number, deltaSeconds: number, rng: SeededRandom): void {
    for (const track of ['nibble', 'advanced'] as MonsterGeneratorTrack[]) {
        const level = attacker.generatorLevels[track];
        if (level <= 0) {
            continue;
        }
        const periodSeconds = getGeneratorSpawnPeriodMs(track, level) / 1000;
        attacker.generatorProgress[track] += deltaSeconds / periodSeconds;
        while (attacker.generatorProgress[track] >= 1) {
            attacker.generatorProgress[track] -= 1;
            const monsterType = chooseMonsterType(track, level, rng);
            const enemyType = monsterType === 'titan' ? 'tank' : monsterType;
            const health = ENEMY_STATS[enemyType].health * getGeneratorHealthScale(track, monsterType);
            defender.incoming.push({
                health,
                engageAt: now + SPAWN_TO_ENGAGEMENT_SECONDS,
                baseAt: now + SPAWN_TO_ENGAGEMENT_SECONDS + DEFENSE_WINDOW_SECONDS,
            });
            attacker.monstersSpawned += 1;
        }
    }
}

function defend(player: SimPlayer, strategy: SelfPlayStrategy, now: number, deltaSeconds: number, rng: SeededRandom, defenseScale: number): void {
    player.incoming.sort((a, b) => a.baseAt - b.baseAt);
    const active = player.incoming.filter((batch) => batch.engageAt <= now && batch.baseAt > now && batch.health > 0);
    const momentaryUtilization = clamp(strategy.utilization + (rng.next() - 0.5) * 0.16, 0.55, 0.96);
    let damageCapacity = player.defensePoints * DEFENSE_DAMAGE_PER_MINUTE_PER_POINT / 60 * momentaryUtilization * defenseScale * deltaSeconds;
    for (const batch of active) {
        if (damageCapacity <= 0) {
            break;
        }
        const damage = Math.min(batch.health, damageCapacity);
        batch.health -= damage;
        damageCapacity -= damage;
    }

    for (const batch of player.incoming) {
        if (batch.health <= 0 || batch.baseAt > now) {
            continue;
        }
        player.leakedHealth += batch.health;
        player.baseHealth = Math.max(0, player.baseHealth - batch.health * BASE_DAMAGE_PER_MONSTER_HEALTH);
        batch.health = 0;
    }
    player.incoming = player.incoming.filter((batch) => batch.health > 0);
}

export function simulateSelfPlay(
    seed: string,
    strategies: readonly [SelfPlayStrategy, SelfPlayStrategy],
    maximumSeconds = 15 * 60,
    defenseScales: readonly [number, number] = [1, 1],
): SelfPlayResult {
    const rng = new SeededRandom(seed);
    const players: [SimPlayer, SimPlayer] = [createPlayer(rng.next() * 2), createPlayer(rng.next() * 2)];
    let now = 0;
    for (; now < maximumSeconds && players.every((player) => player.baseHealth > 0); now += STEP_SECONDS) {
        for (let index = 0; index < players.length; index += 1) {
            const player = players[index];
            while (player.nextAnswerAt <= now) {
                answerQuestion(player, strategies[index], rng);
            }
        }
        spawnMonsters(players[0], players[1], now, STEP_SECONDS, rng);
        spawnMonsters(players[1], players[0], now, STEP_SECONDS, rng);
        defend(players[0], strategies[0], now, STEP_SECONDS, rng, defenseScales[0]);
        defend(players[1], strategies[1], now, STEP_SECONDS, rng, defenseScales[1]);
    }

    const winner = players[0].baseHealth <= 0 && players[1].baseHealth <= 0
        ? null
        : players[0].baseHealth <= 0 ? 1 : players[1].baseHealth <= 0 ? 0 : null;
    return {
        winner,
        durationSeconds: Math.min(now, maximumSeconds),
        baseHealth: [players[0].baseHealth, players[1].baseHealth],
        questionValue: [players[0].questionValue, players[1].questionValue],
        offensePoints: [players[0].offensePoints, players[1].offensePoints],
        defensePoints: [players[0].defensePoints, players[1].defensePoints],
        monstersSpawned: [players[0].monstersSpawned, players[1].monstersSpawned],
        leakedHealth: [players[0].leakedHealth, players[1].leakedHealth],
    };
}
