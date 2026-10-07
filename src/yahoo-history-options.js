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
const RETRY_DELAYS_MS = [2000, 5000];
const REQUEST_INTERVAL_MS = 500;

let requestQueue = Promise.resolve();

function toYahooHistoryOptions(period, interval, now = Date.now()) {
  const duration = PERIOD_DURATIONS[period];
  return {
    period1: duration === null ? new Date(0) : new Date(now - duration),
    interval: interval === '1w' ? '1wk' : interval,
  };
}

function isYahooRateLimitError(error) {
  return error?.statusCode === 429
    || error?.status === 429
    || /too many requests|\b429\b/i.test(error?.message || String(error));
}

function fetchYahooHistory(yf, ticker, period, interval) {
  const request = requestQueue.then(async () => {
    for (let attempt = 0; ; attempt += 1) {
      if (attempt === 0 && fetchYahooHistory.lastRequestAt) {
        const elapsed = Date.now() - fetchYahooHistory.lastRequestAt;
        if (elapsed < REQUEST_INTERVAL_MS) {
          await new Promise((resolve) => setTimeout(resolve, REQUEST_INTERVAL_MS - elapsed));
        }
      }
      fetchYahooHistory.lastRequestAt = Date.now();

      try {
        return await yf.historical(ticker, toYahooHistoryOptions(period, interval));
      } catch (error) {
        if (!isYahooRateLimitError(error) || attempt >= RETRY_DELAYS_MS.length) throw error;
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
      }
    }
  });

  requestQueue = request.catch(() => undefined);
  return request;
}

module.exports = { fetchYahooHistory, isYahooRateLimitError, toYahooHistoryOptions };