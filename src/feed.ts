import fs from 'node:fs';
import path from 'node:path';
import { CFG } from './config';
import { State } from './state';
import { walletAddress } from './solana';
import { getJSON } from './util';

export const feedPath = () => path.join(CFG.dataDir, 'public', 'feed.json');

/** everything the website shows. Public on purpose. */
export function writeFeed(s: State) {
  const now = new Date();
  const next = new Date(now); next.setUTCMinutes(60, 0, 0);
  const lr = s.lastRun;
  const feed = {
    v: 1, dryRun: CFG.dryRun, test: CFG.testMode, testHolders: CFG.testMode ? s.testHolders || [] : undefined, memBalanceSol: s.memBalanceSol,
    updatedAt: now.toISOString(), nextRunAt: s.nextRunAt || next.toISOString(), status: s.status,
    wallets: { mem: walletAddress(), memMint: CFG.memMint },
    piggy: { sol: +s.piggySol.toFixed(4), target: !s.firstTripDone && !CFG.testMode ? CFG.firstTripSol : CFG.minDropSol },
    firstTrip: { target: CFG.firstTripSol, done: !!s.firstTripDone || CFG.testMode },
    radar: s.radar || [], radarNo: s.radarNo || [], radarAt: s.radarAt,
    totals: s.totals,
    rules: {
      test: CFG.testMode, pumpOnly: CFG.pumpOnly, firstTripSol: CFG.firstTripSol, neverRebuy: true,
      gasPct: CFG.gasPct, minDropSol: CFG.minDropSol, topN: CFG.topN, minHold: CFG.minHold.toString(), maxSharePct: CFG.maxSharePct,
      maxPoolPct: CFG.maxPoolPct, filters: CFG.filters, safety: CFG.safety, weights: CFG.weights,
    },
    lastRun: lr ? { hour: lr.hour, claimedSol: lr.claimedSol, claimTx: lr.claimTx, note: lr.note, picks: lr.picks,
      ...(CFG.testMode ? { errors: lr.errors || [], pending: s.pending.length } : {}) } : null,
    history: s.history.slice(0, 48).map((h, i) => (i === 0 || !h.drop ? h : { ...h, drop: { ...h.drop, recipients: [] } })),
    board: s.board.slice(0, CFG.topN), cutoff: s.cutoff,
    paid: s.paid,
  };
  fs.mkdirSync(path.dirname(feedPath()), { recursive: true });
  fs.writeFileSync(feedPath() + '.tmp', JSON.stringify(feed));
  fs.renameSync(feedPath() + '.tmp', feedPath());
}

/** update "since mem bought" for past picks */
export async function refreshPrices(s: State) {
  const mints = [...new Set(s.history.slice(0, 30).map(h => h.mint))];
  if (!mints.length) return;
  try {
    const pairs = await getJSON<any[]>(`https://api.dexscreener.com/tokens/v1/solana/${mints.join(',')}`);
    for (const h of s.history.slice(0, 30)) {
      const p = pairs.filter(x => x.baseToken?.address === h.mint).sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (!p) continue;
      h.nowPriceUsd = Number(p.priceUsd || 0);
      if (h.buyPriceUsd > 0) h.sinceBuyPct = Math.round((h.nowPriceUsd / h.buyPriceUsd - 1) * 1000) / 10;
    }
  } catch { /* keep old numbers */ }
}
