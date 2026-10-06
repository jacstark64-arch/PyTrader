const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeAnalyzeRequest,
  serializeAnalysisResult,
} = require('../api/analyze');

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
