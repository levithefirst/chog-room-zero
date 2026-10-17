// The reward block on both results screens (owner 2026-10-17): what this match paid, line by line, and what the
// shards are for. The lines are the site's (the numbers it applied); a guest sees what the same match would have paid.
import { UPGRADES, UPGRADE_IDS, type Upgrades } from '../config/power';
import { levelOf, type NoReward, type RewardLine } from '../config/progression';
import { esc } from './screens';

export const NO_REWARD_TEXT: Record<Exclude<NoReward, null>, string> = {
  short: 'Under 20 s: no reward',
  left: 'You left before the end: no reward',
  cap: 'Daily reward limit reached: resets over 24 h',
  private: 'Private room: no rewards',
  demo: 'Demo: no rewards',
  lab: 'Lab room: no rewards',
  unverified: 'Run could not be verified: no reward',
};

/** The cheapest next rank, and whether the account can buy it now. */
export function nextUpgrade(shards: number, up: Upgrades): { name: string; rank: number; cost: number; ready: boolean } | null {
  let best: { name: string; rank: number; cost: number; ready: boolean } | null = null;
  for (const id of UPGRADE_IDS) {
    const def = UPGRADES[id], r = up[id];
    if (r >= def.ranks) continue;
    const cost = def.costs[r];
    if (!best || cost < best.cost) best = { name: def.name, rank: r + 1, cost, ready: shards >= cost };
  }
  return best;
}

export interface RewardView {
  lines: RewardLine[];
  xp: number;
  shards: number;
  none: NoReward;
  /** Paid to the account (signed in), or a preview of what it would pay (guest). */
  kept: boolean;
  /** XP and shards before this match (signed in), for the level bar and the shard total. */
  before: { xp: number; shards: number } | null;
  /** The account's upgrades after this match (signed in). */
  upgrades: Upgrades | null;
  /** Online only: the rating change. */
  rating?: { before: number; after: number };
}

export function rewardHtml(v: RewardView): string {
  if (v.none) return `<div class="rewards none" id="rewards"><p class="pb">${esc(NO_REWARD_TEXT[v.none])}</p></div>`;
  const rows = v.lines.map((l) => `<li><span>${esc(l.label)}</span><b class="num">${l.shards ? `+${l.shards}` : ''}</b><small class="num">${l.xp ? `+${l.xp} XP` : ''}</small></li>`).join('');
  const total = `<li class="total"><span>${v.kept ? 'Earned' : 'Would earn'}</span><b class="num" id="rw-shards">+${v.shards}</b><small class="num" id="rw-xp">+${v.xp} XP</small></li>`;
  let foot = '';
  if (!v.kept) foot = '<p class="note small" id="rw-keep">Sign in to keep shards and XP</p>';
  else if (v.before && v.upgrades) {
    const lb = levelOf(v.before.xp), la = levelOf(v.before.xp + v.xp);
    const have = v.before.shards + v.shards;
    const nx = nextUpgrade(have, v.upgrades);
    const d = v.rating ? v.rating.after - v.rating.before : null;
    foot = `<div class="rw-foot"><div class="rw lv"><span>Level ${la.level}${la.level > lb.level ? ' <em class="lvup">LEVEL UP</em>' : ''}</span><div class="xpbar big"><i class="was" style="width:${la.level > lb.level ? 0 : Math.round((lb.into / lb.next) * 100)}%"></i><i class="now" style="width:${Math.round((la.into / la.next) * 100)}%"></i></div><small class="num">${la.into} / ${la.next} XP</small></div>
${d !== null ? `<div class="rw"><span>Rating</span><b class="num ${d >= 0 ? 'up' : 'down'}">${d >= 0 ? '+' : ''}${d}</b><small class="num">${v.rating!.before} → ${v.rating!.after}</small></div>` : ''}</div>
<p class="rw-use" id="rw-use"><span class="num">${have}</span> shards · ${nx ? (nx.ready ? `<b class="good">${esc(nx.name)} ${nx.rank} ready (${nx.cost})</b>` : `${esc(nx.name)} ${nx.rank} costs ${nx.cost}, ${nx.cost - have} to go`) : 'every upgrade maxed'}</p>`;
  }
  return `<div class="rewards" id="rewards"><ul class="rw-lines"><li class="head"><span></span><b>Shards</b><small>XP</small></li>${rows}${total}</ul>${foot}</div>`;
}
