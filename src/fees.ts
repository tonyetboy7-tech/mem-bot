import { VersionedTransaction } from '@solana/web3.js';
import { CFG } from './config';
import { wallet, solBalance, sendSigned } from './solana';
import { log } from './util';

/** Claim all pump.fun creator fees into mem's wallet. Returns SOL actually gained. */
export async function claimCreatorFees(): Promise<{ sol: number; tx?: string }> {
  if (CFG.testMode) return { sol: 0 }; // test: no coin yet, mem spends the SOL you sent him
  if (CFG.dryRun) return { sol: CFG.dryRunFeeSol };
  const me = wallet();
  const before = await solBalance(me.publicKey);
  const r = await fetch('https://pumpportal.fun/api/trade-local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicKey: me.publicKey.toBase58(), action: 'collectCreatorFee', priorityFee: 0.00001 }),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status !== 200) { log('claim: nothing to claim or error', r.status, await r.text().catch(() => '')); return { sol: 0 }; }
  const tx = VersionedTransaction.deserialize(new Uint8Array(await r.arrayBuffer()));
  tx.sign([me]);
  const sig = await sendSigned(tx);
  const after = await solBalance(me.publicKey);
  return { sol: Math.max(0, after - before), tx: sig };
}
