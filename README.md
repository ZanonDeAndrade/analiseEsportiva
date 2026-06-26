# BetIntel AI

BetIntel AI e uma plataforma academica de analise probabilistica de futebol. O projeto demonstra uma solucao aplicada de IA com frontend, backend TypeScript, ingestao de dados, treinamento, avaliacao, backtesting e um harness de desenvolvimento orientado por especificacoes.

O sistema nao e casa de apostas, nao recomenda aposta financeira e nao promete lucro. Todas as probabilidades sao estimativas educacionais. Aviso obrigatorio: "Analise baseada em dados historicos. Nao garante resultado."

## Stack

- React + Vite + TypeScript
- Backend local em Node.js + TypeScript
- Testes com `node:test`
- Cache local em `backend/data`
- Artefatos de modelo em `backend/artifacts`

## Estrutura

- `frontend/`: aplicacao React + Vite.
- `frontend/src/`: componentes, estilos, dados de fallback e cliente HTTP.
- `backend/`: API local, providers, pipeline de dados, treino, avaliacao e backtesting.
- `specs/`: especificacao SDD, requisitos e criterios de aceite.
- `.claude/` e `.codex/`: contexto, prompts e agentes usados para orientar a IA.
- `docs/`: system of record tecnico.
- `evals/`: casos de avaliacao.

A conferencia contra a estrutura minima pedida no enunciado esta em
[`docs/estrutura-entrega.md`](docs/estrutura-entrega.md).

## Configuracao

```bash
npm install
```

Crie um `.env` a partir de `.env.example` quando for usar a API-Football:

```bash
API_FOOTBALL_KEY=
BETINTEL_BACKEND_PORT=3333
BETINTEL_MODEL_PATH=backend/artifacts/model.json
BETINTEL_DATA_DIR=backend/data
BETINTEL_FIXTURE_REFRESH_MS=300000
BETINTEL_API_HISTORY_YEARS=5
BETINTEL_SYNC_API_HISTORY=true
BETINTEL_FIXTURE_DAYS=7
# BETINTEL_FIXTURE_TO=2026-12-31  # opcional; se definido, sobrescreve a janela em dias
```

Sem acesso a 2026 na API-Football (sem chave ou plano gratuito, que so cobre 2022-2024), o backend usa o **calendario oficial real da Copa do Mundo 2026** para os jogos e Football-Data.co.uk para historico. Veja a ordem de fontes em [Jogos Atuais](#jogos-atuais).

## Como Rodar

Frontend:

```bash
npm run dev
```

Backend:

```bash
npm run backend:serve
```

Build completo:

```bash
npm run build
```

## Pipeline de Dados e Modelo

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

- `backend:sync`: usa API-Football quando `API_FOOTBALL_KEY` existe, busca CSVs historicos do Football-Data.co.uk e grava cache local.
- `backend:sync -- --api-history-years 5`: define quantos anos historicos da API-Football entram no treino.
- `backend:sync -- --skip-api-history`: sincroniza fixtures atuais sem baixar historico da API-Football.
- `backend:train`: treina frequencias historicas por mercado e segmento.
- `backend:evaluate`: calcula accuracy por selecao, brier score e cobertura.
- `backend:backtest`: executa backtesting temporal simples.

## Como Melhorar a Acuracia

O modelo diferencia partidas usando:

- frequencias historicas por competicao/temporada;
- perfil do mandante e visitante;
- gols pro/contra;
- tendencia de over/under;
- ambas marcam;
- cartoes e escanteios quando existem dados.

Para melhorar a qualidade, aumente a base historica e rode novamente:

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```

Quando `API_FOOTBALL_KEY` esta configurada, `backend:sync` tenta baixar resultados da API-Football dos ultimos `BETINTEL_API_HISTORY_YEARS` anos para as competicoes alvo. O plano gratuito pode limitar temporadas, por exemplo retornando apenas 2022-2024; nesse caso o sync continua com os dados permitidos e registra avisos no terminal e em `backend/data/sync-metadata.json`.

Mais dados por time e competicao tendem a melhorar a estabilidade das estimativas, mas o sistema continua educacional e nao garante resultado.

## Fontes de Dados

- API-Football / API-Sports: `https://v3.football.api-sports.io`, com Copa do Mundo 2026 em `league=1` e `season=2026`.
- Football-Data.co.uk: CSVs historicos com colunas como `FTHG`, `FTAG`, `FTR`, `HC`, `AC`, `HY`, `AY`, `HR`, `AR`.
- Opta / Stats Perform: fonte profissional e licenciada. Pode ser integrada se houver contrato, API key e documentacao de endpoints liberados para o projeto.

Odds presentes em CSVs sao ignoradas no produto final.

## Endpoints

- `GET /health`
- `GET /markets`
- `GET /competitions`
- `GET /fixtures?competition=&from=&to=`
- `POST /sync-data`
- `POST /train`
- `GET /evaluation`
- `GET /backtest`
- `POST /predict`

`POST /predict` retorna `availableMarkets`, `ignoredMarkets`, `reason`, `sourceProvider`, `updatedAt`, `sampleSize` e `confidence`.

## Jogos Atuais

Para jogos 100% atuais, configure `API_FOOTBALL_KEY` e rode `npm run backend:sync`. O endpoint `/fixtures` retorna somente partidas futuras: quando `isoDate` fica menor ou igual ao horario atual, a partida sai da resposta. O frontend consulta o backend a cada 30 segundos e tambem remove localmente qualquer jogo cujo horario de inicio ja passou.

O backend atualiza o cache de fixtures automaticamente quando ele fica obsoleto (intervalo padrao `BETINTEL_FIXTURE_REFRESH_MS=300000`, 5 minutos). A ordem de preferencia das fontes e:

1. **API-Football** (se a chave + plano tiverem acesso a 2026) — jogos reais, ao vivo.
2. **Calendario oficial da Copa 2026** (`calendario-oficial`) — datas e confrontos reais publicados, porem estaticos. Usado quando a API nao libera 2026 (ex.: plano gratuito, que so cobre 2022-2024).
3. **Agenda simulada das ligas** (`mock-fallback`) — apenas quando nao ha jogos reais da Copa na janela, ou via `BETINTEL_SIMULATE_LEAGUES=true`.

Como a janela e relativa a "hoje", a lista avanca sozinha a cada dia.

Por padrao, a busca de fixtures e uma janela rolante de hoje ate hoje + `BETINTEL_FIXTURE_DAYS` (padrao 7 dias). Defina `BETINTEL_FIXTURE_TO=YYYY-MM-DD` para fixar uma data final (tem prioridade sobre a janela em dias). Competicoes alvo:

- Copa do Mundo 2026 (`league=1`, `season=2026`)
- Brasileirao Serie A (`league=71`, `season=2026`)
- Premier League (`league=39`, `season=2026`)
- La Liga (`league=140`, `season=2026`)
- Ligue 1 (`league=61`, `season=2026`)
- Bundesliga (`league=78`, `season=2026`)

## Mercados

- 1X2
- Over 1.5 gols
- Over 2.5 gols
- Over 3.5 gols
- Under 2.5 gols
- Under 3.5 gols
- Ambas Marcam
- Dupla Chance
- Cartoes
- Escanteios

Cartoes e escanteios sao opcionais por CSV. Se colunas ou amostras nao existirem, o status retornado e `dados_insuficientes`.

## Validacao

```bash
npm run build
npm run backend:test
```

Os testes cobrem labels de gols, 1X2, dupla chance, cartoes/escanteios sem dados, resposta `dados_insuficientes`, provider API-Football com payload mockado e provider Football-Data com CSV mockado.

## Harness

O harness exigido pelo trabalho esta em:

- `frontend/`
- `backend/`
- `specs/`
- `docs/`
- `.claude/`
- `.codex/`
- `evals/`
- `AGENTS.md`
- `CLAUDE.md`

Esses arquivos documentam objetivo, requisitos, criterios de aceite, arquitetura, fontes de dados, modelo, validacao, prompts, agente e skills usadas no desenvolvimento assistido por IA.

## Limitacoes

- Sem acesso a 2026 na API-Football (sem chave ou plano gratuito), a Copa do Mundo 2026 usa o **calendario oficial real** (`calendario-oficial`, datas reais porem estaticas) e as ligas, quando ligadas, usam agenda simulada (`mock-fallback`). O plano gratuito da API so cobre temporadas 2022-2024.
- O modelo atual usa frequencias historicas segmentadas, nao uma rede neural profunda.
- Dados de cartoes e escanteios dependem da disponibilidade real nas fontes.
- O projeto tem finalidade academica e educacional.
