// Master integration pass: the hub and its screens from plain data (src/ui/hub.ts). Everything the owner listed is on
// the hub itself, and every number comes from the account, the config or the server.
import { describe, expect, it } from 'vitest';
import { emptyAcct, tierEffect, type AcctView } from '../src/ui/account';
import { boardScreenHtml, careerHtml, classOf, fiveLockReason, hubHtml, onlineResultsHtml, upgradesHtml, upgradesReady, type HubCtx } from '../src/ui/hub';
import { NO_UPGRADES } from '../src/config/power';
import { DEFAULT_SETTINGS } from '../src/ui/profile';
import type { AccountProfile } from '../src/net/account';

const cfg = { db: true, nftCombat: true, demo: true };
const blaze = { tokenId: 5, metadataId: 53, name: 'Blaze (#53)', oneOfOne: 'Blaze', tier: 'legendary' as const, tierLabel: '1:1', signature: { name: 'Flashfire', text: 'x', telegraph: 't', counter: 'c' }, history: { matches: 2, wins: 1, kills: 3 } };
const prof = (o: Partial<AccountProfile> = {}): AccountProfile => ({
  account: 'acc_123456789', xp: 150, level: 2, into: 50, next: 150, shards: 45, rating: 1012, matches: 3, wins: 2, upgrades: { ...NO_UPGRADES },
  callsign: 'Viper', favourite: null, pins: [], medals: {}, practice: { overall: { bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0 }, heroes: {} },
  online: { matches: 3, wins: 2, kills: 4, damage: 500, survived: 2, heroes: {} }, nft: null, ...o,
});
const ctx = (acct: AcctView, o: Partial<HubCtx> = {}): HubCtx => ({
  touch: false, profile: { id: 'GUEST123', nickname: acct.profile?.callsign ?? null, favourite: null, pinned: [], linked: [] }, settings: DEFAULT_SETTINGS,
  records: acct.profile?.practice ?? { overall: prof().practice.overall, heroes: {} }, medals: acct.profile?.medals ?? {}, heroId: 'kettle', demoChip: 'Guest', marking: null,
  muted: false, canFs: false, canVibrate: false, build: 'test', auth: { config: null, session: [], wallets: [], busy: false, message: '' },
  acct, netProfile: null, demoToken: null, mode: 'solo',
  net: { url: 'ws://x/ws', state: 'offline', message: '', queue: null, rtt: 0, party: null, follower: false }, ...o,
});
const guest = (): AcctView => ({ ...emptyAcct(), config: cfg, board: [] });
const signed = (o: Partial<AcctView> = {}): AcctView => ({ ...emptyAcct(), config: cfg, signedIn: true, progression: true, profile: prof(), board: [], ...o });
const holder = (): AcctView => signed({ hasWallet: true, tokens: [blaze], choice: { tokenId: 5 } });

describe('hub', () => {
  it('guest: PLAY, four modes, 5v5 CHOG HOLDERS ONLY, leaderboard and squad on one screen; nothing saved', () => {
    const h = hubHtml(ctx(guest()));
    expect(h).toMatch(/id="playbtn"/);
    for (const m of ['solo', '1v1', '3v3', '5v5']) expect(h).toContain(`data-mode="${m}"`);
    expect(h).toMatch(/CHOG HOLDERS ONLY/);
    expect(h).toMatch(/id="boardpreview"/);
    expect(h).toMatch(/id="squad"/);
    expect(h).toMatch(/nothing is saved/);
    expect(h).not.toMatch(/this device only/i);
  });
  it('picking 5v5 without a verified Chog disables Play and says why', () => {
    const h = hubHtml(ctx(signed(), { mode: '5v5' }));
    expect(h).toMatch(/id="playbtn" disabled|disabled id="playbtn"|data-act="play" disabled/);
    expect(h).toMatch(/CHOG HOLDERS ONLY<\/b> · Sign in with your Chog wallet/);
  });
  it('signed in: level, XP, shards, rating and upgrades ready are in the top strip', () => {
    const h = hubHtml(ctx(signed()));
    expect(h).toMatch(/LV 2/);
    expect(h).toMatch(/50 \/ 150 XP/);
    expect(h).toMatch(/id="hubshards">45/);
    expect(h).toMatch(/id="hubrating">1012/);
    expect(upgradesReady(signed())).toBe(3); // 45 shards: Vitality 10, Plating 10, Focus 30 (Firepower costs 150)
  });
  it('holder: the 1:1 by name, verified, tier power, signature with telegraph and counter, 5v5 open', () => {
    const a = holder();
    const h = hubHtml(ctx(a, { mode: '5v5' }));
    expect(h).toMatch(/Blaze \(#53\)/);
    expect(h).toMatch(/verified on Monad/);
    expect(h).toMatch(/1:1 LEGEND · Blaze/);
    expect(h).toMatch(/Flashfire/);
    expect(h).toMatch(/Telegraph/);
    expect(h).toMatch(/Counter/);
    expect(h).not.toMatch(/CHOG HOLDERS ONLY/);
    expect(fiveLockReason(a)).toBeNull();
    expect(classOf(a)).toMatchObject({ source: 'token', tier: 'legendary', metadataId: 53 });
    expect(classOf(a).power.hpMul).toBe(1.75);
  });
  it('NFT combat switched off: the token still shows, power is free, and the hub says so', () => {
    const a = { ...holder(), config: { ...cfg, nftCombat: false } };
    expect(classOf(a).tier).toBe('free');
    expect(hubHtml(ctx(a))).toMatch(/switched off/);
  });
  it('a squad shows its code and members; a follower cannot start the match', () => {
    const party = { code: 'AB2CD', members: [{ name: 'Lead', hero: 'kettle', tier: 'free' as const, holder: false, demo: false, you: false, leader: true, ready: true }, { name: 'Me', hero: 'mop', tier: 'epic' as const, holder: true, demo: false, you: true, leader: false, ready: true }] };
    const h = hubHtml(ctx(signed(), { mode: '3v3', net: { url: 'ws://x/ws', state: 'idle', message: '', queue: null, rtt: 0, party, follower: true } }));
    expect(h).toMatch(/AB2CD/);
    expect(h).toMatch(/Your squad leader starts the match/);
    expect(h).toMatch(/data-act="squad-leave"/);
  });
});

describe('sub-screens', () => {
  it('upgrades: guest is told to sign in; signed in shows ranks, costs and the class table', () => {
    expect(upgradesHtml(ctx(guest()))).toMatch(/Sign in/);
    const u = upgradesHtml(ctx(signed({ profile: prof({ upgrades: { ...NO_UPGRADES, vitality: 8 } }) })));
    expect(u).toMatch(/MAX/);
    expect(u).toMatch(/data-upgrade="plating"/);
    expect(u).toMatch(/cannot be bought/);
    expect(u).toMatch(/starting class/);
  });
  it('leaderboard: full columns, own row beyond the shown ranks, tier shown not ranked', () => {
    const row = (rank: number, you = false) => ({ rank, name: `P${rank}`, kills: 10 - rank, matches: 3, wins: 1, xp: 0, level: 1, rating: 1000, nftTier: rank === 1 ? 'rare' as const : null, you });
    const b = boardScreenHtml(ctx(signed({ board: [row(1), row(2)], boardMe: row(77, true) })));
    for (const col of ['Kills', 'Wins', 'Matches', 'Level', 'Rating', 'Chog']) expect(b).toContain(`<th>${col}</th>`);
    expect(b).toMatch(/P77 \(you\)/);
    expect(b).toMatch(/never changes a rank/);
  });
  it('career: online and practice careers from the account', () => {
    const c = careerHtml(ctx(signed()));
    expect(c).toMatch(/saved to your account/);
    expect(c).toMatch(/Kills<\/td><td class="num">4/);
  });
  it('online results: XP, shards, rating, level bar, upgrades ready, play again', () => {
    const html = onlineResultsHtml({
      mode: '1v1', won: true, reason: 'eliminated', team: 'alpha', demo: false, signedIn: true, settle: true, myClass: 'Free class', canRequeue: true, follower: false,
      rows: [{ name: 'Me', hero: 'kettle', team: 'alpha', kills: 1, damageDealt: 100, damageTaken: 20, alive: true, cause: null, you: true, tier: 'free', demo: false, metadataId: null }],
      prog: { before: { xp: 90, shards: 0, rating: 1000 }, reward: { xp: 110, shards: 20, ratingBefore: 1000, ratingAfter: 1012 }, pending: false, note: '', upgradesReady: 2 },
    });
    expect(html).toMatch(/Victory/);
    expect(html).toMatch(/\+110/);
    expect(html).toMatch(/\+20/);
    expect(html).toMatch(/\+12/);
    expect(html).toMatch(/LEVEL UP/);
    expect(html).toMatch(/2 upgrades ready/);
    expect(html).toMatch(/Play 1v1 again/);
  });
  it('tier effects come from the power table and say speed never changes', () => {
    expect(tierEffect('free')).toMatch(/upgrades/);
    expect(tierEffect('common')).toBe('+15% health, +8 armour. Speed never changes.');
    expect(tierEffect('legendary')).toMatch(/\+75% health, \+35 armour, \+12% damage, its own signature ability/);
  });
});
