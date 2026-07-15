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
- Parsing ISO e `DD/MM/AAAA`.
- Schemas HTTP invalidos e contrato `application/problem+json`.
- Autenticacao, RBAC, rate limit, payload excessivo, content-type e timeout.
- Erros internos sem stack/mensagem sensivel e contrato OpenAPI.
- Feature flag das rotas antigas e jobs administrativos sem trabalho pesado no handler.

Testes PostgreSQL reais:

```bash
TEST_DATABASE_URL=postgresql://... TEST_REDIS_URL=redis://... BETINTEL_REQUIRE_DB_TESTS=true npm run db:test
```

Essa suíte cria um database descartável e usa Redis real para validar migrations,
constraints, concorrência, rollback, deduplicação, dry-run, auditoria append-only,
duas instâncias, rate limit distribuído, outbox, BullMQ, retries, DLQ, cotas,
circuit breaker, locks e recuperação após reinício.

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

- Sync persiste fixtures/resultados compartilhados no PostgreSQL.
- Train cria `model.model_versions` e `model.model_segments`.
- Evaluate e backtest criam `model.evaluations`.
- Nenhum comando grava estado persistente em `backend/data` ou `backend/artifacts`.

## Analise Critica

O projeto valida a disponibilidade de dados antes de apresentar mercado. A ausencia de dados nao gera excecao nem probabilidade inventada para cartoes/escanteios; o mercado entra em `ignoredMarkets`.
