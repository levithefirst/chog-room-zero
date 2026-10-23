// Stages C and D: /api/game/<action> with PGlite, a fake Monad RPC and a fake game server.
import { beforeEach, describe, expect, it } from 'vitest';
import { handleGame, type Deps, type GameEnv } from '../api/_lib/game-api';
import { SESSION_COOKIE, sign } from '../api/_lib/auth';
import { migrate, type Db } from '../api/_lib/db';
import { selector, CONTRACT } from '../api/_lib/chain';
import { memoryDb } from './helpers/pglite';
import { profileOf, accountFor, type MatchRecord } from '../api/_lib/game';

const SECRET = 'test-secret-'.padEnd(48, 'x');
const HOST = 'chogroomzero.xyz';
const WALLET = '0x1111111111111111111111111111111111111111';
let db: Db | null;
let chain: { chainId: number; owned: Record<string, number[]>; meta: Record<number, number>; down: boolean };
let records: Record<string, unknown>;
let calls: string[];

const word = (n: number) => n.toString(16).padStart(64, '0');
const fakeFetch = async (url: string, init: RequestInit): Promise<Response> => {
  calls.push(url);
  if (url.startsWith('https://room-zero-game.onrender.com/results/')) {
    const id = url.split('/').pop()!;
    return records[id] ? Response.json(records[id]) : new Response('{}', { status: 404 });
  }
  if (chain.down) throw new Error('fetch failed');
  const batch = JSON.parse(String(init.body)) as { id: number; method: string; params: [{ to: string; data: string }] }[];
  return Response.json(batch.map((c) => {
    if (c.method === 'eth_chainId') return { id: c.id, result: '0x' + chain.chainId.toString(16) };
    if (c.method === 'eth_blockNumber') return { id: c.id, result: '0x10' };
    const { to, data } = c.params[0];
    expect(to).toBe(CONTRACT);
    if (data.startsWith(selector('tokensOfOwner(address)'))) {
      const owner = '0x' + data.slice(10 + 24);
      const ids = chain.owned[owner.toLowerCase()] ?? [];
      return { id: c.id, result: '0x' + word(32) + word(ids.length) + ids.map(word).join('') };
    }
    if (data.startsWith(selector('ownerOf(uint256)'))) return { id: c.id, result: '0x' + '0'.repeat(24) + WALLET.slice(2) };
    if (data.startsWith(selector('metadataId(uint256)'))) return { id: c.id, result: '0x' + word(chain.meta[parseInt(data.slice(10), 16)]) };
    return { id: c.id, error: { message: 'unknown' } };
  }));
};

const deps = (env: Partial<GameEnv> = {}): Deps => ({
  env: { AUTH_SECRET: SECRET, AUTH_ORIGIN: `https://${HOST}`, ...env },
  db: async () => (db ? { ...db, close: async () => undefined } : null),
  fetch: fakeFetch, now: () => Date.now(),
});
async function cookieFor(ids: { provider: 'google' | 'wallet'; subject: string; label: string }[]) {
  return `${SESSION_COOKIE}=${encodeURIComponent(await sign({ ids, exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET))}`;
}
const req = (method: string, action: string, o: { body?: object; cookie?: string; origin?: string | null } = {}) => {
  const h = new Headers({ 'content-type': 'application/json' });
  if (o.cookie) h.set('cookie', o.cookie);
  if (o.origin !== null) h.set('origin', o.origin ?? `https://${HOST}`);
  return new Request(`https://${HOST}/api/game/${action}`, { method, headers: h, body: o.body ? JSON.stringify(o.body) : undefined });
};
const call = async (method: string, action: string, o: Parameters<typeof req>[2] = {}, env: Partial<GameEnv> = {}) => {
  const r = await handleGame(req(method, action, o), action, deps(env));
  return { status: r.status, j: (await r.json()) as Record<string, any> };
};

beforeEach(async () => {
  db = await memoryDb(); await migrate(db);
  chain = { chainId: 143, owned: { [WALLET]: [5, 900] }, meta: { 5: 53, 900: 1462 }, down: false };
  records = {}; calls = [];
});

describe('config and profile', () => {
  it('reports what is on; refuses without AUTH_SECRET', async () => {
    // Owner 2026-10-14: NFT combat power is on unless NFT_COMBAT=0.
    expect((await call('GET', 'config')).j).toEqual({ db: true, nftCombat: true, demo: true });
    expect((await call('GET', 'config', {}, { NFT_COMBAT: '0' })).j.nftCombat).toBe(false);
    const r = await handleGame(req('GET', 'config'), 'config', { ...deps(), env: {} });
    expect(r.status).toBe(503);
  });
  it('profile: signed out, signed in, and database offline', async () => {
    expect((await call('GET', 'profile')).j).toEqual({ signedIn: false });
    const cookie = await cookieFor([{ provider: 'google', subject: 'g1', label: 'A' }]);
    expect((await call('GET', 'profile', { cookie })).j.profile).toMatchObject({ level: 1, shards: 0, rating: 1000 });
    db = null;
    expect((await call('GET', 'profile', { cookie })).j).toEqual({ signedIn: true, progression: false });
  });
});

describe('ownership (live chain read, fails closed)', () => {
  const walletCookie = () => cookieFor([{ provider: 'wallet', subject: WALLET, label: 'w' }]);
  it('lists held tokens with tier from the contract metadata id, best first', async () => {
    const { j } = await call('GET', 'tokens', { cookie: await walletCookie() });
    expect(j.tokens.map((t: { tokenId: number; tier: string; name: string }) => [t.tokenId, t.tier, t.name])).toEqual([[5, 'legendary', 'Blaze (#53)'], [900, 'uncommon', 'Chog #1462']]);
    expect(j.tokens[0].oneOfOne).toBe('Blaze');
    expect(j.tokens[0].signature.counter).toBeTruthy();
    expect(j.tokens[0].signature.name).toBe('Flashfire');
  });
  it('wrong chain or RPC down: no holder rights', async () => {
    chain.chainId = 1;
    expect((await call('GET', 'tokens', { cookie: await walletCookie() })).status).toBe(503);
    chain.chainId = 143; chain.down = true;
    const t = await call('POST', 'ticket', { cookie: await walletCookie(), body: {} });
    expect(t.j.profile.holder).toBe(false);
    expect(t.j.warning).toBe('chain_unavailable');
  });
  it('ticket for a holder: verified holding with its tier power (on by default); NFT_COMBAT=0 plays at free power', async () => {
    const off = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 5 } }, { NFT_COMBAT: '0' });
    expect(off.j.profile).toMatchObject({ holder: true, tokenId: 5, metadataId: 53, tokenTier: 'legendary', tier: 'free', demo: false, account: true });
    const on = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 5 } });
    expect(on.j.profile).toMatchObject({ tier: 'legendary', signature: 'Flashfire', oneOfOne: 'Blaze' });
    const check = await call('POST', 'ticket-check', { body: { ticket: on.j.ticket }, origin: null });
    expect(check.j.ticket).toMatchObject({ holder: true, tok: 5, mid: 53, own: WALLET, tier: 'legendary' });
  });
  it('a token the wallet does not hold is refused; the browser cannot claim one', async () => {
    const t = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 77 } }, { NFT_COMBAT: '1' });
    expect(t.j.profile).toMatchObject({ holder: false, tier: 'free', tokenId: null });
    expect(t.j.warning).toBe('not_owned');
    const google = await call('POST', 'ticket', { cookie: await cookieFor([{ provider: 'google', subject: 'g', label: 'g' }]), body: { tokenId: 5 } }, { NFT_COMBAT: '1' });
    expect(google.j.profile.holder).toBe(false);
  });
  it('ticket needs the game page origin; ticket-check refuses forgeries', async () => {
    expect((await call('POST', 'ticket', { body: {}, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', 'ticket-check', { body: { ticket: 'abc.def' }, origin: null })).status).toBe(401);
  });
  it('CHOG superpower: the ticket carries only a power the verified token\'s own traits carry; free and NFT-off carry none', async () => {
    // Token 36 here is Chog #36 (Uncommon): Laser Eyes and an Aura in the catalogue.
    chain.owned[WALLET] = [...(chain.owned[WALLET] ?? []), 36]; chain.meta[36] = 36;
    const pick = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 36, power: 'aura' } });
    expect(pick.j.profile).toMatchObject({ holder: true, metadataId: 36, tier: 'uncommon', power: 'aura', powerName: 'Aura' });
    expect((await call('POST', 'ticket-check', { body: { ticket: pick.j.ticket }, origin: null })).j.ticket.sp).toBe('aura');
    // A power the token does not carry is dropped: the ticket plays its default (first) power.
    const bad = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 36, power: 'bubble' } });
    expect(bad.j.profile).toMatchObject({ power: 'laser' });
    expect((await call('POST', 'ticket-check', { body: { ticket: bad.j.ticket }, origin: null })).j.ticket.sp).toBeUndefined();
    const off = await call('POST', 'ticket', { cookie: await walletCookie(), body: { tokenId: 36, power: 'aura' } }, { NFT_COMBAT: '0' });
    expect(off.j.profile).toMatchObject({ holder: true, tier: 'free', power: null });
    const google = await call('POST', 'ticket', { cookie: await cookieFor([{ provider: 'google', subject: 'g', label: 'g' }]), body: { tokenId: 36, power: 'aura' } });
    expect(google.j.profile).toMatchObject({ holder: false, tier: 'free', power: null });
    const demo = await call('POST', 'ticket', { body: { demo: 36, power: 'aura' } });
    expect(demo.j.profile).toMatchObject({ demo: true, power: 'aura' });
    // A 1:1 keeps its signature: no superpower.
    expect((await call('POST', 'ticket', { body: { demo: 53, power: 'laser' } })).j.profile).toMatchObject({ power: null, signature: 'Flashfire' });
  });
  it('demo tickets: real catalogue tier, labelled, no account, never a holder', async () => {
    const t = await call('POST', 'ticket', { body: { demo: 1373 } });
    expect(t.j.profile).toMatchObject({ demo: true, holder: false, account: false, tier: 'legendary', signature: 'Gold Shell' });
    expect((await call('POST', 'ticket', { body: { demo: 5000 } })).status).toBe(400);
  });
});

describe('live chain self-check', () => {
  it('passes when ownerOf, tokensOfOwner and metadataId agree with the catalogue; fails closed otherwise', async () => {
    chain.owned[WALLET] = [1, 5]; chain.meta[1] = 1462;
    const ok = await call('GET', 'chain');
    expect(ok.j).toMatchObject({ ok: true, checks: { chainId143: true, metadataIdOfToken1Is1462: true, ownerOfToken1ListsToken1: true } });
  });
});

describe('settlement pulled from the game server', () => {
  const record = (o: Partial<MatchRecord> = {}): MatchRecord => ({ id: '0123456789abcdef', mode: '1v1', demo: false, winner: 'alpha', reason: 'eliminated', seconds: 80, endedAt: 1_760_000_000, players: [], ...o });
  it('settles once, returns only the caller\'s own rewards', async () => {
    const a = (await accountFor(db!, [{ provider: 'google', subject: 'a', label: 'a' }]))!;
    const b = (await accountFor(db!, [{ provider: 'google', subject: 'b', label: 'b' }]))!;
    records['0123456789abcdef'] = record({ players: [
      { acc: a, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 1, damage: 100, left: false },
      { acc: b, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 50, left: false }] });
    const cookie = await cookieFor([{ provider: 'google', subject: 'a', label: 'a' }]);
    const s1 = await call('POST', 'settle', { cookie, body: { matchId: '0123456789abcdef' } });
    expect(s1.j).toMatchObject({ ok: true, already: false, mine: { acc: a, xp: 110, shards: 52 } }); // 10 played + 30 win + 10 kill + 2 for 100 damage
    expect(s1.j.players).toBeUndefined();
    const s2 = await call('POST', 'settle', { cookie, body: { matchId: '0123456789abcdef' } });
    expect(s2.j.already).toBe(true);
    expect((await profileOf(db!, a))!.xp).toBe(110);
  });
  it('production env (VITE_GAME_SERVER_URL = the client\'s wss://.../ws) still pulls from the host root', async () => {
    const a = (await accountFor(db!, [{ provider: 'google', subject: 'a', label: 'a' }]))!;
    records['0123456789abcdef'] = record({ players: [
      { acc: a, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 0, left: false },
      { acc: null, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 0, left: true }] });
    const s = await call('POST', 'settle', { body: { matchId: '0123456789abcdef' } }, { VITE_GAME_SERVER_URL: 'wss://room-zero-game.onrender.com/ws' });
    expect(s.j).toMatchObject({ ok: true, already: false });
    expect(calls).toContain('https://room-zero-game.onrender.com/results/0123456789abcdef');
  });
  it('refuses unknown, mismatched and demo matches; offline database', async () => {
    expect((await call('POST', 'settle', { body: { matchId: 'ffffffffffffffff' } })).status).toBe(404);
    expect((await call('POST', 'settle', { body: { matchId: '../etc' } })).status).toBe(400);
    records['aaaaaaaaaaaaaaaa'] = record({ id: 'bbbbbbbbbbbbbbbb', players: [] });
    expect((await call('POST', 'settle', { body: { matchId: 'aaaaaaaaaaaaaaaa' } })).status).toBe(502);
    records['cccccccccccccccc'] = record({ id: 'cccccccccccccccc', demo: true, players: [
      { acc: 'x', team: 'alpha', tier: 'epic', tok: null, mid: null, own: null, kills: 1, damage: 1, left: false },
      { acc: 'y', team: 'bravo', tier: 'epic', tok: null, mid: null, own: null, kills: 1, damage: 1, left: false }] });
    expect((await call('POST', 'settle', { body: { matchId: 'cccccccccccccccc' } })).j).toMatchObject({ ok: false, reason: 'demo' });
    db = null;
    expect((await call('POST', 'settle', { body: { matchId: 'cccccccccccccccc' } })).status).toBe(503);
  });
});

describe('leaderboard and health endpoints', () => {
  it('leaderboard is public, ranked by kills, marks your row; health lists migrations and tables', async () => {
    const a = (await accountFor(db!, [{ provider: 'google', subject: 'a', label: 'a' }]))!;
    const b = (await accountFor(db!, [{ provider: 'google', subject: 'b', label: 'b' }]))!;
    records['0123456789abcdee'] = { id: '0123456789abcdee', mode: '1v1', demo: false, winner: 'bravo', reason: 'eliminated', seconds: 80, endedAt: 1_760_000_000, players: [
      { acc: a, team: 'alpha', tier: 'free', tok: null, mid: null, own: null, kills: 0, damage: 10, left: false, name: 'Alpha' },
      { acc: b, team: 'bravo', tier: 'free', tok: null, mid: null, own: null, kills: 1, damage: 90, left: false, name: 'Bravo' }] };
    await call('POST', 'settle', { body: { matchId: '0123456789abcdee' } });
    const guest = await call('GET', 'leaderboard');
    expect(guest.j).toMatchObject({ progression: true, rankedBy: 'kills', me: null });
    expect(guest.j.rows.map((r: { name: string; kills: number }) => [r.name, r.kills])).toEqual([['Bravo', 1], ['Alpha', 0]]);
    const mine = await call('GET', 'leaderboard', { cookie: await cookieFor([{ provider: 'google', subject: 'a', label: 'a' }]) });
    expect(mine.j.me).toMatchObject({ name: 'Alpha', rank: 2, you: true });
    const h = await call('GET', 'health');
    expect(h.j.migrations.map((m: { version: number }) => m.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(h.j.tables).toContain('match_players');
    db = null;
    expect((await call('GET', 'health')).j).toEqual({ db: false });
    expect((await call('GET', 'leaderboard')).j).toEqual({ progression: false, rows: [], me: null, total: 0 });
  });
  it('a live wallet read sets the account\'s displayed Chog tier to its best held Chog', async () => {
    await call('POST', 'ticket', { cookie: await cookieFor([{ provider: 'wallet', subject: WALLET, label: 'w' }]), body: {} });
    const acc = (await accountFor(db!, [{ provider: 'wallet', subject: WALLET, label: 'w' }]))!;
    const r = await db!.query<{ nft_tier: string; nft_token_id: number }>('SELECT nft_tier, nft_token_id FROM room_zero.accounts WHERE id = $1', [acc]);
    expect(r[0]).toMatchObject({ nft_tier: 'legendary', nft_token_id: 5 });
    chain.owned[WALLET] = [];
    await call('POST', 'ticket', { cookie: await cookieFor([{ provider: 'wallet', subject: WALLET, label: 'w' }]), body: {} });
    const r2 = await db!.query<{ nft_tier: string | null }>('SELECT nft_tier FROM room_zero.accounts WHERE id = $1', [acc]);
    expect(r2[0].nft_tier).toBeNull();
  });
});

describe('upgrades endpoint', () => {
  it('needs a session and the game origin; spends shards', async () => {
    const cookie = await cookieFor([{ provider: 'google', subject: 'u', label: 'u' }]);
    expect((await call('POST', 'upgrade', { body: { id: 'focus' } })).status).toBe(401);
    expect((await call('POST', 'upgrade', { cookie, body: { id: 'focus' }, origin: 'https://evil.example' })).status).toBe(403);
    expect((await call('POST', 'upgrade', { cookie, body: { id: 'focus' } })).j).toEqual({ ok: false, reason: 'shards' });
    const acc = (await accountFor(db!, [{ provider: 'google', subject: 'u', label: 'u' }]))!;
    await db!.query('UPDATE room_zero.accounts SET shards = 40 WHERE id = $1', [acc]); // Focus 1 costs 40 (owner 2026-10-23)
    expect((await call('POST', 'upgrade', { cookie, body: { id: 'focus' } })).j).toEqual({ ok: true, rank: 1, shards: 0 });
  });
});
