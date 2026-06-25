# Criterios de Aceite

## Frontend

- A aplicacao carrega com header, filtros, lista de jogos e painel de analise.
- Copa do Mundo 2026 aparece no filtro lateral.
- O frontend tenta carregar fixtures do backend.
- Se o backend falhar, a UI mostra estado amigavel e fallback mockado marcado.
- O painel mostra competicao/liga, data/hora, fonte, `updatedAt`, mercados disponiveis e ignorados.
- O aviso etico aparece: "Analise baseada em dados historicos. Nao garante resultado."
- Nao ha logos, odds ou textos de casas de aposta.

## Backend

- `GET /health` responde com status ok.
- `GET /markets` lista todos os mercados obrigatorios.
- `GET /competitions` inclui competicoes cacheadas.
- `GET /fixtures` retorna fixtures de cache ou fallback.
- `POST /sync-data` sincroniza ou simula com aviso.
- `POST /train` gera modelo em `backend/artifacts/model.json`.
- `GET /evaluation` retorna metricas de avaliacao.
- `GET /backtest` retorna backtest temporal.
- `POST /predict` retorna `availableMarkets`, `ignoredMarkets`, `reason`, `sourceProvider`, `updatedAt`, `sampleSize` e `confidence`.

## Dados e Modelo

- Labels de gols seguem `FTHG + FTAG`.
- 1X2 deriva `H`, `D`, `A`.
- Dupla chance deriva 1X2.
- Cartoes usam `HY + AY + HR + AR` quando existirem.
- Escanteios usam `HC + AC` quando existirem.
- Ausencia de cartoes/escanteios retorna `dados_insuficientes`.
- Copa do Mundo e segmentada como `competition=World Cup 2026`.

## Validacao

- `npm install` executa.
- `npm run build` passa.
- `npm run backend:test` passa.
- `npm run backend:sync` funciona com API key ou fallback documentado.
- `npm run backend:train`, `backend:evaluate` e `backend:backtest` geram artefatos.
