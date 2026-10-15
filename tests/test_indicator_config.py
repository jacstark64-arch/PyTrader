import sys
from pathlib import Path

import pandas as pd
import numpy as np
import json
import shutil
import subprocess
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import F_Trader_4 as main_engine
import renderer.F_Trader_4 as renderer_engine
from F_Trader_4 import calculate_indicators, get_pe_ratio


def make_df():
    dates = pd.date_range("2024-01-01", periods=60, freq="D")
    return pd.DataFrame(
        {
            "Open": [100 + i * 0.5 for i in range(60)],
            "High": [105 + i * 0.5 for i in range(60)],
            "Low": [95 + i * 0.5 for i in range(60)],
            "Close": [102 + i * 0.4 for i in range(60)],
            "Volume": [1000 + i * 10 for i in range(60)],
        },
        index=dates,
    )


def test_calculate_indicators_adds_rsi_macd_and_pe_columns():
    df = make_df()
    params = {
        "rsi_period": 14,
        "rsi_overbought": 70,
        "rsi_oversold": 30,
        "macd_fast": 12,
        "macd_slow": 26,
        "macd_signal": 9,
        "score_weight_rsi": 5,
        "score_weight_macd": 5,
        "score_weight_per": 5,
        "per_max": 25,
        "adx_period": 14,
        "adx_threshold": 20,
        "score_weight_adx": 5,
        "score_weight_vwap": 5,
    }

    result = calculate_indicators(df, pe_ratio=18.5, params=params)

    assert "rsi" in result.columns
    assert "macd" in result.columns
    assert "macd_signal" in result.columns
    assert "per" in result.columns
    assert "vwap" in result.columns
    assert "adx" in result.columns
    assert result["score"].notna().all()
    assert result["score"].iloc[-1] >= 0


def market_df(direction=1, periods=260):
    x = np.arange(periods, dtype=float)
    close = 200 + direction * x * 0.2
    return pd.DataFrame({
        "Open": close - 0.1, "High": close + 1,
        "Low": close - 1, "Close": close, "Volume": 1000 + x * 10,
    }, index=pd.bdate_range("2024-01-01", periods=periods))


@pytest.mark.parametrize("direction,expected", [(1, 100), (-1, 0), (0, 50)])
def test_rsi_unidirectional_and_flat_prices(direction, expected):
    assert calculate_indicators(market_df(direction))["rsi"].iloc[-1] == expected


def test_weekly_cfi_is_available_without_looking_ahead():
    df = market_df()
    result = calculate_indicators(df)
    assert result["cfi_w_up"].iloc[-1]
    assert not result["cfi_w_up"].iloc[:5].any()
    for size in (12, 31, 57):
        prefix = calculate_indicators(df.iloc[:size])
        pd.testing.assert_series_equal(prefix["cfi_w_up"], result["cfi_w_up"].iloc[:size])


def test_chronological_order_and_nonfinite_per():
    df = market_df()
    expected = calculate_indicators(df)
    pd.testing.assert_frame_equal(calculate_indicators(df.iloc[::-1]), expected)
    for per in (np.nan, np.inf, -np.inf):
        actual = calculate_indicators(df, pe_ratio=per)
        pd.testing.assert_series_equal(actual["score"], expected["score"])


def test_peg_is_not_used_as_per(monkeypatch):
    class Stock:
        fast_info = None
        info = {"pegRatio": 0.8}
    monkeypatch.setattr("F_Trader_4.yf.Ticker", lambda ticker: Stock())
    assert get_pe_ratio("TEST") is None


@pytest.mark.parametrize("per", [None, 18.5, 40])
def test_python_and_javascript_agree(per):
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is needed for the cross-engine regression test")
    df = market_df()
    x = np.arange(len(df))
    df["Close"] += np.sin(x / 3) * 3
    df["Open"] = df["Close"] - np.cos(x / 4)
    df["High"] = df[["Open", "Close"]].max(axis=1) + 1
    df["Low"] = df[["Open", "Close"]].min(axis=1) - 1
    expected = calculate_indicators(df, pe_ratio=per)
    rows = [{"date": date.isoformat(), **{key.lower(): float(value) for key, value in row.items()}}
            for date, row in df.iterrows()]
    script = "const fs=require('fs'); const {calculateIndicators}=require('./src/F_Trader_4'); const p=JSON.parse(fs.readFileSync(0,'utf8')); console.log(JSON.stringify(calculateIndicators(p.rows,{per:p.per})));"
    output = subprocess.run([node, "-e", script], input=json.dumps({"rows": rows, "per": per}),
                            text=True, capture_output=True, check=True,
                            cwd=Path(__file__).resolve().parents[1])
    actual = json.loads(output.stdout)
    for column in ("score", "rsi", "macd", "adx", "momentum", "risk", "vwma"):
        values = np.array([np.nan if row[column] is None else row[column] for row in actual])
        np.testing.assert_allclose(values, expected[column], atol=1e-9, rtol=1e-9, equal_nan=True)
    for js_column, py_column in (("cfiWeeklyUp", "cfi_w_up"), ("bullDiv", "bull_div"),
                                  ("bearDiv", "bear_div"), ("signal", "signal"),
                                  ("bullRecent", "bull_recent"), ("bearRecent", "bear_recent"),
                                  ("rsiUp", "rsi_up"), ("momentumOk", "momentum_ok")):
        assert [row[js_column] for row in actual] == expected[py_column].tolist()


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_rsi_uses_wilder_smoothing(engine):
    closes = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.10, 45.42,
              45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03]
    df = market_df(periods=len(closes))
    df["Close"] = closes
    df["Open"] = df["Close"]
    df["High"] = df["Close"] + 1
    df["Low"] = df["Close"] - 1
    result = engine.calculate_indicators(df)
    assert result["rsi"].iloc[14] == pytest.approx(70.46413502109705)
    assert result["rsi"].iloc[15] == pytest.approx(66.24961855355505)
    assert result["rsi"].iloc[16] == pytest.approx(66.48094183471265)


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_adx_uses_wilder_seed_and_recurrence(engine):
    df = pd.DataFrame({
        "Open": [9, 11, 12, 10, 9, 12], "Close": [9, 11, 12, 10, 9, 12],
        "High": [10, 12, 13, 12, 11, 13], "Low": [8, 9, 10, 9, 8, 10],
        "Volume": [1000] * 6,
    }, index=pd.bdate_range("2024-01-01", periods=6))
    result = engine.calculate_indicators(df, params={"adx_period": 2})
    assert result["adx"].iloc[:3].isna().all()
    np.testing.assert_allclose(result["adx"].iloc[3:], [60, 46.66666666666667, 49.33333333333333])


def divergence_df(bearish=False):
    df = pd.DataFrame({
        "Open": [100.] * 90, "Close": [100.] * 90,
        "High": [105.] * 90, "Low": [95.] * 90, "Volume": [1000.] * 90,
    }, index=pd.bdate_range("2024-01-01", periods=90))
    df.iloc[60, df.columns.get_loc("Low")] = 90
    df.iloc[72, df.columns.get_loc("Low")] = 85
    df.iloc[60, df.columns.get_loc("Close")] = 91
    df.iloc[72, df.columns.get_loc("Close")] = 104
    df.iloc[[60, 72], df.columns.get_loc("Volume")] = [2000, 3000]
    if bearish:
        low, high = df["Low"].copy(), df["High"].copy()
        df["Low"], df["High"] = 200 - high, 200 - low
        df["Open"], df["Close"] = 200 - df["Open"], 200 - df["Close"]
    return df


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
@pytest.mark.parametrize("bearish", [False, True])
def test_divergences_wait_for_two_confirmed_pivots(engine, bearish):
    df = divergence_df(bearish)
    column = "bear_div" if bearish else "bull_div"
    result = engine.calculate_indicators(df)
    assert result[column].iloc[77]
    assert result[column].sum() == 1
    for size in (61, 65, 73, 77, 78):
        prefix = engine.calculate_indicators(df.iloc[:size])
        pd.testing.assert_series_equal(prefix[column], result[column].iloc[:size])


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_python_engines_agree_and_strong_buy_requires_table_conditions(engine):
    df = market_df()
    x = np.arange(len(df))
    df["Close"] += np.sin(x / 3) * 3
    df["Open"] = df["Close"] + 3
    df["High"] = df[["Open", "Close"]].max(axis=1) + 1
    df["Low"] = df[["Open", "Close"]].min(axis=1) - 1
    actual = engine.calculate_indicators(df)
    pd.testing.assert_frame_equal(actual, main_engine.calculate_indicators(df))
    legacy_extra_buy = actual["rsi_bullish"] & actual["macd_bullish"] & actual["trend_up"] & ~actual["buy_pro"]
    assert legacy_extra_buy.any()
    assert actual["signal"].eq("COMPRA FUERTE").equals(actual["buy_pro"])


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
@pytest.mark.parametrize("ticker,normalized", [("BME:SAN", "SAN.MC"), ("SAN.MC", "SAN.MC"), ("UNKNOWN", "UNKNOWN")])
def test_download_does_not_substitute_another_listing(monkeypatch, engine, ticker, normalized):
    calls = []

    def download(symbol, **kwargs):
        calls.append(symbol)
        return pd.DataFrame()

    monkeypatch.setattr(engine.yf, "download", download)
    data, error = engine.download_data_safe(ticker, max_retries=1)
    assert data is None and error
    assert calls == [normalized]


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_fundamentals_reject_peg_and_nonfinite_pe(monkeypatch, engine):
    class Stock:
        fast_info = None
        info = {"forwardPE": float("inf"), "trailingPE": 18.5, "pegRatio": 0.8}

    calls = []

    def ticker(symbol):
        calls.append(symbol)
        return Stock()

    monkeypatch.setattr(engine.yf, "Ticker", ticker)
    assert engine.get_pe_ratio("BME:SAN") == 18.5
    assert calls == ["SAN.MC"]
    Stock.info = {"pegRatio": 0.8}
    assert engine.get_pe_ratio("BME:SAN") is None


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_ttm_eps_is_used_instead_of_forecast_per(monkeypatch, engine):
    class Stock:
        info = {"trailingEps": 2, "forwardPE": 5, "trailingPE": 99}

    monkeypatch.setattr(engine.yf, "Ticker", lambda ticker: Stock())
    assert engine.get_pe_ratio("TEST", price=30) == 15
    Stock.info = {"trailingEps": 2, "currency": "GBp", "financialCurrency": "GBP"}
    assert engine.get_pe_ratio("TEST", price=30) is None
    Stock.info = {"trailingEps": 2}
    result = engine.calculate_indicators(market_df(), eps_ttm=2)
    pd.testing.assert_series_equal(result["per"], (result["Close"] / 2).rename("per"))
    Stock.info = {"forwardPE": 5}
    assert engine.get_pe_ratio("TEST", price=30) is None
    assert engine.get_pe_ratio("TEST") is None


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_pine_buy_filters_and_divergence_expiry(engine):
    df = market_df()
    x = np.arange(len(df))
    df["Close"] += np.sin(x / 3) * 3
    df["Open"] = df["Close"] - 0.2
    df["High"] = df["Close"] + 1
    df["Low"] = df["Close"] - 2
    result = engine.calculate_indicators(df)
    expected_filter = ((result["Close"] - result["Close"].shift(52) > 1) &
                       (result["Close"] - result["Close"].shift(52) < 30) &
                       (result["rsi"] > result["rsi"].shift(1)) & (result["rsi"] < 65))
    expected = result["trend_up"] & result["cfi_up"] & ((result["flow_smooth"] > 0) | result["accumulation"]) & expected_filter
    assert expected.any()
    pd.testing.assert_series_equal(result["buy_pro"], expected.rename("buy_pro"))
    blocked = engine.calculate_indicators(df, params={"momentum_min": 30})
    assert not blocked["buy_pro"].any()
    for bearish, column in ((False, "bull_recent"), (True, "bear_recent")):
        divergence = engine.calculate_indicators(divergence_df(bearish))
        assert not divergence[column].iloc[:77].any()
        assert divergence[column].iloc[77:88].all()
        assert not divergence[column].iloc[88:].any()


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_volume_rsi_vwma_and_risk_match_pine_formulas(engine):
    df = market_df()
    df["Volume"] = 2000 + np.sin(np.arange(len(df)) / 3) * 100
    result = engine.calculate_indicators(df)
    prices = df.copy()
    prices["Close"] = df["Volume"]
    reference = engine.calculate_indicators(prices)
    np.testing.assert_allclose(result["rsi_volume"].iloc[14:], reference["rsi"].iloc[14:])
    expected_vwma = np.average(df["Close"].iloc[-30:], weights=df["Volume"].iloc[-30:])
    assert result["vwma"].iloc[-1] == pytest.approx(expected_vwma)
    assert result["risk"].iloc[-1] == pytest.approx(abs(df["Close"].iloc[-1] - expected_vwma) / df["Close"].iloc[-1] * 100)
    assert result["risk"].iloc[:29].isna().all()


def beta_frames():
    df = market_df(periods=90)
    returns = np.sin(np.arange(89) / 3) / 100 + 0.002
    benchmark = df.copy()
    benchmark["Close"] = np.r_[100, 100 * np.cumprod(1 + returns)]
    df["Close"] = np.r_[200, 200 * np.cumprod(1 + 2 * returns)]
    return df, benchmark


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_beta_uses_sixty_one_aligned_returns_and_requires_benchmark(engine):
    df, benchmark = beta_frames()
    assert engine.calculate_indicators(df)["beta"].isna().all()
    actual = engine.calculate_indicators(df, benchmark=benchmark)
    assert actual["beta"].iloc[:61].isna().all()
    np.testing.assert_allclose(actual["beta"].iloc[61:], 2, atol=1e-10)
    benchmark["Close"] = 100
    assert engine.calculate_indicators(df, benchmark=benchmark)["beta"].isna().all()


def test_pine_metrics_match_javascript_with_eps_and_benchmark():
    node = shutil.which("node")
    if node is None:
        pytest.skip("Node.js is needed for cross-engine validation")
    df, benchmark = beta_frames()
    df["Volume"] += np.sin(np.arange(len(df))) * 300
    expected = main_engine.calculate_indicators(df, eps_ttm=2, benchmark=benchmark)

    def rows(frame):
        return [{"date": date.isoformat(), **{key.lower(): float(value) for key, value in row.items()}}
                for date, row in frame.iterrows()]

    script = "const fs=require('fs'); const {calculateIndicators}=require('./src/F_Trader_4'); const p=JSON.parse(fs.readFileSync(0,'utf8')); console.log(JSON.stringify(calculateIndicators(p.rows,{epsTtm:2,benchmark:p.benchmark})));"
    output = subprocess.run([node, "-e", script], input=json.dumps({"rows": rows(df), "benchmark": rows(benchmark)}),
                            text=True, capture_output=True, check=True,
                            cwd=Path(__file__).resolve().parents[1])
    actual = json.loads(output.stdout)
    for js_column, py_column in (("per", "per"), ("beta", "beta"), ("rsiVolume", "rsi_volume"),
                                  ("vwma", "vwma"), ("risk", "risk"), ("changePct", "change_pct"), ("score", "score")):
        values = np.array([np.nan if row[js_column] is None else row[js_column] for row in actual])
        np.testing.assert_allclose(values, expected[py_column], atol=1e-9, rtol=1e-9, equal_nan=True)


@pytest.mark.parametrize("engine", [main_engine, renderer_engine])
def test_analysis_thread_exposes_pine_metrics_and_missing_values(monkeypatch, engine):
    df, benchmark = beta_frames()
    calls = []

    def download(ticker, **kwargs):
        calls.append(ticker)
        return (benchmark if ticker == "^GSPC" else df), None

    monkeypatch.setattr(engine, "download_data_safe", download)
    monkeypatch.setattr(engine, "get_trailing_eps", lambda ticker: None)
    monkeypatch.setattr(engine.time, "sleep", lambda delay: None)
    thread = engine.AnalysisThread(["TEST"])
    results = []
    thread.result_ready.connect(results.append)
    thread.run()
    assert calls == ["^GSPC", "TEST"]
    assert len(results) == 1
    assert list(results[0]) == engine.DEFAULT_RESULT_HEADERS
    assert results[0]["PER"] == "N/A"
    assert results[0]["Beta"] == pytest.approx(2)
