export const LEGAL_PLACEHOLDER = (value: string) => `[${value}]`

export const legalConfig = {
  productName: 'BetIntel AI',
  supplier: {
    legalName: '[RAZÃO SOCIAL OU NOME DO RESPONSÁVEL]',
    tradeName: '[NOME FANTASIA]',
    registration: '[CNPJ OU CPF]',
    address: '[ENDEREÇO COMPLETO]',
    cityState: '[CIDADE E ESTADO]',
    domain: '[DOMÍNIO]',
    supportEmail: '[E-MAIL DE SUPORTE]',
    privacyEmail: '[E-MAIL DE PRIVACIDADE]',
    phone: '[TELEFONE]',
  },
  terms: {
    version: '0.9',
    publishedAt: '[DATA DE PUBLICAÇÃO]',
    effectiveAt: '[DATA DE VIGÊNCIA]',
    path: '/termos-de-uso',
    hash: '16a34affb0a73cb1d0727080736fc66f1b2cea72d3f1b0adeb92dfd5b249ed56',
    material: true,
  },
  privacy: {
    version: '0.1',
    publishedAt: '[DATA DE PUBLICAÇÃO]',
    effectiveAt: '[DATA DE VIGÊNCIA]',
    path: '/politica-de-privacidade',
    hash: 'd17e4ed9010252e313eb63b1991e965fafcdcd2248cc77a884b8dd6e6c62bf73',
    material: true,
  },
  refund: {
    version: '0.9',
    path: '/cancelamento-e-reembolso',
  },
  acceptableUse: {
    version: '0.9',
    path: '/uso-aceitavel',
  },
  responsibleGaming: {
    version: '0.9',
    path: '/jogo-responsavel',
  },
  risk: {
    version: '0.9',
    path: '/termos-de-uso#aviso-essencial',
    hash: '02edabba9b1de6c1095b78e74ab859ca112714668e20c48c9c969747afffeef2',
  },
  plans: {
    path: '/planos',
    names: 'Plano Brasileirão e Plano Todas as Ligas',
    values: 'mensal de R$ 19,90 e R$ 39,90; anual de R$ 178,80 e R$ 418,80 (equivalentes a R$ 14,90/mês e R$ 34,90/mês)',
    refundPolicy: '[POLÍTICA DE REEMBOLSO]',
    retention: '[PRAZO DE RETENÇÃO]',
    sportsProviders: '[FORNECEDORES DE DADOS ESPORTIVOS]',
  },
} as const

export const legalLinks = [
  { href: legalConfig.terms.path, label: 'Termos de Uso' },
  { href: legalConfig.privacy.path, label: 'Política de Privacidade' },
  { href: legalConfig.refund.path, label: 'Cancelamento e Reembolso' },
  { href: legalConfig.acceptableUse.path, label: 'Uso Aceitável' },
  { href: legalConfig.responsibleGaming.path, label: 'Jogo Responsável' },
] as const

export const legalDraftWarning =
  'MINUTA SUJEITA À REVISÃO E APROVAÇÃO DE ADVOGADO HABILITADO, ESPECIALMENTE QUANTO AO ENQUADRAMENTO REGULATÓRIO DO SERVIÇO.'
