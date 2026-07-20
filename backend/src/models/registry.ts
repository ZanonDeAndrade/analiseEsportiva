import { competitionBaselineModel, frequencyProfileModel, globalBaselineModel } from './baselines.js'
import { gradientBoostingModel } from './gradientBoosting.js'
import { logisticModel } from './logistic.js'
import { dixonColesModel, poissonModel } from './poisson.js'
import type { PredictiveModel } from './types.js'

/** Roster de modelos candidatos comparados na ETAPA 6. */
export const candidateModels: PredictiveModel[] = [
  globalBaselineModel,
  competitionBaselineModel,
  frequencyProfileModel,
  poissonModel,
  dixonColesModel,
  logisticModel,
  gradientBoostingModel,
]
