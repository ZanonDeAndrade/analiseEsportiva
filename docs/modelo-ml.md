# Modelo de ML

## Abordagem

O modelo atual e um baseline supervisionado de frequencias historicas segmentadas. Ele e simples de auditar e adequado para demonstrar feature engineering, labels, avaliacao e backtesting.

O dataset de treino e consolidado por `backend:sync`. Quando `API_FOOTBALL_KEY` existe, o sync baixa resultados da API-Football dos ultimos `BETINTEL_API_HISTORY_YEARS` anos (incluindo a Copa do Mundo 2022, fonte real de selecoes), alem dos CSVs Football-Data.co.uk. O treino usa somente jogos com placar final.

O provider aplica throttle e retry para respeitar o limite por minuto do plano gratuito (ver [fontes-dados.md](fontes-dados.md)). Nomes de times sao normalizados em `backend/src/teamNames.ts` (alias PT->EN, ex.: "Brasil"->"brazil"), para que o calendario em portugues case com o historico em ingles da API.

## Features e Labels

As features principais sao liga/competicao, temporada, times, placar final, cartoes e escanteios quando disponiveis.

Labels:

- Gols: over/under e ambas marcam.
- Resultado: 1X2.
- Dupla chance: derivada de 1X2.
- Cartoes: thresholds 3.5, 4.5, 5.5.
- Escanteios: thresholds 8.5, 9.5.

## Segmentacao

O treino cria segmentos:

- global
- liga
- temporada
- liga + temporada
- competicao
- competicao + temporada

Para a Copa do Mundo, os jogos de 2026 caem no segmento `World Cup` (liga), alimentado pelos dados reais da Copa 2022, em vez de um segmento raso especifico de 2026. Alem do segmento, a predicao ajusta as probabilidades pelo **perfil de cada selecao** (vitorias/empates/derrotas, gols pro/contra) quando ha historico — por isso jogos diferentes recebem analises diferentes. Selecoes sem historico (ex.: estreantes na Copa) caem na base do segmento.

## Disponibilidade de Mercado

Mercados com menos de `minRows` linhas validas ficam indisponiveis. Cartoes e escanteios nao sao obrigatorios; quando faltam colunas, o sistema retorna `dados_insuficientes`.

## Metricas

- Accuracy por selecao.
- Brier score.
- Cobertura por mercado.
- Quantidade de mercados ignorados.

## Limites Tecnicos

O baseline nao usa odds e nao promete acerto. Ele mede frequencias de dados historicos e deve ser interpretado como estimativa educacional.
