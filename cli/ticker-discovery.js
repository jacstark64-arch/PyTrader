const fs = require('node:fs/promises');
const path = require('node:path');

const SUPPORTED_EXTENSIONS = new Set(['.txt', '.csv', '.json']);
const TICKER_PATTERN = /\b(?:[A-Z]{1,5}(?:[.-][A-Z0-9]{1,5})?|[A-Z][A-Z0-9]{1,9}(?:\.[A-Z]{2,5})?)\b/g;

function normalizeTicker(value) {
  return String(value)
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '')
    .replace(/^NASDAQ:/, '')
    .replace(/^NYSE:/, '')
    .replace(/^BME:/, '')
    .replace(/^XETR:/, '')
    .replace(/^LSE:/, '')
    .replace(/^EURONEXT:/, '')
    .replace(/^XETRA:/, '')
    .replace(/\//g, '-');
}

function extractTickers(content) {
  const normalized = String(content || '')
    .replace(/\r/g, '\n')
    .replace(/\b(?:NASDAQ|NYSE|BME|XETR|LSE|EURONEXT|XETRA|MIL|OMXSTO|OSE|OMXCOP|EURONEXT):/gi, '')
    .replace(/\b(?:ticker|tickers|symbol|symbols|accion|acciones|instrumento)\s*[:=]\s*/gi, '\n')
    .replace(/[,;]+/g, '\n');

  const candidates = normalized.match(TICKER_PATTERN) || [];
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const ticker = normalizeTicker(candidate);
    if (!ticker || ticker.length < 2 || !/^[A-Z0-9.-]+$/.test(ticker)) continue;
    if (ticker.includes('.') && !/\.[A-Z]{2,5}$/.test(ticker)) continue;
    if (/^(?:HTTP|HTTPS|SMTP|EMAIL|JSON|CSV|TXT|FROM|TO|SUBJECT|MESSAGE|PERIOD|INTERVAL)$/i.test(ticker)) continue;
    if (seen.has(ticker)) continue;
    seen.add(ticker);
    result.push(ticker);
  }

  return result;
}

async function walkFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walkFiles(fullPath));
    else if (SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(fullPath);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function discoverTickers(inputPath) {
  const absolutePath = path.resolve(inputPath);
  const stats = await fs.stat(absolutePath);
  const files = stats.isDirectory() ? await walkFiles(absolutePath) : [absolutePath];
  const tickers = [];
  const seen = new Set();

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    for (const ticker of extractTickers(content)) {
      if (!seen.has(ticker)) {
        seen.add(ticker);
        tickers.push(ticker);
      }
    }
  }

  return tickers;
}

module.exports = { discoverTickers, extractTickers, walkFiles };
