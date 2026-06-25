# Contexto Para Codex

BetIntel AI e um projeto academico de analise probabilistica esportiva. O objetivo e oferecer uma interface visualmente fiel ao HTML exportado do Claude Design, mas implementada com componentes React reutilizaveis e backend local para treino com CSV.

## Decisoes Tecnicas

- React + Vite + TypeScript.
- CSS puro em `src/App.css`.
- Dados mockados em `src/data/matches.ts`.
- Backend local TypeScript para treinamento, avaliacao, backtesting e predicao a partir de CSV.
- Icones via `lucide-react`.

## Tom do Produto

O produto deve parecer uma ferramenta analitica, nao uma plataforma comercial de apostas. Use linguagem probabilistica, educacional e cautelosa.

## Restricoes

- Nao carregar o HTML exportado como iframe.
- Nao usar logos ou assets de casas de aposta.
- Nao prometer acerto, retorno financeiro ou resultado.
- Nao apresentar as probabilidades como recomendacao financeira.
- Nao quebrar quando cartoes ou escanteios nao existirem no CSV.

## Backend

Arquivos principais:

- `backend/src/markets.ts`: definicoes e labels de mercados.
- `backend/src/featureEngineering.ts`: normalizacao de CSV e features.
- `backend/src/training.ts`: treinamento por mercado e liga.
- `backend/src/prediction.ts`: resposta com disponiveis e ignorados.
- `backend/src/evaluation.ts`: avaliacao holdout.
- `backend/src/backtesting.ts`: backtest temporal simples.
- `backend/src/server.ts`: endpoint HTTP.

## Referencia Visual

Arquivo de referencia:

`C:\Users\Microsoft User\Downloads\BetIntel AI.html`

Caracteristicas principais:

- Fundo escuro radial.
- Header de 58px.
- Sidebar esquerda em superficie escura.
- Lista central com linhas compactas.
- Painel analitico a direita.
- Laranja como cor de acao e selecao.
- Verde, amarelo e vermelho para sinais de confianca e forma.
