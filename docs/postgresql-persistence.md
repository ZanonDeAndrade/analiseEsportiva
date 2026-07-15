# Persistência PostgreSQL

## Escopo implementado

PostgreSQL é agora a única fonte de estado persistente do runtime. API, sincronização, treino, avaliação e backtest não escrevem em `backend/data` nem `backend/artifacts`. Esses diretórios são lidos exclusivamente pelo importador de legado.

Drizzle fica confinado a `backend/src/infrastructure/database`; domínio e HTTP dependem das interfaces em `backend/src/application/ports/persistence.ts`.

## Schemas

| Schema | Tabelas principais | Escopo |
| --- | --- | --- |
| `iam` | organizations, users, memberships, invitations, api_keys, session_metadata | privado por organização quando aplicável |
| `billing` | plans, subscriptions, usage_records, invoices, webhook_events | catálogo compartilhado e registros privados |
| `sports` | competitions, seasons, teams, team_aliases, fixtures, match_results, match_stats | compartilhado; sem `organization_id` |
| `model` | dataset_versions, model_versions, model_segments, predictions, evaluations | modelo versionado; predictions usam scope explícito |
| `ops` | system_state, audit_log, exports, background_jobs | operação; recursos privados exigem organização |

As migrations usam `timestamptz` para instantes, UUIDs, FKs, checks e unique constraints por fonte/identificador externo. `ops.audit_log` possui trigger que rejeita `UPDATE` e `DELETE`. Nenhum segredo de API key ou payload bruto de pagamento é persistido: somente hashes e metadata mínima.

## Configuração

```text
DATABASE_URL=postgresql://usuario:senha@host:5432/betintel
DATABASE_POOL_MAX=10
```

`DATABASE_URL` é obrigatória. Ausência da variável interrompe o boot; não ativa filesystem nem dado simulado.

Exemplo local com Docker:

```bash
docker run --name betintel-postgres -d \
  -e POSTGRES_USER=betintel \
  -e POSTGRES_PASSWORD=troque-esta-senha \
  -e POSTGRES_DB=betintel \
  -p 5432:5432 postgres:17-alpine
```

## Migrations e reconstrução

```bash
npm run db:check
npm run db:migrate
```

Arquivos versionados:

- `0000_initial_postgresql.sql`: schemas, enums, tabelas, FKs, checks e índices;
- `0001_operational_guards.sql`: índices parciais, updated-at e auditoria append-only;
- `0002_system_state.sql`: metadata operacional compartilhada;
- `0003_evaluation_payload.sql`: payload versionado de avaliação/backtest.
- `0004_identity_access.sql`: sincronização, bloqueio e metadata segura de sessão;
- `0007_bullmq_jobs.sql`: outbox BullMQ, DLQ metadata-only, cotas de provider e idempotência de efeitos de modelo;
- `0005_organization_tenancy_rls.sql`: papéis canônicos, tenant ativo, RLS/FORCE
  RLS e owner único.

O teste de integração cria um database vazio, aplica todo o journal e exige as 27 tabelas de negócio. `drizzle-kit push` não faz parte do fluxo de produção.

## Importação do estado legado

Primeiro execute sem escrita:

```bash
npm run db:import -- --dry-run
```

Depois revise `accepted`, `rejected`, `duplicates`, `ambiguous` e cada item de `issues`. Para aplicar:

```bash
npm run db:import
```

Opções:

- `--data-dir caminho`: origem de CSV/fixtures;
- `--artifacts-dir caminho`: origem do modelo e relatórios;
- `--allow-demo-data`: permitido somente em ambiente descartável; produção rejeita providers mock/fallback.

O importador:

- aceita ISO 8601 e `DD/MM/AAAA`, rejeitando formatos ambíguos;
- normaliza aliases antes de criar times;
- calcula identificador determinístico quando a fonte não fornece ID;
- serializa a carga em transação com advisory lock;
- usa hash do conteúdo para idempotência;
- relata todas as linhas rejeitadas, duplicadas e ambíguas;
- termina não-zero quando há rejeições/ambiguidades, mesmo que linhas válidas tenham sido importadas.

## Testes PostgreSQL

```bash
TEST_DATABASE_URL=postgresql://usuario:senha@127.0.0.1:5432/postgres \
BETINTEL_REQUIRE_DB_TESTS=true \
npm run db:test
```

O usuário de teste precisa de permissão para criar e remover databases descartáveis. A suíte cobre banco reconstruído do zero, constraints, rollback, proteção append-only, concorrência, deduplicação por fonte, dry-run e duas instâncias HTTP com pools independentes no mesmo banco.

## Rollback

1. Antes do cutover, gerar snapshot/backup e registrar o journal aplicado.
2. Migrations são expand/contract; rollback preferencial é voltar a imagem da aplicação mantendo schema compatível.
3. Se uma migration falhar, sua transação é revertida e o deploy é interrompido.
4. Em banco sem tráfego de produção, a migration inicial pode ser revertida removendo o database descartável e reconstruindo-o.
5. Depois de qualquer escrita real, não executar `DROP SCHEMA` como rollback. Corrigir por nova migration ou restaurar snapshot após avaliar perda de dados.
6. O código antigo baseado em arquivos não deve ser reativado depois do cutover, porque criaria duas fontes de verdade.

O teste `transacao composta faz rollback integral` prova que efeitos anteriores ao erro não permanecem. A criação e remoção do database de integração exercita a reconstrução completa sem depender de estado local.

## Pendências e riscos

- Configurar backup/PITR e executar restore drill no PostgreSQL gerenciado.
- Provisionar em cada ambiente roles separadas de migration, API e ingestão. A
  role da API deve ser `NOSUPERUSER NOBYPASSRLS` e não proprietária das tabelas.
- Reiniciar qualquer processo antigo compilado antes desta migração, pois ele ainda pode conter código de escrita em arquivo na memória.
- Aprovar licença comercial das fontes antes de importar ou redistribuir dados em produção.
