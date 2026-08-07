import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../src/core/SeededRandom';
import {
    chooseMonsterType,
    getGeneratorHealthScale,
    getGeneratorSpawnPeriodMs,
    getGeneratorUpgradeDifficulty,
    getMonsterMix,
} from '../../src/multiplayer/MonsterGenerator';

describe('multiplayer monster generator progression', () => {
    it('starts with Nibbles and progressively unlocks every monster tier', () => {
        expect(getMonsterMix(1).types).toEqual(['scout']);
        expect(getMonsterMix(2).types).toEqual(['scout', 'grunt']);
        expect(getMonsterMix(4).types).toEqual(['scout', 'grunt', 'tank']);
        expect(getMonsterMix(7).types).toEqual(['scout', 'grunt', 'tank', 'titan']);
    });

    it('spawns faster, raises health, and asks harder questions as it is upgraded', () => {
        expect(getGeneratorSpawnPeriodMs(1)).toBe(8000);
        expect(getGeneratorSpawnPeriodMs(16)).toBe(500);
        expect(getGeneratorHealthScale(5, 'tank')).toBe(2);
        expect(getGeneratorHealthScale(5, 'titan')).toBe(3.2);
        expect([0, 2, 4, 7].map(getGeneratorUpgradeDifficulty)).toEqual(['easy', 'medium', 'hard', 'veryHard']);
    });

    it('chooses deterministically from the unlocked mix', () => {
        const first = new SeededRandom('generator-test');
        const second = new SeededRandom('generator-test');
        const firstRun = Array.from({ length: 20 }, () => chooseMonsterType(12, first));
        const secondRun = Array.from({ length: 20 }, () => chooseMonsterType(12, second));
        expect(firstRun).toEqual(secondRun);
        expect(new Set(firstRun).size).toBeGreaterThan(1);
    });
});
