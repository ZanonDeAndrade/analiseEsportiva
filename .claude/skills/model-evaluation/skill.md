# Skill: model-evaluation

## Quando Usar

Use ao alterar labels, treinamento, predicao, avaliacao ou backtesting.

## Procedimento

1. Revisar `specs/backend-mercados.md`.
2. Criar ou ajustar testes antes de alterar regras de labels.
3. Rodar `npm run backend:test`.
4. Rodar `npm run backend:train`.
5. Rodar `npm run backend:evaluate`.
6. Rodar `npm run backend:backtest`.
7. Conferir se mercados sem dados retornam `dados_insuficientes`.

## Metricas

- Accuracy por selecao.
- Brier score.
- Cobertura.
- Mercados ignorados.
