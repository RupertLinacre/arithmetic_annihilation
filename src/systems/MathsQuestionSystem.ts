import { generateProblem, getYearLevels } from 'maths-game-problem-generator';
import { SeededRandom } from '../core/SeededRandom';
import type { MathsQuestion, TowerDifficulty } from '../types';

const TOWER_DIFFICULTY_OFFSETS: Record<TowerDifficulty, number> = {
    easy: 0,
    medium: 1,
    hard: 2,
    veryHard: 3,
};

export const BASE_MATHS_DIFFICULTIES = getYearLevels() as readonly BaseMathsDifficulty[];

export type BaseMathsDifficulty = 'reception' | 'year1' | 'year2' | 'year3' | 'year4' | 'year5' | 'year6';

export const BASE_MATHS_DIFFICULTY_LABELS: Record<BaseMathsDifficulty, string> = {
    reception: 'Reception',
    year1: 'Year 1',
    year2: 'Year 2',
    year3: 'Year 3',
    year4: 'Year 4',
    year5: 'Year 5',
    year6: 'Year 6',
};

export function normalizeBaseMathsDifficulty(value: string): BaseMathsDifficulty | undefined {
    return BASE_MATHS_DIFFICULTIES.includes(value as BaseMathsDifficulty)
        ? value as BaseMathsDifficulty
        : undefined;
}

export function mapTowerDifficultyToYearLevel(
    difficulty: TowerDifficulty,
    baseDifficulty: BaseMathsDifficulty = 'year3',
): BaseMathsDifficulty {
    const baseIndex = BASE_MATHS_DIFFICULTIES.indexOf(baseDifficulty);
    const mappedIndex = Math.min(BASE_MATHS_DIFFICULTIES.length - 1, baseIndex + TOWER_DIFFICULTY_OFFSETS[difficulty]);
    return BASE_MATHS_DIFFICULTIES[mappedIndex];
}

export class MathsQuestionSystem {
    private lastExpression: string | undefined;

    constructor(
        private readonly rng: SeededRandom,
        private baseDifficulty: BaseMathsDifficulty = 'year3',
    ) {}

    setBaseDifficulty(baseDifficulty: BaseMathsDifficulty): void {
        this.baseDifficulty = baseDifficulty;
        this.lastExpression = undefined;
    }

    createQuestion(difficulty: TowerDifficulty): MathsQuestion {
        const yearLevel = mapTowerDifficultyToYearLevel(difficulty, this.baseDifficulty);
        let problem = generateProblem({ yearLevel, multipleChoice: true, choiceCount: 4 });

        for (let attempt = 0; attempt < 4 && problem.expression === this.lastExpression; attempt += 1) {
            problem = generateProblem({ yearLevel, multipleChoice: true, choiceCount: 4 });
        }

        this.lastExpression = problem.expression;

        return {
            id: `${yearLevel}:${problem.type}:${Math.floor(this.rng.next() * 1000000)}`,
            difficulty,
            yearLevel,
            expression: problem.expression,
            expressionShort: problem.expression_short,
            correctAnswer: problem.correctChoice,
            choices: this.rng.shuffle(problem.choices),
        };
    }
}
