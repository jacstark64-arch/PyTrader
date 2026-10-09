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
