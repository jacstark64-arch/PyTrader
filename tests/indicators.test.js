const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateIndicators, buildTradingViewSymbol } = require('../src/F_Trader_4');

function rows(direction = 1) {
  return Array.from({ length: 260 }, (_, i) => {
    const close = 200 + direction * i * 0.2;
    return { date: new Date(Date.UTC(2024, 0, 1 + i)), open: close - 0.1,
      high: close + 1, low: close - 1, close, volume: 1000 + i * 10 };
  });
}

test('RSI handles rising, falling and flat prices', () => {
  for (const [direction, expected] of [[1, 100], [-1, 0], [0, 50]]) {
    assert.equal(calculateIndicators(rows(direction)).at(-1).rsi, expected);
  }
});

test('weekly CFI is included without using future weeks', () => {
  const input = rows();
  const output = calculateIndicators(input);
  assert.ok(output.at(-1).cfiWeeklyUp);
  for (const size of [12, 31, 57]) {
    assert.deepEqual(calculateIndicators(input.slice(0, size)).map(r => r.cfiWeeklyUp),
      output.slice(0, size).map(r => r.cfiWeeklyUp));
  }
});

test('historical input order does not change results', () => {
  assert.deepEqual(calculateIndicators(rows().reverse()), calculateIndicators(rows()));
});

test('scores are normalized by available criteria and preserve zero weights', () => {
  const cfg = { rsiWeight: 0, macdWeight: 0, adxWeight: 0, vwapWeight: 0 };
  const result = calculateIndicators(rows(), cfg).at(-1);
  const raw = (result.trendUp ? 25 : 0) + (result.cfiUp ? 25 : 0)
    + (result.cfiWeeklyUp ? 20 : 0) + (result.accumulation ? 15 : 0)
    + (result.flowSmooth > 0 ? 15 : 0);
  assert.equal(result.score, raw);
  assert.deepEqual(calculateIndicators(rows(), { per: Infinity }), calculateIndicators(rows()));
});

test('TradingView symbols retain their exchange and full base symbol', () => {
  assert.equal(buildTradingViewSymbol('SAN.MC'), 'BME:SAN');
  assert.equal(buildTradingViewSymbol('AAPL'), 'NASDAQ:AAPL');
});

test('RSI uses Wilder smoothing after its initial average', () => {
  const closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
    45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03];
  const input = rows().slice(0, closes.length).map((r, i) => ({
    ...r, close: closes[i], open: closes[i], high: closes[i] + 1, low: closes[i] - 1
  }));
  const result = calculateIndicators(input);
  for (const [i, expected] of [[14, 70.46413502109705], [15, 66.24961855355505], [16, 66.48094183471265]]) {
    assert.ok(Math.abs(result[i].rsi - expected) < 1e-9);
  }
});

test('divergences compare confirmed pivots and never appear before confirmation', () => {
  for (const bearish of [false, true]) {
    const input = rows().slice(0, 90).map(r => ({ ...r, open: 100, close: 100, high: 105, low: 95, volume: 1000 }));
    Object.assign(input[60], { low: 90, close: 91, volume: 2000 });
    Object.assign(input[72], { low: 85, close: 104, volume: 3000 });
    if (bearish) {
      for (const row of input) {
        const { high, low, open, close } = row;
        Object.assign(row, { high: 200 - low, low: 200 - high, open: 200 - open, close: 200 - close });
      }
    }
    const column = bearish ? 'bearDiv' : 'bullDiv';
    const result = calculateIndicators(input);
    assert.equal(result[77][column], true);
    assert.equal(result.filter(r => r[column]).length, 1);
    for (const size of [61, 65, 73, 77, 78]) {
      assert.deepEqual(calculateIndicators(input.slice(0, size)).map(r => r[column]), result.slice(0, size).map(r => r[column]));
    }
  }
});

test('strong buy requires the master conditions in the CFI table', () => {
  const input = rows().map((r, i) => {
    const close = r.close + Math.sin(i / 3) * 3;
    return { ...r, close, open: close + 3, high: close + 4, low: close - 1 };
  });
  const results = calculateIndicators(input);
  assert.ok(results.some(r => r.rsiBullish && r.macdBullish && r.trendUp && !r.buyPro));
  for (const result of results) {
    assert.equal(result.signal === 'COMPRA FUERTE', result.buyPro);
  }
});

test('Pine momentum and RSI filters block otherwise bullish conditions', () => {
  const input = rows().map(r => ({ ...r, low: r.close - 2 }));
  const results = calculateIndicators(input);
  assert.equal(results[52].momentum, input[52].close - input[0].close);
  assert.ok(results.some(r => r.trendUp && r.cfiUp && r.flowSmooth > 0));
  assert.ok(results.every(r => !r.buyPro)); // RSI is 100, above the Pine limit of 65.
  const boundary = calculateIndicators(input, { momentumMin: results.at(-1).momentum, momentumMax: results.at(-1).momentum });
  assert.equal(boundary.at(-1).momentumOk, false);
});

test('Pine PER uses price divided by EPS TTM and its support limit is strict', () => {
  const input = rows();
  const result = calculateIndicators(input, { epsTtm: 2, per: 1 });
  for (const r of result) assert.equal(r.per, r.close / 2);
  const last = input.at(-1);
  assert.equal(calculateIndicators(input, { epsTtm: last.close / 20 }).at(-1).perSupport, false);
  assert.equal(calculateIndicators(input, { epsTtm: -2 }).at(-1).perSupport, false);
  assert.equal(calculateIndicators(input, { epsTtm: 0 }).at(-1).per, null);
});

test('Beta requires 61 aligned benchmark returns and VWMA risk uses 30 bars', () => {
  const input = rows().slice(0, 90);
  const benchmark = input.map(r => ({ ...r }));
  input[0].close = 200;
  benchmark[0].close = 100;
  for (let i = 1; i < input.length; i++) {
    const change = Math.sin((i - 1) / 3) / 100 + 0.002;
    input[i].close = input[i - 1].close * (1 + 2 * change);
    benchmark[i].close = benchmark[i - 1].close * (1 + change);
  }
  const output = calculateIndicators(input, { benchmark });
  assert.ok(output.slice(0, 61).every(r => r.beta === null));
  assert.ok(output.slice(61).every(r => Math.abs(r.beta - 2) < 1e-10));
  const tail = input.slice(-30);
  const average = tail.reduce((sum, r) => sum + r.close * r.volume, 0) / tail.reduce((sum, r) => sum + r.volume, 0);
  assert.ok(Math.abs(output.at(-1).vwma - average) < 1e-9);
  assert.ok(Math.abs(output.at(-1).risk - Math.abs(input.at(-1).close - average) / input.at(-1).close * 100) < 1e-9);
  assert.ok(calculateIndicators(input).every(r => r.beta === null));
  assert.ok(calculateIndicators(input, { benchmark: benchmark.map(r => ({ ...r, close: 100 })) }).every(r => r.beta === null));
});
