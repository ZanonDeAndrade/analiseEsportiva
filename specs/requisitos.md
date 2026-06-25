# Requisitos

## Funcionais

- RF01: Exibir jogos futuros com liga/competicao, data, hora, times e mercado selecionado.
- RF02: Incluir "Copa do Mundo 2026" no filtro lateral.
- RF03: Buscar fixtures via backend e usar mock marcado quando o backend estiver indisponivel.
- RF04: Exibir fonte dos dados, `updatedAt`, mercados disponiveis e mercados ignorados no painel.
- RF05: Manter aviso etico visivel.
- RF06: Sincronizar dados da API-Football quando `API_FOOTBALL_KEY` existir.
- RF07: Usar `league=1` e `season=2026` para Copa do Mundo 2026.
- RF08: Usar Football-Data.co.uk como fallback historico.
- RF09: Ignorar odds reais no produto final.
- RF10: Treinar somente mercados com dados suficientes.
- RF11: Retornar `dados_insuficientes` para mercado sem coluna ou amostra.
- RF12: Implementar endpoints minimos: `/health`, `/markets`, `/competitions`, `/sync-data`, `/train`, `/evaluation`, `/backtest`, `/predict`, `/fixtures`.
- RF13: Implementar CLI para sync, treino, avaliacao e backtest.
- RF14: Implementar testes de labels, providers e insuficiencia de dados.

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
- RNF03: Backend nao deve depender da API a cada render; usar cache local.
- RNF04: Falha de API externa nao deve quebrar frontend nem backend.
- RNF05: Documentacao deve permitir reproducao por outra pessoa.
- RNF06: Nenhuma parte do sistema deve prometer lucro ou resultado.
