# Observabilidade de produção

## Objetivo e arquitetura

O BetIntel AI emite sinais correlacionáveis sem registrar conteúdo do usuário:

~~~text
HTTP request -> PostgreSQL/Redis -> outbox(trace_context) -> BullMQ job
     |                    |                         |
 requestId + traceId      métricas                  jobId + traceId
     |                                              |
 logs JSON / Sentry                    API externa / modelo / dataset
~~~

OpenTelemetry é carregado com `--import` antes dos módulos da aplicação. O
exportador OTLP envia traces e métricas para um collector gerenciado. A
instrumentação automática cobre HTTP, Fastify, `pg` e `ioredis`; spans manuais
ligam consumo BullMQ e chamadas de providers. `traceparent`/`tracestate` são
persistidos em `ops.background_jobs.trace_context` e copiados para o job.

O endpoint `GET /v1/internal/metrics` expõe Prometheus e aceita exclusivamente a
credencial de serviço `METRICS_BEARER_TOKEN`. JWT de usuário, tenant enviado pelo
cliente ou cookie não autorizam scrape. `/v1/internal/observability` permanece
para administradores com `system.manage`.

## Logs e redação

Todos os processos escrevem uma linha JSON por evento. HTTP concluído contém
`requestId`, `traceId`, `spanId`, `userId`, `organizationId`, rota normalizada,
método, status e `durationMs`. Worker contém também `jobId`, fila, tentativa,
`datasetVersion` e `modelVersion`.

`telemetry/redaction.ts` remove recursivamente authorization, cookies, senhas,
tokens, secrets, API keys, DSN, e-mail, telefone, endereço, cartão, payload/body,
JWT, bearer e query string de URL. Mensagem/stack de exceção não entra no log.
Pino repete a redação no boundary HTTP. IDs internos são permitidos somente para
correlação e os labels de métricas nunca contêm usuário, organização, request ou
job, evitando cardinalidade e exposição.

Retenção mínima configurada no backend de observabilidade:

| Categoria | Retenção online | Acesso |
| --- | ---: | --- |
| logs HTTP/aplicação | 30 dias | engenharia/plantão |
| logs de segurança e identidade | 90 dias | segurança |
| traces | 14 dias | engenharia/segurança |
| métricas raw | 30 dias | engenharia/plantão |
| métricas agregadas | 13 meses | engenharia/SRE |
| `ops.audit_log` | 365 dias online; arquivo conforme parecer de retenção | segurança/compliance |
| eventos financeiros sem payload | 365 dias online; arquivo conforme parecer | finanças/compliance |

Não há exclusão automática do audit log nesta etapa: arquivamento/expurgo precisa
de migration particionada, legal hold e parecer de privacidade. Log storage usa
criptografia, RBAC, MFA e exportação desabilitada por padrão.

## Métricas

- RED HTTP: `betintel_http_requests_total` e
  `betintel_http_request_duration_seconds` por rota normalizada/método/status;
- CPU, memória, GC e event loop: métricas default `betintel_process_*` e
  `betintel_nodejs_*`;
- PostgreSQL: pool por estado, disponibilidade e duração dos probes/coletores;
- Redis: `betintel_dependency_up{dependency="redis"}`;
- cache: `betintel_cache_operations_total{cache,result="hit|miss"}`; o adapter
  deve chamar `recordCache` quando cache esportivo for ativado;
- filas/jobs: profundidade por fila/status, execução, falha e duração;
- providers: chamadas por resultado e razão de consumo da cota;
- domínio: predições, `dados_insuficientes` por mercado, treino/avaliação/backtest;
- billing: webhooks por estado e divergências da última reconciliação.

Labels são enums/rotas normalizadas. IDs de tenant, usuário, request, job,
fixture, dataset e modelo ficam apenas em logs/traces controlados.

## Erros e source maps

Sentry recebe somente erros 5xx e falhas finais de jobs. `sendDefaultPii=false`,
tracing próprio do Sentry fica desligado para não competir com OTel, breadcrumbs,
contexts e URL são sanitizados, e a release usa `APP_RELEASE` gravada na imagem.
Source maps backend são gerados no CI, enviados de forma privada com
`SENTRY_AUTH_TOKEN` e removidos da imagem runtime. Alertas agrupam por componente,
error code, rota ou fila; mensagem do usuário/payload não participa do alerta.

## Auditoria

`ops.audit_log` é append-only por trigger e protegido por RLS/FORCE RLS. Hoje são
gravados provisionamento/login de sessão, revogação, bloqueio/exclusão de conta,
mudanças de membership/owner, convites e jobs administrativos, sempre junto da
transação de negócio. MFA/recovery/attack protection permanecem no Auth0 e devem
chegar ao SIEM por Auth0 Log Stream; payload de autenticação não é copiado.

Quando billing, reembolso, chargeback, exportação e exclusão assíncrona forem
ativados, seus adapters devem gravar ações `billing.*`, `data.exported`,
`data.deleted`, `model.*` e `dataset.*` na mesma transação/outbox. A ausência do
adapter não é substituída por evento inventado.

## Alertas e ensaio humano

Regras versionadas ficam em `ops/observability/prometheus-alerts.yml`; o catálogo
inclui indisponibilidade, fila parada, erro/p99, PostgreSQL/Redis, dado desatualizado,
cota, backup e billing/webhook. Backup usa o alerta nativo do PostgreSQL gerenciado.

O workflow manual `alert_drill=true` chama `npm run alert:drill`. O ensaio envia
somente um identificador aleatório e falha se o endpoint do pager não confirmar
um reconhecimento humano dentro do prazo. Segredos necessários:

- `ALERT_DRILL_WEBHOOK_URL`;
- `ALERT_DRILL_ACK_URL`;
- `ALERT_DRILL_BEARER_TOKEN`.

HTTP 2xx de entrega não é aceito como evidência humana; somente o evento
`alert_drill_human_acknowledged`. Sem integração real do pager, esse critério
permanece bloqueado.

## Configuração e rollback

Produção exige `APP_RELEASE`, `OTEL_SERVICE_NAME`,
`OTEL_EXPORTER_OTLP_ENDPOINT` HTTPS, `SENTRY_DSN` e
`METRICS_BEARER_TOKEN` com no mínimo 32 caracteres. Tokens OTLP/Sentry ficam no
secret manager e são transmitidos por headers configurados pelo ambiente oficial
do exporter, nunca versionados.

Rollback: reverter a imagem e manter a migration `0008` (expand-only). Desabilitar
export temporariamente removendo os endpoints/headers OTLP não pode derrubar a
aplicação. Se telemetria causar degradação, reduzir sampling no collector, depois
desligar exporter; não remover logs de segurança nem o audit log.

