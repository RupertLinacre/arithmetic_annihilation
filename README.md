# arithmetic_annihilation

Arithmetic Annihilation is a maths tower-defence game based on the core mechanics from `vocab_annihilation`.

Answer maths questions to build and upgrade towers. Mobile play defaults to multiple choice, with an optional compact in-game keypad selected through Settings or the `answer-mode=type-answer` URL option. The questions come from `maths-game-problem-generator`, with the selected base difficulty mapped to UK school year levels.

The start screen offers the original one-player game and a two-player game. Two-player mode can be played against a local computer opponent or against a friend using a six-character invite code. Each player builds on one half of the original 24×14 arena, protects a separate base, and answers questions to upgrade one monster generator that attacks the opposing base. It begins with Nibbles, then progressively adds Zappers, Chompers, and Mega Moo while increasing spawn speed and health. The opponent's half, base, monsters, and towers use pre-generated greyscale textures for an immediate visual distinction without per-frame filters.

Two-player games use PeerJS for signalling and a direct WebRTC data connection. Both devices run the same fixed-step combat simulation locally; the host schedules player actions on shared ticks, sends periodic checksums, and supplies a full state snapshot only when a late action or mismatch needs reconciling. Game-end results are explicitly synchronized over the same peer-to-peer connection.

## Development

```sh
npm install
npm run dev
```

## Verification

```sh
npm run typecheck
npm test
npm run build
```
