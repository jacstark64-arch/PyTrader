function createMailTransport() {
  const nodemailer = require('nodemailer');
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE !== '0';

  if (!host || !user || !password) {
    throw new Error('SMTP_HOST, SMTP_USER y SMTP_PASSWORD deben configurarse en el servidor.');
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass: password },
    tls: { rejectUnauthorized: false },
  });
}

function formatResults(results) {
  return results
    .filter((result) => result.result)
    .map((result) => {
      const item = result.result;
      return `Ticker: ${result.ticker} | Signal: ${item.signal} | Score: ${item.score} | Precio: ${item.close}`;
    })
    .join('\n');
}

async function sendEmail(payload = {}) {
  const to = String(payload.to || '').trim();
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    throw new Error('Debe proporcionar una dirección de correo válida.');
  }

  const subject = String(payload.subject || 'PyTrader resultados').slice(0, 255);
  const text = String(payload.text || '').slice(0, 4000);
  const results = Array.isArray(payload.results) ? payload.results : [];
  const transporter = createMailTransport();

  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: `${text}\n\n${formatResults(results)}`,
  });

  return { success: true, message: `Correo enviado a ${to}.` };
}

module.exports = { sendEmail };
