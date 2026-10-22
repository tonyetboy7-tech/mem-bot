import { PublicKey } from '@solana/web3.js';
import { CFG } from './config';
import { walletAddress } from './solana';
import { getJSON, sleep } from './util';

export type Snapshot = Record<string, string>; // owner -> raw balance

/** every real wallet holding $MEM, with balance. Program-owned accounts (bonding curve, pools, lockers) and excluded wallets are dropped. */
export async function snapshot(mint: string): Promise<Snapshot> {
  const totals = new Map<string, bigint>();
  for (let page = 1; page < 200; page++) {
    const r = await getJSON<any>(CFG.rpc, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'mem', method: 'getTokenAccounts', params: { mint, page, limit: 1000, displayOptions: {} } }),
    });
    // an error reply (rate limit, bad key) must never look like "nobody holds $MEM"
    if (r?.error || !r?.result) throw new Error(`helius: ${JSON.stringify(r?.error ?? r).slice(0, 200)}`);
    const accts: any[] = r.result.token_accounts || [];
    if (!accts.length) break;
    for (const a of accts) totals.set(a.owner, (totals.get(a.owner) || 0n) + BigInt(a.amount));
    if (accts.length < 1000) break;
    await sleep(600); // Helius free plan allows 2 DAS requests a second
  }
  const skip = new Set([...CFG.exclude, walletAddress(), '1nc1nerator11111111111111111111111111111111']);
  const out: Snapshot = {};
  for (const [owner, bal] of totals) {
    if (bal < CFG.minHold || skip.has(owner)) continue;
    try { if (!PublicKey.isOnCurve(new PublicKey(owner).toBytes())) continue; } catch { continue; }
    out[owner] = bal.toString();
  }
  return out;
}

export { eligible } from './shares';
