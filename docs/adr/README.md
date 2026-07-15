# Registro de decisões de arquitetura

Os ADRs deste diretório descrevem a arquitetura-alvo proposta para a evolução incremental do BetIntel AI. O estado `Proposto` significa que a decisão ainda depende de revisão técnica, validação de negócio e, quando indicado, análise jurídica ou contratual. Nenhum ADR autoriza por si só a contratação de fornecedor ou a ativação de cobrança.

| ADR | Decisão | Estado |
| --- | --- | --- |
| [0001](0001-fastify-http-framework.md) | Fastify como framework HTTP | Aceito e implementado |
| [0002](0002-managed-postgresql.md) | PostgreSQL gerenciado como banco principal | Proposto |
| [0003](0003-drizzle-orm-and-migrations.md) | Drizzle ORM e migrations SQL versionadas | Proposto |
| [0004](0004-redis-and-bullmq.md) | Redis para cache/rate limit e BullMQ para filas | Aceito e implementado |
| [0005](0005-managed-identity-provider.md) | Identidade gerenciada atrás de uma porta própria | Proposto |
| [0006](0006-stripe-recurring-billing.md) | Stripe Billing atrás de um gateway próprio | Proposto |
| [0007](0007-object-storage.md) | Object storage S3-compatible | Proposto |
| [0008](0008-render-container-paas.md) | Containers em PaaS gerenciada, sem Kubernetes | Proposto |
| [0009](0009-shared-and-organization-data.md) | Separação entre dados esportivos e dados privados | Proposto |

## Convenções

- Data da proposta: 2026-07-15.
- `organization_id` é o identificador canônico de isolamento. “Tenant” descreve o contexto de execução, não um campo enviado pelo cliente.
- Mudanças destrutivas seguem expand/contract e só ocorrem depois da retirada comprovada dos consumidores antigos.
- ADR substituído permanece no histórico com link para o sucessor.
- Segurança, licenciamento de dados e ausência de recomendação de apostas são restrições, não opções de produto.
