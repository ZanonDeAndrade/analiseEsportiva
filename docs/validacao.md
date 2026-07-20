# Validacao

## Testes Unitarios

Comando:

```bash
npm run backend:test
```

Cobertura funcional:

- Labels de gols.
- 1X2.
- Dupla chance.
- Cartoes sem dados.
- Escanteios sem dados.
- Resposta `dados_insuficientes`.
- Provider API-Football com payload mockado.
- Provider Football-Data com CSV mockado.
- Parsing ISO e `DD/MM/AAAA`.
- Schemas HTTP invalidos e contrato `application/problem+json`.
- Autenticacao, RBAC, rate limit, payload excessivo, content-type e timeout.
- Erros internos sem stack/mensagem sensivel e contrato OpenAPI.
- Feature flag das rotas antigas e jobs administrativos sem trabalho pesado no handler.
- CLIs de pipeline em modo offline (`train`/`evaluate`/`backtest` com `--csv`, sem `DATABASE_URL`) e falha amigavel sem stack quando o modo PostgreSQL e usado sem configuracao.
- Validacao centralizada de placares (FTHG/FTAG): rejeita valores nao inteiros, negativos ou fora de `[0, MAX_GOALS_PER_TEAM]` com motivo estruturado (`invalid_home_score`, `invalid_away_score`, `score_out_of_range`, `fractional_score`).
- Divisao temporal por competicao (`temporalSplit`): dataset fora de ordem, varias competicoes, competicao com poucas linhas, datas em formatos mistos, ausencia de sobreposicao treino/validacao/teste e determinismo.
- Features pre-jogo sem vazamento (`preMatchFeatures`): teste obrigatorio de que alterar resultados futuros nao muda features de partidas anteriores; determinismo e ordem cronologica.
- Split temporal de tres vias e walk-forward (`temporalValidation`): treino/validacao/teste por temporada, teste reservado (held-out), competicoes de pouco historico sinalizadas e janela expansivel sem partida futura no treino.
- Modelos candidatos (`models/*`, `modelComparison`): probabilidades validas e coerentes, monotonicidade do Poisson, determinismo de cada modelo e da comparacao, e ranking por Brier no walk-forward sem promocao automatica.
- Features pre-jogo ricas (`preMatchFeatures`): janelas 5/10/20 com tamanho de amostra, splits casa/fora, recencia exponencial, forca dos adversarios, calendario e flags de disponibilidade.
- Modelo de gols (`models/goalDistribution`): coerencia estrutural (1X2 soma 1, Under = complemento do Over, monotonicidade, limites) e correcao Dixon-Coles.
- Modelos tabulares (`models/tabularFeatures`, `hyperparameterSearch`): tratamento de missing (imputacao + indicador), busca de hiperparametros so na validacao com log de todas as configs.
- Ensemble (`models/ensemble`): coerencia da combinacao, pesos somando 1 aprendidos na validacao, comparacao com cada componente e determinismo.
- Metricas (`models/metrics`): 1X2 multiclasse (argmax/Brier/logLoss/confusao/F1/baselines), mercados binarios (precisao/recall/F1/balanced) e cobertura.
- Calibracao (`models/calibration`): ECE zero para 0.5 calibrado, isotonica monotonica, ajuste so na validacao e aceite condicionado a nao piorar Brier/logLoss.
- Incerteza (`models/bootstrap`, `models/skillScore`): block bootstrap determinístico por seed (metodo/repeticoes/seed reportados) e skill score com veredito supera/equivalente/pior conforme o IC exclua ou contenha zero.
- Hiperparametros (`models/hyperparameters`): config padrao valida, combinacoes invalidas rejeitadas, gridSearch determinístico que registra experimentos, pula invalidos e respeita o limite.
- Promocao (`models/promotion`): validated so com os 9 criterios; nao valida por maior Brier isolado (reprova por calibracao/regressao/inconsistencia) e ciclo de vida com transicoes validas.
- Backtest incremental (`backtesting`, `incrementalModel`): equivalencia exata com a implementacao de referencia (retreino), determinismo e relatorio de duracao; dataset completo em ~linear.
- Confianca e dados_insuficientes (`models/confidence`): diferenciacao das causas (ausente/zero/amostra/sem-historico/equipe-nova/feature-indisponivel) e confianca calculada dos seis fatores com aviso de que nao e promessa.

Testes PostgreSQL reais:

```bash
TEST_DATABASE_URL=postgresql://... TEST_REDIS_URL=redis://... BETINTEL_REQUIRE_DB_TESTS=true npm run db:test
```

Essa suíte cria um database descartável e usa Redis real para validar migrations,
constraints, concorrência, rollback, deduplicação, dry-run, auditoria append-only,
duas instâncias, rate limit distribuído, outbox, BullMQ, retries, DLQ, cotas,
circuit breaker, locks e recuperação após reinício.

## Validacao de Build

```bash
npm run build
```

Esse comando compila TypeScript do `frontend/` e do `backend/`, e gera o build Vite em `frontend/dist`.

## Validacao de Pipeline (PostgreSQL)

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

Resultados esperados:

- Sync persiste fixtures/resultados compartilhados no PostgreSQL.
- Train cria `model.model_versions` e `model.model_segments`.
- Evaluate e backtest criam `model.evaluations`.
- Nenhum comando grava estado persistente em `backend/data` ou `backend/artifacts`.

## Validacao de Pipeline (offline, sem PostgreSQL)

Reproduz treino, avaliacao e backtest a partir de um CSV, sem PostgreSQL, Redis
ou Auth0:

```bash
npm run backend:pipeline:offline
npm run backend:train:offline
npm run backend:evaluate:offline
npm run backend:backtest:offline
```

Resultados esperados:

- Cada comando carrega o CSV (`--csv`, padrao `backend/data/combined-results.csv`),
  constroi as features, treina o modelo e imprime um resumo no terminal.
- `--output <arquivo.json>` salva o modelo/avaliacao/backtest; sem ele, nada e
  gravado (o modo offline nao escreve em `backend/artifacts`).
- Nenhuma conexao PostgreSQL e inicializada; `DATABASE_URL` nao e necessaria.
- As datas do CSV sao normalizadas para ISO 8601 antes da divisao temporal e do
  backtest, aceitando ISO e `DD/MM/AAAA` no mesmo arquivo.
- Sem `--csv`, o comando usa PostgreSQL e, faltando `DATABASE_URL`, encerra com
  mensagem orientando o modo offline, sem stack trace.

## Baseline e qualidade de dados (offline)

```bash
npm run backend:baseline   # relatorio "Baseline anterior as correcoes metodologicas" (JSON + resumo)
npm run backend:quality    # relatorio centralizado de qualidade de dados (JSON + resumo)
npm run backend:temporal   # features pre-jogo + split tres vias + walk-forward (JSON + resumo)
npm run backend:compare    # compara 7 modelos por walk-forward (teste reservado; nao promove nada)
npm run backend:ensemble   # busca de hiperparametros (so validacao) + ensemble (pesos na validacao)
npm run backend:metrics    # metricas multiclasse/binarias + cobertura + calibracao (so validacao)
npm run backend:baselines  # skill score vs baselines obrigatorios + IC por block bootstrap
npm run backend:select     # busca de hiperparametros (so validacao) + decisao de promocao (9 criterios)
```

- `backend:baseline` registra versao/hash do dataset, partidas totais/validas/rejeitadas,
  periodo, competicoes, equipes, quantidade por competicao/temporada, disponibilidade por
  mercado, versao/parametros do modelo, duracoes de treino/avaliacao/backtest e metricas
  gerais, por competicao e por temporada. E rotulado como baseline anterior as correcoes e
  nao deve ser usado como evidencia cientifica.
- `backend:quality` executa a camada central `assessDataQuality` (placares, datas
  canonicas ISO, integridade) e reporta linhas aceitas/rejeitadas/duplicadas, avisos,
  problemas por tipo e por fonte, com erros estruturados (codigo, linha, campo, valor,
  motivo, fonte). As mesmas validacoes filtram os registros usados por treino, avaliacao e
  backtest offline.
- Ambos aceitam `-- --csv <arquivo>` e `-- --output <arquivo.json>`.

## Analise Critica

O projeto valida a disponibilidade de dados antes de apresentar mercado. A ausencia de dados nao gera excecao nem probabilidade inventada para cartoes/escanteios; o mercado entra em `ignoredMarkets`.
