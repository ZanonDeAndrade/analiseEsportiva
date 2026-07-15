# Fontes de Dados

## API-Football / API-Sports

Fonte primaria para dados atualizados:

- Base URL: `https://v3.football.api-sports.io`
- Chave: `API_FOOTBALL_KEY`
- Copa do Mundo 2026: `league=1` e `season=2026`
- Fixtures futuras buscadas numa janela rolante: de hoje ate hoje + `BETINTEL_FIXTURE_DAYS` (padrao 7 dias). `BETINTEL_FIXTURE_TO=YYYY-MM-DD` fixa uma data final e tem prioridade quando definido.
- Resultados historicos para treino: ultimos `BETINTEL_API_HISTORY_YEARS` anos (padrao 5), usando `/fixtures` por liga/temporada e filtrando apenas partidas com placar.
- Endpoints usados/previstos: `/fixtures`, eventos e estatisticas embutidos quando disponiveis.
- **Limitacao do plano gratuito:** o plano Free da API-Football pode restringir temporadas recentes. O backend registra o erro no relatorio e nao cria calendario ou fixture simulada como fallback.

Competicoes buscadas por padrao:

- Copa do Mundo 2026: `league=1`, `season=2026`
- Brasileirao Serie A: `league=71`, `season=2026`
- Premier League: `league=39`, `season=2026`
- La Liga: `league=140`, `season=2026`
- Ligue 1: `league=61`, `season=2026`
- Bundesliga: `league=78`, `season=2026`

Referencia: https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports

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

## Calendario estatico legado da Copa 2026

O modulo `backend/src/providers/worldCup2026.ts` permanece como referencia historica do prototipo, mas nao e fonte automatica do runtime PostgreSQL. Qualquer carga comercial precisa passar pelo importador/provider com proveniencia e licenca verificadas.

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
