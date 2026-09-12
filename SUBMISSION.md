# NimHouse — Submission Kit (Cycle II · deadline 18 Sep)

## 1. Description (≤250 words) — paste this into the portal

> NimHouse is a skill-based mini game house inside Nimiq Pay, bundling three original games: NimChick, a Flappy Bird–style flapper starring an absurd mustached chicken; NimStack, a precision block-stacking game where every overhang gets sliced off; and NimBullseye, a dart game where you read a swaying aim and time your power release. Every game is 100% player skill — no entry fees, no betting, no chance-based outcomes.
>
> Nimiq Pay is wired into the core experience, not the footer. Players connect their wallet, watch live consensus and block status, buy cosmetic-only skins (chicken outfits, darts, block themes) by paying NIM directly through Nimiq Pay transactions with on-chain purchase notes, cheer other players by sending NIM with a custom message, and earn a verified badge on their scores by signing a tamper-proof record of their run with their wallet. A per-device leaderboard tracks the best runs, and wallet-verified entries stand out.
>
> NimHouse is for anyone who wants a quick, polished play session inside their wallet — a student killing five minutes between classes, a creator rewarding their community, or a player who wants a game that respects them: no ads, no pay-to-win, no gambling. Skins never affect gameplay.
>
> Built with the Nimiq Pay Mini Apps Framework (Vite, React, @nimiq/mini-app-sdk) using NIM-native APIs: listAccounts, sendBasicTransactionWithData, sign, consensus and block checks, and device identifiers for leaderboards. 100% open source under the MIT license, with a transparent demo mode so the app stays fully testable even outside Nimiq Pay. Playable the moment you open it.

*Word count: 247 — verify with the portal.*

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
