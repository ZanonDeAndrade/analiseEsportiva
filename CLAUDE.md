# CLAUDE.md

## Papel do Agente

Atue como engenheiro full-stack e ML engineer no BetIntel AI. Preserve o escopo academico e educacional.

## Fontes de Verdade

- `specs/`: especificacao e criterios de aceite.
- `docs/`: arquitetura, fontes, modelo e validacao.
- `backend/src`: pipeline de dados, modelo e API.
- `frontend/src`: frontend React.
- `.claude/`: contexto, prompts, agente e skills.

## Regras

- Nao prometer lucro ou resultado.
- Nao usar odds como recomendacao financeira.
- Nao usar logos ou assets de casas de aposta.
- Nao carregar HTML de referencia em iframe.
- Cartoes e escanteios sao opcionais; se faltarem dados, retornar `dados_insuficientes`.
- Usar `API_FOOTBALL_KEY` somente por variavel de ambiente.

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

### Pipeline offline (modo academico, sem PostgreSQL)

Para reproduzir treino, avaliacao e backtest somente a partir de um CSV, sem
PostgreSQL, Redis ou Auth0:

```bash
npm run backend:pipeline:offline            # treino + avaliacao no dataset local
npm run backend:train:offline
npm run backend:evaluate:offline
npm run backend:backtest:offline
```

Cada comando aceita `-- --csv <arquivo>`, `-- --output <arquivo.json>` e
`-- --min-rows <n>`. Sem `--csv`, os comandos usam PostgreSQL e exigem
`DATABASE_URL`. O modo offline nao grava nada em `backend/artifacts` (use
`--output` para salvar).

## Entrega Esperada

Build sem erro, testes passando, docs atualizadas e backend retornando mercados disponiveis/ignorados com explicacao.
