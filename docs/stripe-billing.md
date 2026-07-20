# Stripe Billing — configuração e operação

O Stripe está integrado por um gateway server-side, mas continua **opt-in**. A
aplicação só cria checkout quando `STRIPE_BILLING_ENABLED=true`, todas as quatro
ofertas foram mapeadas e `BILLING_APPROVAL_REFERENCE` registra a aprovação
comercial, jurídica, fiscal e de licenciamento. Essa referência é evidência
operacional interna, não substitui parecer profissional.

O navegador envia somente a chave interna do plano e o aceite explícito da
recorrência. Preço, moeda, intervalo, organização e Price ID são resolvidos no
servidor. O redirect de sucesso nunca libera acesso: a assinatura local muda
somente após webhook Stripe assinado.

## 1. Criar produtos e preços no Stripe

Use contas/modos separados por ambiente. Em desenvolvimento e staging, trabalhe
somente no modo de teste. Crie preços recorrentes fixos com estes valores exatos:

| Chave interna | Valor cobrado | Intervalo | Variável |
| --- | ---: | --- | --- |
| `brasileirao` | BRL 19,90 | mensal | `STRIPE_PRICE_BRASILEIRAO_MONTHLY` |
| `todas-ligas` | BRL 39,90 | mensal | `STRIPE_PRICE_TODAS_LIGAS_MONTHLY` |
| `brasileirao-anual` | BRL 178,80 | anual | `STRIPE_PRICE_BRASILEIRAO_YEARLY` |
| `todas-ligas-anual` | BRL 418,80 | anual | `STRIPE_PRICE_TODAS_LIGAS_YEARLY` |

Copie os IDs `price_...`, não os IDs `prod_...`. No boot, a API consulta o Stripe
e falha fechada se algum preço estiver inativo ou se valor, moeda ou intervalo
divergirem do catálogo em `backend/src/billingCatalog.ts`.

Referência oficial: [Products and prices](https://docs.stripe.com/products-prices/manage-prices).

## 2. Configurar o Customer Portal

Ative no portal apenas as ações aprovadas para o produto, especialmente atualização
de forma de pagamento, consulta de faturas e cancelamento ao fim do período. Se
houver mais de uma configuração, copie o ID `bpc_...` para
`STRIPE_BILLING_PORTAL_CONFIGURATION_ID`; sem ele, o Stripe usa a configuração
padrão da conta.

Se habilitar troca de plano no Portal, ofereça somente os quatro Prices configurados
acima. O reconciliador deriva o plano pelo Price ID e falha fechado para qualquer
preço desconhecido.

Referência oficial: [Customer portal](https://docs.stripe.com/customer-management).

## 3. Configurar o webhook

Endpoint implantado:

```text
POST https://SEU-BACKEND/webhooks/stripe
```

Inscreva pelo menos estes eventos:

```text
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
customer.subscription.paused
customer.subscription.resumed
invoice.paid
invoice.payment_failed
invoice.updated
invoice.voided
invoice.marked_uncollectible
```

Copie o segredo de assinatura `whsec_...` para `STRIPE_WEBHOOK_SECRET`. O endpoint
recebe os bytes brutos, verifica assinatura e tolerância de cinco minutos, deduplica
por Event ID e reconcilia a assinatura consultando a API do Stripe. O corpo e a
assinatura não são gravados nem incluídos em logs.

Para desenvolvimento local com a Stripe CLI:

```bash
stripe login
stripe listen --forward-to localhost:3333/webhooks/stripe
```

Use o `whsec_...` exibido por `stripe listen` apenas no `.env.local` desse ambiente.
Referência oficial: [Stripe webhooks](https://docs.stripe.com/webhooks).

## 4. Variáveis do backend

Copie `.env.example` para `.env.local` e preencha sem versionar segredos:

```env
STRIPE_BILLING_ENABLED=true
STRIPE_CHECKOUT_ENABLED=true
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_BRASILEIRAO_MONTHLY=price_...
STRIPE_PRICE_TODAS_LIGAS_MONTHLY=price_...
STRIPE_PRICE_BRASILEIRAO_YEARLY=price_...
STRIPE_PRICE_TODAS_LIGAS_YEARLY=price_...
STRIPE_BILLING_PORTAL_CONFIGURATION_ID=bpc_...
STRIPE_AUTOMATIC_TAX_ENABLED=false
BILLING_APP_URL=http://localhost:5173
BILLING_APPROVAL_REFERENCE=ata-go-billing-AAAA-MM-ID
```

`STRIPE_AUTOMATIC_TAX_ENABLED` deve permanecer `false` até cadastro fiscal,
endereços, códigos de imposto, registros e tratamento contábil serem validados.
Em production a API exige `sk_live_...`, `BILLING_APP_URL` HTTPS e recusa loopback;
fora de production ela recusa chaves live.

## 5. Executar e testar

```bash
npm run db:migrate
npm run dev
```

1. Entre pelo Auth0 como `owner` da organização.
2. Abra `?view=billing`, marque o aceite recorrente e escolha um plano.
3. Use um meio de pagamento de teste do Stripe.
4. Confirme que a volta do Checkout apenas informa “aguardando confirmação”.
5. Confirme, depois do webhook, a assinatura e a fatura na tela.
6. Abra o portal e teste cancelamento ao fim do período.
7. Reenvie o mesmo evento no Stripe e confirme que ele é tratado como duplicado.

Para validar o repositório:

```bash
npm run typecheck
npm run test:unit
npm run build
```

## 6. Passagem para produção

Antes de trocar para modo live:

- registrar o go/no-go e a referência em `BILLING_APPROVAL_REFERENCE`;
- revisar termos, política de reembolso, tributos, nota fiscal e suporte;
- validar por escrito o uso comercial e a redistribuição dos dados esportivos;
- criar Products, Prices, Portal e webhook novamente no modo live;
- armazenar chaves no secret manager e restringir acesso/rotação;
- executar checkout, pagamento recusado, renovação, cancelamento e replay de webhook;
- monitorar `billing.webhook_events` e o alerta `BillingWebhookFailure`.

Rollback de novas vendas: defina `STRIPE_CHECKOUT_ENABLED=false` e reinicie a API.
Portal, cancelamento e webhooks continuam ativos. Só use
`STRIPE_BILLING_ENABLED=false` depois de tratar assinaturas existentes no Stripe;
desligar reconciliação antes disso pode deixar o estado local divergente.
