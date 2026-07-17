# Skill: data-ingestion

## Quando Usar

Use ao alterar sincronizacao, providers, cache local ou fontes de dados.

## Procedimento

1. Confirmar se `API_FOOTBALL_KEY` esta configurada.
2. Usar somente as ligas configuradas pelo adaptador.
3. Salvar fixtures e resultados em `backend/data`.
4. Usar Football-Data.co.uk para historico.
5. Remover/ignorar odds.
6. Marcar fallback como `mock-fallback`.
7. Rodar `npm run backend:sync` e `npm run backend:test`.

## Criterio

Falha de API externa nao pode quebrar o sistema.
