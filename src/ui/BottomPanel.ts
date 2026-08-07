import { DIFFICULTY_LABELS, TOWER_BUILD_DIFFICULTIES, TOWER_LABELS } from '../config/gameConfig';
import { canUpgradeTower, getUpgradeQuestionDifficulty } from '../entities/Tower';
import { getTowerStats } from '../pathfinding/ThreatMap';
import { MathsQuestionSystem } from '../systems/MathsQuestionSystem';
import type { GridPoint, MathsQuestion, TowerDifficulty, TowerState, TowerType, Vec2 } from '../types';

const BUILD_TOWER_TYPES: TowerType[] = ['easy', 'spray', 'missile', 'flamethrower', 'cluster', 'wall', 'airstrike'];
const spritePath = (path: string): string => `${import.meta.env.BASE_URL}${path}`;
const TOWER_SELECTOR_OPTIONS: Record<TowerType, { imagePath?: string; markerClassName?: string; label: string; testId: string }> = {
    easy: { imagePath: spritePath('sprites/turret_basic.png'), label: 'Bullet', testId: 'select-easy' },
    spray: { imagePath: spritePath('sprites/turret_cluster.png'), label: 'Spray', testId: 'select-medium' },
    missile: { imagePath: spritePath('sprites/turret_sidewinder.png'), label: 'Homing missile', testId: 'select-hard' },
    flamethrower: { markerClassName: 'tower-selector-marker tower-selector-marker-flamethrower', label: 'Flamethrower', testId: 'select-flamethrower' },
    cluster: { imagePath: spritePath('sprites/turrent_cluster_bomb.png'), label: 'Cluster', testId: 'select-veryHard' },
    wall: { imagePath: spritePath('sprites/wall.png'), label: 'Wall', testId: 'select-wall' },
    airstrike: { markerClassName: 'tower-selector-marker tower-selector-marker-airstrike', label: 'Airstrike', testId: 'select-airstrike' },
};
const BUILD_MENU_PADDING = 12;
const BUILD_MENU_OFFSET = 14;
const NUMBER_PAD_DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'] as const;
const MAX_NUMBER_PAD_LENGTH = 16;

export type MobileAnswerMode = 'multiple-choice' | 'type-answer';
type NumberPadControlKey = 'backspace' | 'submit';
type NumberPadKey = string | NumberPadControlKey;

export function getAnswerNumberPadKeys(answer: string, includeSubmit: boolean): NumberPadKey[] {
    const specialKeys = [...new Set([...answer].filter((character) => !/[0-9\s]/.test(character)))];
    const keys: NumberPadKey[] = [
        ...NUMBER_PAD_DIGITS.slice(0, 5),
        'backspace',
        ...NUMBER_PAD_DIGITS.slice(5),
        ...specialKeys,
    ];
    if (includeSubmit) {
        keys.push('submit');
    }
    return keys;
}

export type BuildTowerSelection = TowerType;

interface BottomPanelCallbacks {
    onBuild: (cell: GridPoint, towerType: TowerType) => void;
    onUpgrade: (tower: TowerState) => void;
    onAnswered: (correct: boolean) => void;
    onQuestionStateChange: (isActive: boolean) => void;
    onClose: () => void;
}

export interface BottomPanelMobileOptions {
    infoHost: HTMLElement;
    answerMode: MobileAnswerMode;
}

type PendingAction =
    | { kind: 'build'; cell: GridPoint; towerType: TowerType; difficulty: TowerDifficulty }
    | { kind: 'upgrade'; tower: TowerState; difficulty: TowerDifficulty }
    | { kind: 'custom'; difficulty: TowerDifficulty; onSuccess: () => void };

export class BottomPanel {
    private readonly frame = document.querySelector<HTMLElement>('#game-frame')!;
    private readonly panel = document.querySelector<HTMLElement>('[data-testid="bottom-panel"]')!;
    private readonly body = document.querySelector<HTMLElement>('[data-panel-body]')!;
    private readonly toggleButton = document.querySelector<HTMLButtonElement>('[data-panel-toggle]')!;
    private readonly buildMenu: HTMLElement;
    private closeTimeoutId: number | undefined;
    private popupAnchor: Vec2 | undefined;
    private currentQuestion: MathsQuestion | undefined;
    private pendingAction: PendingAction | undefined;
    private questionActive = false;
    private correctionRequired = false;
    private selectedBuildTower: BuildTowerSelection = 'easy';
    private panelExpanded = true;
    private readonly mobile: BottomPanelMobileOptions | undefined;
    private mobileAnswerMode: MobileAnswerMode;
    private extraSelectorControl?: HTMLElement;

    constructor(
        private readonly maths: MathsQuestionSystem,
        private readonly callbacks: BottomPanelCallbacks,
        mobile?: BottomPanelMobileOptions,
    ) {
        this.mobile = mobile;
        this.mobileAnswerMode = mobile?.answerMode ?? 'multiple-choice';
        this.buildMenu = document.createElement('section');
        this.buildMenu.className = 'build-popup';
        this.buildMenu.dataset.testid = 'build-popup';
        this.buildMenu.hidden = true;
        (this.mobile?.infoHost ?? this.frame).append(this.buildMenu);
        this.toggleButton.addEventListener('click', () => this.setExpanded(!this.panelExpanded));
        this.renderDifficultySelector();
        this.setExpanded(true);
    }

    isMobile(): boolean {
        return this.mobile !== undefined;
    }

    openBuild(cell: GridPoint, anchor: Vec2): void {
        if (this.correctionRequired) {
            return;
        }
        this.clearPendingClose();
        this.popupAnchor = anchor;
        const towerType = this.resolveBuildTower();
        this.showQuestion({ kind: 'build', cell, towerType, difficulty: TOWER_BUILD_DIFFICULTIES[towerType] });
    }

    openUpgrade(tower: TowerState, anchor: Vec2): void {
        if (this.correctionRequired) {
            return;
        }
        this.clearPendingClose();
        this.popupAnchor = anchor;
        if (!canUpgradeTower(tower)) {
            const stats = getTowerStats(tower);
            const detail = tower.type === 'wall'
                ? `Health ${Math.ceil(tower.health ?? 0)} / ${Math.ceil(tower.maxHealth ?? tower.health ?? 0)}.`
                : `Range ${Math.round(stats.range)} px. Fire interval ${Math.round(stats.cooldownMs)} ms.`;
            const message = tower.type === 'wall' ? 'No upgrade path.' : 'Maximum level reached.';
            this.showMessagePopup(
                TOWER_LABELS[tower.type],
                `Level ${tower.level} tower`,
                detail,
                message,
            );
            return;
        }

        const nextLevel = tower.level + 1;
        this.showQuestion({ kind: 'upgrade', tower, difficulty: getUpgradeQuestionDifficulty(tower, nextLevel) });
    }

    openCustomQuestion(difficulty: TowerDifficulty, anchor: Vec2, onSuccess: () => void): void {
        if (this.correctionRequired) {
            return;
        }
        this.popupAnchor = anchor;
        this.showQuestion({ kind: 'custom', difficulty, onSuccess });
    }

    close(force = false): void {
        if (this.correctionRequired && !force) {
            return;
        }
        this.clearPendingClose();
        this.correctionRequired = false;
        this.setQuestionActive(false);
        this.hideBuildMenu();
        this.popupAnchor = undefined;
        this.currentQuestion = undefined;
        this.pendingAction = undefined;
        this.callbacks.onClose();
    }

    setSelectedBuildDifficulty(selection: BuildTowerSelection): void {
        this.selectedBuildTower = selection;
        this.renderDifficultySelector();
    }

    getSelectedBuildTower(): BuildTowerSelection {
        return this.selectedBuildTower;
    }

    getCurrentQuestionAnswer(): string | undefined {
        return this.currentQuestion?.correctAnswer;
    }

    setMobileAnswerMode(answerMode: MobileAnswerMode): void {
        this.mobileAnswerMode = answerMode;
        this.close(true);
    }

    setExtraSelectorControl(control?: HTMLElement): void {
        this.extraSelectorControl = control;
        this.renderDifficultySelector();
    }

    private showQuestion(action: PendingAction): void {
        this.clearPendingClose();
        this.correctionRequired = false;
        this.hideBuildMenu();
        this.pendingAction = action;
        this.currentQuestion = this.maths.createQuestion(action.difficulty);
        this.setQuestionActive(true);
        this.showAnswerPopup();
    }

    private answer(answer: string): void {
        if (!this.currentQuestion || !this.pendingAction) {
            return;
        }

        const correct = this.isCorrectAnswer(answer);
        this.callbacks.onAnswered(correct);
        if (correct) {
            this.setQuestionActive(false);
            this.buildMenu.append(this.createParagraph('feedback good', 'Correct'));
            this.buildMenu.style.pointerEvents = 'none';
            if (this.pendingAction.kind === 'build') {
                this.callbacks.onBuild(this.pendingAction.cell, this.pendingAction.towerType);
            } else if (this.pendingAction.kind === 'upgrade') {
                this.callbacks.onUpgrade(this.pendingAction.tower);
            } else {
                this.pendingAction.onSuccess();
            }
            this.clearPendingClose();
            this.closeTimeoutId = window.setTimeout(() => this.close(), 220);
            return;
        }

        const action = this.pendingAction;
        this.showIncorrectAnswerPopup(action);
    }

    private hideBuildMenu(): void {
        this.buildMenu.classList.remove('is-open');
        this.buildMenu.classList.remove('is-answer-popup');
        this.buildMenu.hidden = true;
        this.buildMenu.innerHTML = '';
        this.buildMenu.style.left = '';
        this.buildMenu.style.top = '';
        this.buildMenu.style.pointerEvents = '';
    }

    private showAnswerPopup(): void {
        if (!this.currentQuestion || !this.popupAnchor) {
            return;
        }

        const header = this.createDiv('build-popup-header');
        if (this.mobile) {
            header.classList.add('build-popup-header-compact');
        } else {
            const heading = this.createDiv('build-popup-head');
            heading.append(this.createParagraph('panel-kicker build-popup-kicker', DIFFICULTY_LABELS[this.currentQuestion.difficulty]));
            header.append(heading);
        }

        const closeButton = this.createButton('icon-button build-popup-close', '×', 'answer-popup-close');
        closeButton.setAttribute('aria-label', 'Close answers');
        closeButton.addEventListener('click', () => this.close());
        header.append(closeButton);

        const questionText = this.createQuestionText(this.currentQuestion);
        const answerControl = this.mobile
            ? this.mobileAnswerMode === 'multiple-choice'
                ? this.createChoiceButtons(this.currentQuestion)
                : this.createAnswerNumberPad(this.currentQuestion, (answer) => this.answer(answer), true)
            : this.createAnswerInput(this.currentQuestion, 'answer-input');

        this.buildMenu.append(header, questionText, answerControl);
        this.buildMenu.hidden = false;
        this.buildMenu.classList.add('is-answer-popup');
        this.buildMenu.classList.add('is-open');
        this.positionBuildMenu(this.popupAnchor);
        if (!this.mobile) {
            answerControl.focus();
        }
    }

    private showIncorrectAnswerPopup(action: PendingAction): void {
        if (!this.currentQuestion || !this.popupAnchor) {
            return;
        }

        const question = this.currentQuestion;
        this.correctionRequired = true;
        this.hideBuildMenu();

        const header = this.createDiv('build-popup-header');
        const heading = this.createDiv('build-popup-head');
        heading.append(this.createParagraph('panel-kicker build-popup-kicker', DIFFICULTY_LABELS[question.difficulty]));
        header.append(heading);

        const questionText = this.createQuestionText(question);
        const feedback = this.createParagraph('feedback answer-review-answer', `Incorrect — correct answer: ${question.correctAnswer}`);
        const instruction = this.createParagraph('meta-line answer-review-prompt', 'Tap the correct answer to continue.');
        const numberPad = this.createAnswerNumberPad(question, () => this.showQuestion(action), false);

        this.buildMenu.append(header, questionText, feedback, instruction, numberPad);
        this.buildMenu.hidden = false;
        this.buildMenu.classList.add('is-answer-popup');
        this.buildMenu.classList.add('is-open');
        this.positionBuildMenu(this.popupAnchor);
    }

    private showMessagePopup(kicker: string, titleText: string, detail: string, message: string): void {
        if (!this.popupAnchor) {
            return;
        }

        this.setQuestionActive(false);
        this.hideBuildMenu();

        const header = this.createDiv('build-popup-header');
        const heading = this.createDiv('build-popup-head');
        heading.append(this.createParagraph('panel-kicker build-popup-kicker', kicker));
        const title = document.createElement('h2');
        title.textContent = titleText;
        heading.append(title);

        const closeButton = this.createButton('icon-button build-popup-close', '×', 'message-popup-close');
        closeButton.setAttribute('aria-label', 'Close details');
        closeButton.addEventListener('click', () => this.close());
        header.append(heading, closeButton);

        this.buildMenu.append(
            header,
            this.createParagraph('meta-line', detail),
            this.createParagraph('feedback good', message),
        );
        this.buildMenu.hidden = false;
        this.buildMenu.classList.add('is-open');
        this.positionBuildMenu(this.popupAnchor);
    }

    private setQuestionActive(isActive: boolean): void {
        if (this.questionActive === isActive) {
            return;
        }
        this.questionActive = isActive;
        this.callbacks.onQuestionStateChange(isActive);
    }

    private renderDifficultySelector(): void {
        this.body.innerHTML = '';
        const row = this.createDiv('button-row difficulty-selector-row');
        BUILD_TOWER_TYPES.forEach((selection) => {
            const isSelected = selection === this.selectedBuildTower;
            const button = this.createTowerSelectorButton(selection, isSelected);
            button.setAttribute('aria-pressed', String(isSelected));
            button.addEventListener('click', () => this.setSelectedBuildDifficulty(selection));
            row.append(button);
        });
        if (this.extraSelectorControl) {
            row.prepend(this.extraSelectorControl);
        }
        this.body.append(row);
    }

    private resolveBuildTower(): TowerType {
        return this.selectedBuildTower;
    }

    private setExpanded(expanded: boolean): void {
        this.panelExpanded = expanded;
        this.panel.classList.toggle('is-open', expanded);
        this.toggleButton.textContent = expanded ? '↓' : '↑';
        this.toggleButton.setAttribute('aria-expanded', String(expanded));
        this.toggleButton.setAttribute('aria-label', expanded ? 'Collapse difficulty panel' : 'Expand difficulty panel');
    }

    private clearPendingClose(): void {
        if (this.closeTimeoutId === undefined) {
            return;
        }
        window.clearTimeout(this.closeTimeoutId);
        this.closeTimeoutId = undefined;
    }

    private normalizeAnswerInput(value: string): string {
        return value.trim().replace(/\s+/g, '').toLowerCase();
    }

    private isCorrectAnswer(answer: string): boolean {
        if (!this.currentQuestion) {
            return false;
        }
        return this.normalizeAnswerInput(answer) === this.normalizeAnswerInput(this.currentQuestion.correctAnswer);
    }

    private createChoiceButtons(question: MathsQuestion): HTMLDivElement {
        const row = this.createDiv('build-popup-actions answer-popup-actions');
        question.choices.forEach((choice) => {
            const button = this.createButton('choice-button', choice, 'answer-button');
            button.dataset.correct = String(choice === question.correctAnswer);
            button.addEventListener('click', () => this.answer(choice));
            row.append(button);
        });
        return row;
    }

    private createAnswerInput(question: MathsQuestion, testId: string): HTMLInputElement {
        const answerInput = document.createElement('input');
        answerInput.type = 'text';
        answerInput.inputMode = 'numeric';
        answerInput.className = 'answer-review-input';
        answerInput.dataset.testid = testId;
        answerInput.setAttribute('aria-label', 'Type the answer');
        answerInput.setAttribute('autocomplete', 'off');
        answerInput.setAttribute('autocapitalize', 'off');
        answerInput.setAttribute('autocorrect', 'off');
        answerInput.setAttribute('spellcheck', 'false');
        answerInput.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter') {
                return;
            }

            event.preventDefault();
            this.answer(answerInput.value);
        });
        answerInput.addEventListener('input', () => {
            if (this.normalizeAnswerInput(answerInput.value) === this.normalizeAnswerInput(question.correctAnswer)) {
                this.answer(answerInput.value);
            }
        });
        return answerInput;
    }

    private createAnswerNumberPad(
        question: MathsQuestion,
        onSubmit: (answer: string) => void,
        requireSubmit: boolean,
    ): HTMLDivElement {
        const numberPad = this.createDiv('answer-number-pad');
        numberPad.dataset.testid = 'answer-number-pad';

        const display = this.createDiv('answer-number-pad-display is-empty');
        display.dataset.testid = 'answer-number-pad-display';
        display.setAttribute('role', 'textbox');
        display.setAttribute('aria-label', 'Entered answer');
        display.setAttribute('aria-readonly', 'true');
        display.setAttribute('aria-live', 'polite');
        display.textContent = '—';

        const keys = this.createDiv('answer-number-pad-keys');
        let value = '';
        const updateValue = (nextValue: string): void => {
            value = nextValue;
            display.textContent = value || '—';
            display.classList.toggle('is-empty', value.length === 0);
            if (!requireSubmit && value && this.isCorrectAnswer(value)) {
                onSubmit(value);
            }
        };

        const numberPadKeys = getAnswerNumberPadKeys(question.correctAnswer, requireSubmit);
        const columnCount = Math.min(7, Math.max(6, Math.ceil(numberPadKeys.length / 2)));
        keys.style.setProperty('--answer-key-columns', String(columnCount));
        numberPadKeys.forEach((key) => {
            const isBackspace = key === 'backspace';
            const isSubmit = key === 'submit';
            const button = this.createButton(
                `answer-number-key${isBackspace ? ' answer-number-key-backspace' : ''}${isSubmit ? ' answer-number-key-submit' : ''}`,
                isBackspace ? '⌫' : isSubmit ? '✓' : key,
                'answer-number-key',
            );
            button.dataset.key = key;
            button.setAttribute(
                'aria-label',
                isBackspace
                    ? 'Delete last character'
                    : isSubmit
                        ? 'Check answer'
                        : key === '.'
                            ? 'Decimal point'
                            : key === '/'
                                ? 'Fraction slash'
                                : /^[0-9]$/.test(key) ? `Digit ${key}` : key,
            );
            button.addEventListener('click', () => {
                if (isBackspace) {
                    updateValue(value.slice(0, -1));
                    return;
                }
                if (isSubmit) {
                    if (value) {
                        onSubmit(value);
                    }
                    return;
                }
                if (!/^[0-9]$/.test(key) && value.includes(key)) {
                    return;
                }
                if (value.length >= MAX_NUMBER_PAD_LENGTH) {
                    return;
                }
                if (key === '.' && !value) {
                    updateValue(value ? `${value}.` : '0.');
                    return;
                }
                updateValue(value === '0' && /^[0-9]$/.test(key) ? key : `${value}${key}`);
            });
            keys.append(button);
        });

        numberPad.append(display, keys);
        return numberPad;
    }

    private positionBuildMenu(anchor: Vec2): void {
        // On mobile the popup is docked inside the side info panel, no anchoring needed.
        if (this.mobile) {
            return;
        }
        const frameBounds = this.frame.getBoundingClientRect();
        const menuBounds = this.buildMenu.getBoundingClientRect();
        const relativeX = anchor.x - frameBounds.left;
        const relativeY = anchor.y - frameBounds.top;
        const maxLeft = Math.max(BUILD_MENU_PADDING, frameBounds.width - menuBounds.width - BUILD_MENU_PADDING);
        const maxTop = Math.max(BUILD_MENU_PADDING, frameBounds.height - menuBounds.height - BUILD_MENU_PADDING);
        const left = Math.max(BUILD_MENU_PADDING, Math.min(relativeX + BUILD_MENU_OFFSET, maxLeft));
        const abovePointer = relativeY - menuBounds.height - BUILD_MENU_OFFSET;
        const belowPointer = relativeY + BUILD_MENU_OFFSET;
        const top = abovePointer >= BUILD_MENU_PADDING
            ? abovePointer
            : Math.min(belowPointer, maxTop);

        this.buildMenu.style.left = `${left}px`;
        this.buildMenu.style.top = `${Math.max(BUILD_MENU_PADDING, top)}px`;
    }

    private createDiv(className: string): HTMLDivElement {
        const div = document.createElement('div');
        div.className = className;
        return div;
    }

    private createParagraph(className: string, text: string): HTMLParagraphElement {
        const paragraph = document.createElement('p');
        paragraph.className = className;
        paragraph.textContent = text;
        return paragraph;
    }

    private createQuestionText(question: MathsQuestion): HTMLDivElement {
        const container = this.createDiv('question-text');
        container.append(this.createParagraph('definition popup-definition', `${question.expression} = ?`));
        return container;
    }

    private createButton(className: string, text: string, testId: string): HTMLButtonElement {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.dataset.testid = testId;
        return button;
    }

    private createTowerSelectorButton(selection: TowerType, isSelected: boolean): HTMLButtonElement {
        const option = TOWER_SELECTOR_OPTIONS[selection];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `difficulty-button difficulty-selector-button tower-selector-button${isSelected ? ' is-selected' : ''}`;
        button.dataset.testid = option.testId;
        button.setAttribute('aria-label', `${DIFFICULTY_LABELS[TOWER_BUILD_DIFFICULTIES[selection]]} tower, ${option.label}`);

        const marker = option.imagePath
            ? (() => {
                const image = document.createElement('img');
                image.className = 'tower-selector-image';
                image.src = option.imagePath;
                image.alt = '';
                image.decoding = 'async';
                return image;
            })()
            : (() => {
                const chip = document.createElement('span');
                chip.className = option.markerClassName ?? 'tower-selector-marker';
                chip.setAttribute('aria-hidden', 'true');
                return chip;
            })();

        const label = document.createElement('span');
        label.className = 'tower-selector-label';
        label.textContent = option.label;

        const content = document.createElement('span');
        content.className = 'tower-selector-content';
        content.append(label);

        button.append(marker, content);
        return button;
    }
}
