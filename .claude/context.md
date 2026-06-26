# Contexto BetIntel AI

BetIntel AI e um projeto academico de Inteligencia Artificial 2026/01. A entrega deve demonstrar solution aplicada de IA e harness engineering.

## Dominio

Analise probabilistica educacional de futebol. O produto nao e casa de apostas e nao recomenda apostas financeiras.

## Dados

Fonte primaria:

- API-Football / API-Sports.
- Base URL `https://v3.football.api-sports.io`.
- Copa 2026: `league=1`, `season=2026`.
- Chave em `API_FOOTBALL_KEY`.

Fonte secundaria:

- Football-Data.co.uk CSVs historicos.
- Colunas de placar, resultado, escanteios e cartoes.
- Odds ignoradas.

## Arquitetura

Frontend React em `frontend/` consome backend local. Backend sincroniza dados, grava cache, treina modelo, avalia, roda backtest e prediz mercados.

## Restricao Etica

Sempre manter: "Analise baseada em dados historicos. Nao garante resultado."
