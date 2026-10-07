const analyzeButton = document.querySelector('#analyzeButton');
const resultsBody = document.querySelector('#resultsBody');
const statusMessage = document.querySelector('#statusMessage');
const filterText = document.querySelector('#filterText');
const filterScore = document.querySelector('#filterScore');
const emailForm = document.querySelector('#emailForm');
const healthStatus = document.querySelector('#healthStatus');
const listFilesInput = document.querySelector('#listFiles');
const listFolderInput = document.querySelector('#listFolder');
const listStatus = document.querySelector('#listStatus');

let lastResults = [];

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

async function readJsonResponse(response) {
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    if (response.status === 429 || /too many requests/i.test(body)) {
      throw new Error('Yahoo Finance ha limitado las solicitudes. Espera unos minutos y vuelve a intentarlo.');
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
  const tickers = document.querySelector('#tickers').value
    .split(/[\n,;]+/)
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);

  if (tickers.length === 0) {
    setStatus('Introduce al menos un ticker.', 'error');
    return;
  }

  analyzeButton.disabled = true;
  analyzeButton.textContent = 'Analizando…';
  setStatus('Descargando datos y calculando indicadores…');

  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tickers,
        period: document.querySelector('#period').value,
        interval: document.querySelector('#interval').value,
      }),
    });
    const payload = await readJsonResponse(response);
    if (!response.ok || !payload.success) throw new Error(payload.error || 'No se pudo analizar.');

    lastResults = payload.results;
    renderResults();
    setStatus(`Análisis finalizado para ${tickers.length} ticker${tickers.length === 1 ? '' : 's'}.`, 'success');
  } catch (error) {
    setStatus(error.message || 'Error al analizar.', 'error');
    lastResults = [];
    renderResults();
  } finally {
    analyzeButton.disabled = false;
    analyzeButton.textContent = 'Analizar tickers';
  }
}

async function importLists(fileList) {
  const files = [...fileList]
    .filter((file) => file.name.toLowerCase().endsWith('.txt'))
    .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(b.webkitRelativePath || b.name));

  if (files.length === 0) {
    listStatus.textContent = 'No se encontraron archivos .txt.';
    setStatus('Selecciona al menos un archivo .txt.', 'error');
    return;
  }

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
      listStatus.textContent = `${files.length} lista${files.length === 1 ? '' : 's'} cargada${files.length === 1 ? '' : 's'}, sin tickers válidos.`;
      setStatus('No se encontraron tickers en las listas seleccionadas.', 'error');
      return;
    }

    document.querySelector('#tickers').value = tickers.join(', ');
    listStatus.textContent = `${files.length} archivo${files.length === 1 ? '' : 's'} cargado${files.length === 1 ? '' : 's'}; ${tickers.length} ticker${tickers.length === 1 ? '' : 's'} únicos.`;
    await analyze();
  } catch {
    listStatus.textContent = 'No se pudieron leer las listas seleccionadas.';
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
listFilesInput.addEventListener('change', () => importLists(listFilesInput.files));
listFolderInput.addEventListener('change', () => importLists(listFolderInput.files));
filterText.addEventListener('input', renderResults);
filterScore.addEventListener('input', renderResults);
checkHealth();
