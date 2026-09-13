# 🐔 NimHouse

**Skill-based mini games inside Nimiq Pay.** One house, seven games, real NIM integration — and
zero gambling. Built for the [Nimiq Mini Apps Competition](https://miniappscompetition.com)
(Cycle II).

| Game | Loop | Skill |
| --- | --- | --- |
| **NimChick** | Flappy-Bird-style flapper starring an absurd mustached chicken | flap timing |
| **NimStack** | Blocks float overhead; drop them onto the shrinking tower | timing & precision |
| **NimBullseye** | Dart throwing: ride the swaying crosshair, green band = PERFECT ×2 | feel & judgment |
| **NimRush** | Pseudo-3D chicken runner — weave through cows, UFOs, giant sausages | reflexes |
| **NimSwat** | One angry mustachioed fly; tap it before it gets too fast (5 misses = escape) | moving-target accuracy |
| **NimSlice** | Sausage volleys fly up the screen — swipe to slice them all (3 escapes = over) | swipe timing |
| **NimDash** | Side-scrolling platformer — sprint, jump & mid-air flap over blocks, pits & mustachioed flies; stomp for +50, grab Luna coins | jump timing, air-flap control & stomping |

## Why NimHouse

- **100% player skill.** No entry fees, no betting, no chance-based outcomes. Every score is earned.
- **Cosmetic-only NIM shop.** Buy chicken outfits, darts, and block themes with real NIM payments
  through Nimiq Pay. Skins *never* affect gameplay.
- **Wallet-verified scores.** Verify any run by signing a tamper-proof record with your Nimiq wallet
  — the run earns a ✓ badge on the leaderboard.
- **Cheer the house.** Tip other players with a NIM payment that carries your message on-chain.
- **NimHouse Cup.** Every 3 days, per game, the NimHouse wallet stakes 100 NIM (testnet). Top 3
  wallet-verified scores take 50 / 30 / 20 % of that cup's pool, paid on-chain at the end of the cup.
  Free to enter — one entry per device per game per cup, best score counts.
- **Demo mode.** Running outside Nimiq Pay (browser, CI) transparently simulates wallet actions so
  the app is always fully testable. Inside Nimiq Pay everything is real.

## Nimiq Pay integration (framework APIs used)

| Feature | API |
| --- | --- |
| Wallet connect, address | `nimiq.listAccounts()` |
| Live network status | `nimiq.isConsensusEstablished()`, `nimiq.getBlockNumber()` |
| Skin purchases, cheers | `nimiq.sendBasicTransactionWithData()` (NIM, Luna, note on-chain) |
| Score verification | `nimiq.sign()` (message signing) |
| Cup entries | `nimiq.sign()` → server verifies the ed25519 signature, then stores the entry |
| Leaderboard device id | `requestDeviceIdentifier()` from `@nimiq/mini-app-sdk` |

Built with the official stack from the [mini app tutorial](https://nimiq.dev/mini-apps/tutorials/mini-app-tutorial):
Vite + React + `@nimiq/mini-app-sdk`. One extra runtime dependency, `js-sha3` (keccak256, used by
the Cup API to match how Nimiq wallets hash signed messages).

## NimHouse Cup (prize pool)

A free-to-enter, skill-only cup runs on a **3-day cycle**, independently per game.

- **Stake.** At the start of every cup the NimHouse wallet stakes `100 NIM` (testnet) per game.
- **Entry.** Finish any game → **Enter the NimHouse Cup**. The app signs a tamper-proof message
  (`game | period | score | device`) with your Nimiq wallet. The server re-verifies the ed25519
  signature before accepting the entry — a score you didn't sign with your own key is rejected.
- **Fairness.** One entry per device per game per cup (replays are free; the best score counts). No
  entry fee, no randomness, no betting.
- **Payout.** At the end of each cup the **top 3** take **50 / 30 / 20 %** of that cup's pool, paid
  on-chain from the NimHouse wallet. Winners and payout tx hashes are public.
- **Transparency.** Pool, entries, and payouts are stored in the open repo at
  [`data/cup.json`](data/cup.json). Anyone can audit every entry and payment.

### Cup API (Vercel serverless functions)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/cup` | Current period, pool, top-3 per game, recorded payouts |
| `POST /api/cup/submit` | Verify signature + record/upgrade an entry |
| `POST /api/cup/payout` | Record a payout tx (admin-gated) |

The functions read/write `data/cup.json` in this repo via the GitHub Contents API. Configure in
Vercel (never commit these):

```
CUP_GITHUB_TOKEN     fine-grained PAT with Contents: read/write on this repo
CUP_GITHUB_REPO      <owner>/<repo>   (e.g. sasam44/nimhouse)
CUP_ADMIN_SECRET     random secret guarding /api/cup/payout (sent as x-cup-admin)
```

`data/cup.json` is seeded with a `PENDING` wallet; the Cup card auto-enables once the wallet is set.

### Running payouts

After a cup closes, pay the winners from the NimHouse wallet and record the tx hashes with the
bundled runner (reads the public `data/cup.json`, no GitHub token needed; the admin secret comes
from `.env.cup-admin`):

```bash
node scripts/payout.mjs --dry-run   # preview the payout table
node scripts/payout.mjs             # interactive: paste each tx hash (or s to skip)
```

### Player names (signed claims)

Names are **claimed, not typed**: the player submits a gamertag in the menu (☰ → Player), the app
signs `NimHouse Name | name=<name> | device=<device>` with the wallet, and the server verifies it
before storing it in the public [`data/names.json`](data/names.json).

- The claimed name **is** the player's Cup identity — Cup entries display the claimed name
  server-side, so a client can't spoof a different one.
- Changing the name requires a **new wallet signature** (tracked with a `changes` counter).
- A device's name is **locked to the wallet that first claimed it** — another wallet on the same
  device is rejected. (Message signing was chosen over a NIM transaction: same security — the key
  holder approves — at zero fee.)

| Endpoint | Purpose |
| --- | --- |
| `GET /api/name?device=…` | Look up a device's claimed name |
| `POST /api/name/claim` | Verify signature + store/update the claim |

## Quick start

```bash
npm install
npm run dev -- --host     # Vite dev server, host-enabled for phone access
```

### Load into Nimiq Pay (real device)

1. Phone and dev machine on the **same Wi-Fi**.
2. Open **Nimiq Pay → Mini Apps** and enter the Network URL in **Custom URL**, e.g. `http://192.168.1.42:5173`.
3. Optionally switch to **testnet** (menu → long-press settings 10 s) and claim free NIM to test
   real payment flows with zero real funds. See
   [Load a Local Mini App](https://nimiq.dev/mini-apps/development/load-local-mini-app).

### Deploy (public URL)

Any static host works (Vercel, Netlify, GitHub Pages):

```bash
npm run build   # outputs dist/
```

Then open it from Nimiq Pay with `https://nimpay.app/miniapps/open/<your-domain>`.

**Current production deployment:** [https://nimhouse.vercel.app](https://nimhouse.vercel.app)

### Payout / staking address

`CHEER_ADDRESS` in [`src/wallet.js`](src/wallet.js) is the recipient for skin purchases, cheers, and
Cup stakes. The live deployment uses the real NimHouse wallet:
`NQ31PBEFQ9DLBPTSP14PUCJ8LN9YHP6NPBLQ`.

> **Note:** Vercel serverless functions bake env vars in at deploy time — after changing
> `CUP_ADMIN_SECRET` (or any `CUP_*` var) run a fresh `deploy --prod` for the running functions to
> pick up the new values.

## Project structure

```
api/
  cup.js                  Cup GET + shared game list + 3-day period math
  cup/submit.js           verify wallet signature, record/upgrade entry
  cup/payout.js           admin-gated payout tx recorder
  name/index.js           GET a device's claimed name
  name/claim.js           verify signature + store/update a name claim
  lib/store.js            read/write data/*.json via the GitHub Contents API
  lib/verify.js           shared ed25519 + Nimiq Keyguard digest verification
data/
  cup.json                cup pool + entries + payouts (public, auditable)
  names.json              signed player-name claims (public, auditable)
src/
  App.jsx                 hub: wallet, shop, cheer, leaderboards, routing
  wallet.js               SDK init + demo-mode fallback, device id, NIM helpers
  skins.js                cosmetic-only skin catalog (prices in Luna)
  sketch.js               canvas drawing (chicken, darts, blocks)
  leaderboard.js          per-device leaderboard (localStorage)
  sound.js                WebAudio SFX (no assets)
  games/NimChick.jsx      flapper engine
  games/NimStack.jsx      drop-stacking engine
  games/NimBullseye.jsx   dart engine
  games/NimRush.jsx       pseudo-3D lane-dodge runner
  games/NimSwat.jsx       moving-target swatter
  games/NimSlice.jsx      swipe-slicing sausage volley (portrait-friendly)
  games/NimDash.jsx        side-scrolling platformer (seeded course, stompables, air-flap)
  assets/chick.png        official NimHouse chick sprite (all games + hub; procedural art remains as fallback)
  components/ScoreOverlay.jsx  shared round-over + verify flow
```

## Rules compliance (Nimiq Mini Apps Competition)

- ✅ Built on the **Nimiq Pay Mini Apps Framework** (SDK `init()` + provider APIs)
- ✅ Integrates **NIM** natively (payments + signing) — scores under Nimiq integration
- ✅ **No gambling / no games of chance** — all seven games are deterministic skill games; the Cup
  is a free-to-enter skill prize pool (no entry fee, no chance), which the rules explicitly permit
- ✅ Fully functional product, no prototype pieces, works on first try
- ✅ Public repo, **MIT License** (see `LICENSE`), no hardcoded secrets
- ✅ AI tools used in development (permitted by the competition FAQ)

## License

MIT — see [LICENSE](LICENSE).
