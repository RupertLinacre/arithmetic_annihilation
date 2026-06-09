declare module 'maths-game-problem-generator' {
    export interface GenerateProblemOptions {
        yearLevel?: string;
        type?: string | null;
        multipleChoice?: boolean;
        choiceCount?: number;
    }

    export interface GeneratedMathsProblem {
        expression: string;
        expression_short: string;
        answer: number;
        formattedAnswer: string;
        type: string;
        yearLevel: string;
        choices?: string[];
        correctChoice?: string;
    }

    export function generateProblem(options?: GenerateProblemOptions): GeneratedMathsProblem & {
        choices: string[];
        correctChoice: string;
    };
    export function getYearLevels(): string[];
}
