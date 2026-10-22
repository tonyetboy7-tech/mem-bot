# mem's shopping bot

mem collects the $MEM creator fees. When his piggy bank first reaches 2 SOL he goes on his first shopping trip, and after that he shops every hour. On each trip he buys the hottest memes that pass his rules and sends them to the top $MEM holders. Everything is published to a public feed, which the website shows live.

To launch, see **LAUNCH.md** (mem runs free on GitHub Actions, site on Vercel). For a practice run on your own computer, see **TEST-RUN.md**.

## How mem shops (the rules)

### 1. Collect the fees
- **Before launch:** every 5 minutes mem claims the pump.fun creator fees into his wallet. His **first trip starts as soon as the piggy bank reaches 2 SOL** (`FIRST_TRIP_SOL`).
- **After that:** he shops every hour (GitHub runs land a few minutes past the hour).
- **Each trip:** 10% (or more, if needed) covers transaction fees, plus opening a token account in each holder's wallet. Each account costs about 0.0025 SOL, and that SOL stays in the holder's wallet. The rest buys memes.
- **Small hours:** if an hour's budget is under 0.3 SOL (`MIN_DROP_SOL`), it rolls into the next hour, so drops aren't eaten up by account costs.

### 2. Watch the trenches (the radar)
- **Every 10 minutes**, mem scans:
  - GeckoTerminal's trending Solana pools (top 40 over the last hour, and the top 20 over the last 6 hours)
  - the busiest PumpSwap and pump.fun bonding-curve pools
  - DexScreener's latest boosted coins and profiles
- **On the site:** the 12 coins he's watching appear in random order with no scores, so nobody can tell which ones he'll buy.
- **Rotation:** a coin shown on the radar rests for an hour before it can appear again, as long as there are enough fresh coins. Coins he already bought never come back.

### 3. Rules every coin must pass
| Rule | Limit |
|---|---|
| Age | 30 minutes to 30 days |
| Market cap | $75k to $100M |
| Liquidity | $15k or more |
| Last hour volume | $40k or more |
| Last hour trades | 250 or more |
| Price, last hour | not up more than 600%, not down more than 25% |
| Price, last 5 min | not down more than 15% |
| Socials | must have an X account |
| **Repeat** | **never. mem never buys the same coin twice** |

### 4. Score (0–100)
Each coin is ranked against the other coins that passed, on five things:

| Part | Weight | What it measures |
|---|---|---|
| Momentum | 25% | this hour's volume compared with its recent average |
| Crowd | 25% | number of buys, weighted by how buy-heavy the hour is |
| Attention | 25% | trending rank, having an X account and a website, plus X mentions if an X API key is set |
| Strength | 15% | price change over 1 hour and 6 hours |
| Depth | 10% | liquidity compared with market cap |

Paid boosts never count.

### 5. Safety checks
Every pick must pass all of these:
- mint authority revoked
- freeze authority revoked
- not flagged by RugCheck as a rug, a honeypot, or mintable/freezable. Its other warnings, like low liquidity or holder spread, are normal for memes and are ignored.
- the top 10 real wallets hold 50% or less. Pools and bonding curves don't count.
- a small buy-and-sell quote test through Jupiter loses less than 15%. This still catches honeypots and big taxes.
- if a check can't run (RugCheck or the holder lookup is down), mem skips that check instead of rejecting the coin.

### 6. Buy
- mem buys up to 3 favourites per trip, as many as the budget covers.
- Each buy goes through Jupiter and is never more than 2% of the coin's pool.

### 7. Share
- **Who gets paid:** the top 50 wallets holding at least 1,000,000 $MEM.
- **Hold all hour:** balances are checked 3 times an hour, once at a secret random minute. Your balance counts at its lowest of the three.
- **Split:** in proportion to balance, capped at 10% per wallet.
- **Never paid:** pools, mem's own wallet, and every wallet in `EXCLUDE_WALLETS`.
- **Delivery:** tokens land straight in holders' wallets. A failed send is retried, but only to wallets that are still owed.

### 8. Publish
`/feed.json` holds:
- status and the time of the next trip
- the piggy bank and progress to the first trip
- the radar
- every pick after it's bought, with its transaction links
- every drop
- the top-50 board
- a 7-day record of what each wallet received

## Commands
```
npm install
npm run sim        # offline check of the rules and payout math
npm start          # run as an always-on server (reads .env)
npx tsx src/tick.ts  # one run, what GitHub Actions does every 5 minutes
npm run test-run   # practice mode on your own computer (see TEST-RUN.md)
npm run withdraw -- ADDRESS   # empty mem's wallet to ADDRESS
```
