import { describe, expect, it } from 'vitest';
import { CORRECT_ANSWERS_PER_SKIP, QuestionSkipBank } from '../../src/ui/QuestionSkipBank';

describe('question skip bank', () => {
    it('starts with one skip and refuses to overspend', () => {
        const bank = new QuestionSkipBank();

        expect(bank.available).toBe(1);
        expect(bank.spend()).toBe(true);
        expect(bank.available).toBe(0);
        expect(bank.spend()).toBe(false);
    });

    it('earns one skip for every six correct answers', () => {
        const bank = new QuestionSkipBank();
        bank.spend();

        for (let index = 0; index < CORRECT_ANSWERS_PER_SKIP - 1; index += 1) {
            bank.recordCorrectAnswer();
        }
        expect(bank.available).toBe(0);

        bank.recordCorrectAnswer();
        expect(bank.available).toBe(1);

        for (let index = 0; index < CORRECT_ANSWERS_PER_SKIP; index += 1) {
            bank.recordCorrectAnswer();
        }
        expect(bank.available).toBe(2);
    });

    it('resets to the initial allowance', () => {
        const bank = new QuestionSkipBank();
        bank.recordCorrectAnswer();
        bank.spend();

        bank.reset();

        expect(bank.available).toBe(1);
    });
});
