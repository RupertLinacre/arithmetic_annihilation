import type { SeededRandom } from '../core/SeededRandom';
import type { MonsterGeneratorType, TowerDifficulty } from '../types';

export const MAX_MONSTER_GENERATOR_LEVEL = 16;

export interface MonsterMix {
    types: readonly MonsterGeneratorType[];
    weights: readonly number[];
    description: string;
}

export function getMonsterMix(level: number): MonsterMix {
    if (level <= 1) {
        return { types: ['scout'], weights: [1], description: 'Nibbles' };
    }
    if (level <= 3) {
        return { types: ['scout', 'grunt'], weights: [0.75, 0.25], description: 'Nibbles + Zappers' };
    }
    if (level <= 6) {
        return { types: ['scout', 'grunt', 'tank'], weights: [0.5, 0.38, 0.12], description: '+ Chompers' };
    }
    if (level <= 10) {
        return { types: ['scout', 'grunt', 'tank', 'titan'], weights: [0.32, 0.38, 0.24, 0.06], description: '+ Mega Moo' };
    }
    if (level <= 13) {
        return { types: ['scout', 'grunt', 'tank', 'titan'], weights: [0.2, 0.32, 0.34, 0.14], description: 'Heavy mixed wave' };
    }
    return { types: ['scout', 'grunt', 'tank', 'titan'], weights: [0.12, 0.24, 0.42, 0.22], description: 'Maximum pressure' };
}

export function chooseMonsterType(level: number, rng: Pick<SeededRandom, 'weightedChoice'>): MonsterGeneratorType {
    const mix = getMonsterMix(level);
    return rng.weightedChoice(mix.types, mix.weights);
}

export function getGeneratorSpawnPeriodMs(level: number): number {
    return 8000 / Math.max(1, Math.min(MAX_MONSTER_GENERATOR_LEVEL, level));
}

export function getGeneratorUpgradeDifficulty(level: number): TowerDifficulty {
    if (level <= 1) return 'easy';
    if (level <= 3) return 'medium';
    if (level <= 6) return 'hard';
    return 'veryHard';
}

export function getGeneratorHealthScale(level: number, type: MonsterGeneratorType): number {
    const levelScale = 1 + (Math.max(1, level) - 1) * 0.25;
    return type === 'titan' ? levelScale * 1.6 : levelScale;
}
