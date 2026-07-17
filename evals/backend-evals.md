# Evals Backend

## Casos

1. CSV com `FTHG=2` e `FTAG=1` deve gerar `totalGoals=3`, 1X2 mandante e over 2.5 verdadeiro.
2. CSV sem `HC`/`AC` deve retornar escanteios como `dados_insuficientes`.
3. CSV sem `HY`/`AY`/`HR`/`AR` deve retornar cartoes como `dados_insuficientes`.
4. Payload API-Football com eventos de cartao deve gerar `HY`, `AY`, `HR`, `AR`.
5. CSV Football-Data com odds deve ignorar colunas de odds.
6. Predicao sem colunas reais de cartoes/escanteios deve deixar esses mercados ignorados.

## Execucao

```bash
npm run backend:test
npm run backend:evaluate
npm run backend:backtest
```
