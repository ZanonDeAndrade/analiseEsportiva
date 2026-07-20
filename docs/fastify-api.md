# API Fastify `/v1`

- Estado: implementado
- Data: 2026-07-15
- ADR: [`0001-fastify-http-framework.md`](adr/0001-fastify-http-framework.md)

## Escopo e invariantes

A interface HTTP foi migrada de uma cadeia manual de `node:http` para Fastify 5. O
domínio, os schemas dos mercados, `dados_insuficientes` e o aviso de que dados
históricos não garantem resultados continuam invariantes. A API não recomenda
apostas, não promete retorno e não expõe marcas de casas de apostas.

O runtime usa PostgreSQL como fonte de verdade. Nenhuma rota grava estado
persistente em `backend/data/` ou `backend/artifacts/`. `organization_id`, papel,
permissão e estado de assinatura são resolvidos no servidor; campos homônimos no
corpo, query, path ou header não concedem acesso.

## Composição

`backend/src/httpApp.ts` é o composition root HTTP. Os plugins têm responsabilidades
separadas:

| Plugin | Responsabilidade |
| --- | --- |
| `security` | CORS por allowlist, Helmet e `Content-Type` JSON estrito |
| `errors` | problema seguro e uniforme, sem stack em produção |
| `observability` | contadores em memória por rota/status |
| `safe-logging` | log mínimo e `X-Request-Id`, sem token, cookie ou payload |
| `timeout` | prazo máximo por resposta |
| `rate-limit` | limite global por IP, inclusive antes de validar token |
| `authentication` | valida access token e materializa a identidade local |
| `tenancy` | deriva organização ativa da sessão e membership |
| `authorization` | aplica a matriz central de permissões |

Handlers dependem de portas de aplicação/repositórios, não de SDKs externos. O
Fastify usa TypeBox no boundary, com tipos TypeScript derivados por `Static` quando
aplicável. O OpenAPI 3.1 nasce dos mesmos schemas.

## Contrato de erro

Erros usam `application/problem+json`:

```json
{
  "type": "https://betintel.ai/problems/validation_error",
  "title": "Requisição inválida",
  "status": 400,
  "code": "validation_error",
  "detail": "Um ou mais campos são inválidos.",
  "requestId": "b3b18aec-57a4-42db-89f7-f73f303fd4dd"
}
```

O `requestId` também é retornado em `X-Request-Id`. Somente UUID válido enviado pelo
cliente é reutilizado. Falhas inesperadas viram `internal_error`; mensagem original
e stack nunca entram na resposta de produção.

## Rotas canônicas

Saúde é pública. As demais rotas exigem identidade e membership válidas, além da
permissão declarada no schema da rota.

| Método e rota | Função |
| --- | --- |
| `GET /v1/health/live` | liveness sem dependência externa |
| `GET /v1/health/ready` | readiness de PostgreSQL e Redis; informa apenas se modelo ativo existe |
| `GET /v1/markets` | catálogo acadêmico de mercados |
| `GET /v1/competitions` | competições persistidas |
| `GET /v1/fixtures` | fixtures reais persistidas e filtradas |
| `GET /v1/fixtures/:id` | fixture por identificador |
| `POST /v1/predictions` | inferência somente com modelo ativo pronto |
| `GET /v1/evaluations/latest` | última avaliação pronta |
| `GET /v1/backtests/latest` | último backtest pronto |
| `GET /v1/models/active` | metadados do modelo ativo |
| `/v1/me`, `/v1/account/*` | conta e sessões |
| `/v1/organizations*`, `/v1/organization/*` | organização, membros e convites |
| `POST /v1/billing/portal` | porta de portal; responde `503` sem gateway aprovado |
| `GET /v1/billing/overview` | catálogo server-side e estado local reconciliado |
| `POST /v1/billing/checkout` | aceite explícito; servidor resolve Price ID |
| `POST /webhooks/stripe` | corpo bruto, assinatura Stripe e deduplicação |
| `GET /v1/internal/observability` | contadores protegidos por `system.manage` |

Rotas administrativas protegidas são assíncronas:

- `POST /v1/admin/jobs/sports-sync`;
- `POST /v1/admin/jobs/model-training`;
- `POST /v1/admin/jobs/evaluation`;
- `POST /v1/admin/jobs/backtest`;
- `GET /v1/admin/jobs/:id`.

Os `POST` exigem `Idempotency-Key`, gravam apenas metadados duráveis com status
`queued` e trilha de auditoria e retornam `202`. Eles não executam sync, treino,
avaliação ou backtest no event loop HTTP. Somente o solicitante owner/admin pode
consultar seu job; a migration `0006_system_job_rls.sql` reforça essa regra no banco.

## OpenAPI

Em ambiente diferente de produção:

- UI: `GET /docs`;
- documento JSON: `GET /docs/json`.

Os hooks globais mantêm a documentação protegida. Em produção, a UI não é
registrada. O documento é testado para conter as rotas canônicas e não publicar as
rotas pesadas antigas.

## Limites e configuração

| Variável | Padrão | Regra |
| --- | --- | --- |
| `CORS_ALLOWED_ORIGINS` | localhost em desenvolvimento | obrigatória e sem `*` em produção |
| `HTTP_BODY_LIMIT_BYTES` | `1000000` | inteiro positivo |
| `HTTP_REQUEST_TIMEOUT_MS` | `15000` | inteiro positivo |
| `HTTP_RATE_LIMIT_MAX` | `120` | inteiro positivo por janela |
| `HTTP_RATE_LIMIT_WINDOW` | `1 minute` | janela aceita pelo plugin |
| `ENABLE_LEGACY_HTTP_ROUTES` | `false` | habilita aliases apenas durante migração |
| `LOG_LEVEL` | `info` | nunca remove as regras de redaction |

Cookies não são usados pela API atual; o SPA envia bearer token. Se autenticação por
cookie for introduzida, CSRF passa a ser requisito bloqueante antes da ativação.

## Compatibilidade e desativação

Com `ENABLE_LEGACY_HTTP_ROUTES=true`, aliases antigos recebem `Deprecation: true`,
`Sunset: Thu, 15 Oct 2026 00:00:00 GMT` e `Link` para a rota sucessora. A flag fica
desligada por padrão. `/train` e `/sync-data` nunca voltam a executar trabalho
síncrono: apenas criam jobs protegidos. O frontend já usa `/v1/fixtures` e
`/v1/predictions`.

Critério para remover os aliases: trinta dias sem chamadas legítimas nos logs, todos
os clientes em `/v1` e runbook de rollback aprovado. Depois disso, remover plugin,
flag e testes de compatibilidade em uma release separada.

## Observabilidade e dados seguros

Logs estruturados contêm somente evento, request ID, método, template da rota,
status e duração. Authorization, cookies e API keys são redigidos. Corpo, query com
PII, tokens Auth0, payloads financeiros e segredos não são registrados.

O contador interno atual é local ao processo e útil para diagnóstico de uma
instância. Métricas agregadas e traces entre réplicas ainda dependem do backend de
observabilidade da PaaS.

## Redis e workers

Quando `REDIS_URL` está configurada, o rate limit é compartilhado entre réplicas e
falha fechado. O outbox PostgreSQL, dispatcher BullMQ, workers e scheduler estão
implementados em processos separados; detalhes operacionais estão em
[`async-jobs.md`](async-jobs.md). Jobs já gravados no outbox não são perdidos durante
indisponibilidade do Redis; novos requests podem ser recusados pelo rate limit
fail-closed até a recuperação.

O gateway Stripe está implementado de forma opt-in e permanece desativado por
padrão. Configuração e gates estão em [`stripe-billing.md`](stripe-billing.md).

## Testes e reprodução

```bash
npm run build
npm run backend:test
TEST_DATABASE_URL=postgresql://... BETINTEL_REQUIRE_DB_TESTS=true npm run db:test
node --test evals/*.test.mjs
```

A suíte cobre schema inválido, auth/RBAC, rate limit, payload excessivo,
content-type, timeout, ocultação de erro, OpenAPI, feature flag, job idempotente e
isolamento RLS em PostgreSQL real.

## Rollback

1. Não reverta migrations destrutivamente. Desative tráfego para a release nova.
2. Se um consumidor legado ainda existir, habilite temporariamente
   `ENABLE_LEGACY_HTTP_ROUTES=true`; os aliases continuam protegidos e assíncronos.
3. Restaure a imagem anterior compatível com as migrations expand-only já aplicadas.
4. Preserve `ops.background_jobs` e `ops.audit_log`; cancelar/reprocessar jobs exige
   decisão operacional explícita e chave idempotente.
5. Só reverta `0006_system_job_rls.sql` após impedir criação de jobs de sistema e
   confirmar que não há worker ativo. O rollback SQL é restaurar a policy anterior
   de `0005`, nunca desativar RLS.

Sinal de rollback: aumento sustentado de `5xx`, falha de readiness, quebra de
contrato OpenAPI ou evidência de autorização incorreta. Respostas `4xx` esperadas e
jobs apenas aguardando worker não justificam relaxar controles de segurança.
