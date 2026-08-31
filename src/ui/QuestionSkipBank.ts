export const CORRECT_ANSWERS_PER_SKIP = 6;

export class QuestionSkipBank {
    private skips = 1;
    private correctAnswersTowardNextSkip = 0;

    get available(): number {
        return this.skips;
    }

    spend(): boolean {
        if (this.skips <= 0) return false;
        this.skips -= 1;
        return true;
    }

    recordCorrectAnswer(): void {
        this.correctAnswersTowardNextSkip += 1;
        if (this.correctAnswersTowardNextSkip < CORRECT_ANSWERS_PER_SKIP) return;
        this.correctAnswersTowardNextSkip -= CORRECT_ANSWERS_PER_SKIP;
        this.skips += 1;
    }

    reset(): void {
        this.skips = 1;
        this.correctAnswersTowardNextSkip = 0;
    }
}
