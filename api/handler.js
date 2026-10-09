const { analyzeTickers } = require('./analyze');
const { sendEmail } = require('./email');

function jsonResponse(body, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

async function handleApiRequest(event) {
  const payload = event.body ? JSON.parse(event.body) : {};
  const results = await analyzeTickers(payload);
  return jsonResponse({ success: true, results });
}

async function analyze(event) {
  try {
    return await handleApiRequest(event);
  } catch (error) {
    const statusCode = error.message.includes('SMTP') || error.message.includes('correo') ? 500 : 400;
    return jsonResponse({ error: error.message || 'Error interno.' }, statusCode);
  }
}

async function sendEmailHandler(event) {
  try {
    const payload = event.body ? JSON.parse(event.body) : {};
    const result = await sendEmail(payload);
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: error.message || 'Error interno.' }, 500);
  }
}

async function handleRequest(request, response) {
  if (request.method === 'GET' && request.url === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ status: 'ok', service: 'pytrader-web' }));
    return;
  }

  if (request.method !== 'POST') {
    response.writeHead(405, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Método no permitido.' }));
    return;
  }

  let body = '';
  for await (const chunk of request) body += chunk;

  let payload;
  try {
    payload = body ? JSON.parse(body) : {};
  } catch {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'El cuerpo JSON no es válido.' }));
    return;
  }

  try {
    if (request.url === '/api/analyze') {
      const results = await analyzeTickers(payload);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify({ success: true, results }));
      return;
    }

    if (request.url === '/api/email') {
      const result = await sendEmail(payload);
      response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      response.end(JSON.stringify(result));
      return;
    }

    response.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'Ruta no encontrada.' }));
  } catch (error) {
    const statusCode = error.message.includes('SMTP') || error.message.includes('correo') ? 500 : 400;
    response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message || 'Error interno.' }));
  }
}

module.exports = { analyze, sendEmailHandler, handleRequest };
