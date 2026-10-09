#!/usr/bin/env node

const { discoverTickers } = require('./ticker-discovery');

function printUsage() {
  console.log('Uso: pytrader-web [archivo|carpeta] [opciones]');
  console.log('');
  console.log('Ejemplos:');
  console.log('  pytrader-web watchlist.txt');
  console.log('  pytrader-web ./watchlists --period 1y --interval 1d');
  console.log('');
  console.log('Opciones:');
  console.log('  -p, --period  Periodo de datos: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max');
  console.log('  -i, --interval Intervalo de datos: 1m, 5m, 15m, 30m, 1h, 1d, 1w, 1mo');
  console.log('  -h, --help    Muestra esta ayuda');
}

function parseArguments(argv) {
  const options = { period: '1y', interval: '1d' };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '-h' || argument === '--help') options.help = true;
    else if (argument === '-p' || argument === '--period') options.period = argv[++index];
    else if (argument === '-i' || argument === '--interval') options.interval = argv[++index];
    else if (argument.startsWith('--period=')) options.period = argument.split('=').slice(1).join('=');
    else if (argument.startsWith('--interval=')) options.interval = argument.split('=').slice(1).join('=');
    else positional.push(argument);
  }

  return { options, positional };
}

async function main(argv = process.argv.slice(2)) {
  const { options, positional } = parseArguments(argv);
  if (options.help || positional.length === 0) {
    printUsage();
    return;
  }

  if (positional.length > 1) {
    throw new Error('Solo se puede indicar un archivo o carpeta.');
  }

  const tickers = await discoverTickers(positional[0]);
  if (tickers.length === 0) {
    throw new Error(`No se encontraron tickers compatibles en ${positional[0]}.`);
  }

  const { analyzeTickers } = require('../api/analyze');
  const results = await analyzeTickers({ tickers, period: options.period, interval: options.interval });
  console.log(`\nAnalizados ${results.length} tickers:`);
  for (const item of results) {
    if (item.error) console.log(`- ${item.ticker}: ERROR ${item.error}`);
    else console.log(`- ${item.ticker}: ${item.result?.signal || 'SIN RESULTADO'} / score ${item.result?.score ?? '—'}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { main, parseArguments, printUsage };
