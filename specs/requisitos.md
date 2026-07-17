# Requisitos

## Funcionais

- RF01: Exibir jogos futuros com liga/competicao, data, hora, times e mercado selecionado.
- RF02: Buscar fixtures via backend e mostrar estado amigavel quando o backend estiver indisponivel, sem exibir jogos mockados no fluxo principal.
- RF03: Exibir fonte dos dados, `updatedAt`, mercados disponiveis e mercados ignorados no painel.
- RF04: Manter aviso etico visivel.
- RF05: Sincronizar dados da API-Football quando `API_FOOTBALL_KEY` existir.
- RF06: Usar Football-Data.co.uk como fallback historico.
- RF07: Ignorar odds reais no produto final.
- RF08: Treinar somente mercados com dados suficientes.
- RF09: Retornar `dados_insuficientes` para mercado sem coluna ou amostra.
- RF10: Implementar API `/v1` para saude, mercados, competicoes, fixtures, predicoes, avaliacoes, backtests, modelo, conta, organizacao e jobs administrativos protegidos.
- RF11: Implementar CLI para sync, treino, avaliacao e backtest.
- RF12: Implementar testes de labels, providers e insuficiencia de dados.

## Mercados Obrigatorios

- 1X2
- Over 1.5 gols
- Over 2.5 gols
- Over 3.5 gols
- Under 2.5 gols
- Under 3.5 gols
- Ambas Marcam
- Dupla Chance
- Cartoes
- Escanteios

## Nao Funcionais

- RNF01: TypeScript estrito.
- RNF02: Frontend responsivo desktop/mobile.
- RNF03: Backend nao deve depender da API externa a cada render; PostgreSQL e a fonte persistente e cache distribuido exige Redis antes de multiplas replicas.
- RNF04: Falha de API externa nao deve quebrar frontend nem backend.
- RNF05: Documentacao deve permitir reproducao por outra pessoa.
- RNF06: Nenhuma parte do sistema deve prometer lucro ou resultado.
