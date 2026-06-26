# Validacao

## Testes Unitarios

Comando:

```bash
npm run backend:test
```

Cobertura funcional:

- Labels de gols.
- 1X2.
- Dupla chance.
- Cartoes sem dados.
- Escanteios sem dados.
- Resposta `dados_insuficientes`.
- Provider API-Football com payload mockado.
- Provider Football-Data com CSV mockado.

## Validacao de Build

```bash
npm run build
```

Esse comando compila TypeScript do `frontend/` e do `backend/`, e gera o build Vite em `frontend/dist`.

## Validacao de Pipeline

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

Resultados esperados:

- Sync cria cache local.
- Train cria `backend/artifacts/model.json`.
- Evaluate cria `backend/artifacts/evaluation.json`.
- Backtest cria `backend/artifacts/backtest.json`.

## Analise Critica

O projeto valida a disponibilidade de dados antes de apresentar mercado. A ausencia de dados nao gera excecao nem probabilidade inventada para cartoes/escanteios; o mercado entra em `ignoredMarkets`.
