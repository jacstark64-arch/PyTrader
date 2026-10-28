const { fetchMarketHistory } = require('./market-history');
const { normalizeTicker } = require('./F_Trader_4');

const CHART_PERIODS = Object.freeze({
  '1d': '3mo',
  '1w': '1y',
  '1mo': '5y',
});

async function fetchCompanyOverview(ticker, interval = '1d') {
  const yf = require('yahoo-finance2').default;
  const symbol = normalizeTicker(String(ticker || '').trim().toUpperCase());
  if (!symbol) throw new Error('Ticker no válido.');

  const period = CHART_PERIODS[interval] ? interval : '1d';
  const [summary, history] = await Promise.all([
    yf.quoteSummary(symbol, { modules: ['price', 'summaryProfile'] }).catch(() => ({})),
    fetchMarketHistory(yf, symbol, CHART_PERIODS[period], period).catch(() => []),
  ]);
  const price = summary?.price || {};
  const profile = summary?.summaryProfile || {};
  return {
    ticker,
    name: price.longName || price.shortName || ticker,
    market: price.exchangeName || price.exchange || price.exchangeCode || 'No disponible',
    sector: profile.sector || 'No disponible',
    interval: period,
    history: (history || []).map((row) => ({
      date: row.date,
      open: Number(row.open),
      high: Number(row.high),
      low: Number(row.low),
      close: Number(row.close),
    }))
      .filter((row) => [row.open, row.high, row.low, row.close].every(Number.isFinite))
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

module.exports = { fetchCompanyOverview, CHART_PERIODS };
