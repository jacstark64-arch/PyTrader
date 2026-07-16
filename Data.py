import yfinance as yf

# Crear el objeto ticker
ticker = yf.Ticker("AAPL")

# Obtener historial de precios (por defecto: 1 mes o periodo especificado)
# periodos: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, 10y, ytd, max
hist = ticker.history(period="1y")

print(hist.head()) # Muestra las primeras 5 filas
