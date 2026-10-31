// A real Postgres engine in memory (PGlite) behind the same Db interface the Vercel functions use with Neon.
import { PGlite } from '@electric-sql/pglite';
import type { Db, Tx } from '../../api/_lib/db';

export async function memoryDb(): Promise<Db & { pg: PGlite }> {
  const pg = new PGlite();
  await pg.waitReady;
  const wrap = (q: { query: PGlite['query'] }): Tx => ({ query: async <T>(sql: string, params: unknown[] = []) => (await q.query<T>(sql, params)).rows });
  return {
    pg,
    ...wrap(pg),
    tx: <T>(fn: (tx: Tx) => Promise<T>) => pg.transaction((t) => fn(wrap(t))),
    close: () => pg.close(),
  };
}
