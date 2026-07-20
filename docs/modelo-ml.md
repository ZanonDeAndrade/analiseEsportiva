# Modelo, avaliação e operação de ML

## Escopo

O BetIntel AI usa um baseline auditável de frequências históricas segmentadas. As probabilidades são estimativas educacionais: não representam certeza, promessa de resultado ou recomendação financeira. Cartões e escanteios continuam opcionais; ausência de coluna ou de amostra suficiente produz `dados_insuficientes`.

## Validação temporal e proteção contra vazamento

A avaliação usa uma **divisão temporal por competição**, reprodutível e sem embaralhamento aleatório. Antes de dividir, todas as datas são normalizadas para ISO 8601 (aceitando ISO e `DD/MM/AAAA`); linhas com data ausente ou inválida são descartadas e contadas em `split.discardedRows`. Os jogos são agrupados por competição e, dentro de cada grupo, ordenados por instante UTC crescente: os primeiros 80% formam o treino e os últimos 20% o teste (a porcentagem é configurável, com 80/20 como padrão; uma fatia de validação intermediária é opcional via `validationRatio`). Os grupos são então unidos.

Assim, **toda competição é representada tanto no treino quanto no teste**, corrigindo o viés anterior — em que o holdout global por data concentrava no teste apenas as competições ativas no período mais recente e deixava outras (por exemplo, Brasileirão e Ligue 1) fora do conjunto de teste.

Uma mesma partida nunca aparece em dois conjuntos: a divisão é feita por contagem dentro de cada competição e uma verificação automatizada rejeita, com `TemporalLeakageError`, qualquer sobreposição de índices entre treino, validação e teste. O relatório de avaliação registra a estratégia utilizada (`per_competition_temporal`), os intervalos temporais de treino e teste, a contagem por competição e o total de linhas descartadas.

O backtest walk-forward treina, para cada alvo, apenas com registros cujo instante seja estritamente anterior ao alvo. Assim, outro jogo do mesmo dia não pode vazar para o histórico.

**Features pré-jogo sem vazamento (`preMatchFeatures.ts`, versão `pre-match-v2`)**: um gerador sequencial percorre as partidas em ordem cronológica determinística e, para cada partida, (1) lê o estado histórico anterior, (2) gera as features pré-jogo, (3) armazena o exemplo e (4) só então atualiza o estado com o resultado. Por construção, alterar o resultado de uma partida futura não pode modificar as features de nenhuma partida anterior — verificado por teste obrigatório. O conjunto de features é modular e versionado: identidade contextual (competição, temporada, rodada, mando, mês); forma recente em janelas de 5/10/20 jogos com tamanho de amostra real (vitórias/empates/derrotas, pontos por jogo, gols pró/contra, saldo, médias, %Over 1.5/2.5/3.5, %Ambas Marcam, %sem sofrer, %sem marcar); splits casa/fora; Elo cronológico (antes do jogo, K e vantagem de casa configuráveis, com Elo ajustado e evolução recente); força dos adversários recentes; descanso e calendário (dias desde o último jogo, jogos em 7/14 dias, sequência de mando); confronto direto opcional com amostra/recência/troca de temporada; ponderação exponencial por recência (lambda configurável, selecionável na validação); e flags de disponibilidade para dados avançados (xG, finalizações, posse) — ausência não é confundida com zero.

**Split temporal explícito e walk-forward (`temporalValidation.ts`)**: além do split treino/teste da avaliação, há um split de três vias (treino = período mais antigo, validação = intermediário, teste = mais recente) por competição, preferindo temporadas completas quando há temporadas suficientes, com limites temporais registrados e competições de pouco histórico sinalizadas (nenhuma some do relatório). A validação walk-forward usa janela expansível (treina em períodos 1..k, valida em k+1) apenas sobre treino + validação. O conjunto de teste é reservado (held-out): não é usado para escolher features, hiperparâmetros, modelo, limiar, janela ou calibração.

## Comparação de modelos (ETAPA 6)

Há uma interface comum `PredictiveModel` (`backend/src/models/types.ts`): `metadata()` + `train(examples)` → `TrainedModel.predict(example)`, onde cada exemplo carrega as features pré-jogo sem vazamento. Sete candidatos são comparados: (1) baseline global (climatologia), (2) baseline por competição, (3) modelo atual de frequências + perfis, (4) Poisson, (5) Dixon-Coles, (6) regressão logística e (7) gradient boosting tabular (implementação própria em TypeScript).

**Modelo de gols (ETAPA 7, `models/goalDistribution.ts`)**: estima gols esperados de mandante e visitante a partir de força ofensiva/defensiva por time (com regularização/shrinkage), média da competição e vantagem de casa; monta a distribuição conjunta de placares 0–10 (massa residual redistribuída pela renormalização) e expõe as marginais. Todos os mercados de gols derivam da MESMA distribuição, com coerência estrutural garantida: 1X2 soma exatamente 1 após normalização, Under é o complemento exato do respectivo Over, Over 1.5 ≥ Over 2.5 ≥ Over 3.5, todas as probabilidades ficam em (0, 1) e o arredondamento não quebra a complementaridade. Começa por Poisson; Dixon-Coles adiciona a correção de placares baixos. Cartões e escanteios NÃO são derivados do modelo de gols.

A comparação (`modelComparison.ts`, comando `npm run backend:compare`) treina cada modelo no treino de cada fold walk-forward e pontua na validação (Brier, log loss, cobertura por mercado), **usando apenas o development — o teste final é reservado**. **Nenhum modelo é promovido automaticamente**: o modelo de produção permanece inalterado.

**Modelos tabulares (ETAPA 8)**: logística e gradient boosting consomem as features pré-jogo por um vetorizador (`models/tabularFeatures.ts`) que trata valores ausentes corretamente — imputação pela média do treino mais um indicador binário de ausência, para não confundir "sem histórico" com o valor 0. Os hiperparâmetros são configuráveis (regularização `lambda`, profundidade máxima, taxa de aprendizado, número de rodadas) e a busca (`models/hyperparameterSearch.ts`) ocorre **somente nos folds de validação temporal**, registrando todas as configurações testadas. Optou-se por manter tudo em TypeScript (implementação própria, sem dependências nativas frágeis nem uma arquitetura Python separada), o que é adequado para logística e árvores rasas neste volume de dados.

**Ensemble (ETAPA 9, `models/ensemble.ts`, comando `npm run backend:ensemble`)**: combina ao menos dois modelos já avaliados isoladamente. Os pesos (que somam 1) são aprendidos **apenas na validação** — nos folds mais antigos — e o ensemble é avaliado no fold de validação mais recente, nunca no teste reservado. A combinação reimpõe a coerência entre mercados (1X2 soma 1, dupla chance deriva do 1X2, Under é o complemento do Over). O ensemble só é candidato à promoção se superar **todos** os componentes; na avaliação inicial ele não superou o Dixon-Coles, então **não foi promovido**. A comparação inicial mostra ganhos pequenos e concentrados no 1X2 (logística/Poisson/Dixon-Coles à frente dos baselines), enquanto o modelo mais complexo (gradient boosting) não foi o melhor — evidência de que maior complexidade não garante melhora.

## Métricas, baselines e incerteza

Toda métrica publicada inclui amostra, cobertura e duas baselines obrigatórias:

- climatologia do conjunto de treino;
- distribuição uniforme entre as seleções do mercado.

São registrados Brier Score, log loss, acurácia de classe quando aplicável, decomposição do Brier (confiabilidade, resolução e incerteza), tabela de calibração em dez faixas e expected calibration error. A incerteza inclui intervalo de Wilson para acurácia e bootstrap determinístico para Brier. Relatórios sem baseline não são elegíveis à promoção.

## Métricas corretas e calibração (ETAPAS 10 e 11)

**Métricas (`models/metrics.ts`, comando `npm run backend:metrics`)**: para o 1X2 a métrica principal é **multiclasse** — acurácia por argmax, Brier multiclasse, log loss multiclasse, matriz de confusão 3×3, macro F1, balanced accuracy, calibração por classe, baseline da classe majoritária e baseline por frequência da competição — **nunca** tratando cada seleção como binária independente com limiar de 50%. Para mercados binários: Brier, log loss, balanced accuracy, precisão, recall, F1, matriz de confusão, calibração, prevalência e baseline de frequência. **Interpretação sempre reportada**: Brier e log loss são "quanto menor, melhor". A **cobertura** (total, previstas, `dados_insuficientes`, %) acompanha obrigatoriamente qualquer acurácia, para que um modelo que só prevê partidas fáceis não pareça melhor sem que a limitação fique clara. Na avaliação, o Dixon-Coles supera o baseline de frequência no 1X2, mas a matriz de confusão revela honestamente a dificuldade com empates (macro F1 ≈ 0,34).

**Calibração (`models/calibration.ts`)**: reliability diagram, Expected Calibration Error, Maximum Calibration Error, Brier, log loss e distribuição de previsões por faixa. Compara Platt Scaling, Regressão Isotônica e Temperature Scaling, **ajustando o calibrador somente na validação** (nunca no teste final) e medindo antes/depois num fold de validação reservado. Uma calibração só é aceita se **melhorar o ECE sem piorar Brier nem log loss** — evitando "melhorar a aparência dos percentuais" à custa da generalização. Na avaliação inicial nenhum método foi aceito (o mercado já estava bem calibrado).

## Baselines obrigatórios e incerteza estatística (ETAPAS 12 e 13)

**Skill score vs baselines (`models/skillScore.ts`, comando `npm run backend:baselines`)**: cada modelo é comparado, no 1X2 (Brier multiclasse), contra frequência global, frequência por competição, classe mais comum, modelo atual, Poisson simples e previsão uniforme. Para cada comparação são reportados diferença absoluta, diferença relativa, skill score (`skill = 1 - modelBrier/baselineBrier`; positivo supera, zero equivalente, negativo pior), intervalo de confiança e tamanho da amostra. **Resultados negativos não são omitidos** — a avaliação mostra, por exemplo, que o modelo atual é levemente pior que o Poisson simples (skill −0,015).

**Incerteza (`models/bootstrap.ts`)**: os intervalos vêm de um **moving block bootstrap** que reamostra blocos de partidas consecutivas (ordenadas por tempo), preservando a dependência cronológica — em vez de reamostrar partidas isoladas, o que destruiria a estrutura temporal. Cada intervalo reporta estimativa central, limite inferior/superior, método, número de repetições e seed (reprodutível). O veredito só declara superioridade quando o intervalo **exclui zero**; quando contém zero, a diferença é estatisticamente equivalente (visível no empate exato entre a frequência global e a por competição).

## Hiperparâmetros e promoção (ETAPAS 14 e 15)

**Hiperparâmetros (`models/hyperparameters.ts`)**: um tipo `HyperparameterConfig` reúne, com padrões explícitos, os parâmetros ajustáveis — janelas de forma, lambda de recência, K do Elo, vantagem de casa, regularização, mínimo de partidas por equipe/competição, Poisson/Dixon-Coles (shrinkage/rho), logística, gradient boosting e método de calibração. `validateHyperparameters` rejeita combinações inválidas antes de treinar. A busca (`gridSearch`) é **determinística por seed**, roda **somente na validação temporal** (teste reservado), **registra cada experimento** e o espaço de busca, pula configs inválidos e é **limitada** (`maxExperiments`) para não sobreajustar a validação. Comando `npm run backend:select`.

**Promoção (`models/promotion.ts`)**: o ciclo de vida é `candidate → validated | rejected → active → archived`, com transições explícitas. Um modelo só é `validated` quando passa em TODOS os 9 critérios — superar o baseline (Brier **ou** log loss), não piorar significativamente a calibração, ser consistente em múltiplos folds, não depender de poucas competições, manter cobertura aceitável, não regredir em mercado importante, ter tempo aceitável, passar todos os testes e ter versão/metadados completos. **Nunca** é validado só por ter maior acurácia/Brier: na avaliação, o melhor candidato logístico supera o baseline em Brier mas é **rejeitado** por piorar a calibração (ΔECE 0,054). A promoção final é sempre uma decisão explícita contra o teste reservado — nada é substituído automaticamente.

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

`backend/src/mlops.test.ts` cobre separação temporal, vazamento, reprodução, baselines, calibração conhecida, promoção/rollback lógico e dados insuficientes. `backend/src/temporalSplit.test.ts` cobre especificamente a divisão por competição: dataset fora de ordem, várias competições, competição com poucas linhas, datas em formatos mistos, ausência de sobreposição entre treino/validação/teste e determinismo. `backend/src/preMatchFeatures.test.ts` cobre o gerador sequencial (features neutras sem histórico, determinismo, ordem cronológica e o teste obrigatório de que alterar o futuro não muda features passadas). `backend/src/temporalValidation.test.ts` cobre o split de três vias (por temporada, sem sobreposição, teste reservado, pouco histórico sinalizado, determinismo) e o walk-forward expansível sem partida futura no treino. Os testes de persistência cobrem o ciclo champion/challenger/rollback quando `TEST_DATABASE_URL` está disponível; o CI torna esses testes obrigatórios com PostgreSQL e Redis reais.
