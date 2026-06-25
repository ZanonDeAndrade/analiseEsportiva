# Prompts Principais

Registro dos prompts que orientaram a IA neste projeto. A regra de uso foi
sempre: ler `specs/` e `docs/` antes de alterar, manter TypeScript estrito, tom
academico, aviso etico, `dados_insuficientes` para mercados sem dados, e validar
com build + testes antes de concluir.

## Prompts reutilizaveis (arquetipos)

### Manutencao
"Voce e engenheiro full-stack e ML engineer do BetIntel AI. Antes de alterar, leia specs e docs. Implemente mudancas mantendo TypeScript estrito, tom academico, aviso etico e `dados_insuficientes` para mercados sem dados."

### Ingestao
"Sincronize dados da API-Football usando `API_FOOTBALL_KEY`; use `league=1` e `season=2026` para Copa 2026. Use Football-Data.co.uk como historico. Nao use odds e nao use previsoes prontas da API."

### Avaliacao
"Avalie o modelo com accuracy por selecao, brier score, cobertura por mercado e lista de mercados ignorados. Explique limitacoes e nao apresente resultado como garantia."

### Frontend
"Preserve a identidade visual existente. Adicione estados de backend indisponivel e fallback mockado marcado. Mostre fonte, updatedAt, mercados disponiveis, ignorados e aviso etico."

## Log da evolucao (iteracoes G2)

Cada item traz o pedido (prompt) e como a IA foi orientada/validada.

1. **"Mostrar mais jogos: todos os jogos para 7 dias a frente, atualizando a cada dia."**
   - Resultado: janela rolante `BETINTEL_FIXTURE_DAYS` (config) + agenda gerada a partir de "hoje". Validado com `/fixtures` e contagem por dia.

2. **"As datas estao erradas; quero as datas originais dos jogos."**
   - Diagnostico: dados eram simulados. Decisao: usar fonte real. Implementado `backend/src/providers/worldCup2026.ts` com o calendario oficial da Copa 2026 (datas reais, UTC).

3. **"Coloquei a chave da API."** / "onde pego a api?"
   - Descoberto que o **plano gratuito so cobre 2022-2024** (a API retorna `errors.plan`). A IA foi orientada a capturar esse erro e cair para o calendario oficial, registrando o motivo no relatorio do `sync`.

4. **"Esta retornando a mesma analise para todas as partidas; quero treinar melhor a IA."**
   - Causa raiz (3 partes): poucos dados reais; nomes PT vs EN nao casavam; segmento mock sombreava o real.
   - Correcoes: baixar Copa 2022 + ligas 2022-2024 (throttle+retry no provider); alias de nomes em `teamNames.ts`; nao injetar mock quando ha dado real. Validado comparando predicoes de varios jogos (deixaram de ser identicas) e `backend:evaluate`.

5. **"Nao faz sentido dar probabilidade sem o confronto definido."**
   - Decisao: esconder confrontos com placeholder (`1o Grupo X`, `Melhor 3o`) via `isDefinedMatchup` em `dataStore.ts`. So aparecem jogos com os dois times definidos.

6. **"Arrumar a estrutura do projeto conforme o PDF do professor."**
   - Auditoria da arvore contra a estrutura minima exigida; criacao de `.gitignore`, limpeza de temporarios e atualizacao de docs/prompts para reproducibilidade.

## Validacao aplicada a cada iteracao

- `npm run build` e `npm run backend:test` sem erros.
- Verificacao no navegador (preview) das telas afetadas.
- Conferencia de que nenhuma resposta promete lucro e que o aviso etico permanece.
