# AGENTS.md

## Orientacao Geral

Este repositorio implementa o BetIntel AI, uma plataforma academica de analise probabilistica de futebol. Qualquer agente deve manter o escopo educacional, sem promessas de resultado, sem incentivo financeiro e sem uso de odds como recomendacao.

## Mapa do Projeto

- `frontend/`: aplicacao React + Vite.
- `frontend/src/`: componentes, dados mockados, API client e estilos do frontend.
- `backend/src/`: providers, feature engineering, mercados, treino, avaliacao, backtesting, predicao e servidor.
- `backend/data/`: cache local sincronizado.
- `backend/artifacts/`: modelo e relatorios.
- `specs/`: especificacao SDD e criterios de aceite.
- `docs/`: system of record tecnico.
- `.claude/`: contexto, prompts, agentes e skills.
- `evals/`: casos de avaliacao.

## Comandos

```bash
npm install
npm run build
npm run backend:test
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
npm run backend:serve
```

## Regras

- Preserve TypeScript estrito.
- Nao carregue HTML de referencia em iframe.
- Nao inclua logos, imagens ou assets de casas de aposta.
- Nao mude o tom academico para tom comercial.
- Nao trate cartoes ou escanteios como obrigatorios para todo CSV.
- Retorne `dados_insuficientes` para mercado sem coluna ou amostra.
- Use `API_FOOTBALL_KEY` somente por variavel de ambiente.

## Checklist de Entrega

- Build sem erro.
- Testes passando.
- Filtros funcionando.
- Painel de analise atualizando.
- Layout legivel em desktop e mobile.
- Aviso etico visivel.
- Backend retorna `dados_insuficientes` para mercados sem dados.
- README e docs explicam reproducao.
