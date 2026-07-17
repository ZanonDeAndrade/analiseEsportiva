# Operação confiável de dados esportivos

## Contrato e governança do provedor

O domínio consome `SportsDataProviderAdapter`; adaptadores traduzem API-Football e Football-Data para snapshots normalizados. Habilitar uma fonte exige três valores operacionais por provedor: referência da política de uso, referência da licença/contrato e ambientes permitidos. Esses campos são referências fornecidas pelo responsável pelo deploy; o BetIntel AI não conclui nem declara que determinado uso é juridicamente permitido.

Cada sincronização persiste a referência usada em `sports.provider_snapshots`. Credenciais permanecem somente em variáveis de ambiente. Não há calendário simulado nem fallback fictício na operação de produção. O modo visual de demonstração da SPA existe apenas em build de desenvolvimento.

## Identidade, aliases e deduplicação

- Competições, temporadas e times possuem `canonical_key`.
- `competition_external_ids`, `season_external_ids` e `team_aliases` vinculam identificadores de cada fonte à entidade canônica.
- Fixtures têm constraint única `(source_provider, external_id)`.
- Aliases conflitantes entram como `pending` e geram `data_quality_issues`; não são reassociados silenciosamente.
- A tela **Dados**, disponível a owner/admin, permite revisar aliases e registros rejeitados.

## Tempo e estados

Instantes são persistidos como `timestamp with time zone` e normalizados para UTC. Conversões para `pt-BR` ocorrem somente na resposta de apresentação.

Os estados normalizados distinguem: não iniciado, ao vivo, intervalo, encerrado, adiado, cancelado, abandonado, prorrogação e pênaltis. `match_results.decision` e `winner` preservam o contexto: um jogo empatado e decidido nos pênaltis continua com `outcome = D`, mas registra o vencedor da disputa separadamente.

## Correção e reprocessamento

`match_result_revisions` é imutável por fixture/revisão. Alteração de placar, decisão, pênaltis ou estatística incrementa o contador de correções da ingestão. O job de normalização é então enfileirado com o `dataset_version_id`, seguido por treino, avaliação e backtest.

`model.dataset_records` guarda manifesto, hash e payload de cada registro do dataset. Treino, avaliação e backtest leem esse payload versionado, evitando que uma correção posterior altere silenciosamente um dataset anterior. `model_versions.dataset_version_id` é obrigatório.

O repositório de modelos não cria datasets sintéticos para satisfazer a chave estrangeira: sem dataset pronto e rastreável, o treino é recusado.

## Frescor, falhas e quota

Fixtures carregam `last_seen_at` e `fresh_until`. A API pública filtra fixtures vencidas e informa quantos registros foram bloqueados. Uma fixture vencida também não pode ser usada para solicitar análise. Os limites são:

- `SPORTS_FIXTURE_FRESHNESS_MS` para fixtures não iniciadas;
- `SPORTS_LIVE_FRESHNESS_MS` para estados ao vivo, intervalo, prorrogação e pênaltis.

Chamadas externas passam por quota diária/mensal, espaçamento distribuído, retry exponencial limitado e circuit breaker em Redis. Snapshots normalizados possuem cache operacional curto no PostgreSQL (`SPORTS_PROVIDER_CACHE_TTL_MS`), além do manifesto persistente/idempotente; uma indisponibilidade do provedor não cria dados novos nem promove cache vencido a dado atual.

## Runbook

1. Conferir configuração explícita de uso/licença e quota do provedor.
2. Executar `npm run backend:sync` ou o job administrativo de sync.
3. Verificar **Dados → Frescor** e as filas de aliases/rejeições.
4. Resolver ambiguidades com evidência externa; não aprovar por similaridade de nome apenas.
5. Para correção retroativa, aguardar a cadeia normalização → treino → avaliação/backtest e confirmar o novo `datasetVersionId` no modelo ativo.
6. Se o circuit breaker abrir, verificar saúde/limite do provedor. Não habilitar fallback simulado.

## Testes de aceite

`npm run backend:test` cobre normalização de aliases, duplicados, UTC, adiamento/cancelamento, prorrogação/pênaltis, frescor, indisponibilidade/circuit breaker, correção/reprocessamento e idempotência. Testes PostgreSQL completos usam `TEST_DATABASE_URL`.
