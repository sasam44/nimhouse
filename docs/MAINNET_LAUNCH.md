# NimHouse Mainnet Launch Runbook

The app is **network-agnostic by design** — zero code changes are required for mainnet.
`src/` contains no hard-coded network strings; `wallet.js` talks to whatever Nimiq Pay
host it runs inside, and `scripts/payout.mjs` only records tx hashes the user makes from
their own wallet. The remaining work is operational:

## 1. Domain (owner: user)

Vercel already has `nimhouse.site` added to the project. In Namecheap (Advanced DNS):

| Type   | Host | Value                  |
|--------|------|------------------------|
| A      | `@`  | `76.76.21.21`          |
| CNAME  | `www`| `cname.vercel-dns.com` |

Vercel issues the SSL cert automatically once DNS resolves. Verify:
`curl -sI https://nimhouse.site | head -3`

## 2. Fund the mainnet wallet (owner: user)

- Mainnet Nimiq Pay account (default mode — no dev menu).
- Buy a small amount of NIM (KuCoin / CoinEx / Gate / MEXC). NIM trades around
  ~$0.0005, so **5,000 NIM ≈ a few thousand rupiah** and covers many cup periods
  (7 games × 100 NIM per 3-day period = 700 NIM/period).
- Send to the NimHouse wallet (same address on both networks):
  `NQ52UUPVJEM5SBRAY98HS0FPYHCXHUQRH8CJ`
- Keep the funding tx hash — it becomes `stakeTx` in `data/cup.json` (public proof).

## 3. Point the Cup pool at mainnet (agent)

Update `data/cup.json` via the API flow (or a direct repo commit):
- `pool.stakeTx` = funding tx hash
- `pool.note` = "…stakes 100 NIM (mainnet) per game…"
- Testnet mode keeps working automatically — judges may use either network.

## 4. Mainnet verification (agent, before announcing)

Full pass inside the Nimiq Pay app (mainnet mode):
1. Connect → address + block number shown
2. Play one game → submit score → Cup entry appears (signed, verified badge)
3. Cheer 0.01 NIM with a message → board entry with on-chain tx
4. Buy a 0.01 NIM skin → on-chain note, skin equips
5. `https://nimhouse.site` serves the same bundle (check bundle hash)

## 5. Docs + deploy (agent)

- README/SUBMISSION: testnet → mainnet wording (pool, demo script, "Get free NIM"
  line becomes "send NIM to the wallet").
- Commit, push, redeploy. Mainnet is live.

## Ongoing

- Every 3-day period: pay top 3 per game with `node scripts/payout.mjs`
  (real NIM, from the NimHouse wallet; tx hashes recorded + public).

## Rollback

Not needed — the app runs on both networks. Worst case, the mainnet pool simply
runs out and the Cup pauses; nothing breaks.
