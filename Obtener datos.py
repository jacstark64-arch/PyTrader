import yfinance as yf
import pandas as pd


# Obtener datos financieros de Microsoft (MSFT)
msft = yf.Ticker("MSFT")

# Mostrar el PER (Price-to-Earnings Ratio)
print(f"PER de Microsoft: {msft.info['trailingPE']}")

# Descargar el balance sheet anual
balance_sheet = msft.balance_sheet
print(balance_sheet.head(3))  # Primeras filas del balance