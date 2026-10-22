import { PublicKey } from '@solana/web3.js';
import { CFG, LAMPORTS, SOL_MINT } from './config';
import { conn, mintInfo } from './solana';
import { quote } from './buy';
import { Candidate } from './types';
import { getJSON, log, sleep } from './util';

/** only these RugCheck findings block a buy. Everything else RugCheck flags (low liquidity, holder spread, mutable metadata, creator history...) is normal for memes and ignored. */
const SERIOUS = /freeze|mint authority|mintable|honeypot|rugged/i;

/** share of supply held by the 10 biggest real wallets (pools, curves and lockers are programs, so they're skipped) */
async function top10Share(mint: string, supply: bigint): Promise<number> {
  const largest = await conn.getTokenLargestAccounts(new PublicKey(mint));
  const accts = largest.value.slice(0, 20);
  const infos = await conn.getMultipleParsedAccounts(accts.map(a => a.address));
  let sum = 0n, n = 0;
  infos.value.forEach((inf, i) => {
    const owner = (inf?.data as any)?.parsed?.info?.owner;
    if (!owner || n >= 10) return;
    if (!PublicKey.isOnCurve(new PublicKey(owner).toBytes())) return;
    sum += BigInt(accts[i].amount); n++;
  });
  return supply > 0n ? Number((sum * 10000n) / supply) / 10000 : 1;
}

async function quoteRetry(a: string, b: string, amt: bigint) {
  for (let i = 0; i < 3; i++) { const q = await quote(a, b, amt); if (q) return q; await sleep(1500 * (i + 1)); }
  return null;
}

/** deep checks, run only on the top-scoring coins. Returns why mem says no, or null. */
export async function deepCheck(c: Candidate): Promise<string | null> {
  const s = CFG.safety;
  let info;
  for (let i = 0; i < 2 && !info; i++) { try { info = await mintInfo(c.mint); } catch { await sleep(1500); } }
  if (!info) return 'could not read token';
  if (info.mintAuthority) return 'can still be minted';
  if (info.freezeAuthority) return 'can freeze wallets';
  try {
    const rc = await getJSON<any>(`https://api.rugcheck.xyz/v1/tokens/${c.mint}/report/summary`, {}, 2);
    const bad = (rc.risks || []).find((r: any) => String(r.level).toLowerCase() === 'danger' && SERIOUS.test(String(r.name)));
    if (bad) return `rugcheck: ${String(bad.name).toLowerCase()}`;
  } catch { /* rugcheck down: other checks still apply */ }
  try { if ((await top10Share(c.mint, info.supply)) > s.maxTop10) return `top 10 wallets hold over ${Math.round(s.maxTop10 * 100)}%`; }
  catch (e) { log(`holder check skipped for $${c.symbol}`, (e as Error).message); }
  const probe = BigInt(Math.round(s.probeSol * LAMPORTS));
  const got = await quoteRetry(SOL_MINT, c.mint, probe);
  if (!got) return CFG.jupKey ? 'no buy route on Jupiter' : 'no buy route (add a JUPITER_API_KEY)';
  const back = await quoteRetry(c.mint, SOL_MINT, got);
  if (!back) return 'no sell route on Jupiter';
  const loss = 1 - Number(back) / Number(probe);
  if (loss > s.maxRoundTripLoss) return `sell test lost ${Math.round(loss * 100)}%`;
  return null;
}
