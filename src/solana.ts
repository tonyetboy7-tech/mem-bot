import { Connection, Keypair, PublicKey, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'node:fs';
import path from 'node:path';
import { CFG } from './config';
import { sleep } from './util';

export const conn = new Connection(CFG.rpc, 'confirmed');

let kp: Keypair | null = null;
/** mem's wallet: PRIVATE_KEY if set, otherwise a wallet created on first run and kept in data/mem-wallet.json */
export function wallet(): Keypair {
  if (kp) return kp;
  if (CFG.privateKey) { kp = Keypair.fromSecretKey(bs58.decode(CFG.privateKey)); return kp; }
  // never create a wallet file when running on GitHub: the data branch is public
  if (process.env.MEM_TICK) throw new Error('PRIVATE_KEY secret is missing. Add it in GitHub: Settings > Secrets and variables > Actions');
  const f = path.join(CFG.dataDir, 'mem-wallet.json');
  try {
    kp = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(f, 'utf8')).secretKey));
  } catch {
    kp = Keypair.generate();
    fs.mkdirSync(CFG.dataDir, { recursive: true });
    fs.writeFileSync(f, JSON.stringify({ address: kp.publicKey.toBase58(), secretKeyBase58: bs58.encode(kp.secretKey), secretKey: Array.from(kp.secretKey) }, null, 1));
  }
  return kp;
}
export function walletAddress(): string {
  try { return wallet().publicKey.toBase58(); } catch { return ''; }
}

export async function solBalance(addr: PublicKey): Promise<number> {
  return (await conn.getBalance(addr, 'confirmed')) / LAMPORTS_PER_SOL;
}

export interface MintInfo { programId: PublicKey; decimals: number; supply: bigint; mintAuthority: string | null; freezeAuthority: string | null; }
export async function mintInfo(mint: string): Promise<MintInfo> {
  const acc = await conn.getParsedAccountInfo(new PublicKey(mint));
  const v = acc.value as any;
  if (!v || !v.data?.parsed) throw new Error(`not a mint: ${mint}`);
  const i = v.data.parsed.info;
  return { programId: v.owner as PublicKey, decimals: i.decimals, supply: BigInt(i.supply), mintAuthority: i.mintAuthority ?? null, freezeAuthority: i.freezeAuthority ?? null };
}

/** wait until a signature is confirmed (or fail after ~75s) */
export async function confirmSig(sig: string): Promise<void> {
  for (let i = 0; i < 50; i++) {
    const st = (await conn.getSignatureStatuses([sig])).value[0];
    if (st?.err) throw new Error(`tx failed ${sig}: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === 'confirmed' || st?.confirmationStatus === 'finalized') return;
    await sleep(1500);
  }
  throw Object.assign(new Error(`tx not confirmed in time ${sig}`), { sig });
}

export async function sendSigned(tx: VersionedTransaction): Promise<string> {
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await confirmSig(sig);
  return sig;
}

/** raw token balance a wallet holds of one mint (all its accounts) */
export async function tokenBalance(owner: PublicKey, mint: string): Promise<bigint> {
  const res = await conn.getParsedTokenAccountsByOwner(owner, { mint: new PublicKey(mint) });
  return res.value.reduce((s, a) => s + BigInt((a.account.data as any).parsed.info.tokenAmount.amount), 0n);
}
