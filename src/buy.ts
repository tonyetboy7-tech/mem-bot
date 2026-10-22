import { VersionedTransaction } from '@solana/web3.js';
import { CFG, SOL_MINT } from './config';
import { wallet } from './solana';
import { getJSON } from './util';

const JUP = 'https://api.jup.ag/swap/v2';
const hdr = (): Record<string, string> => (CFG.jupKey ? { 'x-api-key': CFG.jupKey } : {});

/** price check only (no wallet attached) */
export async function quote(inputMint: string, outputMint: string, amount: bigint): Promise<bigint | null> {
  try {
    const q = await getJSON<any>(`${JUP}/order?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}`, { headers: hdr() }, 2);
    return q.outAmount ? BigInt(q.outAmount) : null;
  } catch { return null; }
}

/** buy `lamports` worth of `mint` with mem's wallet */
export async function buy(mint: string, lamports: bigint): Promise<{ sig?: string; out: bigint }> {
  if (CFG.dryRun) return { out: (await quote(SOL_MINT, mint, lamports)) ?? 0n };
  const me = wallet();
  const order = await getJSON<any>(`${JUP}/order?inputMint=${SOL_MINT}&outputMint=${mint}&amount=${lamports}&taker=${me.publicKey.toBase58()}`, { headers: hdr() }, 2);
  if (!order.transaction) throw new Error(`jupiter: no transaction (${order.errorMessage || order.errorCode || 'unknown'})`);
  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, 'base64'));
  tx.sign([me]);
  const res = await fetch(`${JUP}/execute`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...hdr() },
    body: JSON.stringify({ signedTransaction: Buffer.from(tx.serialize()).toString('base64'), requestId: order.requestId }),
    signal: AbortSignal.timeout(60000),
  }).then(r => r.json() as Promise<any>);
  if (res.status !== 'Success' && res.code !== 0) throw new Error(`jupiter execute failed: ${JSON.stringify(res).slice(0, 300)}`);
  return { sig: res.signature, out: BigInt(res.outputAmountResult ?? res.totalOutputAmount ?? order.outAmount ?? 0) };
}
