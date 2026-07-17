# Backend de Mercados

## Labels

Gols:

```ts
totalGoals = FTHG + FTAG
over15 = totalGoals > 1.5
over25 = totalGoals > 2.5
over35 = totalGoals > 3.5
under25 = totalGoals < 2.5
under35 = totalGoals < 3.5
bothTeamsScore = FTHG > 0 && FTAG > 0
```

Resultado:

- `1X2 = H | D | A`
- `1X = H ou D`
- `12 = H ou A`
- `X2 = D ou A`

Escanteios:

- `totalCorners = HC + AC`
- Over 8.5 escanteios
- Over 9.5 escanteios

Cartoes:

- `totalCards = HY + AY + HR + AR`
- Over 3.5 cartoes
- Over 4.5 cartoes
- Over 5.5 cartoes

## Disponibilidade

Cada mercado e treinado somente quando ha amostra minima. O sistema segmenta por liga, temporada e competicao.

## Resposta de Predicao

`availableMarkets` contem mercados com segmento disponivel. `ignoredMarkets` contem:

- `market`
- `displayName`
- `status = dados_insuficientes`
- `reason`
- colunas requeridas/opcionais

O endpoint tambem retorna `sourceProvider`, `updatedAt`, `sampleSize`, `confidence` e o aviso etico.
