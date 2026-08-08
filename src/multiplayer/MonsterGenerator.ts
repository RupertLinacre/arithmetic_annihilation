import { ENEMY_STATS } from '../config/gameConfig';
import type { SeededRandom } from '../core/SeededRandom';
import { OFFENSE_HEALTH_PER_MINUTE_PER_POINT } from './BalanceConfig';
import type { MonsterGeneratorTrack, MonsterGeneratorType, TowerDifficulty } from '../types';

export const MAX_MONSTER_GENERATOR_LEVEL = 16;
export const WRONG_ANSWER_NIBBLE_LEVEL_MULTIPLIER = 1 / 3;

export interface MonsterMix {
    types: readonly MonsterGeneratorType[];
    weights: readonly number[];
    description: string;
}

export function getGeneratorQuestionValue(track: MonsterGeneratorTrack): 1 | 2 {
    return track === 'nibble' ? 1 : 2;
}

export function getWrongAnswerNibbleLevelIncrease(questionValue: 1 | 2): number {
    return questionValue * WRONG_ANSWER_NIBBLE_LEVEL_MULTIPLIER;
}

export function getGeneratorUpgradeDifficulty(track: MonsterGeneratorTrack): TowerDifficulty {
    return track === 'nibble' ? 'easy' : 'medium';
}

export function getMonsterMix(track: MonsterGeneratorTrack, level: number): MonsterMix {
    if (track === 'nibble') {
        return { types: ['scout'], weights: [1], description: 'Nibbles only' };
    }
    if (level <= 2) {
        return { types: ['grunt'], weights: [1], description: 'Zappers' };
    }
    if (level <= 5) {
        return { types: ['grunt', 'tank'], weights: [0.72, 0.28], description: 'Zappers + Chompers' };
    }
    if (level <= 8) {
        return { types: ['grunt', 'tank', 'titan'], weights: [0.48, 0.4, 0.12], description: '+ Mega Moo' };
    }
    return { types: ['grunt', 'tank', 'titan'], weights: [0.28, 0.48, 0.24], description: 'Heavy mixed wave' };
}

export function chooseMonsterType(
    track: MonsterGeneratorTrack,
    level: number,
    rng: Pick<SeededRandom, 'weightedChoice'>,
): MonsterGeneratorType {
    const mix = getMonsterMix(track, level);
    return rng.weightedChoice(mix.types, mix.weights);
}

export function getGeneratorHealthScale(_track: MonsterGeneratorTrack, type: MonsterGeneratorType): number {
    return type === 'titan' ? 1.6 : 1;
}

export function getGeneratorDamageScale(track: MonsterGeneratorTrack, type: MonsterGeneratorType): number {
    return getGeneratorHealthScale(track, type);
}

export function getExpectedMonsterHealth(track: MonsterGeneratorTrack, level: number): number {
    const mix = getMonsterMix(track, level);
    return mix.types.reduce((total, type, index) => {
        const enemyType = type === 'titan' ? 'tank' : type;
        return total + ENEMY_STATS[enemyType].health * getGeneratorHealthScale(track, type) * mix.weights[index];
    }, 0);
}

export function getGeneratorHealthPerMinute(track: MonsterGeneratorTrack, level: number): number {
    return Math.max(0, level) * getGeneratorQuestionValue(track) * OFFENSE_HEALTH_PER_MINUTE_PER_POINT;
}

export function getGeneratorSpawnPeriodMs(track: MonsterGeneratorTrack, level: number): number {
    const healthPerMinute = getGeneratorHealthPerMinute(track, level);
    if (healthPerMinute <= 0) {
        return Number.POSITIVE_INFINITY;
    }
    return getExpectedMonsterHealth(track, level) * 60_000 / healthPerMinute;
}
