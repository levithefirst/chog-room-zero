# Database (master build, stage C)

Owner decision (2026-10-13): reuse the owner's existing Neon Postgres. No new paid service.

## Owner action (the one thing that switches saved progression on)

1. In Neon, copy the connection string of the database to use (the pooled one is fine).
2. Vercel project `chog-room-zero` -> Settings -> Environment Variables -> add `DATABASE_URL` = that string, type
   Sensitive, environment Production (and Preview if wanted). Never paste it into chat, Git or a ticket.
3. Redeploy production. The first request to `/api/game/*` creates schema `room_zero` and its tables.
4. Check: `https://chogroomzero.xyz/api/game/config` answers `"db":true`.

Until then every account endpoint answers "progression offline" and the game plays normally.

## What it creates

Only schema `room_zero` (nothing in `public`, nothing else touched): `schema_migrations`, `accounts`, `identities`,
`upgrades`, `ledger`, `matches`, `match_players`, `token_history`, `ownership_checks`, `medals`, `practice_runs`. Definitions: `api/_lib/db.ts`.

| Version | What it adds |
|---|---|
| 1 | the nine tables above |
| 2 | leaderboard: `accounts.display_name`, `accounts.nft_tier` / `nft_token_id` / `nft_checked_at` (display only), index `match_players(account_id)` |
| 3 | account-owned profile (master integration pass, owner 2026-10-14): `accounts.callsign` / `favourite_hero` / `pins`; `match_players.hero` / `survived`; tables `medals` (account, medal, earned_at) and `practice_runs` (one row per solo practice run, unique per account + run id); indexes `practice_runs(account_id, created_at)`, `matches(settled_at)` |

## What lives on the account (nothing in the browser)

Callsign, favourite operator, pinned medals, medals, practice career (aggregated from `practice_runs`), online career
(from `match_players`), XP, level, shards, upgrades, rating, wins, matches. `GET /api/game/profile` returns all of it;
`POST callsign`, `POST prefs`, `POST practice` change it (same-origin, signed-in only). A practice run is reported by
the browser (solo is simulated there), so it is bounded (`validPractice`), rate limited (6 a minute), stored once per
run id, and pays no XP, shards or rating and never reaches the leaderboard; medals are awarded on the server from the
stored runs. A guest's progress lives in the page's memory for the session only. localStorage keeps preferences only
(settings, tips, onboarding, last operator, last mode, the demo pick).

Live check: `GET /api/game/health` lists the applied migrations and the tables (no rows, no connection details).

## Leaderboard (owner requirement 2026-10-14)

`GET /api/game/leaderboard`, public, account-based, persistent. Ranked by opponents killed, summed from `match_players`
of matches that paid rewards (20 s or longer; a quit-and-requeue loop adds nothing), then wins, then fewer matches,
then account id. Shows kills, wins, matches, XP and level, rating, and the account's Chog tier as of its last live
ownership read or verified match. The Chog tier, rating and XP never decide the order (`tests/leaderboard.test.ts`
proves a 1:1 holder with more wins and a higher rating ranks below a free player with more kills, and that changing a
tier moves nobody). Guests and demo matches never appear. Kills come from the authoritative server's record, never
from the browser.

- Account progression (`accounts`, `upgrades`, `ledger`) and token history (`token_history`) are separate: a token
  transfer moves no XP, shards or rating.
- Every shard movement is a `ledger` row, unique per (account, kind, reason, ref), so a match can pay an account once.
- `matches.id` is the game server's match id: settlement inserts it first, and a second settle of the same match is a
  no-op (tested).

## Migration rules

- Additive only: `CREATE ... IF NOT EXISTS`, new columns with defaults. Never `DROP`, `TRUNCATE`, `DELETE` or a type
  change in a migration (`tests/progression.test.ts` fails the build if one appears).
- Each migration runs once, in a transaction, under an advisory lock (`pg_advisory_xact_lock(712004)`), and is recorded
  in `room_zero.schema_migrations`. Applied migrations are never edited; a change is a new version.

## Backup and rollback

- Before connecting for the first time, nothing of the owner's is touched (only a new schema is created). Neon keeps a
  point-in-time history (restore window depends on the Neon plan): to undo, restore a branch to a time before the
  change, from the Neon console.
- To roll the game back without touching data: redeploy an earlier Vercel deployment. Old code ignores the
  `room_zero` schema.
- To remove the feature's data entirely (owner only, deliberately, never by an agent): back up first, then
  `DROP SCHEMA room_zero CASCADE` removes this game's tables and nothing else.

## Tests

`tests/progression.test.ts` and `tests/game-api.test.ts` run every query against PGlite (real Postgres compiled to
WebAssembly) in memory. Not tested: Neon itself (no connection string was available to the agent), real concurrency
(PGlite has one connection, so the "two purchases at once" test proves the logic, not row locking under load).
