# Revision de indicadores - 2026-10-15

## Referencias disponibles

- Se ha leido el documento del usuario situado en
  `/home/jac4806/Documentos/Trader/Documentación/Explicación detallada de Mi Tabla CFI.odt`.
- Se ha recibido y leido `/home/jac4806/Escritorio/Mi_Tabla_Fundamentales.txt`,
  Pine Script v6. Su bloque comun es mas reciente que el documento ODT y se ha
  tomado como referencia para actualizar las reglas compartidas de los motores.
- La revision compara formulas y usa series sinteticas con resultados conocidos.
  No se dispone de una exportacion de ambas tablas con ticker, fecha y valores
  para validar coincidencias contra cotizaciones reales.

## Comparacion con Mi Tabla CFI

| Componente | Resultado de la revision |
| --- | --- |
| CFI | Se conserva EMA(20) de volumen por (cierre - apertura), comparada con su EMA(20). |
| CFI semanal | Corregida la alineacion del motor Python principal: ahora propaga la ultima semana cerrada, sin usar cierres futuros. |
| Volumen | Se conserva volumen mayor que SMA(50). |
| Flow | Se conserva posicion del cierre en el rango, filtro de volumen y EMA(5). Queda la diferencia de tick minimo indicada abajo. |
| Divergencias | Antes se comparaban barras desplazadas sin exigir pivotes. Ahora se comparan los dos ultimos pivotes del mismo tipo, confirmados con cinco barras a cada lado. |
| Acumulacion/distribucion | Se conservan umbrales 0.6/0.4, volumen fuerte y direccion de la vela. |
| Tendencia | Se conserva cierre > EMA21 > SMA50 > SMA200. |
| Compra fuerte | Se exige tendencia, CFI, flujo/acumulacion, momentum valido, RSI ascendente y RSI < 65, como el Pine recibido. |
| Compra temprana | Se exige divergencia alcista reciente, flujo positivo y los mismos filtros de momentum/RSI. |
| Venta | Distribucion, divergencia bajista reciente o flujo negativo. Se mantiene la prioridad compra fuerte, compra temprana, venta, espera. |

La expresion de divergencia del ODT antiguo usa simultaneamente `pl` y `pl[5]`
y exige `low[5] < low[10]`. Con pivotes (5,5), el segundo minimo esta dentro de
la ventana derecha del primero y lo invalida. Para maximos ocurre lo mismo.
Por eso se compara con el pivote confirmado anterior, no con un desplazamiento
fijo de cinco barras. El Pine recibido ya corrige esto mediante `prevPl` y
`prevPh`: confirma la interpretacion aplicada en la primera revision. Ahora
tambien se conserva la divergencia durante las diez barras siguientes, incluido
el limite, como `ta.barssince(...) <= divWindow`.

## Comparacion con Mi Tabla Fundamentales

| Metrica o regla | Implementacion |
| --- | --- |
| Momentum | Cierre menos cierre de hace 52 barras; limites estrictos > 1 y < 30, en unidades de precio, no porcentaje. |
| RSI de compra | RSI Wilder ascendente y estrictamente menor de 65; se exige una observacion anterior valida. |
| RSI de volumen | RSI Wilder(14) sobre volumen; no RSI sobre precio ni volumen relativo. |
| PER | Cierre dividido por BPA TTM (`trailingEps`), sin sustituir por PER previsto ni PEG. Sin BPA real se presenta N/A. |
| PER favorable | Positivo y estrictamente menor de 20 por defecto. El PER negativo se conserva como valor, pero no suma apoyo. |
| ADX | Wilder con longitud DI y suavizado separados en el motor; defecto 14/14. Umbral de apoyo por defecto 25. |
| Riesgo | Distancia absoluta a VWMA de cierre de 30 barras, dividida por cierre, por 100. No es distancia al VWAP acumulado. |
| Beta | 61 retornos de una barra contra S&P 500 (`^GSPC`), alineados temporalmente sin usar retornos futuros. Sin indice o varianza suficiente se presenta N/A. |
| Diferencia | Cambio porcentual de cierre respecto a la barra anterior. |
| Entrada institucional | Tendencia, CFI diario y semanal, volumen fuerte y acumulacion. Distinta de Compra Fuerte. |

Python muestra RSI Vol., Momentum, VWMA, Riesgo %, Beta, Dif. % y Entrada
Institucional junto a los resultados existentes. Electron obtiene las metricas
en su resultado y la API web las serializa. Los motores consultan BPA TTM y el
indice para el analisis; no se usa la beta precalculada de Yahoo.

## Correcciones adicionales

- RSI: suavizado Wilder/RMA en los tres motores. Antes usaban medias simples;
  el Python principal ademas devolvia 50 en subidas sin perdidas, en vez de 100.
- ADX: el Python principal ahora usa True Range y suavizado Wilder como los
  otros motores, incluyendo semilla inicial y series planas.
- Orden temporal: el Python principal ordena las velas antes de calcular.
- PER: eliminado el uso incorrecto de PEG o PER previsto como sustituto. Los valores infinitos
  o NaN se tratan como ausentes y no alteran el denominador del score.
- Identidad del activo: las descargas Python ya no prueban bolsas arbitrarias
  ni eliminan el sufijo de una cotizacion fallida. Precio y PER normalizan el
  mismo simbolo. En Stooq se elimina el intento con el simbolo base de una
  cotizacion europea y las conversiones ambiguas Frankfurt/Xetra y Helsinki/Israel.
- Si el proveedor declara distinta moneda/unidad de cotizacion y de los datos
  financieros, se deja el BPA/PER como N/A en vez de dividir unidades distintas.
- RSI y otras metricas con historico insuficiente permanecen sin dato. Para
  series planas con ganancias y perdidas ambas cero se conserva RSI neutral 50.

## Diferencias pendientes para una comparacion real

- Python descarga precios ajustados con `auto_adjust=True`. JavaScript usa
  primero Stooq y despues Yahoo. No se ha demostrado que esos historiales
  compartan ajuste de dividendos/splits, volumen ni hora de actualizacion.
- Hay que comparar la misma bolsa, vela, zona horaria, fecha y profundidad del
  historico. Las bolsas sin correspondencia explicita siguen necesitando revision.
- El CFI llamado diario se calcula por barra: solo es diario con intervalo `1d`.
  El semanal usa semanas cerradas; puede diferir de una tabla que muestre la
  semana en curso. El Pine usa `request.security(..., lookahead_off)`: la
  alineacion historica exacta al cierre de mercado y el valor de la semana en
  curso requieren el calendario/sesion del instrumento. No se declara igualdad
  exacta con TradingView en esas barras.
- El documento usa `syminfo.mintick`; el programa mantiene un minimo de rango
  fijo de `0.0001`. Falta el tick de cada instrumento para igualarlo exactamente.
- El BPA TTM de Yahoo puede diferir de la serie `EARNINGS_PER_SHARE` de
  TradingView por proveedor, revision contable o definicion del BPA. Faltan
  valores exportados de la tabla para medir esa diferencia en activos reales.
- El BPA TTM actual se aplica a las velas: estos resultados no constituyen
  un backtest de fundamentos historicos disponibles en cada fecha.
- Los parametros nuevos siguen los valores predeterminados del Pine. Los
  ajustes PER/ADX previamente guardados por el usuario se mantienen. El motor
  acepta parametros para momentum, RSI de compra, vigencia, RSI de volumen,
  VWMA, beta y suavizado ADX; no se han anadido editores nuevos a la configuracion.
- El score es un porcentaje ponderado de condiciones; no es una probabilidad
  de acierto ni una metrica presente en el documento CFI.

## Validacion

- 39 pruebas Python correctas, incluidas comparaciones numericas con JavaScript.
- 26 pruebas JavaScript correctas.
- Casos cubiertos: valores RSI conocidos, recurrencia ADX, CFI semanal sin
  anticipacion, pivotes alcistas/bajistas sin anticipacion, coincidencia de los
  motores Python, filtros exactos de compra, caducidad de divergencias, BPA TTM,
  RSI de volumen, VWMA/riesgo, beta conocida, falta de indice, distintas monedas,
  respuesta API, columnas del hilo de analisis e identidad de descarga.
- No se han comprobado resultados en vivo contra las tablas del usuario.

Referencias de calculo adicionales:

- [RSI de TradingView](https://www.tradingview.com/support/solutions/43000502338-relative-strength-index-rsi/)
- [DMI de TradingView](https://www.tradingview.com/support/solutions/43000502250-directional-movement-dmi/)
- [BPA TTM y PER en Pine](https://www.tradingview.com/support/solutions/43000564727-what-financial-data-is-available-in-pine/)
