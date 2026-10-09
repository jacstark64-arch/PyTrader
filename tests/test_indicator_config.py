import sys
from pathlib import Path

import pandas as pd
import numpy as np
import json
import shutil
import subprocess
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

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
    for column in ("score", "rsi", "macd", "adx"):
        values = np.array([np.nan if row[column] is None else row[column] for row in actual])
        np.testing.assert_allclose(values, expected[column], atol=1e-9, rtol=1e-9, equal_nan=True)
