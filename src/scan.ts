import { CFG, SOL_MINT } from './config';
import { Candidate } from './types';
import { getJSON, log, sleep } from './util';

const STABLES = new Set([SOL_MINT, 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB']);
const QUOTES = new Set(['SOL', 'WSOL', 'USDC']);

/** Step 1: find every Solana coin that is trending right now */
export async function discover(): Promise<Map<string, { geckoRank?: number; boosted?: boolean }>> {
  const found = new Map<string, { geckoRank?: number; boosted?: boolean }>();
  const add = (mint: string, v: { geckoRank?: number; boosted?: boolean }) => {
    if (!mint || STABLES.has(mint) || mint === CFG.memMint) return;
    found.set(mint, { ...(found.get(mint) || {}), ...v });
  };
  try {
    for (const page of [1, 2]) {
      const base = `https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token&page=${page}`;
      const g = await getJSON<any>(`${base}&duration=1h`, {}, 2).catch(() => getJSON<any>(base, {}, 2));
      (g.data || []).forEach((p: any, i: number) => {
        const id: string = p?.relationships?.base_token?.data?.id || '';
        add(id.replace(/^solana_/, ''), { geckoRank: (page - 1) * 20 + i + 1 });
      });
      await sleep(6500);
    }
  } catch (e) { log('geckoterminal trending failed', (e as Error).message); }
  /* coins trending over the last 6 hours too, so mem's radar isn't just this minute's top 20 */
  try {
    const g6 = await getJSON<any>('https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?include=base_token&duration=6h&page=1', {}, 2);
    (g6.data || []).forEach((p: any) => add(String(p?.relationships?.base_token?.data?.id || '').replace(/^solana_/, ''), {}));
  } catch (e) { log('geckoterminal 6h trending failed', (e as Error).message); }
  await sleep(6500);
  /* busiest pump.fun pools right now (bonding curve + PumpSwap) */
  for (const dex of ['pumpswap', 'pump-fun']) {
    try {
      const g = await getJSON<any>(`https://api.geckoterminal.com/api/v2/networks/solana/dexes/${dex}/pools?include=base_token&page=1`, {}, 2);
      (g.data || []).forEach((p: any) => add(String(p?.relationships?.base_token?.data?.id || '').replace(/^solana_/, ''), {}));
    } catch (e) { log(`geckoterminal ${dex} pools failed`, (e as Error).message); }
    await sleep(6500);
  }
  try {
    const top = await getJSON<any[]>('https://api.dexscreener.com/token-boosts/top/v1');
    top.filter(t => t.chainId === 'solana').forEach(t => add(t.tokenAddress, { boosted: true }));
    const prof = await getJSON<any[]>('https://api.dexscreener.com/token-profiles/latest/v1');
    prof.filter(t => t.chainId === 'solana').forEach(t => add(t.tokenAddress, {}));
  } catch (e) { log('dexscreener discovery failed', (e as Error).message); }
  return found;
}

/** Step 2: pull live market data for each coin (its deepest SOL/USDC pool) */
export async function marketData(found: Map<string, { geckoRank?: number; boosted?: boolean }>): Promise<Candidate[]> {
  const mints = [...found.keys()];
  const out: Candidate[] = [];
  for (let i = 0; i < mints.length; i += 30) {
    const chunk = mints.slice(i, i + 30);
    let pairs: any[] = [];
    try { pairs = await getJSON<any[]>(`https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`); }
    catch (e) { log('dexscreener tokens failed', (e as Error).message); continue; }
    for (const mint of chunk) {
      const best = pairs
        .filter(p => p.baseToken?.address === mint && QUOTES.has(String(p.quoteToken?.symbol).toUpperCase()))
        .sort((a, b) => (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0))[0];
      if (!best) continue;
      const socials: any[] = best.info?.socials || [];
      const xs = socials.find(s => s.type === 'twitter' || /x\.com|twitter\.com/.test(s.url || ''));
      out.push({
        mint, symbol: best.baseToken.symbol, name: best.baseToken.name, image: best.info?.imageUrl,
        pairAddress: best.pairAddress, dexId: best.dexId, url: best.url,
        priceUsd: Number(best.priceUsd || 0), priceNative: Number(best.priceNative || 0),
        mcap: Number(best.marketCap || best.fdv || 0), liqUsd: Number(best.liquidity?.usd || 0),
        v1h: Number(best.volume?.h1 || 0), v6h: Number(best.volume?.h6 || 0),
        buys1h: Number(best.txns?.h1?.buys || 0), sells1h: Number(best.txns?.h1?.sells || 0),
        chg5m: Number(best.priceChange?.m5 || 0), chg1h: Number(best.priceChange?.h1 || 0), chg6h: Number(best.priceChange?.h6 || 0),
        ageH: best.pairCreatedAt ? (Date.now() - best.pairCreatedAt) / 3.6e6 : 0,
        x: xs?.url, site: best.info?.websites?.[0]?.url,
        ...found.get(mint),
      });
    }
  }
  return out;
}

/** Step 3: quick rules. Returns why mem says no, or null. */
export function quickReject(c: Candidate, recent: Record<string, number>, f: typeof CFG.filters = CFG.filters): string | null {
  if (CFG.denylist.includes(c.mint)) return 'on the no list';
  if (CFG.pumpOnly && !(c.mint.endsWith('pump') || c.dexId === 'pumpswap' || c.dexId === 'pumpfun')) return 'not a pump.fun coin';
  if (recent[c.mint] && Date.now() - recent[c.mint] < f.cooldownH * 3.6e6) return 'already bought today';
  if (c.ageH < f.minAgeH) return 'too new';
  if (c.ageH > f.maxAgeDays * 24) return 'too old';
  if (c.mcap < f.minMcap) return 'too small';
  if (c.mcap > f.maxMcap) return 'already huge';
  if (c.liqUsd < f.minLiq) return 'thin liquidity';
  if (c.v1h < f.minVol1h) return 'quiet hour';
  if (c.buys1h + c.sells1h < f.minTx1h) return 'not enough traders';
  if (c.chg1h > f.maxChg1h) return 'too hot right now';
  if (c.chg1h < f.minChg1h || c.chg5m < f.minChg5m) return 'dumping';
  if (f.requireX && !c.x) return 'no X account';
  return null;
}

/** Optional: X mentions of $TICKER in the last hour (needs a paid X API plan) */
export async function xMentions(symbol: string): Promise<number | undefined> {
  if (!CFG.xBearer) return undefined;
  try {
    const q = encodeURIComponent(`$${symbol} -is:retweet`);
    const r = await getJSON<any>(`https://api.x.com/2/tweets/counts/recent?query=${q}&granularity=hour`, { headers: { Authorization: `Bearer ${CFG.xBearer}` } }, 1);
    const d = r.data || [];
    return d.length ? Number(d[d.length - 1].tweet_count || 0) : 0;
  } catch { return undefined; }
}
