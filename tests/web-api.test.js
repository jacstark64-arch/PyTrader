const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAnalyzeRequest,
  serializeAnalysisResult,
} = require('../api/analyze');
const {
  isYahooRateLimitError,
  toYahooHistoryOptions,
} = require('../src/yahoo-history-options');

const sampleResult = {
  date: '2026-03-01',
  close: 132.4,
  signal: 'COMPRA FUERTE',
  score: 85,
  trendUp: true,
  cfi: 1.2,
  flowSmooth: 0.8,
  rsi: 58.4,
  macd: 0.7,
  macdSignal: 0.5,
  per: 18.3,
  adx: 24.2,
  vwap: 128.1,
  volume: 125000,
};

test('normalizeAnalyzeRequest accepts a valid request', () => {
  const request = normalizeAnalyzeRequest({
    tickers: ['AAPL', 'MSFT'],
    period: '1y',
    interval: '1d',
  });

  assert.deepEqual(request.tickers, ['AAPL', 'MSFT']);
  assert.equal(request.period, '1y');
  assert.equal(request.interval, '1d');
});

test('normalizeAnalyzeRequest rejects invalid input', () => {
  assert.throws(
    () => normalizeAnalyzeRequest({ tickers: [''] }),
    /ticker/i,
  );
  assert.throws(
    () => normalizeAnalyzeRequest({ tickers: ['AAPL'], period: 'invalid' }),
    /period/i,
  );
});

test('toYahooHistoryOptions converts configured periods to period1 dates', () => {
  const now = Date.UTC(2026, 0, 1);
  const options = toYahooHistoryOptions('1y', '1d', now);

  assert.equal(options.period1.getTime(), now - 365 * 24 * 60 * 60 * 1000);
  assert.equal(options.interval, '1d');
  assert.deepEqual(toYahooHistoryOptions('max', '1w', now), {
    period1: new Date(0),
    interval: '1wk',
  });
});

test('isYahooRateLimitError recognizes a plain-text 429 response', () => {
  assert.equal(isYahooRateLimitError(new Error("Unexpected token 'T', \"Too Many Requests \" is not valid JSON")), true);
  assert.equal(isYahooRateLimitError(new Error('Invalid symbol')), false);
});

test('serializeAnalysisResult returns a serializable result', () => {
  const response = serializeAnalysisResult('AAPL', sampleResult);

  assert.equal(response.ticker, 'AAPL');
  assert.equal(response.result.close, sampleResult.close);
  assert.equal(typeof response.result.score, 'number');
  assert.equal(typeof response.result.signal, 'string');
  assert.equal(typeof response.result.rsi, 'number');
  assert.equal(typeof response.result.macd, 'number');
  assert.equal(response.result.trend, 'ALCISTA');
});
