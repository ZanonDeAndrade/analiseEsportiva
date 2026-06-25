# Prompts de Apoio

## Implementacao

Ao alterar a interface, preserve a estrutura principal:

- Header superior.
- Sidebar de filtros.
- Lista central de jogos.
- Painel de analise.

Priorize componentes pequenos e reutilizaveis. Evite acoplar dados mockados diretamente em componentes de UI.

## Revisao Visual

Compare a tela com a referencia exportada:

- Cores escuras e contraste.
- Densidade compacta.
- Estados ativos em laranja.
- Chips de forma recente.
- Painel de analise com secoes claras.

## Revisao Etica

Verifique se nenhum texto:

- Promete lucro.
- Garante resultado.
- Usa linguagem de incentivo financeiro.
- Trata estimativas como certeza.

Prefira frases como:

- "estimativa probabilistica"
- "dados historicos simulados"
- "uso educacional"
- "nao garante resultado"

## Validacao

Antes de entregar uma alteracao:

```bash
npm run build
npm run backend:test
```

Tambem valide manualmente:

- Busca por "Flamengo".
- Filtro "Premier League".
- Filtro "Amanha".
- Mercado "Dupla Chance".
- Clique em "Ver analise".

## Validacao do Backend

Execute:

```bash
npm run backend:train -- --csv backend/src/fixtures/sample-results.csv --out backend/artifacts/sample-model.json --min-rows 2
npm run backend:evaluate -- --csv backend/src/fixtures/sample-results.csv --out backend/artifacts/sample-evaluation.json --min-rows 2
npm run backend:backtest -- --csv backend/src/fixtures/sample-results.csv --out backend/artifacts/sample-backtest.json --min-rows 2 --initial-window 4
```

Cheque se cartoes e escanteios entram em `ignoredMarkets` quando a liga nao possui colunas/amostra suficiente.
