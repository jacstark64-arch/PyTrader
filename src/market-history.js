const https = require('node:https');
const {
  fetchYahooHistory,
  isYahooRateLimitError,
  toYahooHistoryOptions,
} = require('./yahoo-history-options');

const PERIOD_DURATIONS = {
  '1d': 24 * 60 * 60 * 1000,
  '5d': 5 * 24 * 60 * 60 * 1000,
  '1mo': 30 * 24 * 60 * 60 * 1000,
  '3mo': 90 * 24 * 60 * 60 * 1000,
  '6mo': 180 * 24 * 60 * 60 * 1000,
  '1y': 365 * 24 * 60 * 60 * 1000,
  '2y': 2 * 365 * 24 * 60 * 60 * 1000,
  '5y': 5 * 365 * 24 * 60 * 60 * 1000,
  max: null,
};
const STOOQ_INTERVALS = new Map([
  ['1d', 'd'],
  ['1w', 'w'],
  ['1mo', 'm'],
]);
const YAHOO_UNAVAILABLE_MESSAGE = 'La pagina web no esta operativa. Yahoo Finance limito las solicitudes.';

function stooqDate(date) {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function stooqRange(period, now = Date.now()) {
  const duration = Object.hasOwn(PERIOD_DURATIONS, period) ? PERIOD_DURATIONS[period] : PERIOD_DURATIONS['1y'];
  return {
    from: duration === null ? '19000101' : stooqDate(new Date(now - duration)),
    to: stooqDate(new Date(now)),
  };
}

function stooqSymbolCandidates(ticker) {
  const normalized = String(ticker || '').trim().toLowerCase().replaceAll('/', '-');
  if (!normalized) return [];

  const suffixMap = new Map([
    ['.mc', '.es'],
    ['.pa', '.fr'],
    ['.l', '.uk'],
    ['.de', '.de'],
    ['.f', '.de'],
    ['.mi', '.it'],
    ['.as', '.nl'],
    ['.he', '.il'],
    ['.st', '.se'],
    ['.sw', '.ch'],
    ['.ol', '.no'],
    ['.co', '.dk'],
    ['.br', '.be'],
    ['.ls', '.pt'],
    ['.vi', '.at'],
  ]);
  const candidates = [];
  const suffix = [...suffixMap.keys()].find((item) => normalized.endsWith(item));
  if (suffix) {
    const base = normalized.slice(0, -suffix.length);
    candidates.push(`${base}${suffixMap.get(suffix)}`, normalized, base);
  } else if (!normalized.includes('.')) {
    candidates.push(`${normalized}.us`, normalized);
  } else {
    candidates.push(normalized);
  }

  return [...new Set(candidates)];
}

function requestText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'PyTrader/0.1' } }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.on('end', () => {
        if (response.statusCode >= 400) {
          reject(new Error(`Stooq devolvio HTTP ${response.statusCode}.`));
          return;
        }
        resolve(body);
      });
    }).on('error', reject);
  });
}

function parseStooqCsv(csv) {
  const lines = String(csv || '').trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2 || !/^date,open,high,low,close,volume$/i.test(lines[0])) return [];

  return lines.slice(1).map((line) => {
    const [date, open, high, low, close, volume] = line.split(',');
    return {
      date: new Date(`${date}T00:00:00Z`),
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume || 0),
    };
  }).filter((row) => Number.isFinite(row.close));
}

async function fetchStooqHistory(ticker, period, interval, now = Date.now()) {
  const stooqInterval = STOOQ_INTERVALS.get(interval);
  if (!stooqInterval) {
    throw new Error(`Stooq no soporta el intervalo ${interval}.`);
  }

  const { from, to } = stooqRange(period, now);
  for (const symbol of stooqSymbolCandidates(ticker)) {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&d1=${from}&d2=${to}&i=${stooqInterval}`;
    const rows = parseStooqCsv(await requestText(url));
    if (rows.length > 0) return rows;
  }

  return [];
}

async function fetchMarketHistory(yf, ticker, period, interval) {
  if (STOOQ_INTERVALS.has(interval)) {
    return fetchStooqHistory(ticker, period, interval);
  }

  try {
    return await fetchYahooHistory(yf, ticker, period, interval);
  } catch (error) {
    if (isYahooRateLimitError(error)) {
      const unavailable = new Error(YAHOO_UNAVAILABLE_MESSAGE);
      unavailable.code = 'MARKET_DATA_UNAVAILABLE';
      throw unavailable;
    }
    throw error;
  }
}

function isMarketDataUnavailableError(error) {
  return error?.code === 'MARKET_DATA_UNAVAILABLE'
    || isYahooRateLimitError(error)
    || /yahoo finance.*limit|too many requests|\b429\b|pagina web no esta operativa|página web no está operativa/i.test(error?.message || String(error));
}

module.exports = {
  YAHOO_UNAVAILABLE_MESSAGE,
  fetchMarketHistory,
  fetchStooqHistory,
  isMarketDataUnavailableError,
  parseStooqCsv,
  stooqSymbolCandidates,
  toYahooHistoryOptions,
};
