# Estrutura de Entrega

Conferencia do projeto contra o enunciado do Trabalho 2 de Inteligencia Artificial.

## Mapa do Enunciado

| Exigencia do PDF | Onde esta no repositorio | Status |
| --- | --- | --- |
| Solucao de IA aplicada | `frontend/` e `backend/` | Atendido |
| Harness de desenvolvimento | `specs/`, `.claude/`, `.codex/`, `docs/`, `evals/`, `AGENTS.md`, `CLAUDE.md` | Atendido |
| `specs/projeto.md` | `specs/projeto.md` | Atendido |
| `specs/requisitos.md` | `specs/requisitos.md` | Atendido |
| `specs/criterios-aceite.md` | `specs/criterios-aceite.md` | Atendido |
| Pasta de contexto da IA | `.claude/context.md` e `.codex/context.md` | Atendido |
| Prompts principais | `.claude/prompts.md` e `.codex/prompts.md` | Atendido |
| Agents | `.claude/agents/analista-esportivo/agent.md` e `.codex/agents/analista-esportivo/agent.md` | Atendido |
| Skills | `.claude/skills/data-ingestion/skill.md` e `.claude/skills/model-evaluation/skill.md` | Atendido |
| Codigo-fonte da solucao | `frontend/src/` e `backend/src/` | Atendido |
| Tests ou evals | `backend/src/*.test.ts` e `evals/` | Atendido |
| Docs como system of record | `docs/` | Atendido |
| Entrada para IA/agente | `AGENTS.md` e `CLAUDE.md` | Atendido |
| Reproducao | `README.md` | Atendido |

## Observacao Sobre `src/`

O PDF mostra uma estrutura minima com uma pasta `src/`. Este projeto usa uma
estrutura equivalente e mais explicita para aplicacao full-stack:

- `frontend/src/`: codigo React, componentes, estilos, metadados de ligas, dados de demonstracao opcionais e cliente HTTP.
- `backend/src/`: providers, engenharia de features, mercados, treino, avaliacao, backtesting, predicao, servidor e testes.

Essa separacao evita deixar o frontend solto na raiz e preserva a reproducibilidade pelos comandos do `README.md`.

## Comandos de Validacao

Execute a partir da raiz:

```bash
npm install
npm run build
npm run backend:test
```

Pipeline completo:

```bash
npm run backend:sync
npm run backend:train
npm run backend:evaluate
npm run backend:backtest
```
