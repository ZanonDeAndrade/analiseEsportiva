# ADR 0009 — Separação entre dados esportivos compartilhados e dados privados

- Estado: Proposto
- Data: 2026-07-15
- Decisores: engenharia, segurança, produto e jurídico

## Contexto

Dados de competições, times, partidas, estatísticas e modelos globais descrevem o mesmo evento para todos os clientes. Duplicá-los por tenant aumenta custo e inconsistência. Análises salvas, preferências, exportações, assinatura e auditoria pertencem a uma organização e exigem isolamento rigoroso.

## Decisão

Separar classificação, schema, ownership e políticas de acesso. `organization_id` é o identificador canônico; “tenant context” é o contexto resolvido no servidor.

### Dados compartilhados

Tabelas no schema `sports`, como `providers`, `competitions`, `seasons`, `teams`, `fixtures`, `match_results`, `match_statistics`, `market_observations`, `model_versions` e `evaluation_reports`:

- não possuem `organization_id` nem `tenant_id`;
- são ingeridas por jobs de sistema a partir de fontes com licença aprovada;
- podem ter acesso condicionado a entitlement, sem mudar sua propriedade compartilhada;
- não incorporam odds como recomendação e preservam proveniência/licença.

### Dados privados

Recursos como `private.analysis_requests`, `private.saved_analyses`, `private.exports`, `private.preferences`, `billing.customers`, `billing.subscriptions`, `billing.entitlements` e eventos privados:

- têm `organization_id UUID NOT NULL` e chave estrangeira;
- incluem `organization_id` em uniques e índices de acesso quando necessário;
- nunca recebem o valor a partir do body/query/header como fonte de verdade;
- são acessados com contexto derivado de identidade verificada e membership local ativa.

Uma URL pode conter slug organizacional para navegação, mas o servidor o valida contra a membership e resolve o UUID. O body dos recursos não expõe campo mutável de tenant. Operações globais têm `scope='system'`; operações privadas têm `scope='organization'` e constraint que exige `organization_id`, evitando IDs fictícios.

### Defesa em profundidade

- habilitar e forçar RLS em toda tabela privada;
- papel da aplicação não é owner e não possui `BYPASSRLS`;
- por transação, o adapter executa `SET LOCAL app.organization_id = ...` antes das queries privadas;
- política usa o setting para `USING` e `WITH CHECK`, com default deny quando contexto está ausente;
- repositories ainda filtram por organização para clareza, mas esse filtro não substitui RLS;
- roles de migration, ingestão esportiva e suporte são separadas e mínimas;
- jobs e exports revalidam organização/entitlement ao executar, não apenas ao enfileirar;
- testes tentam leitura, criação, atualização e exclusão cruzadas entre duas organizações.

Exemplo conceitual, a ser materializado por migration revisada:

```sql
ALTER TABLE private.saved_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.saved_analyses FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_isolation ON private.saved_analyses
USING (organization_id = current_setting('app.organization_id', true)::uuid)
WITH CHECK (organization_id = current_setting('app.organization_id', true)::uuid);
```

## Consequências

### Positivas

- Dados esportivos são armazenados uma vez e privados têm limite verificável.
- RLS reduz o impacto de uma query que esqueça o filtro.
- A classificação orienta cache, storage, logs, retenção e jobs.

### Custos e riscos

- Pooling exige transação e `SET LOCAL` corretos para impedir vazamento de contexto.
- Roles proprietárias podem contornar RLS; testes precisam usar o papel real da aplicação.
- Alguns registros operacionais mistos exigem `scope` e constraints explícitas.

## Alternativas rejeitadas

- `tenant_id` em todas as tabelas, inclusive partidas: duplica dados comuns e cria semântica falsa.
- Confiar somente em filtros da aplicação: um erro de query vira exposição entre organizações.
- Schema/banco por organização: custo e migrations excessivos na escala inicial.
- Aceitar header `X-Tenant-ID` como autoridade: permite selecionar organização sem prova de membership.

## Validação e rollback

- Catálogo de dados classifica toda tabela/objeto antes da migration.
- CI falha se uma tabela marcada privada não tiver `organization_id NOT NULL`, FK, RLS e testes negativos.
- Ativação começa em endpoints privados piloto; dados compartilhados permanecem acessíveis pelo caminho existente.
- Rollback desativa o endpoint piloto. É proibido “resolver” incidente desligando RLS ou aceitando tenant do cliente.

## Referências

- [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Drizzle: Row-Level Security](https://orm.drizzle.team/docs/rls)
