# ADR 0002 — PostgreSQL gerenciado como banco principal

- Estado: Proposto
- Data: 2026-07-15
- Decisores: engenharia, segurança e operações

## Contexto

O protótipo persiste cache esportivo, modelo e relatórios no filesystem. O disco local de uma instância não oferece concorrência segura, recuperação operacional, consultas relacionais nem isolamento por organização. Uma aplicação stateless não pode depender dele como fonte de verdade.

## Decisão

Usar PostgreSQL gerenciado como sistema de registro para dados estruturados. A primeira implantação poderá usar Render Postgres, desde que o plano escolhido forneça TLS, backups, recuperação point-in-time e disponibilidade compatíveis com os SLOs aprovados.

Princípios operacionais:

- schemas lógicos `sports`, `iam`, `private`, `billing` e `ops`, sem presumir que schemas substituem autorização;
- UUIDs gerados no servidor e timestamps UTC;
- constraints, chaves estrangeiras e unicidade no banco, além da validação da aplicação;
- pool com limites por processo e orçamento total abaixo do limite do provedor;
- migrations executadas por job único antes do tráfego da versão que depende delas;
- backups automáticos, teste periódico de restauração e retenção definida por classificação do dado;
- nenhum payload financeiro sensível, token ou segredo armazenado fora do mínimo contratualmente necessário;
- nenhum filesystem local usado como fallback silencioso em produção.

Artefatos binários e exportações ficam no object storage; o PostgreSQL mantém metadados, hashes, versão e estado.

## Consequências

### Positivas

- Transações, integridade referencial, auditoria e RLS sustentam dados privados.
- Uma fonte de verdade comum permite múltiplas réplicas stateless da API e workers.
- Consultas temporais e índices atendem o domínio esportivo sem duplicação por organização.

### Custos e riscos

- Custo fixo, capacidade de conexões, latência de rede e dependência do provedor.
- Migrations incompatíveis podem impedir rollback de aplicação.
- Backup só é confiável após um restore drill bem-sucedido.

## Alternativas rejeitadas

- SQLite ou arquivos compartilhados: não atendem concorrência, operação multi-instância e RLS.
- Banco por organização: aumenta custo, migrations e operação sem necessidade para a escala inicial.
- Banco NoSQL como fonte principal: reduz suporte natural a integridade e políticas relacionais exigidas.

## Validação e rollback

- Medir volume, crescimento, conexões, p95 e tempo de restauração antes da produção.
- Migrar primeiro dados esportivos compartilhados, com backfill verificável por contagens e hashes.
- Fazer mudanças expand/contract. Rollback de aplicação usa schema compatível; migration destrutiva só depois de duas versões sem leitores antigos.
- Em incidente de migration, interromper rollout, restaurar snapshot apenas com procedimento aprovado e preferir uma migration corretiva para preservar gravações recentes.

## Referências

- [PostgreSQL: Row Security Policies](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Render Postgres](https://render.com/docs/postgresql)
