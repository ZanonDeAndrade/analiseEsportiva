# ADR 0003 — Drizzle ORM e migrations SQL versionadas

- Estado: Proposto
- Data: 2026-07-15
- Decisores: engenharia

## Contexto

Não existe ORM ou query builder no repositório. A solução precisa preservar TypeScript estrito, produzir migrations revisáveis e permitir SQL explícito para RLS, índices e recursos específicos do PostgreSQL.

## Decisão

Adotar Drizzle ORM e Drizzle Kit. O schema TypeScript descreve tabelas e relações; o repositório versiona os arquivos SQL gerados e todo SQL complementar necessário.

Regras:

- migrations em `backend/migrations/`, imutáveis depois de aplicadas em qualquer ambiente compartilhado;
- `drizzle-kit generate` gera a proposta, que precisa de revisão humana antes do merge;
- `drizzle-kit migrate` é executado por um processo único; `push` é proibido em produção;
- RLS, `FORCE ROW LEVEL SECURITY`, funções, triggers e índices especiais podem ser escritos como migrations SQL explícitas;
- repositories implementam portas da camada de aplicação; tipos Drizzle não atravessam para domínio ou HTTP;
- cada migration inclui pré-condições, verificação pós-aplicação, impacto de lock e procedimento de rollback;
- expand/contract para renomear/remover colunas e migrations corretivas para produção; `down` só quando reversão for comprovadamente sem perda.

## Consequências

### Positivas

- Consultas e schemas tipados sem esconder SQL.
- Histórico SQL auditável e compatível com políticas RLS avançadas.
- Baixo acoplamento se os adapters respeitarem as portas.

### Custos e riscos

- O schema TypeScript não expressa sozinho toda a segurança; SQL revisado continua obrigatório.
- Tipagem não previne consultas sem filtro organizacional; RLS e testes negativos são a defesa principal.
- A equipe precisa controlar drift e ordem de migrations.

## Alternativas rejeitadas

- Prisma: boa experiência de desenvolvimento, mas Drizzle oferece um caminho mais direto para SQL versionado e políticas PostgreSQL no desenho proposto.
- Knex/Kysely: query builders adequados, porém exigiriam compor separadamente uma fonte tipada de schema e política de migrations.
- SQL manual sem query builder: máximo controle, com maior duplicação de tipos e mapeamento.

## Validação e rollback

- CI cria banco vazio, aplica todo o histórico e executa testes.
- CI também atualiza uma cópia do schema da versão anterior e verifica ausência de drift.
- Testes de RLS usam ao menos duas organizações e um papel sem `BYPASSRLS`.
- Rollback de biblioteca mantém repositories antigos atrás de flag; rollback de schema segue o procedimento de cada migration, nunca exclusão improvisada.

## Referências

- [Drizzle: Migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle: Row-Level Security](https://orm.drizzle.team/docs/rls)
