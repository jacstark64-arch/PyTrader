async function fetchTrailingEps(yf, ticker) {
  try {
    const summary = await yf.quoteSummary(ticker, { modules: ['defaultKeyStatistics', 'price', 'financialData'] });
    const currency = summary?.price?.currency;
    const financialCurrency = summary?.financialData?.financialCurrency;
    if (currency && financialCurrency && currency !== financialCurrency) return null;
    const eps = summary?.defaultKeyStatistics?.trailingEps;
    return typeof eps === 'number' && Number.isFinite(eps) && eps !== 0 ? eps : null;
  } catch {
    return null;
  }
}

module.exports = { fetchTrailingEps };
