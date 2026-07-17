# Fontes de Dados

## football-data.org API v4

Fonte complementar recomendada para a agenda atual das cinco ligas exibidas no produto:

- Base URL: `https://api.football-data.org/v4`
- Token somente no servidor: `FOOTBALL_DATA_ORG_API_KEY`
- Endpoint: `GET /v4/matches`, filtrado por `competitions`, `dateFrom` e `dateTo`
- Codigos: `BSA`, `PL`, `PD`, `FL1` e `BL1`
- Uma unica requisicao cobre a janela rolante e reduz o consumo de cota
- Datas persistidas em UTC; conversao para `America/Sao_Paulo` ocorre apenas na apresentacao

Referencias oficiais: [inicio](https://www.football-data.org/), [quickstart](https://www.football-data.org/documentation/quickstart), [recurso de partidas](https://docs.football-data.org/general/v4/match.html), [cobertura](https://www.football-data.org/coverage) e [politicas de requisicao](https://docs.football-data.org/general/v4/policies.html).

O plano, a licenca e a finalidade permitida devem ser conferidos pelo responsavel da conta. A aplicacao exige `FOOTBALL_DATA_ORG_USE_POLICY_REFERENCE`, `FOOTBALL_DATA_ORG_LICENSE_REFERENCE` e `FOOTBALL_DATA_ORG_ALLOWED_ENVIRONMENTS`; esses campos sao referencias operacionais, nao parecer juridico.

## API-Football / API-Sports

Fonte primaria para dados atualizados:

- Base URL: `https://v3.football.api-sports.io`
- Chave: `API_FOOTBALL_KEY`
- Fixtures futuras buscadas numa janela rolante: de hoje ate hoje + `BETINTEL_FIXTURE_DAYS` (padrao 7 dias). `BETINTEL_FIXTURE_TO=YYYY-MM-DD` fixa uma data final e tem prioridade quando definido.
- Resultados historicos para treino: ultimos `BETINTEL_API_HISTORY_YEARS` anos (padrao 5), usando `/fixtures` por liga/temporada e filtrando apenas partidas com placar.
- Endpoints usados/previstos: `/fixtures`, eventos e estatisticas embutidos quando disponiveis.
- **Limitacao do plano gratuito:** o plano Free da API-Football pode restringir temporadas recentes. O backend registra o erro no relatorio e nao cria calendario ou fixture simulada como fallback.

Competicoes buscadas por padrao:

- Brasileirao Serie A: `league=71`, `season=2026`
- Premier League: `league=39`, `season=2026`
- La Liga: `league=140`, `season=2026`
- Ligue 1: `league=61`, `season=2026`
- Bundesliga: `league=78`, `season=2026`

Restricao: a aplicacao nao usa endpoint de previsoes prontas da API como decisao do modelo.

O sync usa apenas linhas reais aceitas, registra avisos/rejeicoes e complementa o historico com Football-Data.co.uk. Se nenhuma fonte real retornar dados, a transacao e abortada.

## Football-Data.co.uk

Fonte secundaria para historico:

- Pagina: https://www.football-data.co.uk/data.php
- Notas de colunas: https://www.football-data.co.uk/notes.txt

Colunas usadas:

- `FTHG`, `FTAG`, `FTR`
- `HC`, `AC`
- `HY`, `AY`, `HR`, `AR`

Odds presentes nos CSVs sao removidas pelo provider e nao entram no produto final.

Confrontos indefinidos nunca sao convertidos em previsoes. Ausencia de fonte atual produz estado vazio/aviso.

## Demonstracao simulada

Dados simulados ficam restritos ao modo visual explicito `?demo=1` do frontend. O sincronizador nao os produz e o importador PostgreSQL rejeita provider contendo `mock`, `fallback` ou `simulad`, salvo `--allow-demo-data` solicitado em ambiente descartavel.

## Opta / Stats Perform

Opta e uma fonte profissional da Stats Perform. A integracao e possivel apenas com acesso licenciado, API key e documentacao contratual dos endpoints. O projeto nao deve fazer scraping, copiar datasets proprietarios ou usar dados fora dos termos.

Campos Opta que melhorariam o modelo:

- expected goals (xG);
- finalizacoes e finalizacoes no alvo;
- posse, passes progressivos e ataques perigosos;
- pressao/recuperacoes;
- escalações, ausencias e substituicoes;
- eventos em tempo real;
- estatisticas por jogador e por time.

Com esses dados, o provider deve normalizar tudo para o schema interno antes de treinar, mantendo odds e recomendacoes financeiras fora do produto.
