from F_Trader_4 import rate_fundamentals


def test_rates_strong_fundamentals_as_very_good():
    rating, color, _ = rate_fundamentals({
        "trailingPE": 18,
        "returnOnEquity": 0.2,
        "profitMargins": 0.18,
        "debtToEquity": 40,
        "revenueGrowth": 0.2,
    })

    assert rating == "Muy buena"
    assert color == "#16a34a"


def test_rates_mixed_fundamentals_as_good():
    rating, color, _ = rate_fundamentals({
        "trailingPE": 30,
        "returnOnEquity": 0.1,
        "profitMargins": 0.08,
        "debtToEquity": 150,
        "revenueGrowth": 0.03,
    })

    assert rating == "Buena"
    assert color == "#f59e0b"


def test_rates_weak_fundamentals_as_bad():
    rating, color, _ = rate_fundamentals({
        "trailingPE": 60,
        "returnOnEquity": 0.02,
        "profitMargins": 0.02,
        "debtToEquity": 300,
        "revenueGrowth": -0.1,
    })

    assert rating == "Mala"
    assert color == "#dc2626"


def test_does_not_grade_insufficient_fundamentals_as_bad():
    rating, color, _ = rate_fundamentals({
        "returnOnEquity": 0.2,
        "profitMargins": 0.18,
    })

    assert rating == "Sin datos"
    assert color == "#94a3b8"
