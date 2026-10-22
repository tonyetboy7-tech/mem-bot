import { ComputeBudgetProgram, PublicKey, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { CFG } from './config';
import { conn, wallet, sendSigned, confirmSig, MintInfo } from './solana';
import { log } from './util';
export { computeShares, splitAmount } from './shares';

/** send the tokens. Opens each holder's token account if needed (that rent stays in their wallet). */
export async function airdrop(mint: string, info: MintInfo, list: { wallet: string; amount: bigint }[]): Promise<{ sigs: string[]; failed: { wallet: string; amount: bigint }[]; error?: string }> {
  const me = wallet();
  const mintPk = new PublicKey(mint);
  const from = getAssociatedTokenAddressSync(mintPk, me.publicKey, false, info.programId);
  const sigs: string[] = [];
  const failed: { wallet: string; amount: bigint }[] = [];
  let error: string | undefined;
  const todo = list.filter(r => r.amount > 0n);
  for (let i = 0; i < todo.length; i += CFG.batchSize) {
    const batch = todo.slice(i, i + CFG.batchSize);
    const ixs: TransactionInstruction[] = [
      ComputeBudgetProgram.setComputeUnitLimit({ units: 60_000 * batch.length + 20_000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: CFG.priorityMicroLamports }),
    ];
    for (const r of batch) {
      const owner = new PublicKey(r.wallet);
      const to = getAssociatedTokenAddressSync(mintPk, owner, false, info.programId);
      ixs.push(createAssociatedTokenAccountIdempotentInstruction(me.publicKey, to, owner, mintPk, info.programId));
      ixs.push(createTransferCheckedInstruction(from, mintPk, to, me.publicKey, r.amount, info.decimals, [], info.programId));
    }
    try {
      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      const msg = new TransactionMessage({ payerKey: me.publicKey, recentBlockhash: blockhash, instructions: ixs }).compileToV0Message();
      const tx = new VersionedTransaction(msg);
      tx.sign([me]);
      sigs.push(await sendSigned(tx));
    } catch (e) {
      const late = (e as any).sig as string | undefined;
      if (late) { try { await confirmSig(late); sigs.push(late); continue; } catch { /* really failed */ } }
      error = (e as Error).message;
      log(`airdrop batch ${i / CFG.batchSize + 1} failed`, error);
      failed.push(...batch);
    }
  }
  return { sigs, failed, error };
}
