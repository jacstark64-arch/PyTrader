const PERIODS = new Set(['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max']);
const INTERVALS = new Set(['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w', '1mo']);
const { fetchYahooHistory, isYahooRateLimitError } = require('../src/yahoo-history-options');

function loadDependencies() {
  const yf = require('yahoo-finance2').default;
  const { calculateIndicators } = require('../src/F_Trader_4');
  return { yf, calculateIndicators };
}

function normalizeAnalyzeRequest(input = {}) {
  if (!input || !Array.isArray(input.tickers) || input.tickers.length === 0) {
    throw new Error('Debe proporcionar al menos un ticker válido.');
  }

  const tickers = input.tickers
    .map((ticker) => String(ticker).trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0 || new Set(tickers).size !== tickers.length) {
    throw new Error('Debe proporcionar uno o más tickers válidos.');
  }

  const period = String(input.period || '1y');
  const interval = String(input.interval || '1d');
  const rsiPeriod = positiveInteger(input.rsiPeriod, 14, 'RSI');
  const macdFast = positiveInteger(input.macdFast, 12, 'MACD rápido');
  const macdSlow = positiveInteger(input.macdSlow, 26, 'MACD lento');
  const macdSignal = positiveInteger(input.macdSignal, 9, 'MACD señal');
  const adxPeriod = positiveInteger(input.adxPeriod, 14, 'ADX');
  const minScore = Number(input.minScore ?? 0);

  if (!PERIODS.has(period)) throw new Error('El periodo no es válido.');
  if (!INTERVALS.has(interval)) throw new Error('El intervalo no es válido.');
  if (macdFast >= macdSlow) throw new Error('El período MACD rápido debe ser inferior al período MACD lento.');
  if (macdSignal >= macdFast) throw new Error('El período MACD señal debe ser inferior al período MACD rápido.');
  if (!Number.isFinite(minScore) || minScore < 0 || minScore > 100) throw new Error('El score mínimo debe estar entre 0 y 100.');

  return {
    tickers,
    period,
    interval,
    rsiPeriod,
    macdFast,
    macdSlow,
    macdSignal,
    adxPeriod,
    minScore,
  };
}

function positiveInteger(value, fallback, label) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 200) {
    throw new Error(`El período de ${label} debe ser un entero entre 2 y 200.`);
  }
  return parsed;
}

function serializeAnalysisResult(ticker, result) {
  return {
    ticker,
    result: result ? {
      date: result.date,
      close: result.close,
      signal: result.signal,
      score: result.score,
      trend: result.trendUp ? 'ALCISTA' : 'DESCENTA',
      cfi: result.cfi,
      flow: result.flowSmooth,
      rsi: result.rsi,
      macd: result.macd,
      macdSignal: result.macdSignal,
      per: result.per,
      adx: result.adx,
      vwap: result.vwap,
      volume: result.volume,
    } : null,
  };
}

function buildAnalysisResponse(ticker, ohlcv, options = {}) {
  if (!Array.isArray(ohlcv) || ohlcv.length === 0) {
    return { ticker, error: 'Sin datos disponibles.' };
  }

  const { calculateIndicators } = loadDependencies();
  const normalized = ohlcv.map((row) => ({
    date: row.date,
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number(row.volume || 0),
  }));

  const result = calculateIndicators(normalized, {
    rsiPeriod: Number(options.rsiPeriod || 14),
    macdFast: Number(options.macdFast || 12),
    macdSlow: Number(options.macdSlow || 26),
    macdSignal: Number(options.macdSignal || 9),
    perMax: Number(options.perMax || 25),
    adxPeriod: Number(options.adxPeriod || 14),
  }).at(-1);

  return serializeAnalysisResult(ticker, result);
}

async function analyzeTickers(input) {
  const request = normalizeAnalyzeRequest(input);
  const { yf } = loadDependencies();
  const results = [];

  for (const ticker of request.tickers) {
    try {
      const history = await fetchYahooHistory(yf, ticker, request.period, request.interval);
      const rows = (history || []).map((row) => ({
        date: row.date,
        open: row.open,
        high: row.high,
        low: row.low,
        close: row.close,
        volume: row.volume,
      })).sort((a, b) => new Date(a.date) - new Date(b.date));

      results.push(buildAnalysisResponse(ticker, rows, request));
    } catch (error) {
      results.push({
        ticker,
        error: isYahooRateLimitError(error)
          ? 'Yahoo Finance limitó las solicitudes. Espera unos minutos antes de volver a intentarlo.'
          : error.message || 'No se pudieron analizar los datos.',
      });
    }
  }

  return results;
}

module.exports = {
  analyzeTickers,
  buildAnalysisResponse,
  normalizeAnalyzeRequest,
  serializeAnalysisResult,
};
