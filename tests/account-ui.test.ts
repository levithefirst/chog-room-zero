// Stage E: what the account and class-system screens say, from plain data.
import { describe, expect, it } from 'vitest';
import { emptyAcct, fiveLock, onlineIdentityHtml, progressTabHtml, rewardLine, tierEffect } from '../src/ui/account';
import { NO_UPGRADES } from '../src/config/power';

const cfg = { db: true, nftCombat: false, demo: true };
const tok = { tokenId: 5, metadataId: 53, name: 'Chog #53', tier: 'legendary' as const, tierLabel: '1:1', signature: { name: 'Flashfire', text: 'x' }, history: null };

describe('5v5 lock (display only; the server enforces it)', () => {
  it('locked for guests and non-holders, open for a held token, a demo token, or a server-verified holder', () => {
    const a = emptyAcct();
    expect(fiveLock(a, null)).toMatch(/holders only/);
    expect(fiveLock({ ...a, choice: { demo: 53 } }, null)).toBeNull();
    expect(fiveLock({ ...a, tokens: [tok], choice: { tokenId: 5 } }, null)).toBeNull();
    expect(fiveLock({ ...a, choice: { tokenId: 99 }, tokens: [tok] }, null)).toMatch(/holders only/);
    expect(fiveLock(a, { verified: true, holder: true, demo: false, tier: 'free', account: true, metadataId: 53, note: null })).toBeNull();
  });
});

describe('identity panel', () => {
  it('says plainly when NFT combat power is off, labels demo, and never claims a check that did not happen', () => {
    const held = onlineIdentityHtml({ ...emptyAcct(), config: cfg, signedIn: true, hasWallet: true, tokens: [tok], choice: { tokenId: 5 } }, null, null);
    expect(held).toMatch(/switched off until the Core Feel Gate/);
    expect(held).toMatch(/verified on Monad when you connect/);
    const demo = onlineIdentityHtml({ ...emptyAcct(), config: cfg, choice: { demo: 1373 } }, null, '1373');
    expect(demo).toMatch(/DEMO/);
    expect(demo).toMatch(/no ownership check/);
    expect(demo).toMatch(/earn nothing/);
    expect(onlineIdentityHtml(emptyAcct(), null, null)).toMatch(/free profile/);
    expect(onlineIdentityHtml({ ...emptyAcct(), config: cfg, signedIn: true, hasWallet: true, tokens: [], tokensError: 'chain_unavailable' }, null, null)).toMatch(/could not be verified/);
  });
  it('tier effects come from the power table and say speed never changes', () => {
    expect(tierEffect('free')).toBe('Base operator.');
    expect(tierEffect('common')).toBe('+6% health, +6 armour. Speed never changes.');
    expect(tierEffect('legendary')).toMatch(/\+25% health, \+18 armour, \+5% damage, signature ability/);
  });
});

describe('progress tab and rewards', () => {
  it('guest, offline database, and a signed-in profile with upgrades', () => {
    expect(progressTabHtml({ ...emptyAcct(), config: cfg })).toMatch(/Sign in/);
    expect(progressTabHtml({ ...emptyAcct(), config: cfg, signedIn: true })).toMatch(/offline/);
    const html = progressTabHtml({ ...emptyAcct(), config: cfg, signedIn: true, progression: true,
      profile: { account: 'abc', xp: 150, level: 2, into: 50, next: 150, shards: 45, rating: 1012, matches: 3, wins: 2, upgrades: { ...NO_UPGRADES, vitality: 3 } }, board: [] });
    expect(html).toMatch(/Level 2/);
    expect(html).toMatch(/max/);
    expect(html).toMatch(/cannot be bought/);
    expect(html).toMatch(/data-upgrade="plating">40 shards/);
    expect(html).toMatch(/data-upgrade="focus">30 shards/);
  });
  it('reward line: demo, unsaved, pending, credited', () => {
    expect(rewardLine({ settle: true }, true, true, null, false, '')).toMatch(/DEMO/);
    expect(rewardLine({ settle: false }, false, false, null, false, '')).toMatch(/Sign in/);
    expect(rewardLine({ settle: true }, false, true, null, true, '')).toMatch(/Saving/);
    expect(rewardLine({ settle: true }, false, true, { xp: 110, shards: 15, ratingBefore: 1000, ratingAfter: 1012 }, false, '')).toMatch(/\+110 XP · \+15 shards · rating 1000 → 1012/);
  });
});
