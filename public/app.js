const analyzeButton = document.querySelector('#analyzeButton');
const resultsBody = document.querySelector('#resultsBody');
const statusMessage = document.querySelector('#statusMessage');
const filterText = document.querySelector('#filterText');
const filterScore = document.querySelector('#filterScore');
const emailForm = document.querySelector('#emailForm');
const healthStatus = document.querySelector('#healthStatus');

let lastResults = [];

function setStatus(message, type = '') {
  statusMessage.textContent = message;
  statusMessage.className = `message ${type}`.trim();
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
    const payload = await response.json();
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
    const payload = await response.json();
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
filterText.addEventListener('input', renderResults);
filterScore.addEventListener('input', renderResults);
checkHealth();
