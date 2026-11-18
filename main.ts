// Patient dip-buy swing bot for the make.fun BTC 24h race
// (competition btc-race-24h-20261118-1444, symbol CBBTC, $1,000 paper capital).
//
// Idea: BTC drifts down most of the dev window, and every fast
// trend/mean-reversion rule loses to fees there. So this bot is patient: it
// only buys after a large dislocation — the close at least 2.0% below the
// trailing 6-hour high — and only once the tape has turned, confirmed by two
// consecutive up closes. It then exits fast: take-profit at +1.0% over the
// fill price, or a trailing stop 1.2% below the highest close since entry.
// One position at a time, 100% of cash on entry, no new entries in the last
// 60 bars of the window (a late entry never reaches its target and only pays
// fees when the window flattens it).
//
// Fully deterministic: pure integer (bigint) arithmetic, no clock, no
// environment, no randomness. Two runs on the same data produce identical
// action logs.

import { runBars } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

// Strategy parameters (basis points where noted).
const TRAILING_HIGH_BARS = 360; // 6 hours of 1-minute bars.
const WINDOW_BARS = 1440; // 24 hours of 1-minute bars.
const NO_BUY_LAST_BARS = 60; // do not open in the final hour of the window.
const DIP_BPS = 200; // entry: close >= 2.0% below the trailing high.
const TAKE_PROFIT_BPS = 100; // exit: close >= entry + 1.0%.
const TRAILING_STOP_BPS = 120; // exit: close < peak since entry - 1.2%.
const MAX_SLIPPAGE_BPS = 100; // 1% — far above the largest observed gap.
const BPS = 10_000n;

// All closes seen so far (warm-up batches included), oldest first.
const closes: bigint[] = [];
// Fill price of the open position (raw units at the symbol's price scale),
// and the highest close since that fill. Null while flat.
let entryPrice: bigint | null = null;
let peakSinceEntry: bigint | null = null;

function trailingHigh(window: number): bigint {
  let high = 0n;
  const start = closes.length > window ? closes.length - window : 0;
  for (let i = start; i < closes.length; i++) {
    const c = closes[i]!;
    if (c > high) high = c;
  }
  return high;
}

await runBars({
  onBatch(state, batch) {
    // Build history from every bar, including warm-up bars.
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) closes.push(BigInt(bar.c));
    }
    // Learn the true entry price (and reset) from fills of past orders.
    for (const fill of batch.fills) {
      if (fill.symbol !== SYMBOL || fill.status !== 'filled') continue;
      if (fill.side === 'buy') {
        entryPrice = BigInt(fill.price);
        peakSinceEntry = BigInt(fill.price);
      } else {
        entryPrice = null;
        peakSinceEntry = null;
      }
    }

    // Never trade during warm-up: orders decided there are rejected.
    if (state.warmingUp) return [];
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const position = state.positions.get(SYMBOL);
    const qty = position === undefined ? 0n : position.qty;

    if (qty > 0n) {
      // Holding: manage the exit. If the entry price is somehow unknown,
      // anchor it at the current close so neither exit fires immediately.
      if (entryPrice === null) {
        entryPrice = close;
        peakSinceEntry = close;
        return [];
      }
      if (peakSinceEntry === null || close > peakSinceEntry) {
        peakSinceEntry = close;
      }
      const peak = peakSinceEntry;
      // Take-profit first: close >= entry + 1.0%.
      if (close * BPS >= entryPrice * (BPS + BigInt(TAKE_PROFIT_BPS))) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      // Trailing stop: close < peak since entry - 1.2%.
      if (close * BPS < peak * (BPS - BigInt(TRAILING_STOP_BPS))) {
        return [{ side: 'sell', symbol: SYMBOL, qty, max_slippage_bps: MAX_SLIPPAGE_BPS }];
      }
      return [];
    }

    // Flat: look for a dip-buy entry. The trailing high spans the last 360
    // bars, or however many closes exist yet: this competition sends no
    // warm-up, so history starts empty at the window's first bar and the
    // running high is the only high available early on. Only the two-bar
    // confirmation needs a minimum (3 closes).
    if (closes.length < 3) return [];
    // No new entries in the last 60 bars of the window.
    if (state.seq >= state.warmupBars + WINDOW_BARS - NO_BUY_LAST_BARS) return [];
    // Confirmation: two consecutive up closes (current over previous,
    // previous over the one before).
    const n = closes.length;
    if (!(close > closes[n - 2]! && closes[n - 2]! > closes[n - 3]!)) return [];
    // Dislocation: close at least 2.0% below the trailing 360-bar high.
    const high = trailingHigh(TRAILING_HIGH_BARS);
    if (close * BPS > high * (BPS - BigInt(DIP_BPS))) return [];
    if (state.cash <= 0n) return [];
    return [{ side: 'buy', symbol: SYMBOL, notional_quote_units: state.cash, max_slippage_bps: MAX_SLIPPAGE_BPS }];
  },
});
