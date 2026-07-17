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
- CLIs de pipeline em modo offline (`train`/`evaluate`/`backtest` com `--csv`, sem `DATABASE_URL`) e falha amigavel sem stack quando o modo PostgreSQL e usado sem configuracao.
- Validacao centralizada de placares (FTHG/FTAG): rejeita valores nao inteiros, negativos ou fora de `[0, MAX_GOALS_PER_TEAM]` com motivo estruturado (`invalid_home_score`, `invalid_away_score`, `score_out_of_range`, `fractional_score`).
- Divisao temporal por competicao (`temporalSplit`): dataset fora de ordem, varias competicoes, competicao com poucas linhas, datas em formatos mistos, ausencia de sobreposicao treino/validacao/teste e determinismo.

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

## Validacao de Pipeline (PostgreSQL)

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

## Validacao de Pipeline (offline, sem PostgreSQL)

Reproduz treino, avaliacao e backtest a partir de um CSV, sem PostgreSQL, Redis
ou Auth0:

```bash
npm run backend:pipeline:offline
npm run backend:train:offline
npm run backend:evaluate:offline
npm run backend:backtest:offline
```

Resultados esperados:

- Cada comando carrega o CSV (`--csv`, padrao `backend/data/combined-results.csv`),
  constroi as features, treina o modelo e imprime um resumo no terminal.
- `--output <arquivo.json>` salva o modelo/avaliacao/backtest; sem ele, nada e
  gravado (o modo offline nao escreve em `backend/artifacts`).
- Nenhuma conexao PostgreSQL e inicializada; `DATABASE_URL` nao e necessaria.
- As datas do CSV sao normalizadas para ISO 8601 antes da divisao temporal e do
  backtest, aceitando ISO e `DD/MM/AAAA` no mesmo arquivo.
- Sem `--csv`, o comando usa PostgreSQL e, faltando `DATABASE_URL`, encerra com
  mensagem orientando o modo offline, sem stack trace.

## Analise Critica

O projeto valida a disponibilidade de dados antes de apresentar mercado. A ausencia de dados nao gera excecao nem probabilidade inventada para cartoes/escanteios; o mercado entra em `ignoredMarkets`.
