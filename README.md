# BTC Dip-Buy Swing Bot

[![make.fun](https://make.fun/badge/btc-race-24h-20261118-1444.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![rank](https://make.fun/badge/btc-race-24h-20261118-1444/Zer1332/btc-race-bot-/rank.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)
[![reward](https://make.fun/badge/btc-race-24h-20261118-1444/Zer1332/btc-race-bot-/reward.svg)](https://make.fun/bounty/btc-race-24h-20261118-1444)

A patient dip-buy swing bot for the [make.fun BTC 24h race](https://make.fun/bounty/btc-race-24h-20261118-1444)
(`btc-race-24h-20261118-1444`): it trades cbBTC (CBBTC) against USDC with
$1,000 of paper capital, long only, one position at a time.

## Strategy — "Patient dip-buy swing"

BTC drifts down through most of the window, and fast trend or mean-reversion
rules lose to fees there. So this bot waits for a real dislocation and exits
fast:

- **History:** every close so far; trailing high over the last 360 bars
  (6 hours).
- **Entry (buy):** the close is at least **2.0% below** the trailing 360-bar
  high **and** the close rose two bars in a row (reversal confirmation).
  Buys with 100% of available cash. One position only — never adds.
- **Exit (sell all):** whichever comes first —
  - **take-profit:** close ≥ entry price + **1.0%**, or
  - **trailing stop:** close < highest close since entry − **1.2%**.
- **No new entries in the last 60 bars** of the window: a late entry never
  reaches its target and only pays fees when the window flattens it.
- **Max slippage:** 100 bps (1%) on every order.

Fully deterministic: pure integer arithmetic, no clock, no environment, no
randomness. Two runs on the same data produce byte-identical action logs.

## Layout

- `main.ts` — entrypoint and the whole strategy (Node 22, erasable
  TypeScript).
- `vendor/makefun-bars.ts` — the kit's bars-replay SDK shim, copied
  byte-for-byte (it owns the wire protocol, order validation and state).

## Local grade

```sh
node <kit>/cli/makefun.mjs grade-local --kit <kit> --bot . --driver process
node <kit>/cli/makefun.mjs check --kit <kit> --repo .
```

## License

MIT — see [LICENSE](LICENSE).
