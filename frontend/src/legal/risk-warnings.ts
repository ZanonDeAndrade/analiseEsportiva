export type RiskWarningVariant =
  | 'full'
  | 'summary'
  | 'compact'
  | 'modal'
  | 'checkbox'
  | 'footer'
  | 'plans'
  | 'analysis'
  | 'social'

export const riskWarnings: Record<RiskWarningVariant, string> = {
  full: 'O BetIntel AI oferece análises estatísticas e probabilísticas de partidas de futebol com base em dados históricos, amostras, modelos e informações de terceiros. Probabilidades não são certezas e não garantem que um evento ocorrerá. Eventos esportivos são imprevisíveis e modelos podem errar, apresentar vieses, limitações e períodos de baixa precisão. Não é recomendação de aposta, investimento ou orientação financeira. O BetIntel AI não avalia sua situação financeira, não promete lucro, não garante acerto e não substitui decisão independente. O BetIntel AI não é casa de apostas, não recebe ou registra apostas, não define odds, não guarda dinheiro destinado a apostas, não processa depósitos ou saques e não executa apostas. Apostar pode causar perda parcial ou total dos valores utilizados. Não use dinheiro necessário à subsistência, dinheiro emprestado ou recursos destinados a obrigações. Não tente recuperar perdas aumentando frequência ou valor. Dados podem atrasar, divergir ou ser corrigidos. Partidas podem ser adiadas, canceladas ou alteradas. Verifique informações críticas em fontes oficiais. Interrompa o uso se perceber dificuldade de parar, ansiedade, ocultação de gastos, tentativa de recuperar perdas, comprometimento do orçamento ou prejuízo familiar, profissional ou emocional. O Serviço é proibido para menores de 18 anos.',
  summary: 'As análises do BetIntel AI são estatísticas e baseadas em dados históricos, modelos probabilísticos e informações de terceiros. Probabilidades não garantem resultados. O BetIntel AI não é uma casa de apostas e não oferece recomendação de aposta, investimento ou orientação financeira. Qualquer decisão de apostar é pessoal e independente, podendo resultar em perda parcial ou total dos valores utilizados. Proibido para menores de 18 anos.',
  compact: '18+ | Conteúdo estatístico. Probabilidades não garantem resultados. Não é recomendação de aposta, investimento ou orientação financeira. Apostar pode causar perdas.',
  modal: 'Antes de continuar: probabilidades não são certezas. O BetIntel AI fornece conteúdo estatístico e não realiza apostas. Apostar pode causar perda financeira. Não use dinheiro necessário à subsistência, não tente recuperar perdas e interrompa o uso se perceber comportamento prejudicial. Uso exclusivo por maiores de 18 anos.',
  checkbox: 'Declaro que tenho 18 anos ou mais, li o Aviso de Risco e compreendo que as análises são probabilísticas, não garantem resultados e não constituem recomendação de aposta, investimento ou orientação financeira.',
  footer: '18+ | Conteúdo estatístico. Probabilidades não garantem resultados. Não é recomendação de aposta, investimento ou orientação financeira. Apostar pode causar perdas.',
  plans: 'A assinatura dá acesso a análises estatísticas, não a apostas, garantia de acerto ou compensação por perdas. Probabilidades podem falhar. Antes de contratar, leia os Termos, a Política de Privacidade, a Política de Cancelamento e o Aviso de Risco. Uso exclusivo por maiores de 18 anos.',
  analysis: 'Estimativa probabilística, não garantia. Eventos esportivos são imprevisíveis. Verifique os dados e decida de forma pessoal e independente.',
  social: '18+. Conteúdo estatístico e probabilístico; resultados não são garantidos. O BetIntel AI não recebe apostas e não oferece recomendação de aposta, investimento ou orientação financeira. Apostar pode causar perdas. Jogue com responsabilidade.',
}

export const preservedLiabilityNotice =
  'Eventuais limitações de responsabilidade aplicam-se somente na extensão permitida pela legislação brasileira e não afastam direitos obrigatórios do consumidor nem responsabilidades legalmente não renunciáveis.'

export const insufficientDataNotice =
  'Dados insuficientes para uma análise confiável. A análise não é exibida porque os dados disponíveis não atendem aos critérios mínimos de qualidade ou amostra. Essa restrição é uma medida de prudência, não um erro.'

