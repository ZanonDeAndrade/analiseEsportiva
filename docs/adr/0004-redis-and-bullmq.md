# ADR 0004 — Redis para cache/rate limit e BullMQ para filas

- Estado: Aceito e implementado
- Data: 2026-07-15
- Decisores: engenharia e operações

## Contexto

Cache local, rate limit por processo e tarefas longas síncronas não funcionam de modo consistente com várias réplicas. Sincronização, treino, avaliação, backtest e exportação precisam de execução assíncrona observável.

## Decisão

Usar Redis gerenciado para estado efêmero distribuído e BullMQ para filas. O desenho separa as cargas:

- instância/cache namespace para cache-aside e rate limit, com política de eviction e chaves prefixadas por ambiente;
- instância dedicada a BullMQ com `maxmemory-policy=noeviction`, persistência e retenção compatíveis com a criticidade aprovada;
- conexões de produtores configuradas para falhar rapidamente; workers usam conexões persistentes conforme as exigências do BullMQ;
- filas distintas para ingestão, normalização, treino, avaliação, backtest, exportação, notificação e reconciliação de billing, cada uma com concorrência, timeout, retry e dead-letter definidos;
- `job_id`, `request_id`, ator e `organization_id` derivados pelo servidor em metadados mínimos; jobs globais usam `scope=system` e não simulam uma organização;
- idempotência por chave de negócio, transactional outbox no PostgreSQL para publicação e inbox para webhooks;
- cache nunca é fonte de verdade e jamais contém tokens, payloads de pagamento ou PII desnecessária;
- limites combinam IP/identidade/organização conforme a rota, sempre a partir de contexto verificado.

## Consequências

### Positivas

- API responde sem manter conexão durante trabalho longo.
- Limites e cache são consistentes entre réplicas.
- Retry, atraso e observabilidade ficam explícitos.

### Custos e riscos

- Redis e workers aumentam custo e operação.
- Entrega é “pelo menos uma vez”; handlers precisam ser idempotentes.
- Uma única instância com políticas incompatíveis pode perder jobs ou tornar o cache imprevisível.

## Alternativas rejeitadas

- Memória do processo: inconsistente entre réplicas e perdida em deploy.
- Cron executando comandos locais: não oferece coordenação, retry ou trilha por job.
- Kafka/SQS nesta fase: adicionam complexidade antes de existir escala que a justifique; a porta de fila permite troca futura.

## Validação e rollback

- Testar job duplicado, crash depois do efeito e antes do ack, retry esgotado e indisponibilidade do Redis.
- Medir profundidade, idade do job mais antigo, taxa de falha, duração e dead letters sem payload sensível.
- Rollback: pausar scheduler/dispatcher, drenar workers e preservar Redis/outbox/DLQ. O caminho HTTP síncrono pesado não volta a ser habilitado; uma correção operacional usa CLI/worker controlado e chave idempotente.

## Referências

- [BullMQ: Connections](https://docs.bullmq.io/guide/connections)
- [BullMQ: Going to production](https://docs.bullmq.io/guide/going-to-production)
