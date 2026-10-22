/** One "tick" of mem, for running on a timer (GitHub Actions every 5 minutes) instead of as an always-on server.
 *  Each tick: shops if a trip is due, takes the hour's secret holder check if due, refreshes the radar if due,
 *  then writes state.json + public/feed.json into DATA_DIR and exits. */
process.env.MEM_TICK = '1';
const { CFG } = await import('./config');
const { s, cycle, radarScan, midSnapshot } = await import('./index');
const { writeFeed } = await import('./feed');
const { save } = await import('./state');
const { log } = await import('./util');
const { solBalance, wallet } = await import('./solana');

const now = Date.now();
const hourStart = Math.floor(now / 3.6e6) * 3.6e6;
const nextHour = hourStart + 3.6e6;
const prelaunch = !s.firstTripDone;
log(`tick · ${CFG.dryRun ? 'practice mode' : 'LIVE'} · ${prelaunch ? `saving for the first trip (${CFG.firstTripSol} SOL)` : 'hourly trips'}`);

let shopped = false, ok = true;
if (prelaunch) {
  // before the first trip: claim + check every tick; cycle() returns early until the piggy bank reaches the target
  ok = await cycle();
  shopped = !!s.firstTripDone;
} else if (!s.nextRunAt || now >= Date.parse(s.nextRunAt)) {
  ok = await cycle();
  shopped = true;
}
// a trip that failed before buying anything stays due, so the next run (5 minutes later) tries again
if (!s.firstTripDone) s.nextRunAt = undefined;
else if (ok || !shopped) s.nextRunAt = new Date(nextHour).toISOString();
if (!ok) log('trip failed before buying anything; trying again on the next run');

// this hour's secret holder check, at a random minute only mem knows
if (s.firstTripDone && CFG.memMint && !shopped) {
  if (!s.midTarget || s.midTarget < hourStart || s.midTarget >= nextHour) s.midTarget = hourStart + (10 + Math.random() * 40) * 60000;
  if (now >= s.midTarget && s.midHour !== hourStart) { await midSnapshot(); s.midHour = hourStart; }
}

// radar every RADAR_MIN minutes (skipped on ticks that just went shopping)
if (!shopped && (!s.radarAt || now - Date.parse(s.radarAt) >= (CFG.radarMin - 1) * 60000)) await radarScan();

if (!CFG.dryRun) { try { s.memBalanceSol = await solBalance(wallet().publicKey); } catch { /* keep last */ } }
s.status = 'idle';
writeFeed(s);
save(s);
log('tick done');
process.exit(0);
export {};
