import { CFG } from './config';
import type { Snapshot } from './holders';

/** balance that counts = the lowest a wallet held across this hour's snapshots */
export function eligible(snaps: Snapshot[], minHold = CFG.minHold): Map<string, bigint> {
  const out = new Map<string, bigint>();
  if (!snaps.length) return out;
  for (const owner of Object.keys(snaps[snaps.length - 1])) {
    let min: bigint | null = null;
    for (const s of snaps) {
      if (s[owner] === undefined) { min = null; break; }
      const b = BigInt(s[owner]);
      if (min === null || b < min) min = b;
    }
    if (min !== null && min >= minHold) out.set(owner, min);
  }
  return out;
}

/** top N wallets, paid in proportion to the $MEM they held all hour. No wallet takes more than the cap; the extra goes to everyone else. */
export function computeShares(elig: Map<string, bigint>, topN = CFG.topN, cap = CFG.maxSharePct) {
  const top = [...elig.entries()].sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0)).slice(0, topN);
  if (!top.length) return [];
  const capEff = top.length * cap < 1 ? 1 : cap; // with very few holders a cap can't apply
  const total = top.reduce((s, [, b]) => s + Number(b), 0);
  const shares = top.map(([, b]) => Number(b) / total);
  const capped = shares.map(() => false);
  for (let it = 0; it < 50; it++) {
    let excess = 0;
    shares.forEach((v, i) => { if (!capped[i] && v > capEff + 1e-12) { excess += v - capEff; shares[i] = capEff; capped[i] = true; } });
    if (excess <= 0) break;
    const room = shares.reduce((s, v, i) => s + (capped[i] ? 0 : v), 0);
    if (room <= 0) break;
    shares.forEach((v, i) => { if (!capped[i]) shares[i] = v + excess * (v / room); });
  }
  return top.map(([wallet, bal], i) => ({ wallet, balance: bal.toString(), share: shares[i] }));
}

/** split a raw token amount by shares (rounded down; dust stays with mem for the next drop) */
export function splitAmount(total: bigint, shares: number[]): bigint[] {
  const P = 1_000_000_000_000n;
  return shares.map(s => (total * BigInt(Math.floor(s * 1e12))) / P);
}
