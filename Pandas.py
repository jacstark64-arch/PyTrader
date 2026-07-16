import pandas as pd

# Calcular el margen bruto a partir de un income statement
income_stmt = pd.DataFrame({
    'Year': [2020, 2021, 2022],
    'Revenue': [100_000, 120_000, 150_000],
    'Gross Profit': [60_000, 72_000, 90_000]
})

income_stmt['Gross Margin (%)'] = (income_stmt['Gross Profit'] / income_stmt['Revenue'] * 100).round(2)
print(income_stmt)
