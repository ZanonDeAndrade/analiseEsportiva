import { legalConfig } from './legal-config'
import type { LegalDocumentContent } from './types'

export const privacyContent: LegalDocumentContent = {
  title: 'Política de Privacidade',
  subtitle: 'Documento provisório estruturado a partir do funcionamento auditado da aplicação',
  version: legalConfig.privacy.version,
  publishedAt: legalConfig.privacy.publishedAt,
  effectiveAt: legalConfig.privacy.effectiveAt,
  history: [{ version: '0.1', publishedAt: '[DATA DE PUBLICAÇÃO]', summary: 'Minuta inicial sujeita a inventário de dados, contratos e revisão jurídica.', material: true }],
  sections: [
    { id: 'controlador', title: '1. Identificação e papéis', paragraphs: [
      'Esta Política descreve o tratamento realizado por [RAZÃO SOCIAL OU NOME DO RESPONSÁVEL], [CNPJ OU CPF], com sede em [ENDEREÇO COMPLETO]. Contato de privacidade: [E-MAIL DE PRIVACIDADE].',
      'Em regra, o Fornecedor atua como controlador dos dados de cadastro, autenticação, segurança, faturamento, suporte e comunicações. Em contratos organizacionais, poderá atuar como operador dos dados inseridos pela Organização, conforme instrumento específico. Não se presume a existência de encarregado formal; o canal é [NOME OU CANAL DO ENCARREGADO].',
    ]},
    { id: 'dados', title: '2. Dados tratados', paragraphs: [
      'A aplicação pode tratar identificadores internos, nome, e-mail e estado de verificação recebidos do Auth0; organização, papel, convites e sessões; user agent e endereço IP pseudonimizado; registros de segurança e auditoria; solicitações de suporte; dados de assinatura e cobrança quando o billing for ativado; e evidências de aceite jurídico.',
      'A aplicação não deve armazenar senha, segredo TOTP, código de recuperação ou dados completos de cartão. Esses dados permanecem com provedores especializados quando configurados.',
      'Cookies, analytics, marketing, antifraude, suporte e fornecedores adicionais: [INVENTARIAR ANTES DA PUBLICAÇÃO].',
    ]},
    { id: 'finalidades', title: '3. Finalidades e bases legais', paragraphs: [
      'Os dados são tratados para criar e autenticar a Conta, administrar Organizações, prestar o Serviço, proteger credenciais e sessões, prevenir fraude e abuso, registrar aceites, atender suporte, cumprir obrigações legais e exercer direitos. A base legal deverá ser definida por finalidade, podendo incluir execução de contrato, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse mediante avaliação e consentimento apenas quando ele for efetivamente adequado.',
      'O consentimento não é utilizado como base genérica para todos os tratamentos. Marketing, quando baseado em consentimento, será opcional, separado, não pré-marcado e revogável. Comunicações transacionais, de segurança, cobrança e suporte são separadas das promocionais.',
    ]},
    { id: 'compartilhamento', title: '4. Compartilhamento e operadores', paragraphs: [
      'O sistema utiliza Auth0 para identidade e prevê PostgreSQL/infraestrutura de hospedagem. Stripe Billing está apenas proposto e não está ativo. Os demais fornecedores de hospedagem, e-mail, observabilidade, dados esportivos, suporte, analytics, antifraude e IA devem ser confirmados em [LISTA DE OPERADORES E SUBOPERADORES].',
      'Dados serão compartilhados somente na medida necessária à prestação, segurança, cumprimento legal ou exercício de direitos, com contratos e salvaguardas adequados.',
    ]},
    { id: 'transferencias', title: '5. Transferências internacionais', paragraphs: [
      'Auth0 e futuros fornecedores podem envolver tratamento internacional. Países, regiões de hospedagem, subprocessadores e mecanismos de transferência devem ser inventariados em [MAPA DE TRANSFERÊNCIAS]. Quando aplicável, serão adotados mecanismos compatíveis com a LGPD e regulamentação da ANPD.',
    ]},
    { id: 'retencao', title: '6. Retenção e descarte', paragraphs: [
      'Os dados serão mantidos pelo prazo necessário às finalidades, obrigações legais, segurança, prevenção a fraude e exercício de direitos. Prazo por categoria: [PRAZO DE RETENÇÃO]. Evidências de aceite e versões jurídicas não serão apagadas apenas porque um documento foi atualizado, observados necessidade, legal hold e direitos aplicáveis.',
      'Ao fim do prazo, os dados serão eliminados, anonimizados ou mantidos com fundamento específico documentado.',
    ]},
    { id: 'direitos', title: '7. Direitos dos titulares', paragraphs: [
      'O titular poderá solicitar confirmação, acesso, correção, anonimização, bloqueio ou eliminação quando cabíveis, portabilidade conforme regulamentação, informação sobre compartilhamentos, revisão de decisão automatizada aplicável e revogação de consentimento pelo [E-MAIL DE PRIVACIDADE] ou [CANAL DO TITULAR].',
      'A identidade poderá ser verificada de maneira proporcional antes do atendimento. Prazos e exceções seguirão a legislação aplicável.',
    ]},
    { id: 'seguranca', title: '8. Segurança e incidentes', paragraphs: [
      'São adotados controles como autenticação gerenciada, sessões revogáveis, autorização por papel, isolamento por Organização, rate limiting, logs com redação de segredos e trilhas de auditoria. Nenhum controle elimina totalmente os riscos.',
      'Incidentes serão investigados e, quando houver risco ou dano relevante, comunicados à ANPD e aos titulares conforme a legislação e a regulamentação aplicáveis. Canal de segurança: [CANAL DE SEGURANÇA].',
    ]},
    { id: 'automacao', title: '9. Modelos e decisões automatizadas', paragraphs: [
      'O sistema gera probabilidades esportivas; isso não constitui, por si só, decisão sobre o titular. Caso o produto passe a tomar decisões automatizadas que afetem interesses pessoais, esta Política será atualizada com critérios, consequências e mecanismos de revisão.',
    ]},
    { id: 'alteracoes', title: '10. Alterações e contato', paragraphs: [
      'Alterações materiais serão comunicadas e versionadas. O silêncio não será tratado como novo consentimento quando manifestação for necessária. Dúvidas: [E-MAIL DE PRIVACIDADE].',
    ]},
  ],
}

export const acceptableUseContent: LegalDocumentContent = {
  title: 'Política de Uso Aceitável',
  subtitle: 'Documento complementar aos Termos de Uso',
  version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', effectiveAt: '[DATA DE VIGÊNCIA]',
  history: [{ version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', summary: 'Minuta inicial.', material: true }],
  sections: [
    { id: 'objetivo', title: '1. Objetivo', paragraphs: ['Esta Política protege a segurança, a propriedade intelectual, os fornecedores de dados, os Usuários e a disponibilidade do BetIntel AI.'] },
    { id: 'uso-autorizado', title: '2. Uso autorizado', paragraphs: ['O acesso deve ocorrer por Conta legítima, dentro dos limites do Plano e para consulta interna, pessoal ou empresarial autorizada.'] },
    { id: 'seguranca', title: '3. Segurança', paragraphs: ['É proibido acessar sem autorização, testar vulnerabilidades sem permissão, inserir código malicioso, interferir, contornar autenticação, falsificar identidade ou capturar credenciais.'] },
    { id: 'automacao', title: '4. Automação e dados', paragraphs: ['É proibido scraping, crawling, extração em massa, automação fora da API autorizada, bypass de rate limits, reconstrução de base, criação de espelho ou coleta para treinamento de concorrente.'] },
    { id: 'conteudo', title: '5. Conteúdo e revenda', paragraphs: ['É proibido republicar, revender, sublicenciar, distribuir sinais, vender grupos baseados nas Análises ou remover atribuições sem autorização escrita.'] },
    { id: 'apostas-publicidade', title: '6. Apostas e publicidade', paragraphs: ['É proibido apresentar Análises como garantia de lucro, promessa de acerto, renda, solução de dívida, indicação personalizada ou autorização regulatória.'] },
    { id: 'uso-ilegal', title: '7. Uso ilegal', paragraphs: ['É proibido usar o Serviço para fraude, intermediação de apostas, operação para terceiros, evasão de restrições, lavagem de dinheiro, manipulação esportiva ou atividade proibida.'] },
    { id: 'terceiros', title: '8. Proteção de terceiros', paragraphs: ['É proibido assediar, discriminar, enganar, violar privacidade, usar identidade alheia, infringir direitos ou inserir conteúdo ilícito.'] },
    { id: 'recursos', title: '9. Recursos técnicos', paragraphs: ['Limites de requisição, assentos, sessões, exportações e armazenamento serão informados no Plano. Excedentes não autorizados podem ser bloqueados.'] },
    { id: 'fiscalizacao', title: '10. Fiscalização proporcional', paragraphs: ['O Fornecedor pode monitorar sinais técnicos de abuso, respeitando a LGPD, e adotar advertência, limitação, suspensão ou encerramento de forma proporcional.'] },
    { id: 'defesa', title: '11. Defesa e recurso', paragraphs: ['Quando possível, o Usuário será informado da violação e poderá apresentar esclarecimentos pelo [E-MAIL DE SUPORTE].'] },
    { id: 'relato', title: '12. Relato responsável', paragraphs: ['Vulnerabilidades devem ser relatadas ao [CANAL DE SEGURANÇA], sem exploração além do necessário para demonstrar o problema.'] },
  ],
}

export const refundContent: LegalDocumentContent = {
  title: 'Política de Cancelamento e Reembolso',
  subtitle: 'Minuta compatível com contratação eletrônica e sujeita ao comportamento real do gateway',
  version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', effectiveAt: '[DATA DE VIGÊNCIA]',
  history: [{ version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', summary: 'Minuta inicial; regra comercial e gateway pendentes.', material: true }],
  sections: [
    { id: 'validacao', title: 'Validação obrigatória', notice: '[VALIDAR COM ADVOGADO E COM O GATEWAY DE PAGAMENTO]' },
    { id: 'identificacao', title: '1. Identificação', paragraphs: ['Esta Política é oferecida por [RAZÃO SOCIAL], [CNPJ OU CPF], e integra os Termos.'] },
    { id: 'como-cancelar', title: '2. Como cancelar', paragraphs: ['O cancelamento poderá ser solicitado na Conta, pelo portal de cobrança quando efetivamente configurado, e pelo [E-MAIL DE SUPORTE], com confirmação imediata em meio durável. O cancelamento deve ser tão simples quanto a contratação.'] },
    { id: 'efeito', title: '3. Efeito do cancelamento', paragraphs: ['A renovação futura será interrompida. Salvo arrependimento, defeito, cobrança indevida ou política mais favorável, o acesso permanece até o fim do período pago.'] },
    { id: 'arrependimento', title: '4. Direito de arrependimento', paragraphs: ['Consumidores que contratarem à distância poderão desistir no prazo legal. A opção conservadora recomendada é reembolso integral em até 7 dias da contratação, inclusive após início do acesso digital. Não há renúncia genérica.'] },
    { id: 'apos-prazo', title: '5. Após o arrependimento', paragraphs: ['Após o prazo legal, não haverá reembolso automático do ciclo em andamento, salvo [POLÍTICA DE REEMBOLSO], defeito, indisponibilidade material, descumprimento da oferta ou obrigação legal.'] },
    { id: 'anual', title: '6. Plano anual', paragraphs: ['Antes da ativação, escolher e validar juridicamente uma regra única: sem reembolso após o prazo legal com acesso até o fim, ou reembolso proporcional claramente informado. Esta minuta não escolhe silenciosamente entre alternativas.'] },
    { id: 'teste', title: '7. Teste gratuito', paragraphs: ['Informar duração, cartão, data de cobrança e cancelamento. Se o cancelamento ocorrer antes da data indicada, não haverá cobrança.'] },
    { id: 'cobranca', title: '8. Cobrança indevida ou duplicada', paragraphs: ['Será investigada prioritariamente e restituída pelo meio original, observados os direitos legais. Não será convertida compulsoriamente em crédito interno.'] },
    { id: 'falha', title: '9. Falha do Serviço', paragraphs: ['Pedidos relacionados a defeito serão avaliados considerando duração, impacto, Plano, tentativas de correção e direitos do consumidor. Créditos de SLA não substituem direitos legais.'] },
    { id: 'mudanca-plano', title: '10. Upgrade e downgrade', paragraphs: ['Upgrade pode gerar cobrança proporcional confirmada; downgrade terá efeito no ciclo seguinte, salvo indicação no checkout.'] },
    { id: 'chargeback', title: '11. Chargeback', paragraphs: ['O Usuário pode contestar cobranças. Chargeback fraudulento pode gerar suspensão e cobrança legítima após análise, sem penalidade automática desproporcional.'] },
    { id: 'estorno', title: '12. Prazo do estorno', paragraphs: ['O Fornecedor iniciará o estorno em [PRAZO INTERNO], mas a visualização depende do banco, cartão ou meio de pagamento.'] },
    { id: 'violacao', title: '13. Cancelamento por violação', paragraphs: ['Valores serão tratados proporcionalmente à causa, ao serviço prestado, ao dano e à lei. Não haverá perda automática de todo valor em situação de pequena infração.'] },
    { id: 'encerramento', title: '14. Encerramento do Serviço', paragraphs: ['Se o Fornecedor encerrar definitivamente um Plano pago, reembolsará ou creditará o período não utilizado, salvo migração equivalente aceita pelo Usuário.'] },
  ],
}

export const responsibleGamingContent: LegalDocumentContent = {
  title: 'Jogo Responsável',
  subtitle: 'Orientações de prevenção e uso moderado',
  version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', effectiveAt: '[DATA DE VIGÊNCIA]',
  history: [{ version: '0.9', publishedAt: '[DATA DE PUBLICAÇÃO]', summary: 'Orientações iniciais de prevenção.', material: true }],
  sections: [
    { id: 'moderacao', title: '1. Use com moderação', paragraphs: ['Defina limites de tempo e financeiros fora da Plataforma. Não utilize recursos necessários à subsistência, moradia, alimentação, saúde, educação, impostos ou obrigações familiares.'] },
    { id: 'credito', title: '2. Não use dinheiro emprestado', paragraphs: ['Não use empréstimos, crédito ou valores de terceiros. Não aumente frequência ou valor para tentar recuperar perdas.'] },
    { id: 'sinais', title: '3. Reconheça sinais de risco', paragraphs: ['Interrompa o uso diante de dificuldade de parar, ansiedade, ocultação de gastos, impulsividade ou prejuízo familiar, profissional ou emocional. Não utilize a plataforma sob influência de álcool, drogas ou comprometimento emocional.'] },
    { id: 'ajuda', title: '4. Busque ajuda profissional', paragraphs: ['O BetIntel AI não é tratamento médico ou psicológico. Procure profissional de saúde e os serviços públicos disponíveis em sua localidade quando necessário. Nenhum canal externo específico é apresentado como parceiro ou serviço aprovado do produto.'] },
    { id: 'suspensao', title: '5. Suspensão voluntária', notice: 'FUNCIONALIDADE RECOMENDADA: a suspensão voluntária ainda não está implementada. Hoje o Usuário pode encerrar sessões, desativar ou excluir a Conta e, quando houver assinatura ativa, solicitar cancelamento.' },
  ],
}

