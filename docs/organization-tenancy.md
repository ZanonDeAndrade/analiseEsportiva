# Organizações, RBAC e isolamento entre tenants

- Estado: implementado e validado localmente com PostgreSQL 17
- Migration: `backend/migrations/0005_organization_tenancy_rls.sql`
- Identificador canônico: `organization_id`; `tenant` descreve o contexto, não um
  valor autoritativo recebido do cliente

## Contexto ativo

Cada sessão Auth0 possui uma linha em `iam.session_metadata` com
`organization_id NOT NULL`. Na autenticação, o backend valida novamente usuário,
sessão, organização e membership ativa. A troca de organização recebe um ID apenas
como destino solicitado, confirma a membership no PostgreSQL e, somente depois,
persiste a nova organização na sessão.

Headers, query strings, path params ou campos como `tenant_id` e
`organization_id` nunca substituem o contexto da sessão. As rotas de recursos
privados não possuem organization ID no path; elas operam sobre o ator resolvido.

Em cada transação privada o adapter configura:

```sql
select set_config('app.user_id', $user_id, true);
select set_config('app.user_email', $verified_email, true);
select set_config('app.organization_id', $organization_id, true);
```

`true` equivale a `SET LOCAL`: o contexto desaparece no commit/rollback e não
vaza para a próxima requisição do pool.

## Matriz central de permissões

A fonte executável é `backend/src/application/authorization.ts`. Papéis não são
redefinidos em handlers ou repositories. `viewer` é o papel read-only.

| Permissão | owner | admin | member | viewer/read_only |
| --- | :---: | :---: | :---: | :---: |
| Criar/trocar/listar organização | sim | sim | sim | sim |
| Listar membros | sim | sim | sim | sim |
| Convidar/revogar convite | sim | sim | não | não |
| Alterar papel/remover membro | sim | sim, exceto owner/admin | não | não |
| Transferir propriedade | sim | não | não | não |
| Ler recursos privados | sim | sim | sim | sim |
| Escrever recursos privados | sim | sim | sim | não |
| Criar export/job privado | sim | sim | sim | não |
| Gerenciar API keys/auditoria | sim | sim | não | não |
| Sync/treino administrativo | sim | sim | não | não |

Somente transferência promove alguém a owner. Owner não pode se remover; admin
não altera/remove owner ou outro admin. A transferência exige autenticação de no
máximo cinco minutos e a constraint parcial garante um único owner ativo.

## API

| Método e rota | Operação |
| --- | --- |
| `GET /v1/organizations` | memberships do usuário e tenant ativo |
| `POST /v1/organizations` | cria organização e ownership, ativa na sessão |
| `POST /v1/organizations/switch` | valida membership e troca o tenant da sessão |
| `GET /v1/organization/members` | lista membros do tenant ativo |
| `GET /v1/organization/invitations` | lista convites com e-mail mascarado |
| `POST /v1/organization/invitations` | cria token aleatório de 256 bits, expira em 1–168h |
| `DELETE /v1/organization/invitations/:id` | revoga convite pendente |
| `POST /v1/invitations/accept` | aceita token uma vez e ativa a organização |
| `PATCH /v1/organization/members/:userId` | altera papel permitido |
| `DELETE /v1/organization/members/:userId` | remove e revoga acesso local/externo |
| `POST /v1/organization/transfer-ownership` | troca owner atomicamente |

O token de convite é devolvido uma única vez ao criador; somente SHA-256 do token
aleatório é armazenado. Ele nunca entra em auditoria/log. A entrega deve ocorrer
por canal TLS autenticado; integração com provedor de e-mail é uma etapa
operacional separada e não autoriza token em log ou URL de analytics.

Ao remover um membro, a transação revoga membership, sessões ativas daquele tenant
e API keys criadas pelo membro naquela organização. A permissão some imediatamente
porque toda requisição relê a membership. A revogação Auth0 ocorre depois do
bloqueio local e falha fechada.

## RLS e classificação

RLS e `FORCE ROW LEVEL SECURITY` estão ativos em:

- `iam.organizations`, `memberships`, `invitations`, `api_keys`, `session_metadata`;
- `billing.subscriptions`, `usage_records`, `invoices`;
- `model.predictions` organizacionais;
- `ops.exports`, `background_jobs`, `audit_log` organizacionais.

`iam.users` é o principal global de identidade e não pertence a um tenant.
`billing.plans`, webhooks, datasets, modelos/avaliações e todo o schema `sports`
são compartilhados. Tabelas esportivas não possuem `organization_id`.

A role de runtime deve ser diferente da role de migration e das proprietárias das
tabelas, com `NOSUPERUSER NOBYPASSRLS`. Conceder somente schemas/tabelas exigidos.
Executar a aplicação como superuser invalida a segunda barreira e é proibido em
produção.

Jobs usam envelope `{ scope, organizationId, requestedByUserId, payload }` criado a
partir do ator. Workers revalidam o organization ID contra o recurso antes de
processar. Cache usa prefixo `env:org:{organizationId}:...`. Exportações usam
object storage com chave `organizations/{organizationId}/exports/...`; download exige metadata autorizada e
prefixo correspondente. Nenhum desses componentes aceita prefixo fornecido pelo
cliente.

## Auditoria

Criação/troca de organização, convites, aceitação, revogação, alteração de
papel, remoção e transferência gravam evento append-only com `before` e `after`.
Metadata usa IDs internos, papéis e status; não grava e-mail, token, IP bruto ou
payload sensível.

## Testes e critérios de aceite

A integração cria uma role PostgreSQL real `NOSUPERUSER/NOBYPASSRLS`, reconstrói
o banco e executa a API com ela. A suíte:

- confirma RLS + FORCE RLS em todas as doze tabelas privadas;
- insere dados de tenant B em cada tabela e prova leitura zero sob contexto A;
- prova que INSERT cruzado falha com SQLSTATE `42501`;
- prova que `sports.fixtures` continua compartilhada;
- adultera body, query, path e headers sem trocar o tenant;
- cobre criação/troca, convite expirado/uso único/revogação, RBAC, remoção,
  sessão, API key, ownership e auditoria antes/depois;
- prova separação de chaves de cache, objetos/export e jobs.

## Rollback

1. Antes da migration, registrar owners duplicados e sessões sem organização; a
   migration interrompe se não puder preencher uma sessão com membership ativa.
2. Rollback preferencial: voltar a imagem mantendo enum `member`, coluna NOT NULL e
   policies; a imagem anterior deve ser verificada porque esperava `analyst`.
3. Para desativar a superfície, retirar as rotas de organização. Nunca desligar RLS
   como resposta a incidente.
4. Reverter `member` para `analyst` exige migration forward e prova de
   compatibilidade; não editar `0005` depois de aplicada.
5. Remover policies somente em banco restaurado/descartável ou por migration
   revisada depois de retirar todos os consumidores. Preservar `audit_log`.
