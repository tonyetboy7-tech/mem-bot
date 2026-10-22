import 'dotenv/config';

const num = (k: string, d: number) => (process.env[k] !== undefined && process.env[k] !== '' ? Number(process.env[k]) : d);
const list = (k: string) => (process.env[k] || '').split(',').map(s => s.trim()).filter(Boolean);

const TEST = process.env.TEST_MODE === 'true';

/** mem's rulebook. Everything here is published on the site. */
export const CFG = {
  /** test mode: no $MEM yet. mem spends whatever SOL is in his wallet, and the "holders" are the wallets that connect on the local site. */
  testMode: TEST,
  testIntervalMin: num('TEST_INTERVAL_MIN', 3),
  pumpOnly: process.env.PUMP_ONLY ? process.env.PUMP_ONLY === 'true' : TEST,
  dryRun: process.env.DRY_RUN !== 'false',
  rpc: process.env.RPC_URL || 'https://api.mainnet-beta.solana.com',
  privateKey: process.env.PRIVATE_KEY || '',
  memMint: process.env.MEM_MINT || '',
  jupKey: process.env.JUPITER_API_KEY || '',
  xBearer: process.env.X_BEARER_TOKEN || '',
  port: num('PORT', 8787),
  dataDir: process.env.DATA_DIR || './data',

  /** money */
  gasPct: num('GAS_PCT', 0.10),            // share of fees kept for gas + new token accounts
  firstTripSol: num('FIRST_TRIP_SOL', 2),   // mem's first shopping trip happens once the piggy bank reaches this
  prelaunchCheckMin: num('PRELAUNCH_CHECK_MIN', 5), // before the first trip, claim + check this often
  minDropSol: num('MIN_DROP_SOL', TEST ? 0.003 : 0.3), // after launch: an hour below this rolls into the next hour
  radarMin: num('RADAR_MIN', 10),          // refresh 'on mem's radar' this often
  radarSize: num('RADAR_SIZE', 12),
  radarFreshMin: num('RADAR_FRESH_MIN', 60), // a coin shown on the radar rests this long before it can show again (if there are enough fresh coins)
  minBuySol: num('MIN_BUY_SOL', TEST ? 0.002 : 0.05),  // smallest single buy
  dropOverheadSol: num('DROP_OVERHEAD_SOL', TEST ? 0.0005 : 0.01), // tx fees per drop
  reserveSol: num('RESERVE_SOL', TEST ? 0.001 : 0.05), // never spend below this wallet balance
  maxPicks: num('MAX_PICKS', 3),           // most memes in one hour (only when the budget is big)
  maxPoolPct: num('MAX_POOL_PCT', 0.02),   // never buy more than 2% of a pool's liquidity
  ataRentSol: 0.0025,                      // cost to open a token account (newer pump.fun coins use bigger accounts)
  swapOverheadSol: num('SWAP_OVERHEAD_SOL', 0.001), // priority fees on the buy
  priorityMicroLamports: num('PRIORITY_MICROLAMPORTS', 50000),
  dryRunFeeSol: num('DRY_RUN_FEE_SOL', 0),  // pretend fees per claim in practice mode (0 = none, so nothing fake piles up before launch)

  /** holders */
  topN: num('TOP_N', 50),
  minHold: BigInt(process.env.MIN_HOLD_RAW || '1000000000000'), // 1,000,000 $MEM (6 decimals)
  maxSharePct: num('MAX_SHARE_PCT', 0.10),
  exclude: list('EXCLUDE_WALLETS'),
  batchSize: num('BATCH_SIZE', 6),

  /** what mem will even look at */
  filters: TEST ? {
    minAgeH: 0.5, maxAgeDays: 30, minMcap: 50_000, maxMcap: 100_000_000, minLiq: 10_000, minVol1h: 10_000, minTx1h: 100,
    maxChg1h: 500, minChg1h: -25, minChg5m: -15, requireX: false, cooldownH: 1,
  } : {
    minAgeH: 0.5,          // at least 30 minutes old (no snipes)
    maxAgeDays: 30,        // still fresh
    minMcap: 75_000,       // has proven something
    maxMcap: 100_000_000,  // still room to go crazier
    minLiq: 15_000,
    minVol1h: 40_000,
    minTx1h: 250,
    maxChg1h: 600,         // not buying a vertical candle
    minChg1h: -25,
    minChg5m: -15,         // not mid-dump
    requireX: true,
    cooldownH: 24,         // (mem also never buys any coin twice: see state.bought)
  },
  /** test mode only: used when nothing passes the normal rules, so a practice run still finds a coin */
  relaxedFilters: {
    minAgeH: 0.25, maxAgeDays: 60, minMcap: 25_000, maxMcap: 200_000_000, minLiq: 5_000, minVol1h: 3_000, minTx1h: 30,
    maxChg1h: 1000, minChg1h: -35, minChg5m: -20, requireX: false, cooldownH: 1,
  },
  safety: {
    maxTop10: TEST ? 0.6 : 0.5,  // top 10 real wallets (not pools) hold at most this share
    maxRoundTripLoss: 0.15,      // buy-then-sell quote may lose at most 15% (catches honeypots and big taxes)
    probeSol: 0.02,
    maxChecks: 15,
  },
  weights: { momentum: 0.25, crowd: 0.25, attention: 0.25, strength: 0.15, depth: 0.10 },
  denylist: list('DENYLIST'),
};

export const SOL_MINT = 'So11111111111111111111111111111111111111112';
export const LAMPORTS = 1_000_000_000;
