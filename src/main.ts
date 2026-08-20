import Phaser from 'phaser';
import './styles.css';
import { GAME_CONFIG } from './config/gameConfig';
import { GameScene } from './scenes/GameScene';
import { isMobileLayout } from './ui/mobile';
import { INVITE_CODE_LENGTH, multiplayerSession } from './multiplayer/MultiplayerSession';
import { normalizePlayerStrength } from './multiplayer/PlayerStrength';
import type { BaseMathsDifficulty } from './systems/MathsQuestionSystem';
import { readSavedPenCapacity } from './config/penSettings';

const baseUrl = import.meta.env.BASE_URL;

function linkManifest(): void {
    if (document.querySelector('link[rel="manifest"]')) {
        return;
    }
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = `${baseUrl}manifest.webmanifest`;
    document.head.append(link);

    const appleIcon = document.createElement('link');
    appleIcon.rel = 'apple-touch-icon';
    appleIcon.href = `${baseUrl}icons/icon-192.png`;
    document.head.append(appleIcon);
}

function registerServiceWorker(): void {
    // Service worker powers the installable Android PWA; only needed on mobile.
    if (!import.meta.env.PROD || !isMobileLayout() || !('serviceWorker' in navigator)) {
        return;
    }
    let refreshingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshingForUpdate) {
            return;
        }
        refreshingForUpdate = true;
        window.location.reload();
    });
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register(`${baseUrl}sw.js?v=3`, { updateViaCache: 'none' });
            await registration.update();
        } catch {
            /* Registration failures are non-fatal; the game still runs online. */
        }
    });
}

linkManifest();
registerServiceWorker();
document.documentElement.classList.toggle('is-mobile', isMobileLayout());

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'game-root',
    width: GAME_CONFIG.canvasWidth,
    height: GAME_CONFIG.canvasHeight,
    backgroundColor: '#132119',
    render: {
        antialias: true,
        antialiasGL: true,
        pixelArt: false,
        roundPixels: false,
        mipmapFilter: 'LINEAR_MIPMAP_LINEAR',
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: isMobileLayout() ? Phaser.Scale.CENTER_HORIZONTALLY : Phaser.Scale.CENTER_BOTH,
        autoRound: true,
    },
    scene: [GameScene],
};

let game: Phaser.Game | undefined;

function startGame(): void {
    if (game) {
        const scene = game.scene.getScene('GameScene');
        if (scene instanceof GameScene && multiplayerSession.isMultiplayer) {
            scene.restartMultiplayerRound(multiplayerSession.seed);
        }
        return;
    }
    document.querySelector<HTMLElement>('[data-testid="mode-screen"]')!.hidden = true;
    document.querySelector<HTMLElement>('#game-frame')!.hidden = false;
    document.documentElement.classList.toggle('is-multiplayer', multiplayerSession.isMultiplayer);
    game = new Phaser.Game(config);
}

async function copyText(text: string): Promise<void> {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }
    const input = document.createElement('textarea');
    input.value = text;
    input.setAttribute('readonly', '');
    input.style.position = 'fixed';
    input.style.opacity = '0';
    document.body.append(input);
    input.select();
    document.execCommand('copy');
    input.remove();
}

function setupModeScreen(): void {
    const actions = document.querySelector<HTMLElement>('[data-mode-actions]')!;
    const setup = document.querySelector<HTMLElement>('[data-multiplayer-setup]')!;
    const lobby = document.querySelector<HTMLElement>('[data-lobby-panel]')!;
    const nameInput = document.querySelector<HTMLInputElement>('[name="player-name"]')!;
    const levelSelect = document.querySelector<HTMLSelectElement>('[name="maths-level"]')!;
    const strengthSlider = document.querySelector<HTMLInputElement>('[name="player-strength"]')!;
    const strengthOutput = document.querySelector<HTMLOutputElement>('[data-player-strength-output]')!;
    const codeInput = document.querySelector<HTMLInputElement>('[name="invite-code"]')!;
    const inviteCode = document.querySelector<HTMLElement>('[data-invite-code]')!;
    const playersList = document.querySelector<HTMLElement>('[data-lobby-players]')!;
    const status = document.querySelector<HTMLElement>('[data-lobby-status]')!;
    const startButton = document.querySelector<HTMLButtonElement>('[data-start-match]')!;
    const copyButton = document.querySelector<HTMLButtonElement>('[data-copy-invite]')!;

    nameInput.value = window.localStorage.getItem('arithmetic-annihilation:player-name') ?? 'Commander';
    levelSelect.value = window.localStorage.getItem('arithmetic-annihilation:base-difficulty') ?? 'year3';
    const savedStrength = Number.parseFloat(window.localStorage.getItem('arithmetic-annihilation:player-strength') ?? '');
    strengthSlider.value = `${Math.round(normalizePlayerStrength(savedStrength) * 100)}`;

    const selectedStrength = () => normalizePlayerStrength(Number.parseInt(strengthSlider.value, 10) / 100);
    const renderStrength = () => { strengthOutput.value = `${Math.round(selectedStrength() * 100)}%`; };
    renderStrength();
    strengthSlider.addEventListener('input', renderStrength);

    const saveProfile = () => {
        window.localStorage.setItem('arithmetic-annihilation:player-name', nameInput.value.trim() || 'Commander');
        window.localStorage.setItem('arithmetic-annihilation:base-difficulty', levelSelect.value);
        window.localStorage.setItem('arithmetic-annihilation:player-strength', `${selectedStrength()}`);
    };
    const showLobby = (isHost: boolean) => {
        actions.hidden = true;
        setup.hidden = true;
        lobby.hidden = false;
        startButton.hidden = !isHost;
        copyButton.hidden = !isHost;
        document.querySelector<HTMLElement>('[data-lobby-heading]')!.textContent = isHost ? 'Your game is ready' : 'Joining the game…';
    };
    const renderPlayers = () => {
        const localIsBlue = multiplayerSession.localTeamId === 'solar';
        const colourBanner = document.querySelector<HTMLElement>('[data-testid="lobby-team-colour-banner"]')!;
        colourBanner.querySelector('strong')!.textContent = `You are ${localIsBlue ? 'blue' : 'red'}`;
        colourBanner.querySelector('span')!.textContent = `Your opponent is ${localIsBlue ? 'red' : 'blue'}`;
        playersList.innerHTML = '';
        for (const teamId of ['solar', 'lunar'] as const) {
            const player = multiplayerSession.players.find((candidate) => candidate.teamId === teamId);
            const item = document.createElement('div');
            const isLocalPlayer = teamId === multiplayerSession.localTeamId;
            item.className = `lobby-player ${isLocalPlayer ? 'player' : 'opponent'}`;
            const side = document.createElement('span');
            const colour = teamId === 'solar' ? 'Blue' : 'Red';
            side.textContent = `${isLocalPlayer ? 'You' : 'Opponent'} · ${colour}`;
            const playerName = document.createElement('strong');
            playerName.textContent = player?.name ?? 'Waiting for player…';
            const strength = document.createElement('small');
            strength.textContent = player ? `${Math.round(normalizePlayerStrength(player.strength) * 100)}% strength` : '';
            item.append(side, playerName, strength);
            playersList.append(item);
        }
        startButton.disabled = multiplayerSession.players.length !== 2;
    };

    document.querySelector<HTMLButtonElement>('[data-testid="single-player-button"]')!.addEventListener('click', () => {
        multiplayerSession.useSinglePlayer();
        startGame();
    });
    document.querySelector<HTMLButtonElement>('[data-testid="two-player-button"]')!.addEventListener('click', () => {
        actions.hidden = true;
        setup.hidden = false;
    });
    document.querySelector<HTMLButtonElement>('[data-mode-back]')!.addEventListener('click', () => {
        setup.hidden = true;
        actions.hidden = false;
    });
    document.querySelector<HTMLButtonElement>('[data-testid="create-match-button"]')!.addEventListener('click', () => {
        saveProfile();
        const code = multiplayerSession.createMatch(nameInput.value, levelSelect.value as BaseMathsDifficulty, selectedStrength(), readSavedPenCapacity());
        inviteCode.textContent = code;
        showLobby(true);
        renderPlayers();
    });
    document.querySelector<HTMLButtonElement>('[data-testid="computer-match-button"]')!.addEventListener('click', () => {
        saveProfile();
        multiplayerSession.startComputerMatch(nameInput.value, levelSelect.value as BaseMathsDifficulty, selectedStrength(), readSavedPenCapacity());
    });
    document.querySelector<HTMLButtonElement>('[data-testid="join-match-button"]')!.addEventListener('click', () => {
        const code = codeInput.value.trim().toUpperCase();
        if (code.length !== INVITE_CODE_LENGTH) {
            codeInput.setCustomValidity(`Enter the ${INVITE_CODE_LENGTH}-character invite code.`);
            codeInput.reportValidity();
            return;
        }
        codeInput.setCustomValidity('');
        saveProfile();
        inviteCode.textContent = code;
        multiplayerSession.joinMatch(code, nameInput.value, levelSelect.value as BaseMathsDifficulty, selectedStrength());
        showLobby(false);
        renderPlayers();
    });
    codeInput.addEventListener('input', () => {
        codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        codeInput.setCustomValidity('');
    });
    startButton.addEventListener('click', () => multiplayerSession.startMatch());
    copyButton.addEventListener('click', async () => {
        await copyText(multiplayerSession.inviteCode);
        status.textContent = 'Invite code copied.';
    });
    document.querySelector<HTMLButtonElement>('[data-leave-lobby]')!.addEventListener('click', () => {
        multiplayerSession.close();
        lobby.hidden = true;
        actions.hidden = false;
    });
    multiplayerSession.onStatus((message) => { status.textContent = message; });
    multiplayerSession.onLobby(() => renderPlayers());
    multiplayerSession.onStart(() => startGame());

    if (window.sessionStorage.getItem('arithmetic-annihilation:resume-single') === 'true') {
        window.sessionStorage.removeItem('arithmetic-annihilation:resume-single');
        multiplayerSession.useSinglePlayer();
        startGame();
    }
}

setupModeScreen();
