import { PublicKey } from '@solana/web3.js';
import { CFG, LAMPORTS, SOL_MINT } from './config';
import { claimCreatorFees } from './fees';
import { discover, marketData, quickReject, xMentions } from './scan';
import { scoreAll } from './score';
import { deepCheck } from './safety';
import { buy, quote } from './buy';
import { snapshot } from './holders';
import { airdrop } from './distribute';
import { eligible, computeShares, splitAmount } from './shares';
import { load, save, State } from './state';
import { writeFeed, refreshPrices } from './feed';
import { serve } from './server';
import { mintInfo, tokenBalance, wallet, solBalance } from './solana';
import { Candidate, Pick } from './types';
import { log, short, sleep } from './util';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const s: State = load();
/* never buy the same coin twice: remember everything mem ever bought */
s.bought = s.bought || {};
for (const h of s.history) s.bought[h.mint] = s.bought[h.mint] || Date.parse(h.hour) || Date.now();
for (const [m, t] of Object.entries(s.recent)) s.bought[m] = s.bought[m] || t;
s.seen = s.seen || {};
const rejectFor = (c: Candidate, f?: typeof CFG.filters) => (s.bought![c.mint] ? 'already bought' : quickReject(c, s.recent, f) ?? undefined);
let busy = false;
let radarBusy = false;
let errors: string[] = [];

function status(st: State['status']) { s.status = st; writeFeed(s); }

async function solPriceUsd(): Promise<number> {
  const out = await quote(SOL_MINT, USDC, BigInt(LAMPORTS));
  return out ? Number(out) / 1e6 : 0;
}

type Share = { wallet: string; balance: string; share: number };

/** who gets this hour's bag */
async function holderShares(): Promise<Share[]> {
  if (CFG.testMode) {
    const list = s.testHolders || [];
    return list.map(w => ({ wallet: w, balance: '0', share: 1 / list.length }));
  }
  if (!CFG.memMint) return [];
  s.snaps.push(await snapshot(CFG.memMint));
  if (s.snaps.length > 3) s.snaps.splice(1, s.snaps.length - 3);
  return computeShares(eligible(s.snaps));
}

/** send tokens; one quick retry for anything that failed. Returns what still couldn't be sent. */
async function send(pick: Pick, list: { wallet: string; amount: bigint }[]) {
  const info = await mintInfo(pick.mint);
  if (CFG.dryRun) return { sigs: [] as string[], left: [] as { wallet: string; amount: bigint }[], info };
  let r = await airdrop(pick.mint, info, list);
  const sigs = [...r.sigs];
  if (r.failed.length) {
    log(`retrying ${r.failed.length} wallet(s) in 15s`);
    await sleep(15000);
    r = await airdrop(pick.mint, info, r.failed);
    sigs.push(...r.sigs);
  }
  if (r.failed.length) errors.push(`couldn't send $${pick.symbol} to ${r.failed.length} wallet(s): ${String(r.error || 'unknown').slice(0, 160)}. retrying next run`);
  return { sigs, left: r.failed, info };
}

/** give one bought meme to the holders */
async function drop(pick: Pick, shares: Share[]) {
  if (!shares.length) return;
  let total = BigInt(pick.tokensOut);
  if (!CFG.dryRun) {
    for (let i = 0; i < 12; i++) { total = await tokenBalance(wallet().publicKey, pick.mint); if (total > 0n) break; await sleep(2500); }
    if (total === 0n) { errors.push(`mem's $${pick.symbol} hasn't shown up in his wallet yet. retrying next run`); s.pending.push({ mint: pick.mint, hour: pick.hour }); return; }
  }
  const amounts = splitAmount(total, shares.map(r => r.share));
  const recipients = shares.map((r, i) => ({ ...r, amount: amounts[i].toString() }));
  const { sigs, left, info } = await send(pick, recipients.map(r => ({ wallet: r.wallet, amount: BigInt(r.amount) })));
  if (left.length) s.pending.push({ mint: pick.mint, hour: pick.hour, left: left.map(l => ({ wallet: l.wallet, amount: l.amount.toString() })) });
  const leftSet = new Set(left.map(l => l.wallet));
  pick.drop = { count: recipients.filter(r => r.amount !== '0' && !leftSet.has(r.wallet)).length, txs: sigs, recipients };
  record(pick, recipients.filter(r => !leftSet.has(r.wallet)), info.decimals, true);
  log(`dropped $${pick.symbol} to ${pick.drop.count} wallet(s)`, sigs.map(t => `https://solscan.io/tx/${t}`).join(' '));
}

function record(pick: Pick, recipients: { wallet: string; amount: string }[], decimals: number, newDrop: boolean) {
  const paidNow = recipients.filter(r => r.amount !== '0');
  if (newDrop) s.totals.drops++;
  s.totals.walletsPaid += paidNow.length;
  const week = Date.now() - 7 * 864e5;
  for (const r of paidNow) {
    const p = s.paid[r.wallet] || { drops: 0, got: [] };
    p.drops++;
    p.got = [{ symbol: pick.symbol, amount: r.amount, decimals, hour: pick.hour }, ...p.got].slice(0, 6);
    s.paid[r.wallet] = p;
  }
  for (const [w, p] of Object.entries(s.paid)) if (!p.got.some(g => Date.parse(g.hour) > week)) delete s.paid[w];
}

/** finish drops that didn't go through last time (only the wallets still owed) */
async function retryPending(shares: Share[]) {
  for (const p of [...s.pending]) {
    s.pending = s.pending.filter(x => x !== p);
    // give up on a drop that still can't go out after 2 days (it's listed in the run log)
    if (Date.now() - Date.parse(p.hour) > 2 * 864e5) { log(`giving up on the $${p.mint} drop from ${p.hour}`); continue; }
    const pick = s.history.find(h => h.mint === p.mint && h.hour === p.hour);
    if (!pick) continue;
    if (!p.left) { await drop(pick, shares); continue; }
    const { sigs, left, info } = await send(pick, p.left.map(l => ({ wallet: l.wallet, amount: BigInt(l.amount) })));
    if (left.length) s.pending.push({ ...p, left: left.map(l => ({ wallet: l.wallet, amount: l.amount.toString() })) });
    const leftSet = new Set(left.map(l => l.wallet));
    const done = p.left.filter(l => !leftSet.has(l.wallet));
    if (pick.drop) { pick.drop.txs.push(...sigs); pick.drop.count += done.length; }
    record(pick, done, info.decimals, false);
    log(`finished $${pick.symbol} drop for ${done.length} wallet(s)`);
  }
}

export async function cycle(): Promise<boolean> {
  if (busy) return true; busy = true;
  let boughtAny = false, ok = true;
  errors = [];
  for (let i = 0; i < 40 && radarBusy; i++) await sleep(1500);
  const hour = new Date().toISOString().slice(0, CFG.testMode ? 19 : 13) + (CFG.testMode ? 'Z' : ':00:00Z');
  try {
    /* 1. collect creator fees (test mode: just use the SOL in mem's wallet) */
    status('claiming');
    const fee = await claimCreatorFees().catch(e => { log('claim failed', e.message); return { sol: 0, tx: undefined as string | undefined }; });
    s.piggySol += fee.sol; s.totals.solClaimed += fee.sol;
    s.feePool = (s.feePool || 0) + fee.sol;
    let balStart = 0;
    if (!CFG.dryRun) {
      s.memBalanceSol = balStart = await solBalance(wallet().publicKey);
      const spendable = Math.max(0, s.memBalanceSol - CFG.reserveSol);
      // test runs spend what you sent; for real, mem only spends SOL that came in as creator fees
      s.piggySol = CFG.testMode ? spendable : Math.min(spendable, s.feePool);
    }
    log(`claimed ${fee.sol.toFixed(4)} SOL, mem can spend ${s.piggySol.toFixed(4)} SOL`);

    /* before launch: nothing to do until the piggy bank reaches the first-trip target */
    if (!CFG.testMode && !s.firstTripDone && s.piggySol < CFG.firstTripSol) {
      // keep a holder snapshot no older than an hour, so the first drop still needs real holding time
      if (CFG.memMint && (!s.snapAt || Date.now() - Date.parse(s.snapAt) > 3.6e6)) {
        try { s.snaps = [await snapshot(CFG.memMint)]; s.snapAt = new Date().toISOString(); } catch (e) { log('snapshot failed', (e as Error).message); }
      }
      s.lastRun = { hour, claimedSol: fee.sol, claimTx: fee.tx, budgetSol: 0, gasSol: 0, note: `saving for the first trip: ${s.piggySol.toFixed(3)} / ${CFG.firstTripSol} SOL`, looked: [], passed: [], picks: [] };
      log(s.lastRun.note);
      return true;
    }

    const shares = await holderShares();
    s.board = shares; s.cutoff = !CFG.testMode && shares.length ? shares[shares.length - 1].balance : undefined;
    log(`${shares.length} holder(s) will share the bag`);

    /* finish drops that failed last time */
    try { await retryPending(shares); } catch (e) { log('pending retry error', (e as Error).message); }
    if (!CFG.dryRun && balStart > 0) {
      // finishing old drops opens token accounts too: take what that cost out of this trip's money
      const spent = Math.max(0, balStart - await solBalance(wallet().publicKey));
      if (spent > 0) s.piggySol = Math.max(0, s.piggySol - spent);
    }

    /* 2. scan the trenches */
    status('scanning');
    const looked: Candidate[] = await marketData(await discover());
    for (const c of looked) c.reject = rejectFor(c);
    let passed = looked.filter(c => !c.reject);
    if (!passed.length && CFG.testMode) {
      log('nothing passed the normal rules, trying the relaxed test rules');
      for (const c of looked) c.reject = rejectFor(c, CFG.relaxedFilters);
      passed = looked.filter(c => !c.reject);
    }
    if (CFG.xBearer) for (const c of [...passed].sort((a, b) => b.v1h - a.v1h).slice(0, 10)) c.xMentions1h = await xMentions(c.symbol);
    scoreAll(passed);
    log(`looked at ${looked.length} coins, ${passed.length} passed:`, passed.slice(0, 5).map(c => `$${c.symbol} ${c.score}`).join(', '));

    /* budget: gas covers every holder's new token account + mem's own + fees */
    const perDropGas = (shares.length + 1) * CFG.ataRentSol + CFG.dropOverheadSol + CFG.swapOverheadSol;
    const gasSol = Math.max(s.piggySol * CFG.gasPct, perDropGas);
    let budget = s.piggySol - gasSol;
    s.lastRun = { hour, claimedSol: fee.sol, claimTx: fee.tx, budgetSol: Math.max(0, budget), gasSol, note: '', looked, passed, picks: [], errors };

    if (!shares.length) {
      s.lastRun.note = CFG.testMode ? 'waiting for a wallet to connect on the site' : 'no eligible holders yet';
      status('saving');
    } else if (!CFG.testMode && !s.firstTripDone && s.piggySol < CFG.firstTripSol) {
      s.lastRun.note = `saving for the first trip: ${s.piggySol.toFixed(3)} / ${CFG.firstTripSol} SOL`;
      status('saving');
    } else if (budget < CFG.minDropSol) {
      s.lastRun.note = CFG.testMode
        ? `saving up: needs about ${(CFG.minDropSol + perDropGas + CFG.reserveSol).toFixed(3)} SOL in mem's wallet, has ${(s.memBalanceSol ?? 0).toFixed(4)}`
        : `saving up (${s.piggySol.toFixed(3)} SOL in the piggy bank)`;
      status('saving');
    } else {
      /* 3. go shopping */
      status('shopping');
      const solUsd = await solPriceUsd();
      /* mem's favorites: the top coins that pass the safety checks */
      const safe: Candidate[] = [];
      let checks = 0;
      for (const c of passed) {
        if (safe.length >= CFG.maxPicks || checks >= CFG.safety.maxChecks) break;
        checks++;
        const why = await deepCheck(c);
        if (why) { c.reject = why; log(`skip $${c.symbol}: ${why}`); continue; }
        safe.push(c);
      }
      /* buy as many favorites as the budget can cover (each extra coin needs its own drop gas) */
      let k = safe.length;
      // an extra coin is only worth it if each buy is at least twice what its drop costs to deliver
      const minPer = CFG.testMode ? CFG.minBuySol : Math.max(CFG.minBuySol, 2 * perDropGas);
      while (k > 1 && (budget - (k - 1) * perDropGas) / k < minPer) k--;
      let remaining = budget - Math.max(0, k - 1) * perDropGas;
      log(`${safe.length} favorite(s) passed safety, buying ${k}`);
      if (!safe.length) errors.push(`none of the top ${checks} coins passed the safety checks: ${passed.slice(0, checks).map(c => `$${c.symbol} (${c.reject})`).join(', ')}`);
      for (let i = 0; i < k; i++) {
        const c = safe[i];
        const capSol = solUsd > 0 ? (c.liqUsd * CFG.maxPoolPct) / solUsd : remaining;
        const sol = Math.min(remaining / (k - i), capSol);
        if (sol < CFG.minBuySol) { c.reject = 'pool too small for the budget'; continue; }
        let out = 0n, sig: string | undefined;
        try { const r = await buy(c.mint, BigInt(Math.floor(sol * LAMPORTS))); out = r.out; sig = r.sig; }
        catch (e) {
          // the buy may still have landed (e.g. Jupiter answered slowly): check before giving up, so no coins are left unsent
          if (!CFG.dryRun) { await sleep(15000); try { out = await tokenBalance(wallet().publicKey, c.mint); } catch { out = 0n; } }
          if (out === 0n) { c.reject = 'buy failed'; errors.push(`buy $${c.symbol} failed: ${(e as Error).message.slice(0, 160)}`); log(`buy $${c.symbol} failed`, (e as Error).message); continue; }
          log(`buy $${c.symbol} reported an error but the coins arrived, carrying on`);
        }
        if (out === 0n) { c.reject = 'buy failed'; continue; }
        const decimals = CFG.dryRun ? 6 : (await mintInfo(c.mint)).decimals;
        const pick: Pick = {
          hour, mint: c.mint, symbol: c.symbol, name: c.name, image: c.image, url: c.url, solIn: +sol.toFixed(4), tokensOut: out.toString(), decimals,
          buyPriceUsd: c.priceUsd, mcapAtBuy: Math.round(c.mcap), buyTx: sig, score: c.score ?? 0, parts: c.parts ?? {},
        };
        s.history.unshift(pick); s.history = s.history.slice(0, 200);
        s.recent[c.mint] = Date.now();
        s.bought![c.mint] = Date.now();
        s.totals.solSpent += sol; s.totals.memesBought++;
        remaining -= sol;
        s.lastRun.picks.push(c.symbol);
        boughtAny = true;
        save(s); // remember the buy right away
        log(`bought $${c.symbol} for ${sol.toFixed(4)} SOL (score ${c.score})`, sig ? `https://solscan.io/tx/${sig}` : CFG.dryRun ? '(dry run)' : '(coins arrived, no tx link)');

        /* 4. share it */
        status('sharing');
        try { await drop(pick, shares); }
        catch (e) { errors.push(`drop of $${c.symbol} failed: ${(e as Error).message.slice(0, 160)}. retrying next run`); log('drop failed, will retry next run', (e as Error).message); s.pending.push({ mint: pick.mint, hour }); }
        save(s); // remember the drop right away
        status('shopping');
      }
      if (s.lastRun.picks.length) {
        if (!s.firstTripDone) { s.firstTripDone = true; log('first shopping trip done. mem shops every hour from now on'); }
        s.totals.gasSol += gasSol;
        s.piggySol = Math.max(0, remaining);
        s.lastRun.note = `bought ${s.lastRun.picks.map(p => '$' + p).join(', ')}`;
      } else {
        s.lastRun.note = 'nothing passed the rules this time, saving up';
      }
    }
    if (!CFG.dryRun) {
      s.memBalanceSol = await solBalance(wallet().publicKey).catch(() => s.memBalanceSol ?? 0);
      // whatever left the wallet this trip (buys, delivery, fees) came out of the fee pool
      if (balStart > 0) s.feePool = Math.max(0, (s.feePool || 0) - Math.max(0, balStart - (s.memBalanceSol ?? balStart)));
    }
    for (const [m, t] of Object.entries(s.recent)) if (Date.now() - t > 7 * 864e5) delete s.recent[m];
    s.snaps = s.snaps.length ? [s.snaps[s.snaps.length - 1]] : [];
    s.snapAt = new Date().toISOString();
    await refreshPrices(s);
    log(s.lastRun.note);
    for (const e of errors) log('problem:', e);
  } catch (e) {
    log('cycle error', (e as Error).stack);
    ok = boughtAny; // nothing bought yet → safe to retry on the next run
  } finally {
    s.status = 'idle'; writeFeed(s); save(s); busy = false;
  }
  return ok;
}

export async function midSnapshot() {
  if (!CFG.memMint || busy || CFG.testMode) return;
  try { const snap = await snapshot(CFG.memMint); s.snaps = [s.snaps[0] ?? snap, snap]; save(s); log(`mid-hour snapshot: ${Object.keys(snap).length} holders`); }
  catch (e) { log('mid snapshot failed', (e as Error).message); }
}

let timer: NodeJS.Timeout | undefined;
function schedule() {
  const now = Date.now();
  const prelaunch = !CFG.testMode && !s.firstTripDone;
  const next = CFG.testMode ? now + CFG.testIntervalMin * 60000
    : prelaunch ? now + CFG.prelaunchCheckMin * 60000
    : Math.ceil((now + 1000) / 3.6e6) * 3.6e6;
  s.nextRunAt = prelaunch ? undefined : new Date(next).toISOString(); writeFeed(s);
  clearTimeout(timer);
  timer = setTimeout(async () => { await cycle(); schedule(); }, next - now + (CFG.testMode ? 0 : 2000));
  if (!CFG.testMode && !prelaunch) {
    const mid = now + (10 + Math.random() * 40) * 60000;
    if (mid < next - 5 * 60000) setTimeout(midSnapshot, mid - now);
  }
  log(prelaunch ? `waiting for ${CFG.firstTripSol} SOL before the first trip (checking every ${CFG.prelaunchCheckMin} min)` : `next shopping trip ${new Date(next).toLocaleTimeString()}`);
}

/** test mode: a wallet that connects on the site becomes a holder */
function register(w: string) {
  try { if (!PublicKey.isOnCurve(new PublicKey(w).toBytes())) return { ok: false, error: 'not a normal wallet address' }; }
  catch { return { ok: false, error: 'not a Solana address' }; }
  s.testHolders = [...new Set([...(s.testHolders || []), w])];
  save(s); writeFeed(s);
  log(`test holder registered: ${w}`);
  return { ok: true };
}

/** "on mem's radar": coins mem is watching right now. Unranked and shuffled, so nobody can tell which ones he'll buy. */
export async function radarScan() {
  if (busy || radarBusy) return;
  radarBusy = true;
  try {
    const looked = await marketData(await discover());
    for (const c of looked) c.reject = rejectFor(c);
    /* rotate: coins shown in the last hour rest, unless there aren't enough fresh ones */
    const ranked = scoreAll(looked.filter(c => !c.reject)).slice(0, CFG.radarSize * 3);
    const now = Date.now(), restMs = CFG.radarFreshMin * 60000;
    const fresh = ranked.filter(c => !s.seen![c.mint] || now - s.seen![c.mint] > restMs);
    const rested = ranked.filter(c => !fresh.includes(c));
    const passed = [...fresh, ...rested].slice(0, CFG.radarSize);
    for (const c of passed) s.seen![c.mint] = now;
    for (const [m, t] of Object.entries(s.seen!)) if (now - t > 2 * 864e5) delete s.seen![m];
    for (let i = passed.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [passed[i], passed[j]] = [passed[j], passed[i]]; }
    s.radar = passed.map(c => ({ symbol: c.symbol, name: c.name, image: c.image, url: c.url, mcap: Math.round(c.mcap), chg1h: c.chg1h, v1h: Math.round(c.v1h) }));
    s.radarNo = looked.filter(c => c.reject && c.reject !== 'not a pump.fun coin' && c.reject !== 'already bought').sort((a, b) => b.v1h - a.v1h).slice(0, 6).map(c => ({ symbol: c.symbol, reject: c.reject }));
    s.radarAt = new Date().toISOString();
    if (!busy) writeFeed(s);
    log(`radar: watching ${s.radar.length} coins`);
  } catch (e) { log('radar scan failed', (e as Error).message); }
  finally { radarBusy = false; }
}

/* test mode: the "shop now" button */
function runNow() {
  if (busy) return { ok: false, error: 'mem is already shopping' };
  clearTimeout(timer);
  log('shop now pressed');
  cycle().then(schedule);
  return { ok: true };
}

async function refreshBalance() {
  if (CFG.dryRun) return;
  try { s.memBalanceSol = await solBalance(wallet().publicKey); if (!busy) writeFeed(s); } catch { /* rpc hiccup */ }
}

async function main() {
  const mode = CFG.testMode ? (CFG.dryRun ? 'TEST (dry run)' : 'TEST RUN, REAL SOL') : CFG.dryRun ? 'DRY RUN: nothing is claimed, bought or sent' : 'LIVE';
  log(`mem shopping bot · ${mode}`, CFG.memMint ? `$MEM ${short(CFG.memMint)}` : '');
  const me = wallet().publicKey.toBase58();
  log(`mem's wallet: ${me}`);
  if (process.argv.includes('--once')) { await cycle(); return; }
  serve(register, runNow);
  if (CFG.testMode) {
    log(`send about 0.02 SOL to ${me}, open http://localhost:${CFG.port} and connect your wallet`);
    await refreshBalance();
    setInterval(refreshBalance, 10000);
  } else if (CFG.memMint && !s.snaps.length) {
    try { s.snaps = [await snapshot(CFG.memMint)]; save(s); } catch (e) { log('first snapshot failed', (e as Error).message); }
  }
  writeFeed(s);
  schedule();
  setTimeout(radarScan, 5000);
  setInterval(radarScan, CFG.radarMin * 60000);
}
if (!process.env.MEM_TICK) main();
