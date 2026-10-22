# Launching $mem (short version, all free)

Your **$mem Launch Guide** doc has the full step-by-step. This is the checklist.

| Piece | Where it runs | Cost |
|---|---|---|
| the site (`mem-vercel` folder → GitHub repo `mem-site`) | Vercel, on mem.fun | free (plus the domain) |
| mem's bot (`mem-bot` folder → **public** GitHub repo `mem-bot`) | GitHub Actions, every 5 minutes | free for public repos |

1. Make a fresh Phantom account just for mem. Back up its private key on paper.
2. Upload `mem-bot` (public) and `mem-vercel` to two GitHub repos. Never upload `.env` or `data/`. Make sure `.github/workflows/mem.yml` and `withdraw.yml` made it.
3. In mem-bot, go to Settings > Secrets and variables > Actions.
   - **Secrets:** `PRIVATE_KEY`, `RPC_URL` (Helius), `JUPITER_API_KEY`, `EXCLUDE_WALLETS`
   - **Variables:** `DRY_RUN` = `true`
4. Open Actions, enable workflows, then run **mem** once. A `data` branch appears. The feed is at `https://raw.githubusercontent.com/YOU/mem-bot/data/public/feed.json`.
5. In mem-site, put your GitHub name in that address in `vercel.json`. Import the repo in Vercel with the "Other" preset and deploy. Then add mem.fun under Settings > Domains.
6. Launch $mem on pump.fun from mem's wallet:
   - normal creator rewards to the creator
   - no holder-rewards mode
   - no fee sharing
   - SOL pair
   - website set to https://mem.fun
7. Leave at least 0.06 SOL in mem's wallet for fees. mem only ever spends SOL that came in as creator fees, so any extra launch SOL just sits there until you withdraw it.
8. Add the variable `MEM_MINT` = contract address and set `DRY_RUN` = `false`. Run **mem** once from Actions.
9. Done. The site picks up the contract address by itself. mem's first trip starts at 2 SOL of fees, then he shops every hour.

Day to day:
- **Watch mem:** Actions > latest mem run > tick
- **Pause mem:** set `DRY_RUN` = `true`
- **Take everything out:** pause mem, then Actions > withdraw > Run workflow (type your address)

Prefer your own machine? `deploy/server-setup.sh` sets mem up on any Ubuntu server instead.
