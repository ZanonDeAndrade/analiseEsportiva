# Criterios de Aceite

## Frontend

- A aplicacao carrega com header, filtros, lista de jogos e painel de analise.
- Copa do Mundo 2026 aparece no filtro lateral.
- O frontend tenta carregar fixtures do backend.
- Se o backend falhar, a UI mostra estado amigavel sem substituir por jogos mockados.
- O painel mostra competicao/liga, data/hora, fonte, `updatedAt`, mercados disponiveis e ignorados.
- O aviso etico aparece: "Analise baseada em dados historicos. Nao garante resultado."
- Nao ha logos, odds ou textos de casas de aposta.

## Backend

- `GET /v1/health/live` e `GET /v1/health/ready` distinguem liveness e readiness.
- `GET /v1/markets` lista os mercados obrigatorios.
- `GET /v1/competitions` e `GET /v1/fixtures` consultam PostgreSQL sem fallback simulado.
- `POST /v1/predictions` usa somente modelo ativo pronto e preserva `dados_insuficientes`.
- `GET /v1/evaluations/latest`, `/v1/backtests/latest` e `/v1/models/active` consultam artefatos prontos.
- Rotas privadas exigem identidade, membership e permissao verificadas no backend.
- Sync, treino, avaliacao e backtest HTTP apenas registram jobs idempotentes protegidos; nao bloqueiam o event loop.
- Schemas runtime geram OpenAPI; erros usam codigo estavel e `requestId` sem stack.
- Limite de corpo, timeout, CORS allowlist, headers seguros, content-type estrito e rate limit estao ativos.
- Aliases antigos ficam desligados por padrao e so podem ser ativados por feature flag com deprecacao.

## Dados e Modelo

- Labels de gols seguem `FTHG + FTAG`.
- 1X2 deriva `H`, `D`, `A`.
- Dupla chance deriva 1X2.
- Cartoes usam `HY + AY + HR + AR` quando existirem.
- Escanteios usam `HC + AC` quando existirem.
- Ausencia de cartoes/escanteios retorna `dados_insuficientes`.
- Copa do Mundo e segmentada como `competition=World Cup 2026`.

## Jobs e Operacao

- API apenas consulta resultados prontos ou grava outbox idempotente.
- Filas separadas cobrem ingestao, normalizacao, treino, avaliacao, backtest,
  exportacao, notificacao e reconciliacao de billing.
- Retry usa backoff exponencial com jitter e esgotamento registra DLQ sem payload.
- Treino concorrente do mesmo dataset e bloqueado no PostgreSQL.
- Circuit breaker e cotas impedem abuso de providers sem gerar dados simulados.
- Scheduler e workers executam em processos escalaveis separados da API.
- Jobs globais nao carregam `organization_id`; jobs privados exigem organizacao.
- Admin de filas exige `system.manage` e nao expoe Redis/BullMQ publicamente.

## Infraestrutura

- Imagem multi-stage executa como usuario nao-root e nao contem secrets nem toolchain.
- Compose local aplica migrations antes de iniciar a API.
- Configuracao e validada no boot; `.env` existe somente no desenvolvimento local.
- Liveness nao consulta dependencias; readiness exige PostgreSQL e Redis e falha com 503.
- API, worker e scheduler fazem shutdown gracioso.
- CI usa instalacao reproduzivel, lint, typecheck, testes reais, audit, build e scan.
- Migrations sao controladas antes do deploy do mesmo digest em staging/production.
- Production depende de aprovacao no GitHub Environment.
- Falha de deploy/smoke aciona rollback Render para o deploy anterior.
- TLS/redirect ficam na borda e HSTS/headers seguros ficam ativos na aplicacao.
- Backup PITR, retencao, restore drill, RPO e RTO seguem o runbook operacional.
- Go-live exige evidencias reais de rollback em staging e restauracao PITR.

## Observabilidade

- Logs HTTP e worker são JSON correlacionáveis por request/job/trace e passam por redação central.
- Métricas cobrem RED, runtime, banco, Redis, filas, providers, dados insuficientes, modelo e billing.
- OpenTelemetry liga HTTP, PostgreSQL, Redis, outbox/BullMQ e API externa por W3C Trace Context.
- Sentry recebe release e erros sanitizados; source maps privados não entram na imagem.
- Audit log permanece append-only e consultável por ator, organização, alvo, ação e request.
- Regras de alerta e runbook cobrem os sete cenários obrigatórios.
- Go-live exige `alert_drill_human_acknowledged` emitido por integração real do pager.

## Validacao

- `npm install` executa.
- `npm run build` passa.
- `npm run backend:test` passa.
- `npm run backend:sync` funciona com API key/licenca valida e nunca inventa dados como fallback.
- `npm run backend:train`, `backend:evaluate` e `backend:backtest` persistem resultados no PostgreSQL.
