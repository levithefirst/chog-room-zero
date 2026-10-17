// Account progression storage (master build, stage C). Postgres in schema `room_zero`: the owner's existing Neon
// database in production (DATABASE_URL), PGlite in tests. Files under api/_lib are not routes.
//
// Migrations are additive and versioned. Each runs once inside a transaction holding an advisory lock, and is recorded
// in room_zero.schema_migrations. Nothing here drops, truncates or rewrites existing data. To roll back a migration,
// write a new one (docs/DATABASE.md); never edit or delete an applied one.
// Never log or return DATABASE_URL.

declare const process: { env: Record<string, string | undefined> };

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
}

export interface Db extends Tx {
  /** Runs fn in one transaction: commit when it resolves, roll back when it throws. */
  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: 'accounts, identities, progression, ledger, matches, token history',
    sql: `
      CREATE TABLE IF NOT EXISTS room_zero.accounts (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL DEFAULT now(),
        xp bigint NOT NULL DEFAULT 0 CHECK (xp >= 0),
        shards integer NOT NULL DEFAULT 0 CHECK (shards >= 0),
        rating integer NOT NULL DEFAULT 1000,
        matches integer NOT NULL DEFAULT 0,
        wins integer NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS room_zero.identities (
        provider text NOT NULL CHECK (provider IN ('google', 'wallet')),
        subject text NOT NULL,
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        linked_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (provider, subject)
      );
      CREATE INDEX IF NOT EXISTS identities_account ON room_zero.identities(account_id);
      CREATE TABLE IF NOT EXISTS room_zero.upgrades (
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        upgrade_id text NOT NULL,
        rank integer NOT NULL CHECK (rank >= 0),
        PRIMARY KEY (account_id, upgrade_id)
      );
      CREATE TABLE IF NOT EXISTS room_zero.ledger (
        id bigserial PRIMARY KEY,
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        kind text NOT NULL CHECK (kind IN ('xp', 'shards')),
        delta integer NOT NULL,
        reason text NOT NULL,
        ref text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (account_id, kind, reason, ref)
      );
      CREATE TABLE IF NOT EXISTS room_zero.matches (
        id text PRIMARY KEY,
        mode text NOT NULL,
        winner text,
        reason text NOT NULL,
        seconds integer NOT NULL,
        ended_at timestamptz NOT NULL,
        settled_at timestamptz NOT NULL DEFAULT now(),
        rewarded boolean NOT NULL
      );
      CREATE TABLE IF NOT EXISTS room_zero.match_players (
        match_id text NOT NULL REFERENCES room_zero.matches(id),
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        team text NOT NULL,
        tier text NOT NULL,
        token_id integer,
        kills integer NOT NULL,
        damage integer NOT NULL,
        won boolean NOT NULL,
        left_early boolean NOT NULL,
        xp integer NOT NULL,
        shards integer NOT NULL,
        rating_before integer NOT NULL,
        rating_after integer NOT NULL,
        PRIMARY KEY (match_id, account_id)
      );
      CREATE TABLE IF NOT EXISTS room_zero.token_history (
        token_id integer NOT NULL,
        match_id text NOT NULL REFERENCES room_zero.matches(id),
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        owner_address text NOT NULL,
        metadata_id integer NOT NULL,
        kills integer NOT NULL,
        won boolean NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (token_id, match_id)
      );
      CREATE TABLE IF NOT EXISTS room_zero.ownership_checks (
        id bigserial PRIMARY KEY,
        address text NOT NULL,
        token_ids integer[] NOT NULL,
        ok boolean NOT NULL,
        rpc text NOT NULL,
        block text,
        checked_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    version: 2,
    name: 'leaderboard: display name, current NFT tier (display only), kills index',
    sql: `
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS display_name text;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS nft_tier text;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS nft_token_id integer;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS nft_checked_at timestamptz;
      CREATE INDEX IF NOT EXISTS match_players_account ON room_zero.match_players(account_id)
    `,
  },
  {
    version: 3,
    name: 'account-owned profile: callsign, favourite, pins, medals, practice career, match hero',
    sql: `
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS callsign text;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS favourite_hero text;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS pins text[] NOT NULL DEFAULT '{}';
      ALTER TABLE room_zero.match_players ADD COLUMN IF NOT EXISTS hero text;
      ALTER TABLE room_zero.match_players ADD COLUMN IF NOT EXISTS survived boolean;
      CREATE TABLE IF NOT EXISTS room_zero.medals (
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        medal_id text NOT NULL,
        earned_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (account_id, medal_id)
      );
      CREATE TABLE IF NOT EXISTS room_zero.practice_runs (
        account_id text NOT NULL REFERENCES room_zero.accounts(id),
        run_id text NOT NULL,
        hero text NOT NULL,
        won boolean NOT NULL,
        seconds integer NOT NULL,
        kills integer NOT NULL,
        bullets integer NOT NULL,
        hits integer NOT NULL,
        damage_dealt integer NOT NULL,
        damage_taken integer NOT NULL,
        pickups integer NOT NULL,
        abilities integer NOT NULL,
        hp_left integer NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (account_id, run_id)
      );
      CREATE INDEX IF NOT EXISTS practice_runs_recent ON room_zero.practice_runs(account_id, created_at);
      CREATE INDEX IF NOT EXISTS matches_settled ON room_zero.matches(settled_at)
    `,
  },
  {
    version: 4,
    name: 'practice rewards: xp and shards paid per stored practice run',
    sql: `
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS xp integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS shards integer NOT NULL DEFAULT 0
    `,
  },
  {
    version: 5,
    name: 'hardening: open practice run, verified practice runs, used wallet nonces, ownership check index, unique callsigns',
    // Runs stored before v5 keep counting for career and medals (verified defaults to true for them); new runs set it.
    // Callsigns: before the unique index, a later account holding a callsign an earlier one already has (any case) is
    // renamed to "<first 11>-<4 of its id>", and if that still collides, to "Player-<id>" (longer than any typed
    // callsign, so it is unique). The original stays in display_name. Nothing is deleted.
    sql: `
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS practice_rid text;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS verified boolean NOT NULL DEFAULT true;
      CREATE TABLE IF NOT EXISTS room_zero.used_nonces (
        nonce text PRIMARY KEY,
        at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS ownership_checks_address ON room_zero.ownership_checks(address, id);
      UPDATE room_zero.accounts a SET callsign = left(a.callsign, 11) || '-' || left(a.id, 4)
        WHERE a.callsign IS NOT NULL AND EXISTS (SELECT 1 FROM room_zero.accounts b WHERE b.callsign IS NOT NULL AND lower(b.callsign) = lower(a.callsign)
          AND (b.created_at, b.id) < (a.created_at, a.id));
      UPDATE room_zero.accounts a SET callsign = 'Player-' || a.id
        WHERE a.callsign IS NOT NULL AND EXISTS (SELECT 1 FROM room_zero.accounts b WHERE b.callsign IS NOT NULL AND lower(b.callsign) = lower(a.callsign)
          AND (b.created_at, b.id) < (a.created_at, a.id));
      CREATE UNIQUE INDEX IF NOT EXISTS accounts_callsign_unique ON room_zero.accounts (lower(callsign)) WHERE callsign IS NOT NULL
    `,
  },
  {
    version: 6,
    name: 'gameplay reality: revives, loot, grenades and allies lost per run; revives and loot per match; leaderboard visibility',
    // Additive. lb_hidden: a player who chose not to be listed (prefs), and the production smoke's own test accounts
    // (display name "SmokeA" / "SmokeB", never given a callsign), which were showing as the whole leaderboard. Nothing
    // is deleted; a hidden account still sees its own rank.
    sql: `
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS revives integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS revived integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS loots integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS thrown integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.practice_runs ADD COLUMN IF NOT EXISTS allies_lost integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.match_players ADD COLUMN IF NOT EXISTS revives integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.match_players ADD COLUMN IF NOT EXISTS loots integer NOT NULL DEFAULT 0;
      ALTER TABLE room_zero.accounts ADD COLUMN IF NOT EXISTS lb_hidden boolean NOT NULL DEFAULT false;
      CREATE INDEX IF NOT EXISTS match_players_account ON room_zero.match_players(account_id);
      UPDATE room_zero.accounts SET lb_hidden = true WHERE callsign IS NULL AND display_name ~ '^Smoke[A-Z]$'
    `,
  },
];

/**
 * Marks a SIWE nonce as used. True the first time, false for a replay. Rows older than 10 minutes (twice the challenge
 * lifetime, api/_lib/auth.ts CHALLENGE_SECONDS) are pruned here: their challenge has expired, so they cannot be redeemed.
 */
export async function claimNonce(db: Db, nonce: string): Promise<boolean> {
  await db.query(`DELETE FROM room_zero.used_nonces WHERE at < now() - interval '10 minutes'`);
  const r = await db.query(`INSERT INTO room_zero.used_nonces (nonce) VALUES ($1) ON CONFLICT DO NOTHING RETURNING nonce`, [nonce]);
  return r.length === 1;
}

/** Applies every migration not yet recorded. Safe to call on every cold start: concurrent callers wait on the lock. */
export async function migrate(db: Db): Promise<number[]> {
  return db.tx(async (tx) => {
    await tx.query(`SELECT pg_advisory_xact_lock(712004)`);
    await tx.query(`CREATE SCHEMA IF NOT EXISTS room_zero`);
    await tx.query(`CREATE TABLE IF NOT EXISTS room_zero.schema_migrations (version integer PRIMARY KEY, name text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await tx.query<{ version: number }>(`SELECT version FROM room_zero.schema_migrations`)).map((r) => Number(r.version)));
    const applied: number[] = [];
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      for (const stmt of m.sql.split(';').map((s) => s.trim()).filter(Boolean)) await tx.query(stmt);
      await tx.query(`INSERT INTO room_zero.schema_migrations (version, name) VALUES ($1, $2)`, [m.version, m.name]);
      applied.push(m.version);
    }
    return applied;
  });
}

/** Read-only evidence for /api/game/health: applied migrations and this game's tables. No data rows, no secrets. */
export async function schemaStatus(db: Db): Promise<{ migrations: { version: number; name: string; appliedAt: string }[]; tables: string[] }> {
  const m = await db.query<{ version: number; name: string; applied_at: Date | string }>(`SELECT version, name, applied_at FROM room_zero.schema_migrations ORDER BY version`);
  const t = await db.query<{ table_name: string }>(`SELECT table_name FROM information_schema.tables WHERE table_schema = 'room_zero' ORDER BY table_name`);
  return { migrations: m.map((r) => ({ version: Number(r.version), name: r.name, appliedAt: new Date(r.applied_at).toISOString() })), tables: t.map((r) => r.table_name) };
}

/** Neon over WebSockets (interactive transactions). One pool per function invocation; call close() when done. */
export async function neonDb(url: string): Promise<Db> {
  const { Pool } = await import('@neondatabase/serverless');
  const pool = new Pool({ connectionString: url, max: 1 });
  return {
    async query<T>(sql: string, params: unknown[] = []) { return (await pool.query(sql, params)).rows as T[]; },
    async tx<T>(fn: (tx: Tx) => Promise<T>) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        const out = await fn({ query: async <R>(sql: string, params: unknown[] = []) => (await c.query(sql, params)).rows as R[] });
        await c.query('COMMIT');
        return out;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end(),
  };
}

let migrated = false;

/** The production database, migrated, or null when DATABASE_URL is not set (progression offline; the game still plays). */
export async function openDb(): Promise<Db | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const db = await neonDb(url);
  if (!migrated) { await migrate(db); migrated = true; }
  return db;
}
