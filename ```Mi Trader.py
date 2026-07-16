# =========================================================
#   SMART MONEY / CFI SCREENER
#   Versión completa corregida y optimizada
# =========================================================

# =========================================================
# INSTALAR LIBRERÍAS
# =========================================================
#
# pip install yfinance pandas numpy openpyxl
#
# =========================================================

import yfinance as yf
import pandas as pd
import numpy as np
import time

from datetime import datetime

# =========================================================
# CONFIGURACIÓN
# =========================================================

PERIOD = "1y"
INTERVAL = "1d"

EXPORT_EXCEL = True
EXCEL_NAME = "SmartMoney_Screener.xlsx"

# Tiempo entre consultas Yahoo
DELAY_BETWEEN_REQUESTS = 1

# =========================================================
# CARGAR TICKERS DESDE TXT
# =========================================================

TXT_FILE = "Magnificas.txt"

with open(TXT_FILE, "r") as file:

    content = file.read()

raw_tickers = content.split(",")

TICKERS = sorted(list(set(

    ticker
    .replace("NASDAQ:", "")
    .replace("NYSE:", "")
    .replace("AMEX:", "")
    .strip()

    for ticker in raw_tickers

    if ticker.strip()

)))

print("\n")
print("=" * 80)
print("TICKERS CARGADOS")
print("=" * 80)
print(TICKERS)
print("=" * 80)

# =========================================================
# FUNCIÓN PRINCIPAL INDICADORES
# =========================================================

def calculate_indicators(dataframe):

    df = dataframe.copy()

    # =====================================================
    # CFI DIARIO
    # =====================================================

    df["cfi"] = (
        df["Volume"] *
        (df["Close"] - df["Open"])
    ).ewm(span=20, adjust=False).mean()

    df["cfi_ma"] = (
        df["cfi"]
        .ewm(span=20, adjust=False)
        .mean()
    )

    df["cfi_up"] = (
        df["cfi"] > df["cfi_ma"]
    )

    # =====================================================
    # CFI SEMANAL
    # =====================================================

    weekly = df.resample("W").agg({
        "Open": "first",
        "High": "max",
        "Low": "min",
        "Close": "last",
        "Volume": "sum"
    })

    weekly["cfi_w"] = (
        weekly["Volume"] *
        (weekly["Close"] - weekly["Open"])
    ).ewm(span=20, adjust=False).mean()

    weekly["cfi_w_ma"] = (
        weekly["cfi_w"]
        .ewm(span=20, adjust=False)
        .mean()
    )

    weekly["cfi_w_up"] = (
        weekly["cfi_w"] >
        weekly["cfi_w_ma"]
    )

    df["cfi_w_up"] = (
        weekly["cfi_w_up"]
        .reindex(df.index, method="ffill")
    )

    # =====================================================
    # VOLUMEN
    # =====================================================

    df["vol_ma"] = (
        df["Volume"]
        .rolling(50)
        .mean()
    )

    df["vol_strong"] = (
        df["Volume"] >
        df["vol_ma"]
    )

    # =====================================================
    # FLOW / SMART MONEY
    # =====================================================

    spread = np.maximum(
        df["High"] - df["Low"],
        0.0001
    )

    df["close_pos"] = (
        (df["Close"] - df["Low"]) /
        spread
    )

    df["strength"] = (
        2 * df["close_pos"] - 1
    )

    df["flow"] = np.where(
        df["vol_strong"],
        df["strength"] * df["Volume"],
        0
    )

    df["flow_smooth"] = (
        df["flow"]
        .ewm(span=5, adjust=False)
        .mean()
    )

    # =====================================================
    # ACUMULACIÓN / DISTRIBUCIÓN
    # =====================================================

    df["accumulation"] = (
        (df["vol_strong"]) &
        (df["close_pos"] > 0.6) &
        (df["Close"] >= df["Open"])
    )

    df["distribution"] = (
        (df["vol_strong"]) &
        (df["close_pos"] < 0.4) &
        (df["Close"] <= df["Open"])
    )

    # =====================================================
    # TENDENCIA
    # =====================================================

    df["ema21"] = (
        df["Close"]
        .ewm(span=21, adjust=False)
        .mean()
    )

    df["sma50"] = (
        df["Close"]
        .rolling(50)
        .mean()
    )

    df["sma200"] = (
        df["Close"]
        .rolling(200)
        .mean()
    )

    df["trend_up"] = (
        (df["Close"] > df["ema21"]) &
        (df["ema21"] > df["sma50"]) &
        (df["sma50"] > df["sma200"])
    )

    # =====================================================
    # DIVERGENCIAS
    # =====================================================

    df["bull_div"] = (
        (df["Low"].shift(5) < df["Low"].shift(10)) &
        (
            df["flow_smooth"].shift(5) >
            df["flow_smooth"].shift(10)
        )
    )

    df["bear_div"] = (
        (df["High"].shift(5) > df["High"].shift(10)) &
        (
            df["flow_smooth"].shift(5) <
            df["flow_smooth"].shift(10)
        )
    )

    # =====================================================
    # SEÑALES
    # =====================================================

    df["buy_pro"] = (
        df["trend_up"] &
        df["cfi_up"] &
        (
            (df["flow_smooth"] > 0) |
            (df["accumulation"])
        )
    )

    df["buy_early"] = (
        df["bull_div"] &
        (df["flow_smooth"] > 0)
    )

    df["sell"] = (
        df["distribution"] |
        df["bear_div"] |
        (df["flow_smooth"] < 0)
    )

    # =====================================================
    # ELIMINAR NaN BOOLEANOS
    # =====================================================

    bool_cols = [
        "cfi_up",
        "cfi_w_up",
        "vol_strong",
        "accumulation",
        "distribution",
        "trend_up",
        "bull_div",
        "bear_div",
        "buy_pro",
        "buy_early",
        "sell"
    ]

    for col in bool_cols:

        df[col] = df[col].fillna(False)

    # =====================================================
    # SCORE
    # =====================================================

    df["score"] = 0

    trend_mask = df["trend_up"]
    cfi_mask = df["cfi_up"]
    cfiw_mask = df["cfi_w_up"]
    acc_mask = df["accumulation"]
    flow_mask = (df["flow_smooth"] > 0).fillna(False)

    df.loc[trend_mask, "score"] += 25
    df.loc[cfi_mask, "score"] += 25
    df.loc[cfiw_mask, "score"] += 20
    df.loc[acc_mask, "score"] += 15
    df.loc[flow_mask, "score"] += 15

    # =====================================================
    # TEXTO SEÑAL
    # =====================================================

    conditions = [
        df["buy_pro"],
        df["buy_early"],
        df["sell"]
    ]

    choices = [
        "COMPRA FUERTE",
        "COMPRA TEMPRANA",
        "VENTA"
    ]

    df["signal"] = np.select(
        conditions,
        choices,
        default="ESPERA"
    )

    return df

# =========================================================
# ANALIZAR EMPRESAS
# =========================================================

results = []

for ticker in TICKERS:

    try:

        print(f"\nAnalizando {ticker}...")

        # =================================================
        # DESCARGAR DATOS
        # =================================================

        df = yf.download(
            ticker,
            period=PERIOD,
            interval=INTERVAL,
            auto_adjust=True,
            progress=False,
            group_by="column"
        )

        # =================================================
        # CORREGIR MULTIINDEX
        # =================================================

        if isinstance(df.columns, pd.MultiIndex):

            df.columns = (
                df.columns.get_level_values(0)
            )

        # =================================================
        # LIMPIAR DATOS
        # =================================================

        df.dropna(inplace=True)

        if df.empty:

            print(f"Sin datos para {ticker}")
            continue

        # =================================================
        # CALCULAR INDICADORES
        # =================================================

        df = calculate_indicators(df)

        # =================================================
        # ÚLTIMO REGISTRO
        # =================================================

        last = df.iloc[-1]

        # =================================================
        # GUARDAR RESULTADOS
        # =================================================

        results.append({

            "Ticker": ticker,

            "Precio": round(
                float(last["Close"]),
                2
            ),

            "Signal": str(last["signal"]),

            "Score": int(last["score"]),

            "Trend": (
                "SI"
                if bool(last["trend_up"])
                else "NO"
            ),

            "CFI Diario": (
                "FUERTE"
                if bool(last["cfi_up"])
                else "DEBIL"
            ),

            "CFI Semanal": (
                "FUERTE"
                if bool(last["cfi_w_up"])
                else "DEBIL"
            ),

            "Flow": (
                "COMPRANDO"
                if float(last["flow_smooth"]) > 0
                else "VENDIENDO"
            ),

            "Smart Money": (

                "ACUMULANDO"

                if bool(last["accumulation"])

                else

                "DISTRIBUYENDO"

                if bool(last["distribution"])

                else

                "NEUTRO"
            ),

            "Vol Relativo": round(

                float(last["Volume"]) /
                float(last["vol_ma"]),

                2

            ) if float(last["vol_ma"]) > 0 else 0,

            "Fecha": datetime.now().strftime(
                "%Y-%m-%d %H:%M"
            )
        })

        print(f"{ticker} OK")

        # =================================================
        # RETRASO ENTRE CONSULTAS
        # =================================================

        time.sleep(DELAY_BETWEEN_REQUESTS)

    except Exception as e:

        print(f"\nERROR EN {ticker}")
        print(e)

# =========================================================
# CREAR DATAFRAME
# =========================================================

results_df = pd.DataFrame(results)

# =========================================================
# VERIFICAR RESULTADOS
# =========================================================

if not results_df.empty and "Score" in results_df.columns:

    # =====================================================
    # ORDENAR
    # =====================================================

    results_df = results_df.sort_values(
        by="Score",
        ascending=False
    )

    # =====================================================
    # MOSTRAR RESULTADOS
    # =====================================================

    print("\n")
    print("=" * 100)
    print(results_df)
    print("=" * 100)

    # =====================================================
    # EXPORTAR EXCEL
    # =====================================================

    if EXPORT_EXCEL:

        with pd.ExcelWriter(
            EXCEL_NAME,
            engine="openpyxl"
        ) as writer:

            results_df.to_excel(
                writer,
                sheet_name="SmartMoney",
                index=False
            )

            workbook = writer.book
            worksheet = writer.sheets["SmartMoney"]

            # =================================================
            # AJUSTAR ANCHO COLUMNAS
            # =================================================

            for column in worksheet.columns:

                max_length = 0

                column_letter = (
                    column[0].column_letter
                )

                for cell in column:

                    try:

                        if len(str(cell.value)) > max_length:

                            max_length = len(
                                str(cell.value)
                            )

                    except:
                        pass

                adjusted_width = max_length + 3

                worksheet.column_dimensions[
                    column_letter
                ].width = adjusted_width

        print("\n")
        print("=" * 80)
        print(f"Excel exportado: {EXCEL_NAME}")
        print("=" * 80)

else:

    print("\n")
    print("=" * 80)
    print("NO SE GENERARON RESULTADOS")
    print("Revisa conexión, tickers o Yahoo Finance")
    print("=" * 80)

