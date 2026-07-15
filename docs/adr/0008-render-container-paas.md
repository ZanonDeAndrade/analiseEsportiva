# ADR 0008 — Containers em PaaS gerenciada, sem Kubernetes

- Estado: Aceito com gate operacional
- Data: 2026-07-15
- Decisores: engenharia, segurança e operações

## Contexto

O projeto precisa de deploy reproduzível para API, worker e tarefas agendadas, mas ainda não tem escala nem equipe operacional que justifiquem Kubernetes. A infraestrutura deve reforçar statelessness e permitir rollback de versão.

## Decisão

Usar containers OCI em Render como PaaS inicial, sujeito a validação de região, SLO, custo, privacidade e suporte. Não adotar Kubernetes nesta fase.

Topologia proposta:

- frontend estático servido por CDN;
- web service Fastify com escala horizontal;
- background worker com a mesma imagem e comando diferente;
- cron/scheduler apenas publica jobs idempotentes;
- pre-deploy job único aplica migrations;
- Render Postgres e Redis-compatible quando cumprirem os requisitos dos ADRs 0002 e 0004;
- AWS S3 externo para objetos.

O container será multi-stage, executará como usuário não-root, terá dependências fixadas e imagem identificada por commit. Configuração e segredos entram pelo ambiente/secret store; não entram na imagem. `/v1/health/live` verifica processo e `/v1/health/ready` verifica dependências necessárias com timeout. O filesystem é efêmero e não é fonte de verdade.

A fundacao foi implementada com Dockerfile por digest, Compose exclusivamente
local, validacao de boot, GitHub Actions, scan, deploy Render por digest, smoke e
rollback automatico. O runbook, backup e gates de evidencia estao em
[`docs/infrastructure-operations.md`](../infrastructure-operations.md).

Observabilidade mínima: logs estruturados com redaction, métricas RED, métricas de filas, tracing/correlation ID, alertas e trilha de deploy. Ambientes de preview não recebem dados de produção.

## Consequências

### Positivas

- Menor carga operacional e deploy/rollback por imagem.
- Separação clara entre API, worker e migration.
- A ausência de volume persistente expõe cedo dependências indevidas de disco.

### Custos e riscos

- Lock-in de configuração, limites da PaaS, cold start e disponibilidade regional.
- Zero downtime depende de health checks e migrations retrocompatíveis.
- Serviços gerenciados precisam de orçamento e monitoramento próprios.

## Alternativas rejeitadas

- Kubernetes: complexidade operacional desproporcional nesta fase.
- VM única com PM2/systemd: cria ponto único e operação manual.
- Serverless functions para todo o backend: tarefas longas e conexões de worker não se ajustam tão bem ao modelo inicial.

## Validação e rollback

- Provar deploy de staging, migration, health checks, SIGTERM com graceful shutdown e processamento de job sem perda.
- Fazer canary/blue-green quando disponível e smoke test antes de ampliar tráfego.
- Rollback seleciona a imagem anterior, desde que migrations sejam expand/contract. Se readiness falhar, o deploy não recebe tráfego.
- Reavaliar PaaS quando SLO, requisito regional, custo ou escala demonstrarem incompatibilidade; isso não implica Kubernetes automaticamente.

O estado aceito nao comprova operacao externa: go-live exige uma execucao real
do rollback drill em staging, restore PITR ensaiado, secrets/environments
protegidos e RPO/RTO medidos.

## Referências

- [Render: Deploys](https://render.com/docs/deploys)
- [Render: Docker](https://render.com/docs/docker)
- [Render: Background workers](https://render.com/docs/background-workers)
- [Render: Service types](https://render.com/docs/service-types)
