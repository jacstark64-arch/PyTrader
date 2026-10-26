const { fetchMarketHistory } = require('./market-history');
const { normalizeTicker } = require('./F_Trader_4');

async function fetchCompanyOverview(ticker) {
  const yf = require('yahoo-finance2').default;
  const symbol = normalizeTicker(String(ticker || '').trim().toUpperCase());
  if (!symbol) throw new Error('Ticker no válido.');

  const [summary, history] = await Promise.all([
    yf.quoteSummary(symbol, { modules: ['price', 'summaryProfile'] }).catch(() => ({})),
    fetchMarketHistory(yf, symbol, '3mo', '1d').catch(() => []),
  ]);
  const price = summary?.price || {};
  const profile = summary?.summaryProfile || {};
  return {
    ticker,
    name: price.longName || price.shortName || ticker,
    market: price.exchangeName || price.exchange || price.exchangeCode || 'No disponible',
    sector: profile.sector || 'No disponible',
    history: (history || []).map((row) => ({ date: row.date, close: Number(row.close) }))
      .filter((row) => Number.isFinite(row.close))
      .sort((a, b) => new Date(a.date) - new Date(b.date)),
  };
}

module.exports = { fetchCompanyOverview };
