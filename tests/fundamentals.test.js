const test = require('node:test');
const assert = require('node:assert/strict');
const { fetchTrailingEps } = require('../src/fundamentals');

test('fundamentals use trailing EPS and never forward PE or PEG', async () => {
  const yf = { quoteSummary: async () => ({ defaultKeyStatistics: { trailingEps: 2, forwardPE: 5, pegRatio: 1 } }) };
  assert.equal(await fetchTrailingEps(yf, 'TEST'), 2);
  yf.quoteSummary = async () => ({ defaultKeyStatistics: { forwardPE: 5, pegRatio: 1 } });
  assert.equal(await fetchTrailingEps(yf, 'TEST'), null);
});

test('unavailable, zero and nonfinite EPS stay unavailable', async () => {
  for (const eps of [null, 0, Infinity, NaN]) {
    assert.equal(await fetchTrailingEps({ quoteSummary: async () => ({ defaultKeyStatistics: { trailingEps: eps } }) }, 'TEST'), null);
  }
  assert.equal(await fetchTrailingEps({ quoteSummary: async () => { throw new Error('offline'); } }, 'TEST'), null);
});

test('price and earnings in different monetary units are not divided', async () => {
  const yf = { quoteSummary: async () => ({ defaultKeyStatistics: { trailingEps: 2 }, price: { currency: 'GBp' }, financialData: { financialCurrency: 'GBP' } }) };
  assert.equal(await fetchTrailingEps(yf, 'TEST.L'), null);
});
