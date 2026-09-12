# NimHouse — Submission Kit (Cycle II · deadline 18 Sep)

## 🌐 Live URL (deployed on Vercel)

- **App:** https://nimhouse.vercel.app
- **Nimiq Pay open link (share this):** `https://nimpay.app/miniapps/open/nimhouse.vercel.app`
- Nimiq Pay → **Mini Apps → Custom URL** → paste `https://nimhouse.vercel.app`


## 1. Description (≤250 words) — paste this into the portal

> NimHouse is a skill-based mini game house inside Nimiq Pay, bundling six original games: NimChick (absurd flapper), NimStack (floating blocks, drop precision), NimBullseye (swaying crosshair darts with PERFECT ×2), NimRush (pseudo-3D chicken runner), NimSwat (the angry mustachioed fly), and NimSlice (swipe-slicing sausage volleys). Every game is 100% player skill — no entry fees, no betting, no chance-based outcomes.
>
> Nimiq Pay is wired into the core experience, not the footer. Players connect their wallet, watch live consensus and block status, buy cosmetic-only skins by paying NIM through Nimiq Pay transactions with on-chain purchase notes, cheer players with NIM tips and on-chain messages, and earn a verified badge by signing a tamper-proof score record with their wallet. A per-device leaderboard tracks the best runs; wallet-verified entries stand out.
>
> NimHouse is for anyone who wants a quick, polished play session inside their wallet — no ads, no pay-to-win, no gambling. Skins never affect gameplay.
>
> Built with the Nimiq Pay Mini Apps Framework (Vite, React, @nimiq/mini-app-sdk) using NIM-native APIs: listAccounts, sendBasicTransactionWithData, sign, consensus and block checks, and device identifiers for leaderboards. 100% open source under the MIT license, with a transparent demo mode that keeps the app fully testable outside Nimiq Pay. Playable the moment you open it.

*Word count: verify below — must be ≤250 for the portal.*

## 2. Submission checklist

- [ ] **Public GitHub repo** with this project, `README.md` + `LICENSE` (MIT) — no secrets in code
  (there are none; `CHEER_ADDRESS` is a public payout address, not a secret)
- [ ] Set `CHEER_ADDRESS` in `src/wallet.js` to your real Nimiq Pay address
- [ ] **Nimiq wallet** for prize payout (lead's wallet)
- [ ] **Lead info**: name/pseudonym + GitHub profile + wallet address
- [ ] Team roster (≤5) — one representative
- [ ] Submit via the portal on the Registration Dashboard before **18 Sep**
- [ ] Demo video (see script below)

## 3. Demo video script (60–90 s)

1. **0–10 s** — open Nimiq Pay on phone, open NimHouse via the mini apps list. "This runs inside the wallet."
2. **10–25 s** — play NimChick: a few flaps, pass pipes, die on purpose. "Flappy Bird, but the chicken has a mustache and attitude."
3. **25–40 s** — NimStack + NimBullseye highlights (one clean stack, one bullseye).
4. **40–60 s** — wallet flow: connect wallet, address + block number shown; buy a skin with NIM (testnet!), show the on-chain note; cheer with a message.
5. **60–80 s** — verify a score with the wallet → ✓ badge on the leaderboard.
6. **80–90 s** — punchline: "No entry fees. No gambling. Pure skill. This is NimHouse."

Record on a phone (it's a mini app — the wallet UI is the point). Testnet mode is perfect for the
payment shots (free NIM, zero real funds).

## 4. Promotion plan (5 pts)

- Post progress daily in the [Skool community](https://www.skool.com/miniappscompetition)
- X thread: build story + 15 s clip per game + "wallet-verified scores" hook
- Attend the last Sip & Ship call (16 Sep, 21:00–22:30 WIB)
- Ask friends/family to test inside Nimiq Pay (real usage = 15 pts)

## 5. Local testing notes

- Outside Nimiq Pay the app auto-detects "demo mode" (amber badge) — all wallet actions simulate
  plausible responses so every flow is clickable.
- Inside Nimiq Pay: Mini Apps → Custom URL → `http://<your-lan-ip>:5173` (dev) or the HTTPS
  deployment URL for production.
- Testnet: long-press settings 10 s in Nimiq Pay → dev menu → Testnet → claim free NIM.
