# Architecture

Status: the stack is a STARTING PROPOSAL from the owner. The repo is empty, so NOTHING below is installed. Verify with `ls` and `git log` before treating anything as present.

## Stack (starting proposal)
TypeScript, Vite, PixiJS, a lightweight custom simulation, Vercel, Neon Postgres, viem (lazy loaded, only for ownership reads), GitHub.

Open choice to confirm on Prototype 0: PixiJS handles the drawing. Vision occlusion drawing must be proven on the Pixel 7 and iPhone 13 before it is locked.

Out of scope for the MVP (LOCKED): Railway worker, multiplayer, custom smart contract, paid inference, $CHOG economy.

Budget: target $0. Hard cap $20. Spend only for a real blocker with the owner's approval.

## Separation (LOCKED rule: simulation apart from everything else)
```
sim/      gameplay rules and state. No DOM, no drawing, no audio, no network, no wallet.
render/   drawing, vision shape drawing, camera, effects
input/    touch and mouse/keyboard -> the shared input struct
audio/    sound generation and the positional mixer (reads sim sound events)
bots/     bot decisions (read and write sim data through plain functions)
web3/     lazy loaded ownership and signing
server/   serverless functions and database access
tuning    one file, every number commented with what it should feel like
```
Create folders when the first file needs them, not before.

## Determinism without killing the juice
- The sim is deterministic for gameplay: fixed 60 Hz step, a seeded random generator, no wall-clock time. Same seed and inputs give the same result. This enables tests, bot batch runs, and replays.
- Presentation is NOT part of the sim: particles, animation, camera shake, audio variation, and UI motion use their own random source and real time. They read sim state and never write back to it. Determinism must never be used as a reason to refuse a presentation effect.

## Persistence
- Write match results once, at match end. Never per frame, never per hit.
- Guest runs write nothing.
- A bound run writes one row keyed to the token. Server verifies ownership. Client claims are never trusted.

## Performance
- No hard frame or latency requirement until G8 records a baseline on the Pixel 7 and iPhone 13 and the owner approves budgets.
- Until then: avoid allocating in per-frame code (pool bullets and particles), cap pixel density (guess: 2), keep the first load small, lazy load wallet code so the game boots without it.
- Keep a debug overlay with frame time, sim time, vision time, and input-to-render delay from the first build.

## Testing
- Unit tests on the sim: movement times, projectile sweep, vision fixtures, sound events, bot state changes, determinism hash.
- Headless bot batch runs.
- Mobile checks on real devices for feel, input, audio, and speed. Emulators cannot judge those.

## Security basics
Ownership is verified on the server. Sign-in is a message signature only: no transaction, no approvals, no gas. No secrets in the repo; use environment variables. The game must work if the chain RPC is down.
