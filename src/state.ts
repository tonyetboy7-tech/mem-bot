import fs from 'node:fs';
import path from 'node:path';
import { CFG } from './config';
import { Candidate, Pick } from './types';
import { Snapshot } from './holders';

export interface State {
  status: 'idle' | 'claiming' | 'scanning' | 'shopping' | 'sharing' | 'saving';
  piggySol: number;
  totals: { solClaimed: number; solSpent: number; gasSol: number; memesBought: number; drops: number; walletsPaid: number };
  snaps: Snapshot[];           // this hour's holder snapshots (start, random, drop)
  recent: Record<string, number>; // mint -> when bought (cooldown)
  history: Pick[];             // newest first
  pending: { mint: string; hour: string; left?: { wallet: string; amount: string }[] }[]; // bought but not fully shared yet (retried next run)
  lastRun?: { hour: string; claimedSol: number; claimTx?: string; budgetSol: number; gasSol: number; note: string; looked: Candidate[]; passed: Candidate[]; picks: string[]; errors?: string[] };
  paid: Record<string, { drops: number; got: { symbol: string; amount: string; decimals: number; hour: string }[] }>;
  board: { wallet: string; balance: string; share: number }[];
  testHolders?: string[];
  firstTripDone?: boolean;
  feePool?: number;  // SOL that came in as claimed creator fees and hasn't been spent yet (mem only ever spends this)
  bought?: Record<string, number>; // every coin mem has ever bought (he never buys one twice)
  seen?: Record<string, number>;   // when each coin was last shown on the radar
  snapAt?: string;
  midTarget?: number; // tick mode: when this hour's secret holder check happens
  midHour?: number;   // tick mode: the hour whose secret check is done
  radar?: Record<string, unknown>[];
  radarNo?: Record<string, unknown>[];
  radarAt?: string;
  nextRunAt?: string;
  memBalanceSol?: number;
  cutoff?: string;
}

const file = () => path.join(CFG.dataDir, 'state.json');
export function load(): State {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); } catch {
    return { status: 'idle', piggySol: 0, totals: { solClaimed: 0, solSpent: 0, gasSol: 0, memesBought: 0, drops: 0, walletsPaid: 0 }, snaps: [], recent: {}, history: [], pending: [], paid: {}, board: [] };
  }
}
export function save(s: State) {
  fs.mkdirSync(CFG.dataDir, { recursive: true });
  const tmp = file() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s));
  fs.renameSync(tmp, file());
}
