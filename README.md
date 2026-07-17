# BetIntel AI

BetIntel AI e uma plataforma academica de analise probabilistica de futebol. O projeto demonstra uma solucao aplicada de IA com frontend, backend TypeScript, ingestao de dados, treinamento, avaliacao, backtesting e um harness de desenvolvimento orientado por especificacoes.

O sistema nao e casa de apostas, nao recomenda aposta financeira e nao promete lucro. Todas as probabilidades sao estimativas educacionais. Aviso obrigatorio: "Analise baseada em dados historicos. Nao garante resultado."

Os documentos jurídicos digitais, o clickwrap, o versionamento e a evidência de aceite estão descritos em [`docs/legal-implementation.md`](docs/legal-implementation.md). As páginas públicas começam em `/termos-de-uso`; tratam-se de minutas sujeitas à revisão jurídica, e o billing permanece bloqueado até validação comercial, jurídica, fiscal e operacional.

A experiência autenticada, os fluxos de organização, conta, consultas, exportação,
billing transparente e a estratégia de atualização sem polling agressivo estão em
[`docs/frontend-saas.md`](docs/frontend-saas.md).

Controles técnicos de privacidade, direitos do titular, retenção e backups estão em
[`docs/privacy-lgpd-controls.md`](docs/privacy-lgpd-controls.md). Suporte, SLA,
escalonamento e operação diária estão em
[`docs/support-operations.md`](docs/support-operations.md), com procedimentos em
[`docs/operations-runbooks.md`](docs/operations-runbooks.md). Nenhum desses documentos
substitui revisão jurídica, contábil ou comercial.

## Stack

- React + Vite + TypeScript
- Backend Node.js + TypeScript
- PostgreSQL + Drizzle ORM/migrations SQL versionadas
- Redis + BullMQ para rate limit distribuido, outbox e workers
- Auth0 Universal Login + SDK React + validação RS256/JWKS no backend
- Testes com `node:test`

## Estrutura

- `frontend/`: aplicacao React + Vite.
- `frontend/src/`: componentes, estilos, metadados de ligas, dados de demonstracao opcionais e cliente HTTP.
- `backend/`: API local, providers, pipeline de dados, treino, avaliacao e backtesting.
- `specs/`: especificacao SDD, requisitos e criterios de aceite.
- `.claude/` e `.codex/`: contexto, prompts e agentes usados para orientar a IA.
- `docs/`: system of record tecnico.
- `evals/`: casos de avaliacao.

A conferencia contra a estrutura minima pedida no enunciado esta em
[`docs/estrutura-entrega.md`](docs/estrutura-entrega.md).

## Configuracao

```bash
npm install
```

Somente no desenvolvimento local, crie um `.env` a partir de `.env.example`.
Staging e production recebem configuracao do secret manager, nunca de arquivo.
`DATABASE_URL` e obrigatoria para o backend:

```bash
API_FOOTBALL_KEY=
FOOTBALL_DATA_ORG_API_KEY=
BETINTEL_BACKEND_PORT=3333
DATABASE_URL=postgresql://betintel:senha@127.0.0.1:5432/betintel
DATABASE_POOL_MAX=10
BETINTEL_API_HISTORY_YEARS=5
BETINTEL_SYNC_API_HISTORY=true
BETINTEL_FIXTURE_DAYS=7
# BETINTEL_FIXTURE_TO=2026-12-31  # opcional; se definido, sobrescreve a janela em dias
AUTH0_DOMAIN=seu-tenant.us.auth0.com
AUTH0_AUDIENCE=https://api.betintel.example/v1
AUTH0_SPA_CLIENT_ID=
AUTH0_MANAGEMENT_CLIENT_ID=
AUTH0_MANAGEMENT_CLIENT_SECRET=
CORS_ALLOWED_ORIGINS=http://localhost:5173
REQUEST_IP_HASH_KEY=
HTTP_BODY_LIMIT_BYTES=1000000
HTTP_REQUEST_TIMEOUT_MS=15000
HTTP_RATE_LIMIT_MAX=120
HTTP_RATE_LIMIT_WINDOW=1 minute
ENABLE_LEGACY_HTTP_ROUTES=false
REDIS_URL=redis://127.0.0.1:6379
BULLMQ_REDIS_URL=redis://127.0.0.1:6379
REDIS_KEY_PREFIX=betintel:development
APP_RELEASE=development
OTEL_SERVICE_NAME=betintel-api
OTEL_EXPORTER_OTLP_ENDPOINT=
SENTRY_DSN=
METRICS_BEARER_TOKEN=
WORKER_DATABASE_URL=postgresql://betintel_worker:senha@127.0.0.1:5432/betintel
SCHEDULER_DATABASE_URL=postgresql://betintel_scheduler:senha@127.0.0.1:5432/betintel
VITE_AUTH0_DOMAIN=seu-tenant.us.auth0.com
VITE_AUTH0_CLIENT_ID=
VITE_AUTH0_AUDIENCE=https://api.betintel.example/v1
```

Prepare o banco antes de iniciar a aplicacao:

```bash
npm run db:migrate
npm run db:import -- --dry-run
npm run db:import
```

O importador le os arquivos legados apenas como entrada de migracao. O runtime nao grava nem consulta estado persistente em `backend/data` ou `backend/artifacts`. Consulte [`docs/postgresql-persistence.md`](docs/postgresql-persistence.md). A configuração do Auth0, gates de plano e rollback estão em [`docs/auth0-identity.md`](docs/auth0-identity.md).

Organizações, matriz RBAC, tenant ativo, RLS e procedimentos operacionais estão
em [`docs/organization-tenancy.md`](docs/organization-tenancy.md). Em produção,
`DATABASE_URL` deve usar uma role `NOSUPERUSER NOBYPASSRLS` que não seja dona das
tabelas.

Sem acesso a fixtures reais, o backend nao inventa agenda: retorna os dados reais ja persistidos ou uma lista vazia com aviso.

## Como Rodar

Infraestrutura local completa, com migrations antes da API:

```bash
docker compose -f compose.dev.yaml up --build
```

O Dockerfile multi-stage executa como usuario nao-root. Compose e somente para
development; staging e production usam bancos, Redis, Auth0 e secrets totalmente
separados. Consulte [`docs/infrastructure-operations.md`](docs/infrastructure-operations.md)
para CI/CD, health checks, Render, TLS, backups, restauracao, RPO/RTO e rollback.

Aplicacao completa (backend + frontend):

```bash
npm run dev
```

Somente frontend:

```bash
npm run frontend:dev
```

Somente backend:

```bash
npm run backend:serve
```

Workers e scheduler, em processos separados:

```bash
npm run backend:worker
npm run backend:scheduler
```

As oito filas, cotas, circuit breaker, DLQ, configuracao e rollback estao em
[`docs/async-jobs.md`](docs/async-jobs.md). O Redis dedicado ao BullMQ deve usar
`maxmemory-policy=noeviction` em producao.

Logs estruturados, métricas RED/runtime/domínio, tracing OpenTelemetry, Sentry,
auditoria, alertas e as sete consultas de investigação estão em
[`docs/observability.md`](docs/observability.md) e
[`docs/observability-runbook.md`](docs/observability-runbook.md).

Build completo:

```bash
npm run build
```

Qualidade isolada:

```bash
npm run lint
npm run typecheck
npm run test:unit
npm run test:evals
```

## Pipeline de Dados e Modelo

A operação de produção usa adaptadores por provedor, identidade canônica, manifesto por dataset, revisões de resultado e bloqueio de dados vencidos. O runbook completo está em [docs/sports-data-operations.md](docs/sports-data-operations.md).

A avaliação temporal, baselines obrigatórias, calibração, rastreabilidade, drift e o ciclo champion/challenger estão documentados em [docs/modelo-ml.md](docs/modelo-ml.md).

Antes de habilitar uma fonte, configure referências internas explícitas (não são parecer jurídico):

```env
API_FOOTBALL_USE_POLICY_REFERENCE=policy-interna-2026-07
API_FOOTBALL_LICENSE_REFERENCE=inventario-contrato-42
API_FOOTBALL_ALLOWED_ENVIRONMENTS=staging,production
FOOTBALL_DATA_USE_POLICY_REFERENCE=policy-interna-2026-07
FOOTBALL_DATA_LICENSE_REFERENCE=inventario-fonte-17
FOOTBALL_DATA_ALLOWED_ENVIRONMENTS=staging,production
BETINTEL_ENABLE_FOOTBALL_DATA=true
FOOTBALL_DATA_ORG_USE_POLICY_REFERENCE=policy-interna-2026-07
FOOTBALL_DATA_ORG_LICENSE_REFERENCE=inventario-fonte-18
FOOTBALL_DATA_ORG_ALLOWED_ENVIRONMENTS=staging,production
```

Não existe fallback fictício em produção. Fixtures vencidas continuam auditáveis no banco, mas são bloqueadas na apresentação como atuais.

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

- `backend:sync`: usa API-Football e/ou football-data.org quando as respectivas chaves existem, busca CSVs historicos do Football-Data.co.uk e persiste no PostgreSQL.
- `backend:sync -- --api-history-years 5`: define quantos anos historicos da API-Football entram no treino.
- `backend:sync -- --skip-api-history`: sincroniza fixtures atuais sem baixar historico da API-Football.
- `backend:train`: treina frequencias historicas por mercado e segmento.
- `backend:evaluate`: avalia temporalmente o challenger, registra baselines/Brier/calibracao e aplica o gate de promocao.
- `backend:backtest`: executa backtesting walk-forward e o associa ao modelo/dataset versionados.

### Pipeline offline (modo academico, somente CSV)

Para reproduzir o pipeline **sem PostgreSQL, Redis ou Auth0** — usando apenas um
arquivo CSV — rode qualquer um dos comandos offline. Eles carregam o CSV,
constroem as features, treinam o modelo e imprimem um resumo no terminal:

```bash
npm run backend:pipeline:offline     # treino + avaliacao no dataset local
npm run backend:train:offline
npm run backend:evaluate:offline
npm run backend:backtest:offline
```

- Por padrao usam `backend/data/combined-results.csv`. Informe outro arquivo com
  `-- --csv <arquivo>` (por exemplo, um recorte menor para o backtest, que é
  O(n²) e fica lento no dataset completo).
- Salve o resultado (modelo, avaliação ou backtest) em JSON com
  `-- --output <arquivo.json>`. Sem `--output`, nada é gravado em disco — o modo
  offline **não** escreve em `backend/artifacts`.
- Ajuste a amostra mínima por mercado com `-- --min-rows <n>` (padrão 5).
- As datas do CSV são normalizadas para ISO 8601 (aceita ISO e `DD/MM/AAAA`),
  então fontes com formatos diferentes podem ser misturadas no mesmo arquivo.

Quando `--csv` **não** é informado, os comandos usam o fluxo PostgreSQL versionado
e exigem `DATABASE_URL`; sem ela, o CLI encerra com uma mensagem orientando o modo
offline, sem stack trace.

## Como Melhorar a Acuracia

O modelo diferencia partidas usando:

- frequencias historicas por competicao/temporada;
- perfil do mandante e visitante;
- gols pro/contra;
- tendencia de over/under;
- ambas marcam;
- cartoes e escanteios quando existem dados.

Para melhorar a qualidade, aumente a base historica e rode novamente:

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

Quando `API_FOOTBALL_KEY` esta configurada, `backend:sync` tenta baixar resultados da API-Football dos ultimos `BETINTEL_API_HISTORY_YEARS` anos para as competicoes alvo. Limites ou erros de provider aparecem no relatorio; nenhum dado simulado e inserido como fallback.

Mais dados por time e competicao tendem a melhorar a estabilidade das estimativas, mas o sistema continua educacional e nao garante resultado.

## Fontes de Dados

- API-Football / API-Sports: `https://v3.football.api-sports.io`, usando as ligas configuradas no adaptador.
- football-data.org API v4: jogos atuais via `/v4/matches`, autenticados no servidor por `FOOTBALL_DATA_ORG_API_KEY`.
- Football-Data.co.uk: CSVs historicos com colunas como `FTHG`, `FTAG`, `FTR`, `HC`, `AC`, `HY`, `AY`, `HR`, `AR`.
- Opta / Stats Perform: fonte profissional e licenciada. Pode ser integrada se houver contrato, API key e documentacao de endpoints liberados para o projeto.

Odds presentes em CSVs sao ignoradas no produto final.

## API Fastify `/v1`

`/v1/health/live` e `/v1/health/ready` sao publicos. As demais rotas exigem access
token da API Auth0 e membership local ativa. O contrato principal inclui:

- `GET /v1/markets`, `/v1/competitions` e `/v1/fixtures`;
- `POST /v1/predictions`;
- `GET /v1/evaluations/latest`, `/v1/backtests/latest` e `/v1/models/active`;
- rotas de conta e organizacao sob `/v1/account`, `/v1/organizations` e
  `/v1/organization`;
- jobs protegidos sob `/v1/admin/jobs/*`.

Sync, normalizacao, treino, avaliacao e backtest nunca executam dentro do handler HTTP. Os
endpoints administrativos exigem `Idempotency-Key`, registram um job duravel e
retornam `202`. `GET /v1/admin/queues` fornece inspecao protegida e
`DELETE /v1/admin/jobs/:id` solicita cancelamento seguro. A documentacao OpenAPI fica em `/docs` fora de producao e continua
protegida pelos hooks globais.

Aliases antigos existem somente com `ENABLE_LEGACY_HTTP_ROUTES=true`, retornam
headers de deprecacao e expiram em 15 de outubro de 2026. A flag fica desligada por
padrao. Consulte [`docs/fastify-api.md`](docs/fastify-api.md) para schemas, seguranca,
configuracao, limitacoes de Redis/BullMQ e rollback.

## Jogos Atuais

Para jogos atuais, configure `API_FOOTBALL_KEY`, rode `npm run backend:sync` e inicie a aplicacao com `npm run dev`. O endpoint `/fixtures` consulta o PostgreSQL e retorna somente partidas futuras. Se a fonte estiver indisponivel, o backend mantem apenas dados reais ja persistidos e devolve aviso; nao cria agenda simulada.

Por padrao, a busca de fixtures e uma janela rolante de hoje ate hoje + `BETINTEL_FIXTURE_DAYS` (padrao 7 dias). Defina `BETINTEL_FIXTURE_TO=YYYY-MM-DD` para fixar uma data final (tem prioridade sobre a janela em dias). Competicoes alvo:

- Brasileirao Serie A (`league=71`, `season=2026`)
- Premier League (`league=39`, `season=2026`)
- La Liga (`league=140`, `season=2026`)
- Ligue 1 (`league=61`, `season=2026`)
- Bundesliga (`league=78`, `season=2026`)

## Mercados

- 1X2
- Over 1.5 gols
- Over 2.5 gols
- Over 3.5 gols
- Under 2.5 gols
- Under 3.5 gols
- Ambas Marcam
- Dupla Chance
- Cartoes
- Escanteios

Cartoes e escanteios sao opcionais por CSV. Se colunas ou amostras nao existirem, o status retornado e `dados_insuficientes`.

## Validacao

```bash
npm run build
npm run backend:test
TEST_DATABASE_URL=postgresql://... TEST_REDIS_URL=redis://... BETINTEL_REQUIRE_DB_TESTS=true npm run db:test
```

Os testes cobrem o dominio e, com PostgreSQL/Redis reais, migrations do zero,
constraints, concorrencia, rollback, deduplicacao, dry-run, duas instancias HTTP,
outbox/BullMQ, DLQ, quotas, circuit breaker e jobs idempotentes isolados por RLS.

A suite HTTP cobre schema invalido, autenticacao/autorizacao, rate limit, payload,
content-type, timeout, ocultacao de stack, OpenAPI e feature flag de compatibilidade.

Tambem cobrem RS256/JWKS, token expirado, issuer/audience/chave errados, ID token
recusado, falha fechada, provisionamento idempotente, revogacao local, isolamento
entre tenants e transferencia de ownership. MFA, recovery, brute force e refresh
rotation exigem o checklist manual no tenant Auth0 real; um fake local nao aprova
esses fluxos gerenciados.

## Harness

O harness exigido pelo trabalho esta em:

- `frontend/`
- `backend/`
- `specs/`
- `docs/`
- `.claude/`
- `.codex/`
- `evals/`
- `AGENTS.md`
- `CLAUDE.md`

Esses arquivos documentam objetivo, requisitos, criterios de aceite, arquitetura, fontes de dados, modelo, validacao, prompts, agente e skills usadas no desenvolvimento assistido por IA.

## Limitacoes

- Sem acesso a uma fonte real de fixtures futuras, a aplicacao mostra estado vazio/aviso. Dados simulados existem apenas no modo visual `?demo=1` de builds locais de desenvolvimento; esse modo é removido do comportamento de produção.
- O modelo atual usa frequencias historicas segmentadas, nao uma rede neural profunda.
- Dados de cartoes e escanteios dependem da disponibilidade real nas fontes.
- O projeto tem finalidade academica e educacional.
