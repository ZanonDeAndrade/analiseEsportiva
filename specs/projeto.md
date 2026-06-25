# Projeto BetIntel AI

## Objetivo

Construir uma solucao aplicada de IA para analise probabilistica educacional de futebol, com frontend, backend, ingestao de dados, treinamento, avaliacao, backtesting e harness de desenvolvimento.

## Problema

Estudantes e interessados em analise esportiva precisam reproduzir um pipeline completo: coletar dados, transformar features, treinar estimativas, avaliar resultados, explicar limitacoes e apresentar probabilidades sem linguagem comercial ou promessa de acerto.

## Solucao

O BetIntel AI organiza jogos futuros e mercados esportivos em uma interface React. O backend usa dados historicos para estimar probabilidades por mercado e segmento. A resposta separa mercados disponiveis de mercados ignorados por falta de dados.

## Escopo Incluido

- Frontend React + Vite + TypeScript.
- Backend Node/TypeScript dentro de `backend/`.
- Ingestao API-Football para Copa do Mundo 2026 quando `API_FOOTBALL_KEY` existe.
- Fallback historico com CSVs Football-Data.co.uk.
- Cache local em `backend/data`.
- Treinamento por frequencias historicas segmentadas.
- Avaliacao com accuracy por selecao, brier score e cobertura.
- Backtesting temporal simples.
- Harness em `specs/`, `docs/`, `.claude/`, `evals/`, `AGENTS.md` e `CLAUDE.md`.

## Fora de Escopo

- Odds reais como recomendacao financeira.
- Previsoes prontas da API-Football.
- Logos ou assets de casas de aposta.
- Garantias de resultado.
- Fluxos de login, pagamento ou aposta.

## Etica

O produto e academico. Ele deve exibir: "Analise baseada em dados historicos. Nao garante resultado." Nenhum texto deve sugerir lucro, green garantido ou recomendacao financeira.
