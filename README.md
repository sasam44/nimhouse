# 🐔 NimHouse

**Skill-based mini games inside Nimiq Pay.** One house, six games, real NIM integration — and zero
gambling. Built for the [Nimiq Mini Apps Competition](https://miniappscompetition.com) (Cycle II).

| Game | Loop | Skill |
| --- | --- | --- |
| **NimChick** | Flappy-Bird-style flapper starring an absurd mustached chicken | flap timing |
| **NimStack** | Blocks float overhead; drop them onto the shrinking tower | timing & precision |
| **NimBullseye** | Dart throwing: ride the swaying crosshair, green band = PERFECT ×2 | feel & judgment |
| **NimRush** | Pseudo-3D chicken runner — weave through cows, UFOs, giant sausages | reflexes |
| **NimSwat** | One angry mustachioed fly; tap it before it gets too fast (5 misses = escape) | moving-target accuracy |
| **NimCannon** | Slingshot ballistics — fling your chick through sausage towers, 3 shots/level | arc reading |

## Why NimHouse

- **100% player skill.** No entry fees, no betting, no chance-based outcomes. Every score is earned.
- **Cosmetic-only NIM shop.** Buy chicken outfits, darts, and block themes with real NIM payments
  through Nimiq Pay. Skins *never* affect gameplay.
- **Wallet-verified scores.** Verify any run by signing a tamper-proof record with your Nimiq wallet
  — the run earns a ✓ badge on the leaderboard.
- **Cheer the house.** Tip other players with a NIM payment that carries your message on-chain.
- **Demo mode.** Running outside Nimiq Pay (browser, CI) transparently simulates wallet actions so
  the app is always fully testable. Inside Nimiq Pay everything is real.

## Nimiq Pay integration (framework APIs used)

| Feature | API |
| --- | --- |
| Wallet connect, address | `nimiq.listAccounts()` |
| Live network status | `nimiq.isConsensusEstablished()`, `nimiq.getBlockNumber()` |
| Skin purchases, cheers | `nimiq.sendBasicTransactionWithData()` (NIM, Luna, note on-chain) |
| Score verification | `nimiq.sign()` (message signing) |
| Leaderboard device id | `requestDeviceIdentifier()` from `@nimiq/mini-app-sdk` |

Built with the official stack from the [mini app tutorial](https://nimiq.dev/mini-apps/tutorials/mini-app-tutorial):
Vite + React + `@nimiq/mini-app-sdk`. No other runtime dependencies.

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

### Before submitting: set your payout address

`CHEER_ADDRESS` in [`src/wallet.js`](src/wallet.js) is the recipient for skin purchases and cheers.
Replace it with your real Nimiq Pay address.

## Project structure

```
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
  games/NimCannon.jsx     ballistic slingshot vs sausage towers
  components/ScoreOverlay.jsx  shared round-over + verify flow
```

## Rules compliance (Nimiq Mini Apps Competition)

- ✅ Built on the **Nimiq Pay Mini Apps Framework** (SDK `init()` + provider APIs)
- ✅ Integrates **NIM** natively (payments + signing) — scores under Nimiq integration
- ✅ **No gambling / no games of chance** — all three games are deterministic skill games
- ✅ Fully functional product, no prototype pieces, works on first try
- ✅ Public repo, **MIT License** (see `LICENSE`), no hardcoded secrets
- ✅ AI tools used in development (permitted by the competition FAQ)

## License

MIT — see [LICENSE](LICENSE).
