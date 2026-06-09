import { describe, expect, it } from 'vitest';
import { SeededRandom } from '../../src/core/SeededRandom';
import { canUpgradeTower, createTower, getMaxTowerLevel, getUpgradeQuestionDifficulty, upgradeTower } from '../../src/entities/Tower';
import { mapTowerDifficultyToYearLevel, MathsQuestionSystem, normalizeBaseMathsDifficulty } from '../../src/systems/MathsQuestionSystem';

describe('maths questions and upgrades', () => {
    it('uses the required upgrade difficulty progression for each tower type', () => {
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 2)).toBe('easy');
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 3)).toBe('easy');
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 4)).toBe('medium');
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 6)).toBe('hard');
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 8)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'easy' }, 16)).toBe('veryHard');

        expect(getUpgradeQuestionDifficulty({ type: 'spray' }, 2)).toBe('medium');
        expect(getUpgradeQuestionDifficulty({ type: 'spray' }, 5)).toBe('hard');
        expect(getUpgradeQuestionDifficulty({ type: 'spray' }, 8)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'spray' }, 16)).toBe('veryHard');

        expect(getUpgradeQuestionDifficulty({ type: 'missile' }, 2)).toBe('hard');
        expect(getUpgradeQuestionDifficulty({ type: 'missile' }, 5)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'missile' }, 16)).toBe('veryHard');

        expect(getUpgradeQuestionDifficulty({ type: 'flamethrower' }, 2)).toBe('hard');
        expect(getUpgradeQuestionDifficulty({ type: 'flamethrower' }, 5)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'flamethrower' }, 16)).toBe('veryHard');

        expect(getUpgradeQuestionDifficulty({ type: 'cluster' }, 2)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'cluster' }, 8)).toBe('veryHard');
        expect(getUpgradeQuestionDifficulty({ type: 'cluster' }, 16)).toBe('veryHard');
    });

    it('allows combat towers to upgrade through level 16', () => {
        const combatTowerTypes = ['easy', 'spray', 'missile', 'flamethrower', 'cluster'] as const;

        for (const towerType of combatTowerTypes) {
            const tower = createTower(1, 0, 0, towerType);

            while (canUpgradeTower(tower)) {
                expect(upgradeTower(tower)).toBe(true);
            }

            expect(getMaxTowerLevel(towerType)).toBe(16);
            expect(tower.level).toBe(16);
            expect(canUpgradeTower(tower)).toBe(false);
            expect(upgradeTower(tower)).toBe(false);
        }
    });

    it('maps tower question difficulty onto capped school year levels', () => {
        expect(mapTowerDifficultyToYearLevel('easy', 'year2')).toBe('year2');
        expect(mapTowerDifficultyToYearLevel('medium', 'year2')).toBe('year3');
        expect(mapTowerDifficultyToYearLevel('hard', 'year2')).toBe('year4');
        expect(mapTowerDifficultyToYearLevel('veryHard', 'year2')).toBe('year5');
        expect(mapTowerDifficultyToYearLevel('veryHard', 'year5')).toBe('year6');
    });

    it('normalizes supported base maths levels', () => {
        expect(normalizeBaseMathsDifficulty('reception')).toBe('reception');
        expect(normalizeBaseMathsDifficulty('year3')).toBe('year3');
        expect(normalizeBaseMathsDifficulty('adultLevel1')).toBeUndefined();
        expect(normalizeBaseMathsDifficulty('not-real')).toBeUndefined();
    });

    it('generates four unique multiple-choice answers including the correct answer', () => {
        const system = new MathsQuestionSystem(new SeededRandom(42), 'year3');
        const question = system.createQuestion('hard');
        expect(question.choices).toHaveLength(4);
        expect(new Set(question.choices).size).toBe(4);
        expect(question.choices).toContain(question.correctAnswer);
        expect(question.expression.length).toBeGreaterThan(0);
        expect(question.yearLevel).toBe('year5');
    });
});
