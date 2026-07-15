# Runbook de investigação

Pré-condições: incidente aberto, janela UTC definida, acesso read-only auditado e
IDs internos obtidos do chamado. Nunca consultar payload de webhook, token, e-mail
ou dados financeiros brutos. Substitua variáveis `:request_id`, `:job_id`,
`:organization_id`, `:model_version_id` e timestamps nos exemplos.

## 1. Vazamento entre tenants

Comece pelo request e compare tenant do log, sessão e auditoria:

~~~sql
select id, created_at, organization_id, actor_user_id, action, target_type, target_id
from ops.audit_log
where request_id = :'request_id'::uuid
order by created_at;
~~~

Verifique se o ator possuía membership ativa no tenant observado:

~~~sql
select m.organization_id, m.user_id, m.role, m.status, m.created_at, m.revoked_at
from iam.memberships m
where m.user_id = :'user_id'::uuid
  and m.organization_id in (:'expected_organization_id'::uuid, :'observed_organization_id'::uuid);
~~~

Busque `requestId`/`traceId` no log e no trace. Confirme span PostgreSQL com RLS
ativa. Preserve evidências, revogue sessão/API keys e interrompa exportações antes
de qualquer correção. Não desligue RLS para reproduzir.

## 2. Alteração indevida

~~~sql
select created_at, actor_user_id, action, target_type, target_id,
       metadata -> 'before' as before_state,
       metadata -> 'after' as after_state,
       request_id
from ops.audit_log
where target_type = :'target_type'
  and target_id = :'target_id'
  and created_at between :'from_utc'::timestamptz and :'to_utc'::timestamptz
order by created_at;
~~~

Correlacione o `request_id` com método/rota/status e confirme papel da membership
naquele instante. Falta de evento para uma mudança persistida é incidente de
auditoria, não autorização para reconstruir uma linha manualmente.

## 3. Acesso administrativo

~~~sql
select created_at, organization_id, actor_user_id, action, target_id, request_id,
       metadata -> 'after' as requested_operation
from ops.audit_log
where action like 'admin.%'
   or action in ('membership.role_changed', 'organization.ownership_transferred')
order by created_at desc
limit 200;
~~~

Para o request suspeito, consulte sessão e revogação:

~~~sql
select provider_session_id, user_id, organization_id, authenticated_at,
       last_seen_at, revoked_at, revoked_reason
from iam.session_metadata
where user_id = :'user_id'::uuid
order by last_seen_at desc;
~~~

Eventos MFA e attack protection são pesquisados no Auth0 Log Stream pelo `sub` e
janela UTC, sem copiar token/código para o chamado.

## 4. Falha de pagamento

~~~sql
select i.id, i.organization_id, i.status, i.currency,
       i.amount_due_minor, i.amount_paid_minor, i.due_at, i.updated_at
from billing.invoices i
where i.organization_id = :'organization_id'::uuid
order by i.created_at desc;

select provider, event_type, status, occurred_at, received_at, processed_at, failure_code
from billing.webhook_events
where received_at between :'from_utc'::timestamptz and :'to_utc'::timestamptz
order by received_at;
~~~

PromQL: `betintel_webhook_events{status="failed"}` e
`betintel_billing_reconciliation_divergences`. Nunca abrir payload financeiro; use
hash/event ID diretamente no painel do gateway com acesso de finanças.

## 5. Análise incorreta

~~~sql
select mv.id, mv.model_key, mv.version, mv.dataset_version_id, mv.status,
       mv.training_rows, mv.payload_sha256, mv.trained_at, mv.activated_at,
       mv.source_job_id
from model.model_versions mv
where mv.id = :'model_version_id'::uuid;

select e.kind, e.generated_at, e.train_rows, e.test_rows, e.metrics,
       e.baselines, e.ignored_markets, e.source_job_id
from model.evaluations e
where e.model_version_id = :'model_version_id'::uuid
order by e.generated_at desc;
~~~

Compare Brier/calibração/baselines, dataset e `dados_insuficientes`; não substitua
modelo ausente por probabilidade simulada. Use `source_job_id` para seguir trace e
logs do treino/backtest.

## 6. Importação errada

~~~sql
select id, dataset_key, version, content_sha256, status,
       accepted_rows, rejected_rows, duplicate_rows, ambiguous_rows,
       source_providers, created_at
from model.dataset_versions
where id = :'dataset_version_id'::uuid;

select id, job_type, status, attempts, failure_code, request_id,
       dataset_version_id, model_version_id, created_at, completed_at
from ops.background_jobs
where dataset_version_id = :'dataset_version_id'::uuid
order by created_at;
~~~

PromQL: `betintel_sports_data_age_seconds` e quota do provider. Pause ingestão e
ativação de modelo; corrija por novo dataset/versionamento, nunca editando o
dataset histórico silenciosamente.

## 7. Indisponibilidade

PromQL inicial:

~~~promql
up{job="betintel-api"}
betintel_dependency_up{dependency=~"postgresql|redis"}
sum by (route, status_code) (rate(betintel_http_requests_total[5m]))
histogram_quantile(0.99, sum by (le, route) (rate(betintel_http_request_duration_seconds_bucket[10m])))
sum by (queue, status) (betintel_queue_depth)
sum by (provider, outcome) (rate(betintel_external_api_requests_total[10m]))
~~~

Abra o trace mais lento/erro pelo exemplar ou `traceId`; identifique o primeiro
span falho entre HTTP, PostgreSQL, Redis, BullMQ e provider. Compare deploy/release,
readiness e fila. Execute rollback somente se a imagem for causal e mantenha
migrations expand-only. Registre horário do alerta, reconhecimento humano,
mitigação, RPO/RTO observado e follow-up.

