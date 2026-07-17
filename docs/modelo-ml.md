# Modelo, avaliação e operação de ML

## Escopo

O BetIntel AI usa um baseline auditável de frequências históricas segmentadas. As probabilidades são estimativas educacionais: não representam certeza, promessa de resultado ou recomendação financeira. Cartões e escanteios continuam opcionais; ausência de coluna ou de amostra suficiente produz `dados_insuficientes`.

## Validação temporal e proteção contra vazamento

A avaliação usa uma **divisão temporal por competição**, reprodutível e sem embaralhamento aleatório. Antes de dividir, todas as datas são normalizadas para ISO 8601 (aceitando ISO e `DD/MM/AAAA`); linhas com data ausente ou inválida são descartadas e contadas em `split.discardedRows`. Os jogos são agrupados por competição e, dentro de cada grupo, ordenados por instante UTC crescente: os primeiros 80% formam o treino e os últimos 20% o teste (a porcentagem é configurável, com 80/20 como padrão; uma fatia de validação intermediária é opcional via `validationRatio`). Os grupos são então unidos.

Assim, **toda competição é representada tanto no treino quanto no teste**, corrigindo o viés anterior — em que o holdout global por data concentrava no teste apenas as competições ativas no período mais recente e deixava outras (por exemplo, Brasileirão e Ligue 1) fora do conjunto de teste.

Uma mesma partida nunca aparece em dois conjuntos: a divisão é feita por contagem dentro de cada competição e uma verificação automatizada rejeita, com `TemporalLeakageError`, qualquer sobreposição de índices entre treino, validação e teste. O relatório de avaliação registra a estratégia utilizada (`per_competition_temporal`), os intervalos temporais de treino e teste, a contagem por competição e o total de linhas descartadas.

O backtest walk-forward treina, para cada alvo, apenas com registros cujo instante seja estritamente anterior ao alvo. Assim, outro jogo do mesmo dia não pode vazar para o histórico.

## Métricas, baselines e incerteza

Toda métrica publicada inclui amostra, cobertura e duas baselines obrigatórias:

- climatologia do conjunto de treino;
- distribuição uniforme entre as seleções do mercado.

São registrados Brier Score, log loss, acurácia de classe quando aplicável, decomposição do Brier (confiabilidade, resolução e incerteza), tabela de calibração em dez faixas e expected calibration error. A incerteza inclui intervalo de Wilson para acurácia e bootstrap determinístico para Brier. Relatórios sem baseline não são elegíveis à promoção.

## Rastreabilidade e reprodução

Cada modelo persiste os seguintes elos:

- `APP_RELEASE` como versão de código;
- `FEATURE_SET_VERSION` e versão do schema do modelo;
- hiperparâmetros, incluindo `minRows` e `MLOPS_SEED`;
- `datasetVersionId` e seus registros de origem;
- `modelVersionId`, fingerprint imutável do artefato e período de treino;
- versão do schema de métricas, partições temporais e identificador do relatório.

O fingerprint não depende da hora de execução. O CI fixa Node pelo workflow, dependências pelo `package-lock.json`, `TZ=UTC`, `MLOPS_SEED=2026` e `APP_RELEASE` no SHA do commit. Testes de reprodução com entrada, seed e instante controlados exigem relatórios idênticos.

## Drift, promoção e rollback

Avaliações e backtests calculam PSI para faixas de gols e diferenças de campos ausentes entre a referência temporal e a janela recente. O relatório classifica drift como `ok`, `warning` ou `critical`; a operação deve investigar `warning` e bloquear promoção em condições críticas por política de release.

Um treino novo nasce como `challenger`. O gate só promove quando todas as métricas têm baseline e o candidato não é pior que a melhor baseline nem que o champion dentro da tolerância registrada. Resultado insuficiente permanece `hold`; candidato claramente pior vira `rejected`. Promoções e rejeições são auditadas. Rollback é uma ação administrativa explícita em `POST /v1/admin/models/:id/rollback`, com motivo, e restaura somente uma versão anteriormente aposentada.

O relatório de avaliação é a autoridade para promoção; o backtest permanece evidência complementar. Nenhum challenger pior é ativado automaticamente.

## Explicabilidade na API e no cliente

A resposta de predição expõe versão de modelo, dataset, código e features, período de treino, atualização e limitações. Cada mercado disponível expõe segmento de origem, amostra, período, versão do modelo e intervalo de incerteza por seleção. O painel apresenta essa proveniência e mantém o aviso ético visível.

## Testes de aceite

`backend/src/mlops.test.ts` cobre separação temporal, vazamento, reprodução, baselines, calibração conhecida, promoção/rollback lógico e dados insuficientes. `backend/src/temporalSplit.test.ts` cobre especificamente a divisão por competição: dataset fora de ordem, várias competições, competição com poucas linhas, datas em formatos mistos, ausência de sobreposição entre treino/validação/teste e determinismo. Os testes de persistência cobrem o ciclo champion/challenger/rollback quando `TEST_DATABASE_URL` está disponível; o CI torna esses testes obrigatórios com PostgreSQL e Redis reais.
