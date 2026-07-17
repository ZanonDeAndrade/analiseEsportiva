# Implementação jurídica digital

Estado: minuta técnica, versão 0.9, sujeita à revisão jurídica. Fonte principal: `BetIntel_AI_Pacote_Juridico_2026.pdf`, pesquisa indicada no documento em 15 de julho de 2026.

## Escopo implementado

- páginas públicas e responsivas para Termos, Privacidade, Cancelamento/Reembolso, Uso Aceitável, Jogo Responsável e Planos;
- índice, links por seção, impressão/salvamento em PDF pelo navegador e exportação HTML;
- aviso de risco reutilizável nas variantes completa, resumida, compacta, modal, checkbox, rodapé, planos, análise e social;
- confirmação declaratória de maioridade e clickwrap não pré-marcado antes do primeiro acesso às análises;
- evidência no PostgreSQL com versão, hash, usuário, organização, horário do servidor, user agent, hash HMAC do IP, origem e metadados permitidos;
- versionamento imutável, histórico, grupos de reaceite material, idempotência, RLS e exportação da evidência;
- conta com consulta/exportação dos aceites e ponto de cancelamento recorrente atrás do gateway opcional;
- estado `dados_insuficientes` tratado como proteção, com aviso próximo às probabilidades.

## Rotas

Frontend público:

- `/termos-de-uso` e redirecionamento de `/termos`;
- `/politica-de-privacidade`;
- `/cancelamento-e-reembolso`;
- `/uso-aceitavel`;
- `/jogo-responsavel`;
- `/planos`.

API:

- `GET /v1/legal/documents` — catálogo e histórico público;
- `GET /v1/legal/status` — verifica o grupo material exigido para o usuário/organização;
- `POST /v1/legal/acceptances` — grava o clickwrap de forma idempotente e com horário do servidor;
- `GET /v1/legal/acceptances` — lista evidências do usuário na organização ativa;
- `GET /v1/legal/acceptances/:id/export` — exporta a evidência e a localização da versão aceita;
- `GET /v1/billing/subscription` — informa se existe gateway/assinatura real;
- `POST /v1/billing/subscription/cancel` — cancela somente por gateway configurado; sem gateway retorna `503` e não simula cancelamento.

## Banco e migration

A migration `backend/migrations/0009_legal_acceptance.sql` cria `legal.documents` e `legal.acceptances`. Documentos publicados não podem ser apagados nem ter conteúdo alterado; uma nova versão deve ser inserida. Aceites são append-only, com exceção da revogação de consentimento de marketing. RLS limita evidências ao usuário e à organização ativos.

As datas de publicação e vigência permanecem `NULL` no seed porque o documento fonte mantém `[DATA DE PUBLICAÇÃO]` e `[DATA DE VIGÊNCIA]`. Antes de publicação definitiva, uma migration adicional deve preencher datas confirmadas em uma nova versão; não altere a versão 0.9 silenciosamente.

## Publicar nova versão

1. Obter aprovação jurídica e preencher todos os campos pendentes.
2. Criar novo arquivo/conteúdo versionado sem sobrescrever a versão anterior.
3. Calcular SHA-256 do artefato exato e atualizar o manifesto do frontend.
4. Inserir nova linha em `legal.documents`; desativar a anterior somente na mesma migration/transação.
5. Para mudança material, usar novo `acceptance_group` e `change_kind='material'`.
6. Para correção tipográfica sem mudança de sentido, preservar o `acceptance_group` e usar `change_kind='non_material'`.
7. Registrar `change_summary`, URL, datas confirmadas e `published_by_user_id` quando houver painel administrativo.
8. Executar `npm run db:check`, testes, lint e build; comunicar usuários antes da vigência quando a mudança for material.

O status compara `acceptance_group`, não apenas o número da versão: correções não materiais não forçam novo aceite; mudanças materiais bloqueiam somente as análises que dependem do novo contrato. O aceite anterior permanece retido.

## Consultar e exportar evidências

Na interface, abra **Conta > Documentos e evidências de aceite**. A exportação JSON contém versão, hash, finalidade, horário do servidor, usuário, organização e URL do documento; não contém o IP bruto.

Via API autenticada:

```bash
curl -H "Authorization: Bearer $TOKEN" "$API/v1/legal/acceptances"
curl -H "Authorization: Bearer $TOKEN" "$API/v1/legal/acceptances/$ID/export"
```

Consultas administrativas diretas devem ocorrer somente por procedimento autorizado, auditado e com necessidade comprovada. Não exponha `ip_hash` ou user agent em relatórios comuns.

## Gateway e cancelamento

Stripe Billing continua apenas proposto no ADR 0006. Não há SDK, checkout, preço, Product/Price ID, webhook, provedor de e-mail ou política comercial ativa. A página de Planos exibe os textos que deverão anteceder uma futura contratação, mas o botão permanece desabilitado e marcar a prévia não grava aceite.

Quando um `BillingPortalGateway` real for ativado, ele deve resolver plano/preço no servidor, persistir o aceite de finalidade `subscription` antes de criar a assinatura, interromper renovação no provedor, reconciliar webhook e retornar `notificationStatus='sent'` somente após confirmação do provedor de e-mail.

## Variáveis de ambiente

Não foram adicionadas variáveis. A evidência reutiliza `REQUEST_IP_HASH_KEY` (mínimo de 32 caracteres) para HMAC do IP e as configurações existentes de PostgreSQL/Auth0. Nunca use a chave do provedor esportivo, segredo Auth0 ou segredo futuro do gateway no frontend.

## Campos pendentes

- `[RAZÃO SOCIAL / RESPONSÁVEL]`, `[NOME FANTASIA]`, `[CNPJ OU CPF]`;
- `[ENDEREÇO COMPLETO]`, `[CIDADE E ESTADO]`, `[DOMÍNIO]`;
- `[E-MAIL DE SUPORTE]`, `[E-MAIL DE PRIVACIDADE]`, `[TELEFONE]`;
- `[DATA DE PUBLICAÇÃO]`, `[DATA DE VIGÊNCIA]`;
- `[PLANOS DISPONÍVEIS]`, `[VALORES]`, impostos, limites, trial e primeira cobrança;
- `[POLÍTICA DE REEMBOLSO]`, `[PRAZO INTERNO]`, `[PRAZO DE RETENÇÃO]`, `[PRAZO DE EXPORTAÇÃO]`;
- `[FORNECEDORES DE DADOS ESPORTIVOS]`, licenças, subprocessadores e transferências;
- canais de suporte, privacidade, segurança, status e propriedade intelectual;
- comportamento real de upgrade, downgrade, chargeback, reativação e confirmação por e-mail.

## Riscos e divergências encontradas

- não foram encontrados afiliados, links/botões para apostar, publicidade de operadores, comissões, pixels de conversão ou logos de casas de apostas;
- Auth0 cria a identidade no Universal Login: há pré-check antes do redirecionamento, mas a evidência vinculada ao usuário somente pode ser persistida após autenticação; essa limitação deve ser revisada se o cadastro precisar ser juridicamente indivisível;
- não há gateway nem provedor de e-mail; portanto contratação, renovação, estorno e confirmação de cancelamento não podem ser declarados como operacionais;
- a Política de Privacidade é provisória: exige inventário de cookies, observabilidade, hospedagem, Auth0, provedores esportivos e eventuais transferências internacionais;
- a fonte de dados e suas licenças ainda exigem validação comercial;
- o nome e o posicionamento do produto podem aumentar risco regulatório/publicitário mesmo sem operação de aposta;
- a confirmação de 18 anos é declaratória e não equivale à verificação absoluta de idade.

Pontos regulatórios, consumeristas, de LGPD, publicidade, dados esportivos, cobrança e eventual aproximação com operadores exigem parecer e aprovação de advogado habilitado antes da publicação definitiva.
