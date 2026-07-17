# Validação de negócio e viabilidade

> Status em 15/07/2026: **NO-GO para ampliar o BetIntel AI como SaaS neste momento**. O trabalho autorizado é uma rodada de validação de cliente, métricas, licenciamento e enquadramento regulatório. Este documento não é parecer jurídico.

## 1. Decisão executiva

O BetIntel AI resolve hoje um problema acadêmico real: organizar dados históricos de futebol, gerar estimativas probabilísticas explicáveis e declarar quando não há dados suficientes. Isso ainda não demonstra que exista um produto comercial viável.

Há cinco dependências sem evidência conclusiva:

1. as métricas atuais não comparam o modelo com baselines e a separação temporal contém riscos de vazamento;
2. a assinatura de uma API de dados não concede, por si só, licença para publicar ou redistribuir comercialmente os dados;
3. o custo da licença comercial aplicável ainda não foi cotado;
4. não há entrevistas, cartas de intenção ou pagamentos que comprovem demanda;
5. não há parecer jurídico sobre o posicionamento do produto, publicidade, propriedade intelectual e regulação de apostas.

Portanto, o único `go` desta etapa é executar os experimentos de validação descritos neste documento. Cobrança, autenticação, planos e tenancy permanecem fora do escopo.

## 2. Problema a resolver

Profissionais e organizações que produzem conteúdo ou ensino sobre futebol gastam tempo reunindo dados de fontes diferentes, conferindo qualidade, calculando indicadores e explicando incerteza. A alternativa comum é uma planilha manual, um feed caro ou conteúdo sem rastreabilidade.

O problema candidato é:

> Produzir rapidamente um briefing estatístico de pré-jogo, rastreável e reutilizável, que mostre fonte, amostra, incerteza, calibração e mercados sem dados, sem prometer resultado e sem recomendar aposta.

O produto só terá valor comercial se reduzir tempo ou aumentar a qualidade editorial de uma tarefa frequente. “Ter probabilidades” isoladamente não é uma proposta de valor suficiente, pois frequências simples, placares e estatísticas básicas já são amplamente disponíveis.

## 3. Segmentos avaliados

### 3.1 ICP principal proposto: criadores e pequenas equipes de mídia esportiva

Hipótese de ICP: criadores independentes, newsletters, podcasts, canais e pequenas redações brasileiras que publicam análises de futebol ao menos três vezes por semana e não possuem equipe própria de dados.

Comprador: proprietário do canal, editor ou responsável por conteúdo. Usuário: redator, apresentador ou analista. Trabalho a realizar: obter um briefing verificável em minutos, exportar tabelas ou texto editorial e justificar por que um indicador está ou não disponível.

Por que é a hipótese principal:

- a dor é recorrente e mensurável em horas de pesquisa e preparação;
- o comprador e o usuário costumam estar próximos, reduzindo ciclo de venda;
- rastreabilidade, explicação e velocidade podem valer mais que uma pequena diferença de acurácia;
- há espaço para posicionamento editorial, sem odds, marcas de casas ou chamada à aposta.

Riscos: baixa disposição a pagar em criadores pequenos; dependência de exportação e fluxo editorial; uso por mídia pode exigir licenças adicionais. Os termos da API-Football afirmam que a assinatura não concede licença de publicação e destacam mídia de massa, fantasy e plataformas de apostas como usos que podem exigir licença dos titulares de direitos ([termos oficiais](https://www.api-football.com/terms)). Assim, este ICP só pode avançar após autorização comercial escrita.

### 3.2 Consumidor interessado em estatística esportiva

Valor possível: explorar partidas, entender probabilidades e aprender sobre calibração. Vantagens: mercado amplo e aquisição direta. Desvantagens: alta oferta gratuita, uso esporádico, churn provável, suporte individual e baixo ticket.

Decisão: **não é o ICP inicial**. Pode ser público de uma landing page educacional ou plano futuro, mas só volta à matriz se entrevistas demonstrarem hábito semanal e intenção real de pagar.

### 3.3 Fantasy games

Valor possível: API ou briefing de confronto para decisões de escalação. Vantagens: tarefa recorrente e valor mensurável. Desvantagens: o protótipo não tem dados por atleta, escalações, lesões ou minutos esperados; integração B2B e SLA aumentam custo; o uso em fantasy é citado expressamente como potencialmente sujeito a licenças adicionais nos termos do provedor.

Decisão: **descartado nesta fase** por desalinhamento de dados e produto. Reavaliar apenas com parceiro de design e licença específica.

### 3.4 Clubes, analistas e escolas

Esse grupo não deve ser tratado como um único ICP:

- clubes profissionais e departamentos de análise exigem dados mais granulares, validação robusta, segurança, integração e suporte; o modelo de frequências atual não sustenta essa venda;
- analistas independentes se aproximam do ICP de criadores, mas podem exigir exportação e metodologia reproduzível;
- escolas, cursos de jornalismo esportivo e programas de análise de desempenho podem usar o pipeline como laboratório didático, com menor risco de prometer vantagem preditiva.

Decisão: **escolas e cursos são ICP secundário para entrevistas**; clubes profissionais ficam descartados até haver dados e método compatíveis. Uma licença institucional educacional pode ser uma rota de pivot se o ICP de mídia não validar.

### 3.5 Público ligado a apostas

Existe demanda aparente, mas é o segmento de maior risco de posicionamento, aquisição e regulação. O produto não deve aceitar apostas, executar transações, destacar odds como oportunidade, calcular retorno, recomendar seleção, usar afiliados ou prometer lucro.

A Lei nº 14.790/2023 disciplina a exploração de apostas de quota fixa no Brasil ([texto oficial](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2023/lei/l14790.htm)). A página oficial da Secretaria de Prêmios e Apostas mantém o conjunto de atos aplicáveis ([legislação consolidada](https://www.gov.br/fazenda/pt-br/composicao/orgaos/secretaria-de-premios-e-apostas/apostas-de-quota-fixa/legislacao/apostas)). Em julho de 2026, o Ministério da Fazenda também divulgou novas exigências de publicidade, advertências e vedações envolvendo incentivo por comentaristas e divulgação de operadores não autorizados ([comunicado oficial](https://www.gov.br/fazenda/pt-br/assuntos/noticias/2026/julho/ministerio-da-fazenda-amplia-exigencias-de-publicidade-de-apostas-no-pais)).

Decisão: **descartado como ICP e como canal de aquisição nesta fase**. Qualquer reavaliação depende de parecer jurídico escrito e de controles de produto que mantenham o serviço como análise estatística, sem incentivo financeiro.

## 4. Proposta de valor

Proposta para teste:

> O BetIntel AI transforma dados esportivos licenciados em briefings estatísticos de futebol prontos para revisão editorial, mostrando fonte, amostra, calibração e limitações. Análise baseada em dados históricos. Não garante resultado.

Promessas permitidas para validar:

- reduzir o tempo de preparação de um briefing;
- tornar cálculos e fontes reproduzíveis;
- separar evidência disponível de `dados_insuficientes`;
- comparar o modelo com baselines de forma transparente;
- oferecer texto e tabelas como rascunho sujeito a revisão humana.

Promessas proibidas:

- lucro, retorno, “green”, vantagem garantida ou taxa de acerto isolada;
- recomendação de aposta ou seleção “melhor”;
- superioridade preditiva antes de um teste temporal bloqueado;
- dados “em tempo real” sem SLA e cobertura contratados;
- associação oficial com ligas, clubes, federações ou casas de apostas.

## 5. Hipóteses de preço

Preço é hipótese de entrevista e landing page, não autorização para implementar cobrança.

| Oferta para teste | Hipótese de preço | O que precisa ser validado |
| --- | ---: | --- |
| Explorador educacional individual | R$ 19 a R$ 39/mês | Uso semanal e retenção; não é ICP principal |
| Criador individual | R$ 149/mês | Economia mínima de 3 horas/mês e uso em 12+ conteúdos |
| Pequena equipe editorial | R$ 349 a R$ 599/mês | 3 a 5 usuários, revisão e exportação; sem construir multiusuário ainda |
| Piloto educacional institucional | R$ 900 a R$ 2.500 por turma/semestre | Orçamento, suporte docente e permissão de uso em sala |
| Clube ou integração de fantasy | Sob consulta | Fora do escopo até existir parceiro, método e licença adequados |

Testar três perguntas separadas: valor percebido, preço aceitável e compromisso. “Achei interessante” não conta como validação; contam carta de intenção, piloto pago ou aprovação explícita de orçamento condicionada aos gates jurídicos e de dados.

## 6. Custo provável de dados e margem

A página oficial da API-Football consultada em 15/07/2026 lista Free a US$ 0/100 requisições por dia, Pro a US$ 19/7.500, Ultra a US$ 29/75.000 e Mega a US$ 39/150.000 por mês ([preços oficiais](https://www.api-football.com/pricing)). Esses valores medem acesso técnico, não direitos comerciais.

Estimativa para validação:

| Item | Faixa inicial | Observação |
| --- | ---: | --- |
| Acesso técnico à API | US$ 19 a US$ 39/mês | Suficiente para protótipo e teste de volume, sujeito a cobertura e limites |
| Licença de publicação/redistribuição | Desconhecida; cotação obrigatória | Pode superar em muito a assinatura técnica e é o principal risco de custo |
| Fonte profissional, como Stats Perform | Contrato sob consulta | Não presumir preço nem direito de uso sem proposta formal |
| Infraestrutura de experimento | R$ 100 a R$ 500/mês | Landing, banco mínimo, observabilidade e e-mail; não inclui desenvolvimento |
| Suporte e operação | Medir no piloto | Registrar minutos por briefing, incidente e cliente |

Regra econômica de `go`: receita mensal recorrente contratada deve cobrir dados, infraestrutura, suporte, impostos e contingência, com margem bruta projetada de pelo menos 70% no cenário conservador. O cálculo deve usar o preço da licença comercial, não apenas os US$ 19–39 do acesso à API.

## 7. Licenciamento, armazenamento e redistribuição

### 7.1 Situação atual

- API-Football: os termos dizem expressamente que o serviço não fornece licença de uso e publicação dos dados e transfere ao usuário a obrigação de obter permissões dos titulares de direitos. Também alertam para restrições em mídia, fantasy e apostas ([termos](https://www.api-football.com/terms)). **Status: não liberado para SaaS comercial.**
- Football-Data.co.uk: a página descreve os arquivos como gratuitos, atribui sua compilação a várias fontes e declara que os dados são disponibilizados para previsão de partidas de liga ([página da fonte](https://www.football-data.co.uk/data.php)). Isso não é evidência suficiente de licença comercial de armazenamento, transformação e redistribuição. **Status: autorização escrita necessária.**
- Logos, imagens e marcas: permanecem proibidos no produto; nomes, marcas de competição e alegação de associação oficial devem ser revisados por especialista.
- Dados derivados: probabilidades, agregados e features não devem ser presumidos livres de restrição. O contrato precisa dizer se derivados podem ser exibidos, exportados e retidos após o término.

### 7.2 Checklist antes de qualquer `go`

Obter resposta contratual escrita, por fonte, para:

- direito de coletar por API ou download automatizado;
- campos e competições cobertos pelo contrato;
- armazenamento, região, criptografia, backup e prazo de retenção;
- uso em treinamento, avaliação e geração de dados derivados;
- exibição a usuários finais e exportação em CSV, imagem, texto ou API;
- redistribuição, sublicenciamento e número de usuários/clientes;
- uso editorial, educacional, fantasy, mídia e contexto relacionado a apostas;
- uso de nomes, calendários, estatísticas, marcas e identificadores;
- atribuição obrigatória e forma de exibição da fonte;
- limites de requisição, cache, atualização, SLA e suporte;
- território, idioma, prazo, reajuste, auditoria e rescisão;
- obrigação de apagar dados e derivados ao encerrar o contrato;
- responsabilidade por erros, indisponibilidade e reclamação de terceiro.

Critério: ausência de resposta explícita equivale a **não autorizado**. Dados gratuitos ou acessíveis publicamente não são tratados como dados comercialmente redistribuíveis.

## 8. Riscos regulatórios e perguntas para advogado

Esta seção lista questões; não responde juridicamente a elas.

1. Um serviço pago de estatística esportiva, sem transação e sem recomendação, pode ser enquadrado como atividade relacionada, publicidade ou facilitação de apostas em algum fluxo de uso?
2. Quais textos, rankings, alertas, notificações e chamadas para ação poderiam caracterizar incentivo ou promessa enganosa?
3. A exibição de odds apenas em relatório interno de avaliação muda o enquadramento? Elas podem ser armazenadas para benchmark e nunca mostradas ao usuário?
4. Conteúdo produzido para criadores ou mídia que também cobrem apostas exige advertências ou controles adicionais?
5. Links afiliados, patrocínio ou integração com operador autorizado são compatíveis com o posicionamento? A decisão de produto atual é não utilizá-los.
6. Há obrigação de verificação etária mesmo sem aposta, depósito, odds ou recomendação?
7. Quais regras do Código de Defesa do Consumidor incidem sobre métricas, disponibilidade, renovação e alegações de IA?
8. Que licenças são necessárias para resultados, calendário, nomes de equipes, competições, estatísticas e dados derivados?
9. O uso comercial de nomes de competições cria risco de marca, concorrência desleal ou associação indevida?
10. Quais documentos e registros são necessários para demonstrar que o produto não é operador, afiliado nem tipster?
11. Quais limites se aplicam a clientes estrangeiros ou à oferta fora do Brasil?
12. Como responder a ordens de remoção, reclamações de titular de direitos e mudanças regulatórias?

Entrevistas e landing pages coletam dados pessoais. A LGPD regula tratamento de dados pessoais inclusive em meios digitais ([Lei nº 13.709/2018](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm)); a ANPD recomenda finalidade, base legal, transparência e boa-fé também em estudos e pesquisas ([guia oficial](https://www.gov.br/anpd/pt-br/centrais-de-conteudo/materiais-educativos-e-publicacoes/guia-orientativo-tratamento-de-dados-pessoais-para-fins-academicos-e-para-a-realizacao-de-estudos-e-pesquisas)). A validação deve coletar apenas nome, contato, segmento e respostas necessárias, com aviso de privacidade e prazo de descarte.

## 9. Perguntas para entrevistas

Não apresentar o produto antes de entender o fluxo atual. Evitar perguntas hipotéticas como “você usaria?”.

### Comuns

1. Conte a última vez em que preparou uma análise pré-jogo. Qual era a entrega e qual era o prazo?
2. Quais fontes e ferramentas usou? Quanto tempo levou cada etapa?
3. Onde ocorreram erros, retrabalho ou dúvida sobre a fonte?
4. O que acontece quando cartões, escanteios ou outra estatística não existem?
5. Como decide se uma probabilidade é confiável ou está calibrada?
6. Quem revisa e quem aprova o material?
7. Quanto esse processo custa em horas ou contratação por mês?
8. Qual foi a última ferramenta de dados esportivos que pagou, cancelou ou recusou? Por quê?
9. Que evidência de licença, fonte e metodologia é exigida antes de publicar?
10. Mostre um exemplo real de saída que seria útil, removendo qualquer informação confidencial.

### Criadores e mídia

11. Quantos briefings ou conteúdos produz por semana e em quais formatos?
12. Uma economia de 30 minutos por conteúdo teria qual impacto concreto?
13. Precisa exportar tabela, imagem, roteiro, API ou apenas consultar?
14. Quais afirmações o jurídico ou editor proíbe?
15. Quem aprovaria R$ 149, R$ 349 ou R$ 599 por mês? De qual orçamento sairia?

### Escolas e cursos

16. O objetivo é ensinar estatística, jornalismo, ciência de dados ou análise de desempenho?
17. Quantos alunos, turmas e semestres usariam o material?
18. É necessário congelar datasets, reproduzir experimentos e citar fontes?
19. Como funciona a compra e qual é o calendário orçamentário?

### Encerramento com compromisso

20. Se os dados tiverem licença comercial, o método superar o baseline e o fluxo economizar o tempo relatado, você aceitaria participar de um piloto no preço discutido?
21. Pode assinar uma carta de intenção não vinculante ou iniciar o processo interno de compra?
22. Quem mais precisa participar da decisão?

Registrar função, segmento, frequência da tarefa, custo atual, gravidade da dor de 1 a 5, preço discutido, objeção e próximo compromisso. Não registrar dados sensíveis ou conteúdo editorial confidencial.

## 10. Experimento de landing page

### Hipótese

Pequenas equipes de mídia e criadores que produzem pelo menos 12 análises mensais deixarão contato para um piloto pago quando a página prometer economia de tempo, rastreabilidade e briefing editorial — sem promessa de acerto.

### Página

- título A: “Briefings estatísticos de futebol com fonte, amostra e limitações claras.”
- título B: “Reduza o tempo de pesquisa pré-jogo sem perder rastreabilidade editorial.”
- demonstração estática com dados reais cuja exibição esteja autorizada, ou apenas wireframe sem números; nunca usar mocks como se fossem produto;
- mostrar `dados_insuficientes`, aviso ético e revisão humana;
- três preços de pesquisa: R$ 149, R$ 349 e “institucional sob consulta”;
- CTA: “Solicitar entrevista para piloto”; sem checkout e sem cobrança;
- sem odds, casas, afiliados, marcas de competição, logos ou alegação de superioridade;
- aviso de privacidade, consentimento quando aplicável e exclusão dos leads rejeitados após 90 dias.

### Aquisição e medição

- 150 visitantes qualificados, identificados por comunidade, newsletter ou prospecção editorial; tráfego genérico não conta;
- distribuição equilibrada entre A e B, sem mudar a oferta durante o teste;
- eventos: visita qualificada, rolagem, clique no CTA, formulário válido, entrevista marcada e carta de intenção;
- entrevistar pelo menos 20 pessoas do ICP, mesmo que a conversão da página seja alta;
- não usar depoimento inventado, número simulado ou contador falso.

### Sucesso

Todos devem ocorrer:

- pelo menos 8% dos 150 visitantes qualificados enviam formulário válido;
- pelo menos 10 entrevistas são efetivamente realizadas a partir da página ou prospecção;
- em um total mínimo de 20 entrevistas, ao menos 10 classificam a dor como 4 ou 5;
- ao menos 5 confirmam orçamento no intervalo testado;
- ao menos 3 assinam carta de intenção ou iniciam aprovação de piloto condicionado aos gates de licença, jurídico e métricas.

O teste falha se houver muitos leads do público de apostas e poucos do ICP editorial; volume do segmento errado não valida a hipótese.

## 11. Auditoria das métricas atuais

### 11.1 Evidência observada

O cache auditado contém 6.470 partidas: 5.404 de `api-football` e 1.066 de `football-data.co.uk`; não há linhas `mock-fallback` nesse arquivo. Cartões e escanteios completos aparecem em 1.066 linhas. O artefato de avaliação registra 5.176 linhas de treino e 1.294 de teste.

| Mercado | Accuracy reportada | Brier reportado | Observação |
| --- | ---: | ---: | --- |
| 1X2 | 68,6% | 0,2089 | Accuracy one-vs-rest por três seleções, não accuracy multiclasses por jogo |
| Over 2,5 | 57,1% | 0,2421 | Par complementar contado duas vezes |
| Ambas marcam | 56,8% | 0,2447 | Sem comparação com frequência-base |
| Cartões | não avaliado | não avaliado | Treino do split não contém amostra utilizável |
| Escanteios | não avaliado | não avaliado | Mesmo problema de disponibilidade no split |

O backtest salvo informa 4.866 jogos avaliados e, portanto, foi produzido sobre uma versão anterior do dataset. Seus números não são diretamente comparáveis ao artefato de avaliação atual.

### 11.2 Problemas que tornam o resultado inconclusivo

1. `evaluation.ts` usa `slice` na ordem do arquivo, sem ordenar por data. Como as fontes são concatenadas em blocos, o teste mede também mudança de fonte e cobertura, não apenas generalização futura.
2. As datas misturam `YYYY-MM-DD` e `DD/MM/YYYY`. `backtesting.ts` usa `localeCompare`, que não representa ordem cronológica entre esses formatos. Isso pode colocar partidas de 2025/26 antes de partidas de 2022/24 e vazar futuro.
3. Jogos com a mesma data não são tratados como bloco. Uma partida posterior no array pode usar resultados de outra partida simultânea ou ainda não conhecida naquele instante.
4. “Selection accuracy” aplica limiar de 50% separadamente a cada classe. Em 1X2, prever “não” para duas das três classes infla a leitura. A métrica correta de classe é `argmax` por partida.
5. Mercados binários avaliam a seleção positiva e seu complemento, duplicando `evaluatedRows`. O Brier deve ser calculado uma vez por evento binário.
6. Dupla chance contém rótulos sobrepostos; não deve ser interpretada como classificação de três classes exclusivas.
7. Não há baseline, intervalo de confiança, teste de diferença pareada, curva de calibração, ECE ou decomposição do Brier.
8. “Confiança” no produto é derivada apenas do tamanho da amostra, não de erro de calibração, incerteza estatística ou drift.
9. Resolvido na etapa de persistência: quando a predição falha, o frontend mostra `n/d` e não estima percentuais, forma ou estatísticas.
10. Resolvido na etapa de persistência: o sincronizador aborta sem fonte real e o importador rejeita providers simulados por padrão.

Atualização técnica de 2026-07-15: os itens 9 e 10 foram corrigidos na migração PostgreSQL. Os mocks do frontend existem somente no modo visual explícito `?demo=1`. Isso não altera a conclusão comercial nem os demais problemas de métricas desta auditoria.

Conclusão da auditoria: **não é possível afirmar que o modelo supera um baseline** com os relatórios atuais. Os números existentes são úteis para depuração acadêmica, não para alegação comercial.

## 12. Plano reproduzível de métricas e baselines

Este plano descreve trabalho futuro; não foi implementado nesta etapa.

### 12.1 Congelamento e qualidade do dataset

1. Criar um manifesto versionado com SHA-256, fonte, licença, data de extração, competições, campos, contagem e rejeições.
2. Excluir toda linha mockada ou sintética da avaliação oficial.
3. Normalizar `kickoffAt` para ISO 8601 UTC e rejeitar data ambígua; preservar data original em campo separado.
4. Deduplicar por identificador do provedor ou chave documentada, registrando colisões.
5. Separar dataset de desenvolvimento, calibração e teste bloqueado. O teste não pode orientar feature, regra ou hiperparâmetro.
6. Publicar cobertura por fonte, competição, temporada, time e mercado. Cartões e escanteios continuam opcionais e retornam `dados_insuficientes` quando aplicável.

### 12.2 Validação temporal sem vazamento

- usar avaliação `walk-forward` por timestamp;
- para uma partida em `t`, treinar apenas com partidas cujo término conhecido seja anterior a `t`;
- agrupar partidas com o mesmo timestamp ou, quando só houver data, o mesmo dia inteiro, impedindo aprendizado dentro do bloco;
- manter uma janela inicial mínima pré-registrada e nunca reduzi-la para obter cobertura;
- reportar resultados globalmente e por competição/temporada;
- manter um holdout final de pelo menos uma temporada ou período ainda não observado no desenvolvimento;
- impedir features que contenham placar, estatísticas pós-jogo ou agregados atualizados após o cutoff.

### 12.3 Baselines

Todos os baselines usam apenas dados anteriores ao alvo.

| Baseline | Regra reproduzível | Mercados |
| --- | --- | --- |
| Frequência-base | Frequência acumulada no treino por mercado; fallback global quando segmento não atinge amostra | Todos |
| Mandante sempre vence | Probabilidade pontual H=1, D=0, A=0; também uma versão probabilística com frequência histórica de mandante | 1X2 |
| Empate sempre | D=1 para expor o desempenho de uma regra simples | 1X2 |
| Classe majoritária | Classe mais frequente do treino; empate determinístico resolvido por ordem pré-registrada | 1X2 e binários |
| Odds implícitas | Converter odds decimais pré-jogo em `q=1/odd` e remover margem por `p_i=q_i/sum(q)` | Apenas benchmark analítico |

Odds devem vir de fonte licenciada, ser congeladas no timestamp pré-jogo e ficar em pipeline isolado da API e UI do produto. Não serão mostradas como recomendação, valor esperado ou oportunidade. Se não houver licença para armazená-las na avaliação, o baseline será marcado `dados_insuficientes`, não substituído por odds inventadas.

### 12.4 Métricas

- 1X2: accuracy top-1 por jogo, Brier multiclasses e matriz de confusão;
- binários: Brier da classe positiva uma vez por jogo, accuracy com limiar pré-registrado e prevalência;
- dupla chance: Brier por seleção sobreposta, sempre rotulado como multilabel;
- todos: cobertura por jogos elegíveis, tamanho de amostra e taxa de `dados_insuficientes`;
- calibração: tabela e gráfico por decis de probabilidade, observado versus previsto, ECE, intercepto e inclinação de calibração;
- incerteza: intervalo de 95% por bootstrap em blocos de competição/data, preservando dependência temporal;
- comparação: diferença pareada de Brier `modelo - baseline`, absoluta e relativa, no mesmo conjunto de partidas;
- drift: métricas por temporada, competição e fonte, sem agregar segmentos pequenos de forma enganosa.

### 12.5 Critério técnico de aprovação

No holdout bloqueado, com pelo menos 1.000 partidas elegíveis, três competições e dois períodos/temporadas:

1. cobertura mínima de 80% nos mercados centrais 1X2, gols e ambas marcam;
2. Brier pelo menos 2% melhor, em termos relativos, que o melhor baseline ingênuo em cada mercado central;
3. limite superior do intervalo de 95% da diferença agregada de Brier abaixo de zero;
4. ECE no máximo 0,05 e inclinação de calibração entre 0,8 e 1,2;
5. nenhum mercado central piora mais de 1% relativo em Brier contra o melhor baseline ingênuo;
6. comparação com odds publicada quando houver licença. Sem superar odds, é proibido alegar vantagem preditiva sobre o mercado, mesmo que o produto editorial prossiga por ganho de fluxo;
7. cartões e escanteios não bloqueiam os mercados centrais, mas só aparecem quando sua própria cobertura e amostra satisfazem a política de `dados_insuficientes`.

Executar a avaliação duas vezes a partir do mesmo manifesto deve produzir os mesmos splits e métricas, exceto timestamps de geração. O relatório deve registrar commit, configuração, hashes e versões.

## 13. Matriz de decisão

| Gate | Evidência exigida | Situação atual | Decisão atual |
| --- | --- | --- | --- |
| Modelo supera baseline? | Holdout temporal bloqueado, baselines, Brier, calibração e IC | Não existe; métricas atuais são inconclusivas | **NO-GO** |
| Dados podem ser armazenados e redistribuídos comercialmente? | Contratos ou autorizações escritas por fonte e competição | Termos atuais não concedem os direitos necessários | **NO-GO** |
| Custo de dados é coberto pelo preço? | Cotação comercial + modelo de margem conservador ≥70% | Licença comercial e disposição a pagar desconhecidas | **NO-GO** |
| Há comprador real disposto a pagar? | 20 entrevistas, 5 confirmações de orçamento e 3 LOIs/pilotos | Nenhuma evidência registrada | **NO-GO** |
| Há parecer jurídico sobre o enquadramento? | Parecer escrito de advogado especializado | Inexistente | **NO-GO** |

Regra: iniciar construção de SaaS somente quando todos os cinco gates estiverem verdes. Um gate “desconhecido” conta como vermelho.

## 14. Critérios de go, pivot e encerramento

### Go para um piloto manual, ainda sem SaaS

Todos os gates abaixo:

- critérios técnicos da seção 12.5 atendidos;
- licença escrita cobrindo o piloto, armazenamento, derivados e saída editorial;
- parecer jurídico favorável ao fluxo e à comunicação propostos;
- pelo menos 3 cartas de intenção ou pilotos aprovados no preço-alvo;
- margem bruta conservadora projetada de 70% ou mais;
- processo manual consegue entregar o briefing no tempo prometido sem dado sintético.

### Pivot

- se há comprador e licença, mas o modelo não supera baseline: vender fluxo de dados/licenciamento e educação, sem alegação de superioridade preditiva;
- se mídia não valida e escolas validam: pivot para laboratório educacional institucional;
- se licença de redistribuição é inviável: avaliar ferramenta local em que o cliente traz sua própria fonte licenciada, somente após revisão jurídica;
- se demanda vem principalmente de apostas: não seguir automaticamente; reavaliar posicionamento e risco antes de qualquer experimento.

### Encerrar a hipótese comercial

Encerrar ou arquivar o projeto como demonstração acadêmica se qualquer condição ocorrer:

- após 20 entrevistas qualificadas, menos de 10 dores com nota 4/5 ou menos de 5 compradores confirmam orçamento;
- após 150 visitas qualificadas, conversão válida fica abaixo de 5%, e uma segunda iteração focada também falha;
- nenhuma fonte concede por escrito os direitos necessários em preço compatível com margem de 70%;
- duas execuções independentes do protocolo temporal falham nos critérios técnicos;
- parecer jurídico conclui que o fluxo pretendido exige autorização ou exposição incompatível com recursos e posicionamento;
- a proposta só demonstra tração quando usa promessa de ganho, odds como recomendação, afiliados ou marcas de apostas.

Encerrar a hipótese comercial não significa apagar o projeto: ele pode permanecer como plataforma acadêmica, com datasets permitidos, mocks apenas em testes e aviso ético visível.

## 15. Sequência recomendada de validação

1. Semana 1: obter cotações e respostas de licença; contratar revisão jurídica; preparar roteiro e aviso de privacidade.
2. Semanas 1–3: realizar 20 entrevistas e medir o fluxo manual atual.
3. Semanas 2–4: corrigir o protocolo de avaliação em branch própria, sem alterar o produto, e congelar holdout.
4. Semanas 3–5: executar landing page e demonstrar apenas saída licenciada ou wireframe.
5. Semana 6: preencher novamente a matriz com evidências e decidir `go`, `pivot` ou encerramento.

Nenhuma etapa dessa sequência autoriza implementar billing, planos, papéis, permissões, autenticação multi-cliente ou tenancy.

## 16. Baseline técnico desta etapa

Antes da criação deste documento:

- `npm run build`: passou; compila frontend com `tsc -b`, Vite e backend com TypeScript estrito;
- `npm run backend:test`: passou, 10 de 10 testes;
- `npm run lint`: não executável, pois o script não existe no `package.json`;
- `npm run typecheck`: não executável, pois o script não existe no `package.json`; o build executa os compiladores TypeScript, mas não há comando dedicado;
- nenhuma arquitetura de cobrança ou tenancy foi criada;
- nenhum arquivo de código, schema, migration, dado ou artefato de modelo foi alterado nesta etapa.

## 17. Critérios de aceite desta validação

- [x] problema e proposta de valor sem promessa de lucro definidos;
- [x] ICP principal, ICP secundário e segmentos descartados documentados;
- [x] hipóteses de preço, custo de dados e margem definidas;
- [x] riscos e checklist de licenciamento/redistribuição documentados;
- [x] questões regulatórias listadas sem emitir parecer jurídico;
- [x] perguntas de entrevista e experimento de landing page definidos;
- [x] métricas atuais auditadas e marcadas como inconclusivas;
- [x] plano reproduzível de baselines, validação temporal, calibração e Brier Score definido;
- [x] matriz de decisão e critérios objetivos de `go/no-go` preenchidos;
- [x] critérios explícitos de pivot e encerramento definidos;
- [x] nenhuma funcionalidade de cobrança ou tenancy implementada.
