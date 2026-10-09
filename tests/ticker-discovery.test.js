const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

const {
  discoverTickers,
  extractTickers,
} = require('../cli/ticker-discovery');
const { parseArguments } = require('../cli/pytrader-web');

test('extractTickers recognizes common text and CSV formats', () => {
  const source = `AAPL, MSFT\nNASDAQ:NVDA\nBME:TEF\ntrader@example.com\n`;
  assert.deepEqual(extractTickers(source), ['AAPL', 'MSFT', 'NVDA', 'TEF']);
});

test('discoverTickers finds supported files recursively', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pytrader-'));
  await fs.mkdir(path.join(root, 'nested'), { recursive: true });
  await fs.writeFile(path.join(root, 'tickers.txt'), 'AAPL\nMSFT');
  await fs.writeFile(path.join(root, 'nested', 'watchlist.csv'), 'ticker\nNVDA\n');
  await fs.writeFile(path.join(root, 'notes.md'), 'ignored');

  try {
    assert.deepEqual(new Set(await discoverTickers(root)), new Set(['AAPL', 'MSFT', 'NVDA']));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('discoverTickers rejects unsupported files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'pytrader-'));
  await fs.writeFile(path.join(root, 'notes.md'), 'AAPL');

  try {
    assert.deepEqual(await discoverTickers(root), []);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('parseArguments accepts a path and analysis options', () => {
  assert.deepEqual(parseArguments(['watchlist.csv', '--period', '3mo', '--interval', '1d']), {
    options: { period: '3mo', interval: '1d' },
    positional: ['watchlist.csv'],
  });
});
