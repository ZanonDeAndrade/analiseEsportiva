# Prompts Principais do BetIntel AI

Este arquivo registra prompts representativos usados para orientar o
desenvolvimento assistido por IA no projeto BetIntel AI. Eles foram
consolidados para documentar o processo de harness engineering exigido no
Trabalho 2 de Inteligencia Artificial.

Os prompts nao representam um pedido unico para a IA entregar o projeto pronto.
Eles mostram como a IA foi orientada por etapas: entendimento do enunciado,
especificacao, arquitetura, dados, treinamento, avaliacao, frontend,
documentacao e validacao.

Regra geral usada em todos os prompts: preservar TypeScript estrito, manter tom
academico, nao usar odds como recomendacao, nao prometer resultado, exibir aviso
etico e retornar `dados_insuficientes` quando um mercado nao possuir coluna ou
amostra suficiente.

Aviso etico obrigatorio do produto:

```text
Analise baseada em dados historicos. Nao garante resultado.
```

---

## 1. Interpretacao do enunciado e definicao do projeto

```text
Estou desenvolvendo o Trabalho 2 da disciplina de Inteligencia Artificial, cujo
foco e AI-driven development, harness engineering, specification-driven
development, uso de agentes, skills, prompts, criterios de aceite e validacao
tecnica.

Minha ideia e construir o BetIntel AI, uma plataforma academica de analise
probabilistica de futebol. O sistema nao deve funcionar como casa de apostas,
nao deve recomendar apostas, nao deve prometer lucro e nao deve usar odds como
sugestao financeira.

Me ajude a transformar essa ideia em uma proposta tecnica coerente com o
enunciado do professor. Quero que voce me ajude a definir:
- o problema que o projeto resolve;
- o objetivo da solucao;
- quais partes usam IA ou aprendizado de maquina;
- quais partes demonstram harness engineering;
- quais arquivos de especificacao e documentacao preciso manter;
- quais criterios de aceite tornam a entrega verificavel.

Nao gere o projeto pronto. Quero uma analise estruturada para eu tomar as
decisoes e implementar.
```

## 2. Definicao do escopo academico e etico

```text
Estou definindo as regras de escopo do BetIntel AI. O projeto deve ser uma
ferramenta educacional de analise probabilistica de partidas de futebol, usando
dados historicos para estimar probabilidades de mercados como 1X2, over/under
gols, ambas marcam, dupla chance, cartoes e escanteios.

Me ajude a escrever restricoes tecnicas e eticas para orientar a IA durante o
desenvolvimento. As regras obrigatorias sao:
- nao prometer acerto;
- nao usar linguagem comercial;
- nao incentivar aposta financeira;
- nao usar odds como recomendacao;
- manter o aviso: "Analise baseada em dados historicos. Nao garante resultado.";
- retornar `dados_insuficientes` quando nao houver coluna ou amostra para um
  mercado;
- tratar cartoes e escanteios como opcionais, porque nem todo CSV possui essas
  colunas.

Quero que a resposta seja adequada para entrar em um arquivo `AGENTS.md` ou
`CLAUDE.md`, funcionando como instrucao inicial para um agente de IA.
```

## 3. Planejamento do harness do projeto

```text
Preciso estruturar o harness de desenvolvimento exigido no trabalho. O professor
pediu que o projeto mostre como a IA foi orientada, quais contextos foram
fornecidos, quais prompts foram usados, quais criterios de aceite existem e como
outra pessoa poderia reproduzir ou continuar o projeto.

Meu repositorio tera:
- `specs/` para especificacao SDD;
- `docs/` como system of record tecnico;
- `.claude/` para contexto, prompts, agentes e skills;
- `backend/` para pipeline de dados, treinamento, avaliacao, backtest e API;
- `frontend/` para a interface React;
- `evals/` para casos de avaliacao;
- `README.md` para reproducao;
- `AGENTS.md` para orientacao geral da IA.

Me ajude a revisar se essa estrutura atende ao enunciado. Para cada pasta,
explique qual evidencia ela fornece para o professor avaliar o uso de harness
engineering. Nao implemente arquivos ainda; quero primeiro validar a organizacao.
```

## 4. Especificacao orientada por SDD

```text
Quero escrever os arquivos de especificacao do BetIntel AI antes de avancar na
implementacao. Me ajude a organizar a especificacao em tres arquivos:
`specs/projeto.md`, `specs/requisitos.md` e `specs/criterios-aceite.md`.

O conteudo deve cobrir:
- objetivo do sistema;
- problema resolvido;
- publico-alvo academico;
- funcionalidades esperadas;
- restricoes eticas;
- requisitos funcionais;
- requisitos nao funcionais;
- criterios de aceite verificaveis;
- comandos que devem passar na entrega.

Nao quero texto comercial. Quero uma especificacao tecnica, objetiva e
compativel com desenvolvimento guiado por IA.
```

## 5. Arquitetura frontend/backend

```text
Estou planejando a arquitetura do BetIntel AI. Quero separar o projeto em
frontend React + Vite + TypeScript e backend Node.js + TypeScript.

O frontend deve:
- listar jogos futuros;
- permitir filtro por competicao e data;
- permitir selecao de uma partida;
- exibir mercados disponiveis;
- exibir mercados ignorados por falta de dados;
- mostrar fonte dos dados, atualizacao, tamanho da amostra e confianca;
- manter aviso etico visivel.

O backend deve:
- sincronizar dados;
- manter cache local;
- transformar dados historicos em features;
- treinar modelo;
- avaliar modelo;
- rodar backtest;
- servir rotas HTTP;
- retornar previsoes probabilisticas sem promessa de resultado.

Me ajude a revisar essa arquitetura, indicando responsabilidades de cada modulo.
Nao escreva todo o codigo; quero validar a divisao tecnica antes da
implementacao.
```

## 6. Definicao das rotas da API

```text
Estou definindo as rotas HTTP do backend do BetIntel AI. A API precisa ser
simples, local e facil de validar durante a apresentacao.

As rotas previstas sao:
- `GET /health`: verificar se o backend esta ativo e se existe modelo treinado;
- `GET /markets`: listar mercados suportados;
- `GET /competitions`: listar competicoes disponiveis no cache;
- `GET /fixtures`: listar jogos futuros, com filtros por competicao e periodo;
- `POST /sync-data`: sincronizar dados externos e atualizar cache;
- `POST /train`: treinar o modelo com os dados historicos disponiveis;
- `GET /evaluation`: retornar metricas de avaliacao;
- `GET /backtest`: retornar resultado de backtesting temporal;
- `POST /predict`: receber uma partida e retornar analise probabilistica.

Me ajude a definir o contrato esperado de cada rota: metodo, objetivo, entrada,
saida, possiveis erros e campos importantes para validacao academica. A resposta
deve priorizar clareza e reprodutibilidade, nao sofisticacao desnecessaria.
```

## 7. Pipeline de dados

```text
Preciso estruturar o pipeline de dados do BetIntel AI. A fonte principal para
jogos atuais deve ser API-Football, usando `API_FOOTBALL_KEY` por variavel de
ambiente. Para a Copa do Mundo 2026, a regra e usar `league=1`, `season=2026` e
segmento `World Cup 2026`.

Tambem quero usar CSVs historicos do Football-Data.co.uk para treinamento,
ignorando odds e aproveitando apenas colunas esportivas como placar, resultado,
cartoes e escanteios quando existirem.

Me ajude a desenhar o fluxo:
1. sincronizacao;
2. cache local;
3. normalizacao dos dados;
4. deteccao de colunas disponiveis;
5. geracao de features;
6. treinamento;
7. avaliacao;
8. backtest;
9. predicao.

Inclua tambem riscos e limitacoes, como plano gratuito da API, ausencia de dados
de cartoes/escanteios e necessidade de fallback. Nao escreva implementacao
completa; quero um desenho tecnico para orientar o desenvolvimento.
```

## 8. Prompt para obter planilha com dados das ultimas Copas

```text
Preciso montar uma base historica em formato Excel para alimentar o treinamento
do BetIntel AI. O arquivo deve conter partidas das ultimas Copas do Mundo ja
concluidas, priorizando dados verificaveis e sem odds.

Monte uma especificacao de planilha `.xlsx` com dados das Copas de 2002, 2006,
2010, 2014, 2018 e 2022. Para cada partida, quero colunas como:
- ano da Copa;
- fase;
- data;
- selecao mandante ou time A;
- selecao visitante ou time B;
- gols do time A;
- gols do time B;
- resultado final;
- vencedor;
- total de gols;
- ambas marcam;
- over 1.5 gols;
- over 2.5 gols;
- over 3.5 gols;
- under 2.5 gols;
- under 3.5 gols;
- observacoes sobre prorrogacao ou penaltis, quando relevante;
- fonte dos dados.

Nao inclua odds, casas de aposta, probabilidades prontas ou recomendacoes
financeiras. Se algum dado nao estiver disponivel com seguranca, marque como
ausente em vez de inventar.

O objetivo da planilha e servir como base historica para treinamento e validacao
academica de um modelo probabilistico simples. A saida deve ser organizada para
posterior importacao no backend TypeScript do projeto.
```

## 9. Feature engineering e labels

```text
Estou definindo a etapa de feature engineering. Cada linha historica deve
representar uma partida com dados como time mandante, time visitante, competicao,
temporada, placar final, total de gols, resultado, cartoes e escanteios quando
disponiveis.

Quero gerar labels para estes mercados:
- 1X2;
- Over 1.5 gols;
- Over 2.5 gols;
- Over 3.5 gols;
- Under 2.5 gols;
- Under 3.5 gols;
- Ambas Marcam;
- Dupla Chance;
- Cartoes;
- Escanteios.

Me ajude a revisar como derivar cada label a partir das colunas historicas. Para
cada mercado, indique:
- quais colunas sao obrigatorias;
- quais colunas sao opcionais;
- quando o mercado deve ser considerado disponivel;
- quando deve retornar `dados_insuficientes`;
- quais testes unitarios deveriam validar essa regra.

Nao use odds e nao trate cartoes/escanteios como obrigatorios para todo dataset.
```

## 10. Prompt para orientar o treinamento do modelo

```text
Agora quero usar a base historica das ultimas Copas do Mundo para treinar a
IA/modelo do BetIntel AI. O objetivo nao e criar uma previsao garantida, mas um
modelo academico e explicavel de analise probabilistica baseado em dados
historicos.

Considere que a planilha contem partidas historicas com colunas como ano, fase,
selecoes, placar, total de gols, resultado, over/under e ambas marcam. Me ajude
a definir o fluxo de treinamento com as seguintes etapas:

1. Ler os dados historicos da planilha ou CSV.
2. Validar se as colunas obrigatorias existem.
3. Remover ou marcar linhas incompletas.
4. Gerar features a partir dos jogos:
   - total de gols;
   - resultado 1X2;
   - desempenho historico por selecao;
   - gols pro e contra;
   - frequencia de over/under;
   - frequencia de ambas marcam;
   - desempenho por fase ou edicao da Copa, se houver amostra suficiente.
5. Criar labels para os mercados:
   - 1X2;
   - Over 1.5 gols;
   - Over 2.5 gols;
   - Over 3.5 gols;
   - Under 2.5 gols;
   - Under 3.5 gols;
   - Ambas Marcam;
   - Dupla Chance.
6. Treinar um modelo simples e explicavel usando frequencias historicas
   segmentadas, evitando modelos complexos demais para uma base pequena.
7. Calcular probabilidades globais e probabilidades por segmento.
8. Retornar `dados_insuficientes` quando a amostra de um mercado ou segmento for
   menor que o minimo definido.
9. Avaliar o modelo com metricas como accuracy, brier score, cobertura por
   mercado e backtesting temporal.
10. Salvar o artefato treinado em `backend/artifacts/model.json`.

Quero que o treinamento seja defensavel em apresentacao academica. Explique as
limitacoes da base de Copas do Mundo, principalmente o tamanho reduzido da
amostra, mudancas de selecoes ao longo dos anos e o risco de falsa precisao.

Nao use odds. Nao apresente o resultado como recomendacao de aposta. O modelo
deve produzir estimativas educacionais acompanhadas do aviso:
"Analise baseada em dados historicos. Nao garante resultado."
```

## 11. Refinamento do treinamento para diferenciar confrontos

```text
Percebi que uma analise igual para todas as partidas nao seria suficiente para
defender o projeto. Quero melhorar o treinamento para que o BetIntel AI
diferencie os confrontos.

Use a base historica das Copas e dos CSVs historicos para criar perfis por time
ou selecao. Para cada time, calcule:
- quantidade de jogos;
- vitorias, empates e derrotas;
- gols marcados;
- gols sofridos;
- media de gols marcados;
- media de gols sofridos;
- frequencia de over 1.5, over 2.5 e over 3.5;
- frequencia de ambas marcam;
- desempenho como mandante/visitante ou time A/time B, se essa separacao fizer
  sentido;
- desempenho por edicao, temporada, liga ou fase somente se houver amostra
  suficiente.

Depois, use esses perfis para ajustar as probabilidades base do confronto entre
duas equipes. O ajuste deve ser conservador, porque a base historica pode ser
pequena. Quero evitar que o modelo pareca mais preciso do que realmente e.

Tambem preciso que a resposta do backend deixe claro:
- qual mercado esta disponivel;
- qual mercado foi ignorado;
- qual amostra foi usada;
- qual a confianca da analise;
- quais limitacoes existem.

Me ajude a transformar isso em uma estrategia tecnica simples, implementavel em
TypeScript e facil de explicar para o professor.
```

## 12. Regra de dados insuficientes

```text
Preciso garantir que o backend nunca invente probabilidade quando nao houver
dados. Para cada mercado, se nao existir coluna necessaria ou se a amostra valida
for menor que o minimo, o sistema deve retornar `dados_insuficientes`.

Me ajude a definir um contrato de resposta para mercados ignorados. Quero que
cada item informe:
- id do mercado;
- nome de exibicao;
- status `dados_insuficientes`;
- motivo;
- colunas obrigatorias;
- colunas opcionais.

Tambem quero uma orientacao de testes para garantir que cartoes e escanteios nao
quebrem quando o CSV nao tiver essas colunas. A resposta deve ser tecnica e
objetiva.
```

## 13. Predicao de partidas

```text
Estou planejando o endpoint `POST /predict`. Ele deve receber uma partida, com
campos como mandante, visitante, competicao, liga, temporada e data, ou entao um
`fixtureId` que permita enriquecer a requisicao a partir do cache.

A resposta deve incluir:
- dados do jogo;
- fonte dos dados;
- data de atualizacao;
- tamanho da amostra;
- confianca;
- aviso etico;
- mercados disponiveis;
- mercados ignorados;
- probabilidades por selecao.

Me ajude a revisar o formato dessa resposta e os cuidados necessarios para nao
apresentar a analise como certeza ou recomendacao financeira. Quero que o retorno
seja facil de consumir no frontend e facil de explicar para o professor.
```

## 14. Avaliacao do modelo

```text
Preciso avaliar o modelo do BetIntel AI de forma honesta. Como o sistema estima
probabilidades por mercado, quero usar metricas simples e interpretaveis:
- accuracy por selecao;
- brier score;
- cobertura por mercado;
- quantidade de linhas usadas;
- quantidade de mercados ignorados;
- comparacao temporal via backtest.

Me ajude a definir como essas metricas devem ser calculadas e apresentadas. A
explicacao precisa deixar claro que avaliacao nao significa garantia de acerto
futuro. Tambem quero sugestoes de casos em que a avaliacao pode ser enganosa,
como amostra pequena, vies por competicao ou falta de colunas.
```

## 15. Backtesting temporal

```text
Quero implementar um backtest temporal simples. A ideia e ordenar partidas por
data, usar uma janela inicial de treino, prever partidas seguintes e acumular
metricas ao longo do tempo.

Me ajude a revisar essa estrategia:
- qual deve ser a janela minima;
- quais mercados devem entrar no backtest;
- como lidar com mercados sem dados;
- como registrar erros;
- quais metricas finais fazem sentido;
- como explicar as limitacoes na documentacao.

Nao quero uma promessa de performance. Quero um mecanismo de validacao tecnica
para demonstrar maturidade do projeto.
```

## 16. Integracao com API-Football e Copa 2026

```text
Preciso integrar o BetIntel AI com a API-Football para buscar jogos atuais. A
chave deve ser lida somente pela variavel de ambiente `API_FOOTBALL_KEY`.

Para a Copa do Mundo 2026, use:
- `league=1`;
- `season=2026`;
- segmento `World Cup 2026`.

Me ajude a definir uma estrategia segura para buscar fixtures futuras, salvar
cache local e lidar com falhas da API. Se a API nao retornar jogos por limitacao
de plano, o sistema deve cair para um calendario oficial/fallback, sem deixar o
frontend vazio.

A implementacao nao deve usar odds, previsoes prontas da API nem recomendacoes
de aposta. A resposta deve manter o carater academico e informar a fonte dos
dados.
```

## 17. Ingestao de CSVs historicos

```text
Quero usar CSVs historicos do Football-Data.co.uk como base complementar para
treinamento. Esses arquivos podem conter colunas de placar, resultado, cartoes,
escanteios e odds.

Me ajude a definir um parser que:
- leia os CSVs historicos;
- aproveite colunas como `FTHG`, `FTAG`, `FTR`, `HC`, `AC`, `HY`, `AY`, `HR`,
  `AR`;
- ignore completamente colunas de odds;
- normalize nomes de times;
- detecte colunas ausentes;
- nao quebre quando cartoes ou escanteios nao existirem;
- registre linhas rejeitadas ou incompletas.

O objetivo e gerar uma base limpa para o treinamento probabilistico do BetIntel
AI.
```

## 18. Testes do backend

```text
Preciso criar testes para validar o backend do BetIntel AI. Os testes devem
cobrir principalmente regras de mercado e dados insuficientes.

Crie uma estrategia de testes para verificar:
- labels de 1X2;
- over 1.5, 2.5 e 3.5 gols;
- under 2.5 e 3.5 gols;
- ambas marcam;
- dupla chance;
- cartoes e escanteios quando existem colunas;
- retorno `dados_insuficientes` quando faltam colunas ou amostra minima;
- provider API-Football com payload mockado;
- provider Football-Data com CSV mockado.

Os testes devem ser compativeis com TypeScript estrito e `node:test`.
```

## 19. Frontend e experiencia do usuario

```text
Estou construindo o frontend do BetIntel AI em React + Vite + TypeScript. A
interface deve ser clara, academica e responsiva, sem parecer um site comercial
de apostas.

A tela principal deve permitir:
- filtrar jogos por competicao;
- visualizar jogos futuros;
- selecionar uma partida;
- ver analise probabilistica;
- distinguir mercados disponiveis de mercados ignorados;
- exibir confianca, amostra e fonte dos dados;
- mostrar aviso etico sempre visivel;
- lidar com backend indisponivel usando dados de fallback identificados como
  mockados.

Me ajude a revisar o comportamento esperado da interface, os estados de
loading/erro/vazio e os pontos que devo testar em desktop e mobile. Nao quero
copy comercial nem elementos de casas de aposta.
```

## 20. Integracao do frontend com o backend

```text
Estou conectando o frontend React ao backend local do BetIntel AI. O frontend
deve consumir as rotas `/fixtures`, `/competitions`, `/markets` e `/predict`.

Me ajude a revisar a integracao para garantir que:
- os filtros de competicao funcionem;
- a lista de jogos atualize corretamente;
- o painel de analise mude ao selecionar uma partida;
- mercados disponiveis e ignorados aparecam separados;
- o aviso etico fique visivel;
- estados de loading, erro e backend indisponivel sejam tratados;
- dados simulados ou fallback sejam identificados claramente.

A interface deve continuar academica e nao pode parecer uma plataforma comercial
de apostas.
```

## 21. Documentacao e reproducao

```text
Preciso documentar o BetIntel AI para que outra pessoa consiga reproduzir o
projeto a partir do repositorio.

Me ajude a revisar o README e os documentos tecnicos para explicar:
- objetivo do projeto;
- estrutura de pastas;
- instalacao com `npm install`;
- configuracao do `.env`;
- uso de `API_FOOTBALL_KEY`;
- comandos de build, teste, sync, treino, avaliacao, backtest e servidor;
- rotas disponiveis;
- fontes de dados;
- limitacoes do modelo;
- aviso etico;
- como o harness foi organizado.

A documentacao deve ser clara para o professor avaliar e tambem para outro aluno
conseguir continuar o projeto.
```

## 22. Validacao final da entrega

```text
Antes de concluir o projeto, quero revisar se a entrega atende ao enunciado do
professor. Use este checklist:
- build sem erro;
- testes passando;
- filtros funcionando;
- Copa do Mundo 2026 no frontend;
- painel de analise atualizando;
- layout legivel em desktop e mobile;
- aviso etico visivel;
- backend retornando `dados_insuficientes` para mercados sem dados;
- README explicando reproducao;
- docs explicando arquitetura, dados, modelo, avaliacao e limitacoes;
- prompts registrados;
- harness organizado em specs, docs, agentes, skills e criterios de aceite.

Me ajude a fazer uma revisao critica. Aponte lacunas, riscos de avaliacao e
melhorias prioritarias, mas nao reescreva o projeto inteiro.
```

## 23. Auditoria contra o enunciado

```text
Compare o projeto BetIntel AI com o enunciado do Trabalho 2 de Inteligencia
Artificial. Verifique se o repositorio demonstra:
- solucao aplicada de IA;
- harness de desenvolvimento;
- specification-driven development;
- prompts registrados;
- agentes ou skills documentados;
- criterios de aceite;
- testes ou evals;
- docs como system of record;
- README com reproducao;
- dominio tecnico e validacao critica.

Aponte o que esta completo, o que esta fraco e o que precisa ser ajustado antes
da entrega.
```

