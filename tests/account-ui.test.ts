// Master integration pass: the hub and its screens from plain data (src/ui/hub.ts). Everything the owner listed is on
// the hub itself, and every number comes from the account, the config or the server.
import { rewardBreakdown } from '../src/config/progression';
import { describe, expect, it } from 'vitest';
import { emptyAcct, tierEffect, type AcctView } from '../src/ui/account';
import { authHtml, boardScreenHtml, careerHtml, classOf, fiveLockReason, hubHtml, onlineResultsHtml, upgradesHtml, upgradesReady, type AuthSheet, type HubCtx } from '../src/ui/hub';
import { NO_UPGRADES } from '../src/config/power';
import { DEFAULT_SETTINGS } from '../src/ui/profile';
import type { AccountProfile } from '../src/net/account';

const cfg = { db: true, nftCombat: true, demo: true };
const blaze = { tokenId: 5, metadataId: 53, name: 'Blaze (#53)', oneOfOne: 'Blaze', tier: 'legendary' as const, tierLabel: '1:1', signature: { name: 'Flashfire', text: 'x', telegraph: 't', counter: 'c' }, history: { matches: 2, wins: 1, kills: 3 } };
const prof = (o: Partial<AccountProfile> = {}): AccountProfile => ({
  account: 'acc_123456789', xp: 150, level: 2, into: 50, next: 150, shards: 45, rating: 1012, matches: 3, wins: 2, upgrades: { ...NO_UPGRADES },
  callsign: 'Viper', favourite: null, pins: [], medals: {}, practice: { overall: { bestWinSeconds: null, mostKills: 0, runs: 0, wins: 0, kills: 0, bullets: 0, hits: 0, damageDealt: 0, damageTaken: 0, seconds: 0, pickups: 0, abilities: 0, revives: 0, loots: 0, thrown: 0 }, heroes: {} },
  online: { matches: 3, wins: 2, kills: 4, damage: 500, survived: 2, heroes: {} }, nft: null, ...o,
});
const ctx = (acct: AcctView, o: Partial<HubCtx> = {}): HubCtx => ({
  touch: false, profile: { id: 'GUEST123', nickname: acct.profile?.callsign ?? null, favourite: null, pinned: [], linked: [] }, settings: DEFAULT_SETTINGS,
  records: acct.profile?.practice ?? { overall: prof().practice.overall, heroes: {} }, medals: acct.profile?.medals ?? {}, heroId: 'benja', demoChip: 'Guest', marking: null,
  muted: false, canFs: false, canVibrate: false, build: 'test', auth: { config: null, session: [], wallets: [], busy: false, message: '' },
  acct, netProfile: null, demoToken: null, mode: 'solo', map: 'room-zero',
  net: { url: 'ws://x/ws', state: 'offline', message: '', queue: null, rtt: 0, party: null, follower: false }, ...o,
});
const guest = (): AcctView => ({ ...emptyAcct(), config: cfg, board: [] });
const signed = (o: Partial<AcctView> = {}): AcctView => ({ ...emptyAcct(), config: cfg, signedIn: true, progression: true, profile: prof(), board: [], ...o });
const holder = (): AcctView => signed({ hasWallet: true, tokens: [blaze], choice: { tokenId: 5 } });

describe('hub', () => {
  it('guest: compact identity, a Sign in button that opens sign-in (never Settings), PLAY, four modes, board, squad', () => {
    const h = hubHtml(ctx(guest()));
    expect(h).toMatch(/id="playbtn"/);
    for (const m of ['solo', '1v1', '3v3', '5v5']) expect(h).toContain(`data-mode="${m}"`);
    expect(h).toMatch(/You \+ 2 AI/); // the default game is not the online 3v3
    expect(h).toMatch(/Holders only/);
    expect(h).toMatch(/id="boardpreview"/);
    expect(h).toMatch(/id="squad"/);
    // CF: Sign in is a quiet secondary button; the Chog entry is "Enter with CHOG", never "Connect wallet".
    expect(h).toMatch(/<button class="btn small ghost" data-act="signin" id="signin-cta">Sign in<\/button>/);
    expect(h).toMatch(/data-act="chog" id="chog-cta"><span>Enter with CHOG<\/span>/);
    expect(h).not.toMatch(/connect wallet/i);
    expect(h).not.toMatch(/data-act="settings"[^>]*id="signin-cta"/);
    // Minimal: no explanatory paragraphs on the hub.
    expect(h).not.toMatch(/nothing is saved|this device only|Sign in to earn|Play 3v3 and 5v5 with friends|Ranked by kills, then wins/i);
    expect(h.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').length).toBeLessThan(600);
  });
  it('the sign-in sheet always offers Continue with Google AND Continue with Wallet', () => {
    const base: AuthSheet = { config: { google: true, wallet: true }, session: [], wallets: [], busy: false, message: '', pickWallet: false };
    const a = authHtml(base, 'chogroomzero.xyz');
    expect(a).toMatch(/data-act="signin-google"[^>]*>.*Continue with Google/);
    expect(a).toMatch(/data-act="signin-wallet"[^>]*>.*Continue with Wallet/);
    // No wallet in the browser: the button stays, and the sheet says so with a way on. A computer: get one (install
    // pages) and look again; a phone: open this page in a wallet app (its own browser has the wallet).
    const none = authHtml({ ...base, pickWallet: true }, 'chogroomzero.xyz');
    expect(none).toMatch(/Continue with Wallet/);
    expect(none).toMatch(/No wallet in this browser/);
    expect(none).toMatch(/metamask\.io\/download/);
    expect(none).toMatch(/data-act="wallet-rescan"/);
    const phone = authHtml({ ...base, pickWallet: true, mobile: true, pageUrl: 'https://chogroomzero.xyz/?squad=AB12C' }, 'chogroomzero.xyz');
    expect(phone).toMatch(/metamask\.app\.link\/dapp\/chogroomzero\.xyz\/\?squad=AB12C/);
    // Several wallets: pick one, each with its mark.
    const w = (id: string, name: string) => ({ id, name, rdns: id, logo: '<svg></svg>', icon: null });
    expect(authHtml({ ...base, pickWallet: true, wallets: [w('io.metamask', 'MetaMask'), w('io.rabby', 'Rabby')] }, 'h')).toMatch(/data-wallet="io\.rabby"/);
    // Signed in with Google: the wallet can still be linked to the same account; sign out is there.
    const g = authHtml({ ...base, session: [{ provider: 'google', label: 'a@b' }] }, 'h');
    expect(g).not.toMatch(/signin-google/);
    expect(g).toMatch(/Continue with Wallet/);
    expect(g).toMatch(/data-act="signout"/);
  });
  it('picking 5v5 without a verified Chog disables Play and says why', () => {
    const h = hubHtml(ctx(signed(), { mode: '5v5' }));
    expect(h).toMatch(/id="playbtn" disabled|disabled id="playbtn"|data-act="play" disabled/);
    expect(h).toMatch(/CHOG HOLDERS ONLY<\/b> · Sign in with your Chog wallet/);
    expect(h).toMatch(/data-act="chog">Enter with CHOG/);
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
    expect(h).toMatch(/id="chogname">Blaze</);
    expect(h).toMatch(/#53/);
    expect(h).toMatch(/✓ Monad/);
    expect(h).toMatch(/Flashfire/);
    expect(h).toMatch(/Telegraph/);
    expect(h).toMatch(/Counter/);
    expect(h).toMatch(/2M · 1W · 3K/); // the token's own history
    expect(h).not.toMatch(/CHOG HOLDERS ONLY/);
    expect(fiveLockReason(a)).toBeNull();
    expect(classOf(a)).toMatchObject({ source: 'token', tier: 'legendary', metadataId: 53 });
    // Owner 2026-10-18: no rarity health or damage; the 1:1 plays its signature in the ability slot.
    expect(classOf(a).power.hpMul).toBe(1);
    expect(classOf(a).power.signature?.name).toBe('Flashfire');
  });
  it('NFT combat switched off: the token still shows, power is free, and the hub says so', () => {
    const a = { ...holder(), config: { ...cfg, nftCombat: false } };
    expect(classOf(a).tier).toBe('free');
    expect(hubHtml(ctx(a))).toMatch(/NFT power off/);
  });
  it('a squad shows its code and members; a follower cannot start the match', () => {
    const party = { code: 'AB2CD', members: [{ name: 'Lead', hero: 'benja', tier: 'free' as const, holder: false, demo: false, you: false, leader: true, ready: true }, { name: 'Me', hero: 'tabsu', tier: 'epic' as const, holder: true, demo: false, you: true, leader: false, ready: true }] };
    const h = hubHtml(ctx(signed(), { mode: '3v3', net: { url: 'ws://x/ws', state: 'idle', message: '', queue: null, rtt: 0, party, follower: true } }));
    expect(h).toMatch(/AB2CD/);
    expect(h).toMatch(/Leader starts the match/);
    expect(h).toMatch(/2\/5/);
    expect(h).toMatch(/data-act="squad-leave"/);
  });
});

describe('sub-screens', () => {
  it('upgrades: guest is told to sign in; signed in shows ranks, costs and the class table', () => {
    expect(upgradesHtml(ctx(guest()))).toMatch(/data-act="signin">Sign in/);
    const u = upgradesHtml(ctx(signed({ profile: prof({ upgrades: { ...NO_UPGRADES, vitality: 8 } }), justBought: 'plating' })));
    expect(u).toMatch(/MAX/);
    expect(u).toMatch(/data-upgrade="plating"/);
    expect(u).toMatch(/class="up-grid"/);
    expect(u).toMatch(/upcard bought" data-up="plating"/);
    expect(u).toMatch(/Class · Free/);
  });
  it('leaderboard: full columns, own row beyond the shown ranks, tier shown not ranked', () => {
    const row = (rank: number, you = false) => ({ rank, name: `P${rank}`, kills: 10 - rank, matches: 3, wins: 1, xp: 0, level: 1, rating: 1000, nftTier: rank === 1 ? 'rare' as const : null, you });
    // GP: two boards; the online one keeps the owner's columns, the Chog tier is a badge beside the name.
    const b = boardScreenHtml(ctx(signed({ board: [row(1), row(2)], boardMe: row(77, true), boardTab: 'online' })));
    for (const col of ['Kills', 'Wins', 'Matches', 'Level', 'Rating']) expect(b).toContain(`<th>${col}</th>`);
    expect(b).toMatch(/P77 <em>you<\/em>/);
    expect(b).toMatch(/tier-rare/);
    expect(b).toMatch(/Kills in saved online matches · then wins · then fewer matches/);
    const solo = boardScreenHtml(ctx(signed({ board: [row(1)], boardMe: row(1, true), boardTab: 'solo' })));
    for (const col of ['Kills', 'Clears', 'Runs', 'Level']) expect(solo).toContain(`<th>${col}</th>`);
    expect(solo).not.toContain('<th>Rating</th>');
  });
  it('career: online and practice careers from the account', () => {
    const c = careerHtml(ctx(signed()));
    expect(c).toMatch(/<h3>Online<\/h3>/);
    expect(c).toMatch(/data-fav="benja"/);
    expect(c).toMatch(/Kills<\/td><td class="num">4/);
  });
  it('online results: every reward line, totals, rating, level bar, what the shards buy, play again', () => {
    const b = rewardBreakdown({ won: true, kills: 1, damage: 100, seconds: 60, leftEarly: false, capped: false });
    const html = onlineResultsHtml({
      mode: '1v1', won: true, reason: 'eliminated', team: 'alpha', demo: false, signedIn: true, settle: true, myClass: 'Free class', canRequeue: true, follower: false,
      rows: [{ name: 'Me', hero: 'benja', team: 'alpha', kills: 1, damageDealt: 100, damageTaken: 20, alive: true, cause: null, you: true, tier: 'free', demo: false, metadataId: null }],
      prog: { before: { xp: 90, shards: 0, rating: 1000 }, reward: { xp: b.xp, shards: b.shards, ratingBefore: 1000, ratingAfter: 1012, lines: b.lines, none: null }, pending: false, note: '', upgradesReady: 2, upgrades: NO_UPGRADES, preview: null },
    });
    expect(html).toMatch(/Victory/);
    for (const l of ['Match played', 'Victory', '1 kill', '100 damage']) expect(html).toContain(l);
    expect(html).toContain(`id="rw-shards">+${b.shards}<`);
    expect(html).toContain(`id="rw-xp">+${b.xp} XP<`);
    expect(html).toMatch(/\+12/);
    expect(html).toMatch(/LEVEL UP/);
    // 40 shards after the match: every rank they buy now, by name and cost.
    expect(html).toMatch(/3 upgrades ready: Vitality 1 \(10\) · Plating 1 \(10\) · Focus 1 \(30\)/);
    expect(html).toMatch(/id="toupgrades">Upgrades/);
    expect(html).toMatch(/data-go="menu" id="continuebtn">Continue/);
    expect(html).toMatch(/data-act="online-again"/);
  });
  it('tier effects come from the power table and say speed never changes', () => {
    expect(tierEffect('free')).toMatch(/upgrades/);
    expect(tierEffect('common')).toBe('Base stats. The Chog\'s superpower plays at Common rank. Speed never changes.');
    expect(tierEffect('legendary')).toMatch(/Base stats and its own signature ability/);
  });
});
