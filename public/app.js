const analyzeButton = document.querySelector('#analyzeButton');
const resultsBody = document.querySelector('#resultsBody');
const statusMessage = document.querySelector('#statusMessage');
const filterText = document.querySelector('#filterText');
const filterScore = document.querySelector('#filterScore');
const emailForm = document.querySelector('#emailForm');
const healthStatus = document.querySelector('#healthStatus');
const listFilesInput = document.querySelector('#listFiles');
const listFolderInput = document.querySelector('#listFolder');
const listsView = document.querySelector('#listsView');
const activityPanel = document.querySelector('#activityPanel');
const activityState = document.querySelector('#activityState');
const activityMessage = document.querySelector('#activityMessage');
const currentTicker = document.querySelector('#currentTicker');
const analysisProgress = document.querySelector('#analysisProgress');
const progressLabel = document.querySelector('#progressLabel');
const stopAnalysisButton = document.querySelector('#stopAnalysisButton');
const configDialog = document.querySelector('#configDialog');
const configForm = document.querySelector('#configForm');
const configButton = document.querySelector('#configButton');
const closeConfigButton = document.querySelector('#closeConfigButton');
const resetConfigButton = document.querySelector('#resetConfigButton');
const configError = document.querySelector('#configError');
const configFields = {
  period: document.querySelector('#configPeriod'),
  interval: document.querySelector('#configInterval'),
  rsiPeriod: document.querySelector('#configRsiPeriod'),
  macdFast: document.querySelector('#configMacdFast'),
  macdSlow: document.querySelector('#configMacdSlow'),
  macdSignal: document.querySelector('#configMacdSignal'),
  adxPeriod: document.querySelector('#configAdxPeriod'),
  minScore: document.querySelector('#configMinScore'),
};
const DEFAULT_CONFIG = Object.freeze({
  period: '1y', interval: '1d', rsiPeriod: 14, macdFast: 12,
  macdSlow: 26, macdSignal: 9, adxPeriod: 14, minScore: 0,
});
const CONFIG_STORAGE_KEY = 'pytrader-web-config';
const WEB_UNAVAILABLE_MESSAGE = 'La pagina web no esta operativa. Yahoo Finance limito las solicitudes.';

let lastResults = [];
let loadedTickers = [];
let stopRequested = false;

function normalizeListTicker(value) {
  const ticker = value.trim().toUpperCase();
  if (!ticker) return '';

  const exchangeSuffixes = {
    BME: '.MC', BM: '.MC', MC: '.MC', EPA: '.PA', PAR: '.PA', LON: '.L', LSE: '.L',
    XETR: '.DE', ETR: '.DE', FRA: '.F', MIL: '.MI', BIT: '.MI', AMS: '.AS', HEL: '.HE',
    STO: '.ST', SWX: '.SW', SIX: '.SW', OSL: '.OL', CPH: '.CO', BRU: '.BR', LIS: '.LS', VIE: '.VI',
  };
  const separator = ticker.indexOf(':');
  if (separator >= 0) {
    const exchange = ticker.slice(0, separator);
    const symbol = ticker.slice(separator + 1).trim().replaceAll(' ', '').replaceAll('/', '-');
    if (!symbol) return '';
    const suffix = exchangeSuffixes[exchange];
    return suffix && !symbol.includes('.') ? `${symbol}${suffix}` : symbol;
  }

  return ticker.replaceAll(' ', '').replaceAll('/', '-');
}

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = `message ${type}`.trim();
}

function getConfig() {
  const values = Object.fromEntries(Object.entries(configFields).map(([key, field]) => [key, field.value]));
  return {
    ...DEFAULT_CONFIG,
    ...values,
    rsiPeriod: Number(values.rsiPeriod),
    macdFast: Number(values.macdFast),
    macdSlow: Number(values.macdSlow),
    macdSignal: Number(values.macdSignal),
    adxPeriod: Number(values.adxPeriod),
    minScore: Number(values.minScore),
  };
}

function applyConfig(config) {
  const merged = { ...DEFAULT_CONFIG, ...config };
  for (const [key, field] of Object.entries(configFields)) field.value = merged[key];
  document.querySelector('#period').value = merged.period;
  document.querySelector('#interval').value = merged.interval;
  filterScore.value = merged.minScore;
  renderResults();
}

function loadConfig() {
  try {
    const saved = JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY));
    if (saved && typeof saved === 'object') applyConfig(saved);
  } catch {
    applyConfig(DEFAULT_CONFIG);
  }
}

function openConfig() {
  configError.textContent = '';
  try {
    applyConfig(JSON.parse(localStorage.getItem(CONFIG_STORAGE_KEY) || {}));
  } catch {
    applyConfig(DEFAULT_CONFIG);
  }

  if (typeof configDialog.showModal === 'function') {
    configDialog.showModal();
  } else {
    configDialog.setAttribute('open', '');
  }
}

function validateConfig(config) {
  const errors = [];
  if (!['1d', '5d', '1mo', '3mo', '6mo', '1y', '2y', '5y', 'max'].includes(config.period)) errors.push('Periodo no válido.');
  if (!['1m', '5m', '15m', '30m', '1h', '2h', '4h', '6h', '8h', '12h', '1d', '1w', '1mo'].includes(config.interval)) errors.push('Intervalo no válido.');
  const periods = ['rsiPeriod', 'macdFast', 'macdSlow', 'macdSignal', 'adxPeriod'];
  if (periods.some((key) => !Number.isInteger(config[key]) || config[key] < 2 || config[key] > 200)) errors.push('Los períodos deben ser enteros entre 2 y 200.');
  if (config.macdFast >= config.macdSlow) errors.push('MACD rápido debe ser inferior a MACD lento.');
  if (config.macdSignal >= config.macdFast) errors.push('MACD señal debe ser inferior a MACD rápido.');
  if (!Number.isFinite(config.minScore) || config.minScore < 0 || config.minScore > 100) errors.push('Score mínimo debe estar entre 0 y 100.');
  return errors;
}

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 429 || /too many requests/i.test(body)) {
      throw new Error(WEB_UNAVAILABLE_MESSAGE);
    }
    throw new Error(`El servidor devolvió una respuesta no válida (${response.status}).`);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function renderResults() {
  const search = filterText.value.trim().toLowerCase();
  const minimumScore = Number(filterScore.value || 0);
  const filtered = lastResults.filter((item) => {
    const ticker = item.ticker.toLowerCase();
    const signal = (item.result?.signal || '').toLowerCase();
    const score = Number(item.result?.score || 0);
    return (!search || ticker.includes(search) || signal.includes(search)) && score >= minimumScore;
  });

  if (filtered.length === 0) {
    resultsBody.innerHTML = '<tr><td colspan="9" class="empty-state">No se encontraron resultados.</td></tr>';
    return;
  }

  resultsBody.innerHTML = filtered.map((item) => {
    const result = item.result;
    if (item.error) {
      return `<tr><td><strong>${escapeHtml(item.ticker)}</strong></td><td colspan="8" class="error-cell">${escapeHtml(item.error)}</td></tr>`;
    }
    return `<tr>
      <td><strong>${escapeHtml(item.ticker)}</strong></td>
      <td><span class="signal ${result.signal.toLowerCase().replaceAll(' ', '-')}">${escapeHtml(result.signal)}</span></td>
      <td>${Number(result.score).toFixed(0)}</td>
      <td>${Number(result.close).toLocaleString('es-ES', { maximumFractionDigits: 4 })}</td>
      <td>${Number.isFinite(result.rsi) ? result.rsi.toFixed(2) : '—'}</td>
      <td>${Number.isFinite(result.macd) ? result.macd.toFixed(4) : '—'}</td>
      <td>${Number.isFinite(result.adx) ? result.adx.toFixed(2) : '—'}</td>
      <td>${Number.isFinite(result.vwap) ? result.vwap.toFixed(4) : '—'}</td>
      <td>${escapeHtml(result.date || '—')}</td>
    </tr>`;
  }).join('');
}

function isWebUnavailableError(error) {
  return /pagina web no esta operativa|página web no está operativa|yahoo finance.*limit|too many requests|\b429\b/i.test(error?.message || String(error));
}

async function checkHealth() {
  try {
    const response = await fetch('/health');
    healthStatus.classList.toggle('healthy', response.ok);
    healthStatus.innerHTML = `<span></span> ${response.ok ? 'Servicio activo' : 'Servicio no disponible'}`;
  } catch {
    healthStatus.classList.remove('healthy');
    healthStatus.innerHTML = '<span></span> Servidor no disponible';
  }
}

async function analyze() {
  const tickers = [...loadedTickers];

  if (tickers.length === 0) {
    setStatus('Carga al menos una lista .txt.', 'error');
    return;
  }

  analyzeButton.disabled = true;
  stopAnalysisButton.disabled = false;
  listFilesInput.disabled = true;
  listFolderInput.disabled = true;
  stopRequested = false;
  analyzeButton.textContent = 'Analizando...';
  activityPanel.classList.add('is-active');
  activityState.textContent = 'En curso';
  currentTicker.textContent = 'Preparando';
  activityMessage.textContent = 'Iniciando análisis de las listas.';
  analysisProgress.max = tickers.length;
  analysisProgress.value = 0;
  progressLabel.textContent = `0 / ${tickers.length}`;
  setStatus('Analizando las listas cargadas...');

  try {
    for (const [index, ticker] of tickers.entries()) {
      if (stopRequested) break;

      currentTicker.textContent = ticker;
      activityMessage.textContent = `Analizando acción ${index + 1} de ${tickers.length}.`;
      progressLabel.textContent = `${index} / ${tickers.length}`;

      try {
        const response = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tickers: [ticker],
            ...getConfig(),
          }),
        });
        const payload = await readJsonResponse(response);
        if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo analizar.');
        if ((payload.results || []).some((item) => item.fatal || isWebUnavailableError(item.error))) {
          throw new Error(WEB_UNAVAILABLE_MESSAGE);
        }
        mergeResults(payload.results);
      } catch (error) {
        if (isWebUnavailableError(error)) {
          stopRequested = true;
          throw new Error(WEB_UNAVAILABLE_MESSAGE);
        }
        mergeResults([{ ticker, error: error.message || 'No se pudo analizar.' }]);
      }

      analysisProgress.value = index + 1;
      progressLabel.textContent = `${index + 1} / ${tickers.length}`;
      renderResults();
      if (stopRequested) break;
    }

    const stopped = stopRequested && analysisProgress.value < tickers.length;
    if (stopped) {
      activityState.textContent = 'Detenido';
      activityMessage.textContent = `Análisis detenido. Se conservaron ${lastResults.length} resultados.`;
      setStatus(`Análisis detenido tras ${analysisProgress.value} de ${tickers.length} acciones. Resultados conservados.`);
    } else {
      currentTicker.textContent = tickers[tickers.length - 1];
      activityState.textContent = 'Finalizado';
      activityMessage.textContent = `Análisis terminado para ${tickers.length} acciones.`;
      setStatus(`Análisis finalizado para ${tickers.length} ticker${tickers.length === 1 ? '' : 's'}.`, 'success');
    }
  } catch (error) {
    activityState.textContent = 'Error';
    activityMessage.textContent = error.message || 'Error durante el análisis.';
    setStatus(error.message || 'Error al analizar.', 'error');
  } finally {
    activityPanel.classList.remove('is-active');
    listFilesInput.disabled = false;
    listFolderInput.disabled = false;
    analyzeButton.disabled = false;
    stopAnalysisButton.disabled = true;
    analyzeButton.textContent = 'Analizar listas';
  }
}

function mergeResults(results) {
  for (const result of results) {
    const existingIndex = lastResults.findIndex((item) => item.ticker === result.ticker);
    if (existingIndex === -1) lastResults.push(result);
    else lastResults[existingIndex] = result;
  }
}

function renderListFiles(files) {
  listsView.replaceChildren();
  for (const file of files) {
    const item = document.createElement('li');
    item.textContent = file.name;
    item.title = file.name;
    listsView.append(item);
  }
}

async function importLists(fileList) {
  const files = [...fileList]
    .filter((file) => file.name.toLowerCase().endsWith('.txt'))
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));

  if (files.length === 0) {
    loadedTickers = [];
    renderListFiles([]);
    analyzeButton.disabled = true;
    activityState.textContent = 'En espera';
    activityMessage.textContent = 'No se encontraron archivos .txt.';
    setStatus('Selecciona al menos un archivo .txt.', 'error');
    return;
  }

  renderListFiles(files);
  try {
    const contents = await Promise.all(files.map((file) => file.text()));
    const tickers = [...new Set(contents.flatMap((content) => content
      .replaceAll(';', ',')
      .split(/[\n,]/)
      .map((item) => item.trim())
      .filter((item) => item && !item.startsWith('###'))
      .map(normalizeListTicker)
      .filter(Boolean)))];

    if (tickers.length === 0) {
      loadedTickers = [];
      analyzeButton.disabled = true;
      activityState.textContent = 'En espera';
      activityMessage.textContent = 'Las listas no contienen acciones válidas.';
      setStatus('No se encontraron tickers en las listas seleccionadas.', 'error');
      return;
    }

    loadedTickers = tickers;
    analyzeButton.disabled = false;
    activityState.textContent = 'Preparado';
    activityMessage.textContent = `${tickers.length} acciones listas para analizar.`;
    setStatus(`Listas cargadas: ${tickers.length} acciones únicas.`, 'success');
    await analyze();
  } catch {
    loadedTickers = [];
    analyzeButton.disabled = true;
    activityState.textContent = 'Error';
    activityMessage.textContent = 'No se pudieron leer las listas seleccionadas.';
    setStatus('Error al leer los archivos de listas.', 'error');
  }
}

emailForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const results = lastResults.filter((item) => item.result && Number(item.result.score) >= 80);
  const button = emailForm.querySelector('button');
  button.disabled = true;
  button.textContent = 'Enviando…';

  try {
    const response = await fetch('/api/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: document.querySelector('#emailTo').value,
        subject: document.querySelector('#emailSubject').value,
        text: document.querySelector('#emailText').value,
        results,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok) throw new Error(payload.error || 'No se pudo enviar el correo.');
    setStatus(payload.message, 'success');
  } catch (error) {
    setStatus(error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = 'Enviar correo';
  }
});

analyzeButton.addEventListener('click', analyze);
stopAnalysisButton.addEventListener('click', () => {
  if (analyzeButton.disabled) {
    stopRequested = true;
    stopAnalysisButton.disabled = true;
    activityState.textContent = 'Deteniendo';
    activityMessage.textContent = `Se detendrá al terminar ${currentTicker.textContent}.`;
    setStatus('Deteniendo el análisis; se conservarán los resultados.');
  }
});
configButton.addEventListener('click', openConfig);
closeConfigButton.addEventListener('click', () => configDialog.close());
configDialog.addEventListener('click', (event) => {
  if (event.target === configDialog) configDialog.close();
});
configForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const config = getConfig();
  const errors = validateConfig(config);
  if (errors.length > 0) {
    configError.textContent = errors.join(' ');
    return;
  }

  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
  applyConfig(config);
  configError.textContent = '';
  configDialog.close();
  setStatus('Configuración guardada. Repite el análisis para aplicar los nuevos parámetros.', 'success');
});
resetConfigButton.addEventListener('click', () => {
  applyConfig(DEFAULT_CONFIG);
  configError.textContent = '';
});
listFilesInput.addEventListener('change', () => importLists(listFilesInput.files));
listFolderInput.addEventListener('change', () => importLists(listFolderInput.files));
filterText.addEventListener('input', renderResults);
filterScore.addEventListener('input', renderResults);
loadConfig();
checkHealth();
