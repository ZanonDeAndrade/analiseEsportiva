/**
 * Validacao centralizada de placares (gols) para todas as fontes.
 *
 * Aplica-se a FTHG/FTAG e seus equivalentes de outros provedores e, quando
 * utilizados, a placares de intervalo. Uma linha so participa de treino,
 * avaliacao ou backtest quando ambos os placares passam por estas regras:
 *
 *  1. o valor deve ser numerico e finito;
 *  2. deve ser inteiro (sem parte fracionaria);
 *  3. deve ser maior ou igual a zero;
 *  4. deve ser menor ou igual a MAX_GOALS_PER_TEAM.
 *
 * Placares zero e placares altos porem plausiveis (ate o limite) sao preservados.
 */

/** Limite plausivel de gols de uma equipe em uma unica partida. */
export const MAX_GOALS_PER_TEAM = 30

export type ScoreRejectionCode =
  | 'invalid_home_score'
  | 'invalid_away_score'
  | 'score_out_of_range'
  | 'fractional_score'

export interface ScoreRejection {
  code: ScoreRejectionCode
  /** Campo de origem, ex.: "FTHG", "FTAG". */
  field: string
  /** Valor bruto recebido (para diagnostico). */
  value: string
}

export type ScoreValidation =
  | { ok: true; value: number }
  | { ok: false; rejection: ScoreRejection }

/**
 * Valida o placar bruto de um lado (mandante ou visitante). Retorna o valor
 * inteiro quando valido ou uma rejeicao estruturada com o campo e o valor
 * recebido. Valores ausentes, vazios ou nao numericos usam o codigo especifico
 * do lado (`invalid_home_score`/`invalid_away_score`).
 */
export function validateGoalScore(
  raw: string | undefined,
  field: string,
  side: 'home' | 'away',
): ScoreValidation {
  const received = raw ?? ''
  const invalidCode: ScoreRejectionCode =
    side === 'home' ? 'invalid_home_score' : 'invalid_away_score'
  const trimmed = raw?.trim() ?? ''

  if (trimmed === '') {
    return { ok: false, rejection: { code: invalidCode, field, value: received } }
  }

  const parsed = Number(trimmed.replace(',', '.'))
  if (!Number.isFinite(parsed)) {
    return { ok: false, rejection: { code: invalidCode, field, value: received } }
  }
  if (!Number.isInteger(parsed)) {
    return { ok: false, rejection: { code: 'fractional_score', field, value: received } }
  }
  if (parsed < 0 || parsed > MAX_GOALS_PER_TEAM) {
    return { ok: false, rejection: { code: 'score_out_of_range', field, value: received } }
  }

  return { ok: true, value: parsed }
}

/** Mensagem legivel, incluindo o campo e o valor recebido, para uma rejeicao. */
export function describeScoreRejection(rejection: ScoreRejection): string {
  const detail = `${rejection.field}="${rejection.value}"`
  switch (rejection.code) {
    case 'invalid_home_score':
      return `Placar do mandante ausente ou nao numerico (${detail}).`
    case 'invalid_away_score':
      return `Placar do visitante ausente ou nao numerico (${detail}).`
    case 'fractional_score':
      return `Placar fracionario nao permitido (${detail}).`
    case 'score_out_of_range':
      return `Placar fora da faixa [0, ${MAX_GOALS_PER_TEAM}] (${detail}).`
  }
}
