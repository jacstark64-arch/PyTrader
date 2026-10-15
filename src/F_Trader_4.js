const ti = require('technicalindicators');

function normalizeTicker(ticker) {
  if (!ticker) return '';
  ticker = String(ticker).toUpperCase().trim();
  if (ticker.includes(':')) {
    const [exchange, symbol] = ticker.split(':', 2);
    const sym = symbol.replace(/\s+/g, '').replace('/', '-');
    if (!sym) return '';
    const map = {
      BME: '.MC', BM: '.MC', MC: '.MC', EPA: '.PA', PAR: '.PA', LON: '.L',
      LSE: '.L', XETR: '.DE', ETR: '.DE', FRA: '.F', MIL: '.MI', BIT: '.MI',
      AMS: '.AS', HEL: '.HE', STO: '.ST', SWX: '.SW', SIX: '.SW', OSL: '.OL',
      CPH: '.CO', BRU: '.BR', LIS: '.LS', VIE: '.VI'
    };
    if (map[exchange] && !sym.includes('.')) return sym + map[exchange];
    const exchangeWithout = new Set(['NASDAQ', 'NYSE', 'AMEX', 'ARCA', 'CBOE']);
    if (exchangeWithout.has(exchange)) return sym;
    return sym;
  }
  return ticker.replace(/\s+/g, '').replace('/', '-');
}

const TV_SUFFIX_EXCHANGE_MAP = {
  '.MC': 'BME', '.PA': 'EURONEXT', '.L': 'LSE', '.DE': 'XETR', '.F': 'FWB',
  '.MI': 'MIL', '.AS': 'EURONEXT', '.HE': 'EURONEXT', '.ST': 'OMXSTO',
  '.SW': 'SIX', '.OL': 'OSE', '.CO': 'OMXCOP', '.BR': 'EURONEXT', '.LS': 'EURONEXT', '.VI': 'VIE'
};

function buildTradingViewSymbol(ticker) {
  if (!ticker) return '';
  ticker = String(ticker).trim().toUpperCase();
  if (ticker.includes(':')) return ticker;
  for (const suf of Object.keys(TV_SUFFIX_EXCHANGE_MAP)) {
    if (ticker.endsWith(suf)) {
      const base = ticker.slice(0, -suf.length);
      return `${TV_SUFFIX_EXCHANGE_MAP[suf]}:${base}`;
    }
  }
  return `NASDAQ:${ticker}`;
}

function ewma(values, span) {
  const alpha = 2 / (span + 1);
  const out = [];
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v == null || Number.isNaN(v)) {
      out.push(null);
      continue;
    }
    if (prev === null) prev = v;
    else prev = alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

function cumulative(values) {
  const out = [];
  let s = 0;
  for (const v of values) {
    s += (v || 0);
    out.push(s);
  }
  return out;
}

function padArray(arr, length) {
  const out = Array(length - arr.length).fill(null).concat(arr);
  return out;
}

function weeklyCfiUp(rows) {
  const sessionDate = value => new Date(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value) ? value + 'Z' : value);
  const weeks = new Map();
  for (const row of rows) {
    const day = sessionDate(row.date);
    day.setUTCHours(0, 0, 0, 0);
    day.setUTCDate(day.getUTCDate() + (7 - day.getUTCDay()) % 7);
    const key = day.getTime();
    const week = weeks.get(key);
    if (week) {
      week.close = row.close;
      week.volume += row.volume;
    } else weeks.set(key, { open: row.open, close: row.close, volume: row.volume });
  }
  const labels = [...weeks.keys()];
  const cfi = ewma([...weeks.values()].map(w => w.volume * (w.close - w.open)), 20);
  const average = ewma(cfi, 20);
  let weekIndex = -1;
  return rows.map(row => {
    const date = sessionDate(row.date).getTime();
    while (weekIndex + 1 < labels.length && labels[weekIndex + 1] <= date) weekIndex += 1;
    return weekIndex >= 0 && cfi[weekIndex] > average[weekIndex];
  });
}

function wilderAverage(values, period) {
  const valid = values.filter(v => v != null);
  return padArray(ti.WEMA.calculate({ values: valid, period }), values.length);
}

function calculateIndicators(ohlcv, options = {}) {
  ohlcv = [...ohlcv].sort((a, b) => new Date(a.date) - new Date(b.date));
  // ohlcv: array of {open, high, low, close, volume, date}
  const defaults = {
    rsiPeriod: 14, rsiOverbought: 70, rsiOversold: 30,
    macdFast: 12, macdSlow: 26, macdSignal: 9,
    per: null, perMax: 20, adxPeriod: 14, adxThreshold: 25,
    rsiWeight: 5, macdWeight: 5, perWeight: 5, adxWeight: 5, vwapWeight: 5,
    momentumPeriod: 52, momentumMin: 1, momentumMax: 30, rsiMaxBuy: 65,
    divergenceWindow: 10, volumeRsiPeriod: 14, vwmaPeriod: 30, betaPeriod: 61,
    epsTtm: null, benchmark: []
  };
  const cfg = Object.assign({}, defaults, options);
  const n = ohlcv.length;
  if (n === 0) return [];

  const close = ohlcv.map(r => r.close);
  const high = ohlcv.map(r => r.high);
  const low = ohlcv.map(r => r.low);
  const open = ohlcv.map(r => r.open);
  const volume = ohlcv.map(r => r.volume);

  // CFI
  const cfiRaw = volume.map((v, i) => (v || 0) * ((close[i] || 0) - (open[i] || 0)));
  const cfi = ewma(cfiRaw, 20);
  const cfiMa = ewma(cfi.map(x => x == null ? 0 : x), 20);
  const cfiUp = cfi.map((v, i) => v != null && cfiMa[i] != null ? v > cfiMa[i] : false);
  const cfiWeeklyUp = weeklyCfiUp(ohlcv);

  // Vol MA (SMA 50)
  const volMa = ti.SMA.calculate({ period: 50, values: volume });
  const volMaP = padArray(volMa, n);
  const volStrong = volume.map((v, i) => volMaP[i] != null && v > volMaP[i]);

  const spread = ohlcv.map(r => Math.max((r.high - r.low), 0.0001));
  const closePos = close.map((c, i) => ((c - low[i]) / spread[i]));
  const strength = closePos.map(cp => 2 * cp - 1);
  const flow = volume.map((v, i) => volStrong[i] ? strength[i] * (v || 0) : 0);
  const flowSmooth = ewma(flow, 5);

  // RSI
  const changes = close.map((v, i) => i ? v - close[i - 1] : null);
  const gains = wilderAverage(changes.map(v => v == null ? null : Math.max(v, 0)), cfg.rsiPeriod);
  const losses = wilderAverage(changes.map(v => v == null ? null : Math.max(-v, 0)), cfg.rsiPeriod);
  const rsiP = gains.map((gain, i) => gain == null ? null : losses[i] === 0 ? (gain > 0 ? 100 : 50) : 100 - 100 / (1 + gain / losses[i]));
  const rsiBullish = rsiP.map((v, i) => i > 0 && v != null && rsiP[i - 1] != null && v > 50 && v > rsiP[i - 1]);
  const rsiUp = rsiP.map((v, i) => i > 0 && gains[i - 1] != null && gains[i] != null && v > rsiP[i - 1]);
  const momentum = close.map((v, i) => i >= cfg.momentumPeriod ? v - close[i - cfg.momentumPeriod] : null);
  const momentumOk = momentum.map(v => v != null && v > cfg.momentumMin && v < cfg.momentumMax);
  const volumeChanges = volume.map((v, i) => i ? v - volume[i - 1] : null);
  const volumeGains = wilderAverage(volumeChanges.map(v => v == null ? null : Math.max(v, 0)), cfg.volumeRsiPeriod);
  const volumeLosses = wilderAverage(volumeChanges.map(v => v == null ? null : Math.max(-v, 0)), cfg.volumeRsiPeriod);
  const rsiVolume = volumeGains.map((gain, i) => gain == null ? null : volumeLosses[i] === 0 ? (gain > 0 ? 100 : 50) : 100 - 100 / (1 + gain / volumeLosses[i]));
  const rsiVolumeUp = rsiVolume.map((v, i) => i > 0 && v != null && rsiVolume[i - 1] != null && v > rsiVolume[i - 1]);
  const volumeAverage = padArray(ti.SMA.calculate({ period: cfg.vwmaPeriod, values: volume }), n);
  const weightedAverage = padArray(ti.SMA.calculate({ period: cfg.vwmaPeriod, values: close.map((v, i) => v * volume[i]) }), n);
  const vwma = weightedAverage.map((v, i) => v != null && volumeAverage[i] > 0 ? v / volumeAverage[i] : null);
  const risk = close.map((v, i) => vwma[i] != null && v !== 0 ? Math.abs(v - vwma[i]) / v * 100 : null);
  const changePct = close.map((v, i) => i > 0 && close[i - 1] !== 0 ? (v / close[i - 1] - 1) * 100 : null);
  const benchmark = [...cfg.benchmark].sort((a, b) => new Date(a.date) - new Date(b.date));
  let benchmarkIndex = -1;
  const benchmarkReturns = ohlcv.map(row => {
    while (benchmarkIndex + 1 < benchmark.length && new Date(benchmark[benchmarkIndex + 1].date) <= new Date(row.date)) benchmarkIndex++;
    return benchmarkIndex > 0 && benchmark[benchmarkIndex - 1].close !== 0
      ? (benchmark[benchmarkIndex].close / benchmark[benchmarkIndex - 1].close - 1) * 100 : null;
  });
  const beta = ohlcv.map((row, i) => {
    if (i < cfg.betaPeriod) return null;
    const instrument = changePct.slice(i - cfg.betaPeriod + 1, i + 1);
    const index = benchmarkReturns.slice(i - cfg.betaPeriod + 1, i + 1);
    if (!instrument.every(Number.isFinite) || !index.every(Number.isFinite)) return null;
    const instrumentMean = instrument.reduce((a, b) => a + b, 0) / cfg.betaPeriod;
    const indexMean = index.reduce((a, b) => a + b, 0) / cfg.betaPeriod;
    const covariance = instrument.reduce((sum, v, j) => sum + (v - instrumentMean) * (index[j] - indexMean), 0);
    const variance = index.reduce((sum, v) => sum + (v - indexMean) ** 2, 0);
    const instrumentVariance = instrument.reduce((sum, v) => sum + (v - instrumentMean) ** 2, 0);
    return variance > 0 && instrumentVariance > 0 ? covariance / variance : null;
  });

  // MACD
  const fast = ewma(close, cfg.macdFast);
  const slow = ewma(close, cfg.macdSlow);
  const macd = fast.map((v, i) => v - slow[i]);
  const macdSignal = ewma(macd, cfg.macdSignal);
  const macdBullish = macd.map((m, i) => i > 0 && m > macdSignal[i] && m > macd[i - 1]);

  // VWAP
  const typical = ohlcv.map(r => (r.high + r.low + r.close) / 3);
  const tpVol = typical.map((t, i) => (t || 0) * (volume[i] || 0));
  const cumTpVol = cumulative(tpVol);
  const cumVol = cumulative(volume);
  const vwap = cumTpVol.map((v, i) => (cumVol[i] ? v / cumVol[i] : null));
  const vwapBullish = close.map((c,i) => (c != null && vwap[i] != null) ? c > vwap[i] : false);

  // ADX
  const trueRange = high.map((h, i) => i ? Math.max(h - low[i], Math.abs(h - close[i - 1]), Math.abs(low[i] - close[i - 1])) : null);
  const plusDm = high.map((h, i) => {
    if (!i) return null;
    const up = h - high[i - 1], down = low[i - 1] - low[i];
    return up > down && up > 0 ? up : 0;
  });
  const minusDm = low.map((l, i) => {
    if (!i) return null;
    const up = high[i] - high[i - 1], down = low[i - 1] - l;
    return down > up && down > 0 ? down : 0;
  });
  const atr = wilderAverage(trueRange, cfg.adxPeriod);
  const plus = wilderAverage(plusDm, cfg.adxPeriod);
  const minus = wilderAverage(minusDm, cfg.adxPeriod);
  const dx = atr.map((value, i) => value == null ? null : (value === 0 || plus[i] + minus[i] === 0) ? 0 : 100 * Math.abs(plus[i] - minus[i]) / (plus[i] + minus[i]));
  const adx = wilderAverage(dx, cfg.adxSmoothing ?? cfg.adxPeriod);
  const adxStrong = adx.map(v => v != null ? v >= cfg.adxThreshold : false);

  // Moving averages for trend
  const ema21 = ewma(close, 21);
  const sma50 = padArray(ti.SMA.calculate({ period: 50, values: close }), n);
  const sma200 = padArray(ti.SMA.calculate({ period: 200, values: close }), n);
  const trendUp = close.map((c,i) => (c != null && ema21[i]!=null && sma50[i]!=null && sma200[i]!=null) ? (c > ema21[i] && ema21[i] > sma50[i] && sma50[i] > sma200[i]) : false);

  // Match the table's pivots, confirmed after five bars on the right.
  const pivotLow = low.map((v, i) => i >= 10 && low[i - 5] <= Math.min(...low.slice(i - 10, i - 5)) && low[i - 5] < Math.min(...low.slice(i - 4, i + 1)));
  const pivotHigh = high.map((v, i) => i >= 10 && high[i - 5] >= Math.max(...high.slice(i - 10, i - 5)) && high[i - 5] > Math.max(...high.slice(i - 4, i + 1)));
  const bullDiv = Array(n).fill(false), bearDiv = Array(n).fill(false);
  let previousLow = null, previousHigh = null;
  for (let i = 10; i < n; i++) {
    const candidate = i - 5;
    if (pivotLow[i]) {
      bullDiv[i] = previousLow !== null && low[candidate] < low[previousLow] && flowSmooth[candidate] > flowSmooth[previousLow];
      previousLow = candidate;
    }
    if (pivotHigh[i]) {
      bearDiv[i] = previousHigh !== null && high[candidate] > high[previousHigh] && flowSmooth[candidate] < flowSmooth[previousHigh];
      previousHigh = candidate;
    }
  }

  const accumulation = ohlcv.map((r,i) => volStrong[i] && closePos[i] > 0.6 && r.close >= r.open);
  const distribution = ohlcv.map((r,i) => volStrong[i] && closePos[i] < 0.4 && r.close <= r.open);

  let lastBull = -Infinity, lastBear = -Infinity;
  const bullRecent = bullDiv.map((v, i) => { if (v) lastBull = i; return i - lastBull <= cfg.divergenceWindow; });
  const bearRecent = bearDiv.map((v, i) => { if (v) lastBear = i; return i - lastBear <= cfg.divergenceWindow; });
  const buyFilter = ohlcv.map((r, i) => momentumOk[i] && rsiUp[i] && rsiP[i] < cfg.rsiMaxBuy);
  const buyPro = ohlcv.map((r,i) => trendUp[i] && cfiUp[i] && ((flowSmooth[i]||0) > 0 || accumulation[i]) && buyFilter[i]);
  const buyEarly = bullRecent.map((v,i) => v && (flowSmooth[i]||0) > 0 && buyFilter[i]);
  const sell = ohlcv.map((r,i) => distribution[i] || bearRecent[i] || ((flowSmooth[i]||0) < 0));
  const institutionalEntry = ohlcv.map((r, i) => trendUp[i] && cfiUp[i] && cfiWeeklyUp[i] && volStrong[i] && accumulation[i]);

  // PER support
  const epsAvailable = cfg.epsTtm != null && Number.isFinite(Number(cfg.epsTtm)) && Number(cfg.epsTtm) !== 0;
  const fallbackPer = cfg.per != null && Number.isFinite(Number(cfg.per)) ? Number(cfg.per) : null;
  const perAvailable = epsAvailable || fallbackPer != null;

  // Score
  const results = [];
  const totalWeight = 100 + cfg.rsiWeight + cfg.macdWeight + cfg.adxWeight + cfg.vwapWeight + (perAvailable ? cfg.perWeight : 0);
  for (let i=0;i<n;i++) {
    const per = epsAvailable ? close[i] / Number(cfg.epsTtm) : fallbackPer;
    const perSupportBool = per != null && per > 0 && per < cfg.perMax;
    const score = Math.max(0, Math.min(100, 100 / totalWeight * (
      (trendUp[i] ? 25 : 0) +
      (cfiUp[i] ? 25 : 0) +
      (cfiWeeklyUp[i] ? 20 : 0) +
      (accumulation[i] ? 15 : 0) +
      ((flowSmooth[i]||0) > 0 ? 15 : 0) +
      (rsiBullish[i] ? cfg.rsiWeight : 0) +
      (macdBullish[i] ? cfg.macdWeight : 0) +
      (perSupportBool ? cfg.perWeight : 0) +
      (adxStrong[i] ? cfg.adxWeight : 0) +
      (vwapBullish[i] ? cfg.vwapWeight : 0)
      )
    ));

    const signal = buyPro[i] ? 'COMPRA FUERTE' : (buyEarly[i] ? 'COMPRA TEMPRANA' : (sell[i] ? 'VENTA' : 'ESPERA'));

    results.push(Object.assign({}, ohlcv[i], {
      cfi: cfi[i],
      cfiUp: cfiUp[i],
      cfiWeeklyUp: cfiWeeklyUp[i],
      volMa: volMaP[i],
      volStrong: volStrong[i],
      closePos: closePos[i],
      strength: strength[i],
      flow: flow[i],
      flowSmooth: flowSmooth[i],
      rsi: rsiP[i],
      rsiBullish: rsiBullish[i],
      rsiUp: rsiUp[i],
      rsiVolume: rsiVolume[i],
      rsiVolumeUp: rsiVolumeUp[i],
      momentum: momentum[i],
      momentumOk: momentumOk[i],
      vwma: vwma[i],
      risk: risk[i],
      changePct: changePct[i],
      beta: beta[i],
      macd: macd[i],
      macdSignal: macdSignal[i],
      macdBullish: macdBullish[i],
      vwap: vwap[i],
      vwapBullish: vwapBullish[i],
      adx: adx[i],
      adxStrong: adxStrong[i],
      ema21: ema21[i],
      sma50: sma50[i],
      sma200: sma200[i],
      trendUp: trendUp[i],
      bullDiv: bullDiv[i],
      bearDiv: bearDiv[i],
      bullRecent: bullRecent[i],
      bearRecent: bearRecent[i],
      accumulation: accumulation[i],
      distribution: distribution[i],
      buyPro: buyPro[i],
      buyEarly: buyEarly[i],
      sell: sell[i],
      institutionalEntry: institutionalEntry[i],
      per: per,
      perSupport: perSupportBool,
      score,
      signal
    }));
  }

  return results;
}

module.exports = {
  normalizeTicker,
  buildTradingViewSymbol,
  calculateIndicators,
  ewma
};
