# Fontes de Dados

## API-Football / API-Sports

Fonte primaria para dados atualizados:

- Base URL: `https://v3.football.api-sports.io`
- Chave: `API_FOOTBALL_KEY`
- Copa do Mundo 2026: `league=1` e `season=2026`
- Fixtures futuras buscadas numa janela rolante: de hoje ate hoje + `BETINTEL_FIXTURE_DAYS` (padrao 7 dias). `BETINTEL_FIXTURE_TO=YYYY-MM-DD` fixa uma data final e tem prioridade quando definido.
- Resultados historicos para treino: ultimos `BETINTEL_API_HISTORY_YEARS` anos (padrao 5), usando `/fixtures` por liga/temporada e filtrando apenas partidas com placar.
- Endpoints usados/previstos: `/fixtures`, eventos e estatisticas embutidos quando disponiveis.
- **Limitacao do plano gratuito:** o plano Free da API-Football so da acesso as temporadas **2022 a 2024**. Temporadas 2025/2026 exigem plano pago — a API responde HTTP 200 com `errors.plan` ("Free plans do not have access to this season"). O backend captura essa mensagem e cai para o calendario oficial / agenda simulada, registrando o motivo no relatorio do `sync`.

Competicoes buscadas por padrao:

- Copa do Mundo 2026: `league=1`, `season=2026`
- Brasileirao Serie A: `league=71`, `season=2026`
- Premier League: `league=39`, `season=2026`
- La Liga: `league=140`, `season=2026`
- Ligue 1: `league=61`, `season=2026`
- Bundesliga: `league=78`, `season=2026`

Referencia: https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports

Restricao: a aplicacao nao usa endpoint de previsoes prontas da API como decisao do modelo.

O sync nao para quando uma temporada e bloqueada pelo plano. Ele usa tudo que a API retornar, registra os avisos e complementa com Football-Data.co.uk.

## Football-Data.co.uk

Fonte secundaria para historico:

- Pagina: https://www.football-data.co.uk/data.php
- Notas de colunas: https://www.football-data.co.uk/notes.txt

Colunas usadas:

- `FTHG`, `FTAG`, `FTR`
- `HC`, `AC`
- `HY`, `AY`, `HR`, `AR`

Odds presentes nos CSVs sao removidas pelo provider e nao entram no produto final.

## Calendario oficial da Copa 2026 (fonte real estatica)

Quando a API-Football nao retorna jogos de 2026 (sem chave ou plano gratuito), o backend usa o **calendario oficial publicado da Copa do Mundo 2026** (`backend/src/providers/worldCup2026.ts`), marcado como `calendario-oficial`. Sao **datas, horarios e confrontos reais** (fase de grupos final + oitavas), com horarios em UTC e exibicao localizada.

So aparecem jogos com **confronto definido** (as duas selecoes conhecidas). Partidas do mata-mata cujos times ainda dependem da classificacao dos grupos (`1º Grupo X`, `2º Grupo X`, `Melhor 3º`) sao **filtradas** por `defaultSchedule()` (`isDefinedMatchup`), porque nao faz sentido estimar probabilidade sem o confronto definido. Elas voltam a aparecer quando os times forem conhecidos (com plano pago/API ao vivo).

Caracteristicas: dados **reais** porem **estaticos** (nao atualizam placar ao vivo). A janela exibida segue `BETINTEL_FIXTURE_DAYS` (padrao 7 dias) e rola a cada dia. Logica de selecao em `defaultSchedule()` (`backend/src/dataStore.ts`).

## Fallback simulado

Quando nao ha jogos reais da Copa na janela (torneio encerrado/nao iniciado), o backend gera uma agenda simulada das 5 grandes ligas, marcada como `mock-fallback`, para nao deixar a tela vazia. Tambem pode ser ligada junto com a Copa via `BETINTEL_SIMULATE_LEAGUES=true`. Esse fallback serve para demonstracao academica e nao substitui dados reais.

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
