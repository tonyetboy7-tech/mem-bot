import { CFG } from './config';
import { Candidate } from './types';
import { clamp, pctRank } from './util';

/** raw "how much mem likes it" metrics. Every one is published. */
export function metrics(c: Candidate) {
  const avgHour6 = Math.max(1, c.v6h / 6);
  const total = Math.max(1, c.buys1h + c.sells1h);
  return {
    momentum: c.v1h / avgHour6,                                   // this hour vs its recent average
    crowd: c.buys1h * (c.buys1h / total),                         // many buyers, mostly buying
    attention: (c.geckoRank ? (21 - Math.min(20, c.geckoRank)) / 20 : 0) * 2
      + (c.x ? 0.5 : 0) + (c.site ? 0.25 : 0) + Math.log1p(c.xMentions1h || 0),
    strength: clamp(c.chg1h, -15, 150) + 0.3 * clamp(c.chg6h, -50, 300),
    depth: c.liqUsd / Math.max(1, c.mcap),                        // healthy liquidity for its size
  };
}

/** rank every candidate against the others in the same hour, 0-100 */
export function scoreAll(cands: Candidate[], w = CFG.weights): Candidate[] {
  const ms = cands.map(metrics);
  const keys = Object.keys(w) as (keyof typeof w)[];
  const ranks: Record<string, number[]> = {};
  for (const k of keys) ranks[k] = pctRank(ms.map(m => m[k]));
  cands.forEach((c, i) => {
    c.parts = {};
    let s = 0;
    for (const k of keys) { const p = Math.round(ranks[k][i] * 100); c.parts[k] = p; s += p * w[k]; }
    c.score = Math.round(s);
  });
  return cands.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}
