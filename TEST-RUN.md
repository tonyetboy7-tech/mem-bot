# Test run: watch mem buy a real pump.fun coin and send it to you

This uses **real SOL on Solana mainnet**. There's no $MEM yet. mem spends the SOL you send to his wallet, and the wallet you connect on the site counts as the holder.

## What you need
- **Node.js 22 or newer** (the LTS installer from nodejs.org).
- **Phantom, Solflare or Backpack** in Chrome, with a little SOL.
- **0.03–0.05 SOL to send to mem.** $1 isn't enough. Each coin mem buys needs about 0.0065 SOL on top of the buy itself:
  - opening a token account for mem (about 0.0025 SOL)
  - opening one for you (about 0.0025 SOL)
  - fees
  - 0.02 SOL covers one coin. 0.03–0.05 SOL lets him buy up to 3 favorites in one run.
  - You keep the coins, and the withdraw step returns everything mem didn't spend.
- **Recommended, both free:**
  - A Jupiter API key from portal.jup.ag. mem's buy may fail without one.
  - A Helius RPC key from helius.dev. The public Solana RPC often rate-limits.

## Steps
1. Unzip the folder and open a terminal inside `mem-bot`.
2. Optional: copy `.env.example` to `.env` and fill in `JUPITER_API_KEY`, and `RPC_URL` with your Helius link.
3. Run:
   ```
   npm install
   npm run test-run
   ```
   The terminal prints **mem's wallet address**. On the first run, mem's wallet is created and saved in `data/mem-wallet.json`.
4. Open **http://localhost:8787** in Chrome. Under "mem's shop" there's a test run box with mem's wallet and a 3-minute timer.
5. Send **0.03–0.05 SOL** to mem's wallet. The box shows the balance once it arrives, within about 10 seconds.
6. Scroll to **check your bag** and press **connect**. Approve the connection in your wallet. You'll see "registered ✓".
   - This only shares your address. Nothing asks you to sign a transaction.
7. When the timer hits 00:00 (or when you press **shop now** in the test box), mem:
   - scans every trending Solana coin
   - keeps only pump.fun coins
   - runs the rules and the safety checks
   - buys his top favorites, as many as the SOL allows (up to 3)
   - sends 100% of each coin to your wallet

   The terminal and the site show each step, with Solscan links for the buy and the drop.
   If a buy or a send fails, the reason shows in red in the test box. A failed send is retried 15 seconds later, and again on the next run, but only to wallets that didn't get their coins, so nobody is paid twice.
8. Check your wallet. The coin should be there.
   - If nothing passed the rules, or the SOL hadn't arrived yet, mem tries again every 3 minutes.
9. Get the leftovers back. Stop the bot with Ctrl+C, then run:
   ```
   npm run withdraw -- YOUR_WALLET_ADDRESS
   ```
   This sends back mem's leftover SOL, any token dust, and the 0.002 SOL rent from each token account he opened.

## Updating from an earlier copy
**Copy the `data` folder from your old `mem-bot` folder into the new one** before running. It holds mem's wallet and anything he still owes you. If you skip this, the new copy creates a new mem wallet, and the old wallet's SOL and coins stay behind. `npm run withdraw` in the old folder still gets them back.

## Good to know
- **Keep `data/mem-wallet.json` private.** It's mem's private key. Anyone with this file controls the SOL inside. To open mem's wallet in Phantom, import the `secretKeyBase58` value from that file.
- **It isn't a $1 test.** mem spends everything you send except a tiny reserve and the gas. If you send more, he buys more: up to 2% of a pool per coin and up to 3 coins per run.
- **The coin is real.** It can go up or down after mem buys it.
- **If more than one wallet connects,** they split each drop equally.
- **Start fresh:** stop the bot and delete `data/state.json`. Keep `mem-wallet.json` unless you've withdrawn everything.
