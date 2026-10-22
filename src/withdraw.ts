/** send everything in mem's wallet to an address: leftover tokens, the rent from closing his token accounts, then all SOL.
 *  usage: npm run withdraw -- YOUR_WALLET_ADDRESS */
import { ComputeBudgetProgram, PublicKey, SystemProgram, TransactionInstruction, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, createCloseAccountInstruction, createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { conn, wallet, sendSigned } from './solana';
import { log } from './util';

async function send(ixs: TransactionInstruction[], priority = true) {
  const me = wallet();
  const { blockhash } = await conn.getLatestBlockhash('confirmed');
  const all = priority ? [ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 20000 }), ...ixs] : ixs;
  const tx = new VersionedTransaction(new TransactionMessage({ payerKey: me.publicKey, recentBlockhash: blockhash, instructions: all }).compileToV0Message());
  tx.sign([me]);
  return sendSigned(tx);
}

async function main() {
  let dest: PublicKey;
  try { dest = new PublicKey(process.argv[2] || ''); } catch { console.log('usage: npm run withdraw -- YOUR_WALLET_ADDRESS'); process.exit(1); }
  const me = wallet();
  log(`emptying mem's wallet ${me.publicKey.toBase58()} into ${dest.toBase58()}`);
  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    const accts = (await conn.getParsedTokenAccountsByOwner(me.publicKey, { programId })).value;
    for (let i = 0; i < accts.length; i += 3) {
      const ixs: TransactionInstruction[] = [];
      for (const a of accts.slice(i, i + 3)) {
        const info = (a.account.data as any).parsed.info;
        const amount = BigInt(info.tokenAmount.amount), mint = new PublicKey(info.mint);
        if (amount > 0n) {
          const to = getAssociatedTokenAddressSync(mint, dest, false, programId);
          ixs.push(createAssociatedTokenAccountIdempotentInstruction(me.publicKey, to, dest, mint, programId));
          ixs.push(createTransferCheckedInstruction(a.pubkey, mint, to, me.publicKey, amount, info.tokenAmount.decimals, [], programId));
        }
        ixs.push(createCloseAccountInstruction(a.pubkey, dest, me.publicKey, [], programId));
      }
      try { log('tokens + rent:', `https://solscan.io/tx/${await send(ixs)}`); } catch (e) { log('could not close some token accounts', (e as Error).message); }
    }
  }
  // Solana only allows an account to end at exactly 0 or above its rent minimum, so send everything except
  // the exact 5,000-lamport fee of a plain one-signature transfer (no priority fee), leaving 0.
  const lamports = await conn.getBalance(me.publicKey, 'confirmed');
  const fee = 5_000;
  if (lamports > fee) log('SOL:', `https://solscan.io/tx/${await send([SystemProgram.transfer({ fromPubkey: me.publicKey, toPubkey: dest, lamports: lamports - fee })], false)}`);
  log('done');
}
main();
