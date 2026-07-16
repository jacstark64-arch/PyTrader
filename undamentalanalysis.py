import matplotlib.pyplot as plt
import seaborn as sns

# Datos de ejemplo: ROE histórico
years = [2018, 2019, 2020, 2021, 2022]
roe = [15, 18, 20, 22, 25]  # En porcentaje

plt.figure(figsize=(8, 4))
sns.lineplot(x=years, y=roe, marker="o")
plt.title("ROE Histórico (2018-2022)")
plt.ylabel("ROE (%)")
plt.grid(True)
plt.show()
