import Peer, { type DataConnection } from 'peerjs';
import type { BaseMathsDifficulty } from '../systems/MathsQuestionSystem';
import type { MultiplayerCommand, MultiplayerSnapshot, ScheduledMultiplayerCommand, TeamId } from '../types';

export type MultiplayerRole = 'host' | 'guest';

export interface PlayerProfile {
    id: string;
    name: string;
    mathsLevel: BaseMathsDifficulty;
    teamId: TeamId;
}

type WireMessage =
    | { kind: 'join'; profile: Pick<PlayerProfile, 'id' | 'name' | 'mathsLevel'> }
    | { kind: 'lobby'; players: PlayerProfile[]; inviteCode: string }
    | { kind: 'start'; seed: number; players: PlayerProfile[] }
    | { kind: 'action'; command: MultiplayerCommand }
    | { kind: 'command'; command: ScheduledMultiplayerCommand }
    | { kind: 'checksum'; tick: number; checksum: string }
    | { kind: 'resyncRequest'; tick: number }
    | { kind: 'resync'; snapshot: MultiplayerSnapshot }
    | { kind: 'gameEnd'; tick: number; winner: TeamId }
    | { kind: 'rematchRequest' }
    | { kind: 'error'; message: string };

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 4;

function createLocalId(): string {
    if (typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    const randomPart = Array.from({ length: 4 }, () => Math.floor(Math.random() * 0x100000000).toString(36)).join('-');
    return `player-${Date.now().toString(36)}-${randomPart}`;
}

export function createInviteCode(): string {
    return Array.from({ length: INVITE_CODE_LENGTH }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');
}

class MultiplayerSession {
    mode: 'single' | 'multiplayer' = 'single';
    role?: MultiplayerRole;
    localTeamId: TeamId = 'solar';
    players: PlayerProfile[] = [];
    inviteCode = '';
    seed = 0;
    isComputerOpponent = false;

    private peer?: Peer;
    private connection?: DataConnection;
    private localId = createLocalId();
    private statusListeners = new Set<(status: string) => void>();
    private lobbyListeners = new Set<(players: PlayerProfile[]) => void>();
    private startListeners = new Set<(seed: number) => void>();
    private actionListeners = new Set<(command: MultiplayerCommand) => void>();
    private commandListeners = new Set<(command: ScheduledMultiplayerCommand) => void>();
    private checksumListeners = new Set<(tick: number, checksum: string) => void>();
    private resyncRequestListeners = new Set<(tick: number) => void>();
    private resyncListeners = new Set<(snapshot: MultiplayerSnapshot) => void>();
    private gameEndListeners = new Set<(tick: number, winner: TeamId) => void>();

    get isMultiplayer(): boolean {
        return this.mode === 'multiplayer';
    }

    get isAuthoritative(): boolean {
        return !this.isMultiplayer || this.role === 'host';
    }

    useSinglePlayer(): void {
        this.close();
        this.mode = 'single';
        this.role = undefined;
        this.localTeamId = 'solar';
    }

    createMatch(name: string, mathsLevel: BaseMathsDifficulty): string {
        this.close();
        this.mode = 'multiplayer';
        this.role = 'host';
        this.localTeamId = 'solar';
        this.inviteCode = createInviteCode();
        const host: PlayerProfile = { id: this.localId, name: this.cleanName(name), mathsLevel, teamId: 'solar' };
        this.players = [host];
        this.emitLobby();
        this.emitStatus('Opening private lobby…');

        const peer = new Peer(`aa-${this.inviteCode.toLowerCase()}`, { debug: 1 });
        this.peer = peer;
        peer.on('open', () => this.emitStatus('Invite ready — waiting for player 2'));
        peer.on('connection', (connection) => {
            if (this.connection?.open) {
                connection.send({ kind: 'error', message: 'This match already has two players.' } satisfies WireMessage);
                connection.close();
                return;
            }
            this.connection = connection;
            this.emitStatus('Player 2 is joining…');
            connection.on('data', (data) => this.handleHostMessage(data as WireMessage, host));
            connection.on('close', () => this.emitStatus('Player 2 disconnected'));
            connection.on('error', () => this.emitStatus('Connection lost'));
        });
        peer.on('error', () => this.emitStatus('Could not open that lobby. Try creating another.'));
        return this.inviteCode;
    }

    startComputerMatch(name: string, mathsLevel: BaseMathsDifficulty): number {
        this.close();
        this.mode = 'multiplayer';
        this.role = 'host';
        this.localTeamId = 'solar';
        this.isComputerOpponent = true;
        this.seed = Math.floor(Math.random() * 1_000_000_000);
        this.players = [
            { id: this.localId, name: this.cleanName(name), mathsLevel, teamId: 'solar' },
            { id: 'computer', name: 'Professor Byte', mathsLevel, teamId: 'lunar' },
        ];
        this.emitLobby();
        this.emitStatus('Computer opponent active');
        this.emitStart();
        return this.seed;
    }

    joinMatch(code: string, name: string, mathsLevel: BaseMathsDifficulty): void {
        this.close();
        this.mode = 'multiplayer';
        this.role = 'guest';
        this.localTeamId = 'lunar';
        this.inviteCode = code.trim().toUpperCase();
        this.emitStatus('Finding the host…');
        const peer = new Peer({ debug: 1 });
        this.peer = peer;
        peer.on('open', () => {
            const connection = peer.connect(`aa-${this.inviteCode.toLowerCase()}`, { reliable: true });
            this.connection = connection;
            connection.on('open', () => {
                this.emitStatus('Connected — joining the lobby');
                connection.send({
                    kind: 'join',
                    profile: { id: this.localId, name: this.cleanName(name), mathsLevel },
                } satisfies WireMessage);
            });
            connection.on('data', (data) => this.handleGuestMessage(data as WireMessage));
            connection.on('close', () => this.emitStatus('Host disconnected'));
            connection.on('error', () => this.emitStatus('Connection lost'));
        });
        peer.on('error', () => this.emitStatus('Match not found. Check the invite code.'));
    }

    startMatch(): number | undefined {
        if (this.role !== 'host' || this.players.length !== 2 || !this.connection?.open) {
            return undefined;
        }
        this.seed = Math.floor(Math.random() * 1_000_000_000);
        this.connection.send({ kind: 'start', seed: this.seed, players: this.players } satisfies WireMessage);
        this.emitStart();
        return this.seed;
    }

    requestRematch(): number | undefined {
        if (!this.isMultiplayer) {
            return undefined;
        }
        if (this.isComputerOpponent) {
            this.seed = Math.floor(Math.random() * 1_000_000_000);
            this.emitStart();
            return this.seed;
        }
        if (this.role === 'host') {
            return this.startMatch();
        }
        if (this.connection?.open) {
            this.connection.send({ kind: 'rematchRequest' } satisfies WireMessage);
        }
        return undefined;
    }

    sendAction(command: MultiplayerCommand): void {
        if (command.teamId !== this.localTeamId) {
            return;
        }
        if (this.role === 'host') {
            this.actionListeners.forEach((listener) => listener(command));
            return;
        }
        this.connection?.send({ kind: 'action', command } satisfies WireMessage);
    }

    broadcastCommand(command: ScheduledMultiplayerCommand): void {
        if (this.role === 'host' && this.connection?.open) {
            this.connection.send({ kind: 'command', command } satisfies WireMessage);
        }
    }

    sendChecksum(tick: number, checksum: string): void {
        if (this.role === 'host' && this.connection?.open) {
            this.connection.send({ kind: 'checksum', tick, checksum } satisfies WireMessage);
        }
    }

    requestResync(tick: number): void {
        if (this.role === 'guest' && this.connection?.open) {
            this.connection.send({ kind: 'resyncRequest', tick } satisfies WireMessage);
        }
    }

    sendResync(snapshot: MultiplayerSnapshot): void {
        if (this.role === 'host' && this.connection?.open) {
            this.connection.send({ kind: 'resync', snapshot } satisfies WireMessage);
        }
    }

    announceGameEnd(tick: number, winner: TeamId): void {
        if (this.role === 'host' && this.connection?.open) {
            this.connection.send({ kind: 'gameEnd', tick, winner } satisfies WireMessage);
        }
    }

    onStatus(listener: (status: string) => void): () => void {
        this.statusListeners.add(listener);
        return () => this.statusListeners.delete(listener);
    }

    onLobby(listener: (players: PlayerProfile[]) => void): () => void {
        this.lobbyListeners.add(listener);
        return () => this.lobbyListeners.delete(listener);
    }

    onStart(listener: (seed: number) => void): () => void {
        this.startListeners.add(listener);
        return () => this.startListeners.delete(listener);
    }

    onAction(listener: (command: MultiplayerCommand) => void): () => void {
        this.actionListeners.add(listener);
        return () => this.actionListeners.delete(listener);
    }

    onCommand(listener: (command: ScheduledMultiplayerCommand) => void): () => void {
        this.commandListeners.add(listener);
        return () => this.commandListeners.delete(listener);
    }

    onChecksum(listener: (tick: number, checksum: string) => void): () => void {
        this.checksumListeners.add(listener);
        return () => this.checksumListeners.delete(listener);
    }

    onResyncRequest(listener: (tick: number) => void): () => void {
        this.resyncRequestListeners.add(listener);
        return () => this.resyncRequestListeners.delete(listener);
    }

    onResync(listener: (snapshot: MultiplayerSnapshot) => void): () => void {
        this.resyncListeners.add(listener);
        return () => this.resyncListeners.delete(listener);
    }

    onGameEnd(listener: (tick: number, winner: TeamId) => void): () => void {
        this.gameEndListeners.add(listener);
        return () => this.gameEndListeners.delete(listener);
    }

    close(): void {
        this.connection?.close();
        this.peer?.destroy();
        this.connection = undefined;
        this.peer = undefined;
        this.players = [];
        this.inviteCode = '';
        this.isComputerOpponent = false;
    }

    private handleHostMessage(message: WireMessage, host: PlayerProfile): void {
        if (message.kind === 'join') {
            const guest: PlayerProfile = {
                ...message.profile,
                name: this.cleanName(message.profile.name),
                teamId: 'lunar',
            };
            this.players = [host, guest];
            this.emitLobby();
            this.emitStatus('Both players connected');
            this.connection?.send({ kind: 'lobby', players: this.players, inviteCode: this.inviteCode } satisfies WireMessage);
            return;
        }
        if (message.kind === 'action' && message.command.teamId === 'lunar') {
            this.actionListeners.forEach((listener) => listener(message.command));
            return;
        }
        if (message.kind === 'resyncRequest') {
            this.resyncRequestListeners.forEach((listener) => listener(message.tick));
            return;
        }
        if (message.kind === 'rematchRequest') {
            this.startMatch();
        }
    }

    private handleGuestMessage(message: WireMessage): void {
        if (message.kind === 'lobby') {
            this.players = message.players;
            this.emitLobby();
            this.emitStatus('Both players connected — host will start the game');
            return;
        }
        if (message.kind === 'start') {
            this.seed = message.seed;
            this.players = message.players;
            this.emitStatus('Peer-to-peer game connected');
            this.emitStart();
            return;
        }
        if (message.kind === 'command') {
            this.commandListeners.forEach((listener) => listener(message.command));
            return;
        }
        if (message.kind === 'checksum') {
            this.checksumListeners.forEach((listener) => listener(message.tick, message.checksum));
            return;
        }
        if (message.kind === 'resync') {
            this.resyncListeners.forEach((listener) => listener(message.snapshot));
            this.emitStatus('Peer-to-peer game connected · state reconciled');
            return;
        }
        if (message.kind === 'gameEnd') {
            this.gameEndListeners.forEach((listener) => listener(message.tick, message.winner));
            return;
        }
        if (message.kind === 'error') {
            this.emitStatus(message.message);
        }
    }

    private cleanName(name: string): string {
        return name.trim().slice(0, 18) || 'Commander';
    }

    private emitStatus(status: string): void {
        this.statusListeners.forEach((listener) => listener(status));
    }

    private emitLobby(): void {
        const players = [...this.players];
        this.lobbyListeners.forEach((listener) => listener(players));
    }

    private emitStart(): void {
        this.startListeners.forEach((listener) => listener(this.seed));
    }
}

export const multiplayerSession = new MultiplayerSession();
