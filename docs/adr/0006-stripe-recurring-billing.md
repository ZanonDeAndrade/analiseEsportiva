# ADR 0006 — Stripe Billing atrás de um gateway próprio

- Estado: Aceito com gate operacional
- Data: 2026-07-15
- Decisores: produto, financeiro, jurídico e engenharia

## Contexto

Cobrança recorrente envolve catálogo, checkout, ciclo da assinatura, impostos, falhas de pagamento, reembolsos e reconciliação. O cliente não pode ser fonte de verdade para plano, preço, assinatura ou entitlement. A validação de negócio atual é um gate anterior à ativação de billing.

## Decisão

Adotar Stripe Billing inicialmente, condicionado ao go/no-go de produto, validação jurídica, fiscal e de dados. Encapsular o SDK em `BillingGateway`.

Regras:

- catálogo público da aplicação usa chaves internas e é resolvido no servidor para Product/Price IDs configurados por ambiente;
- o cliente nunca envia valor monetário, Price ID confiável, plano efetivo ou estado da assinatura;
- checkout e portal são criados no servidor para a organização e o customer já mapeados;
- endpoint `/webhooks/stripe` preserva o corpo bruto, verifica assinatura e timestamp, grava uma inbox com `provider_event_id` único e responde rapidamente;
- processamento idempotente reconcilia `billing.subscriptions` e faturas locais; a evolução para fila dedicada deve preservar a mesma inbox;
- acesso é derivado do entitlement local reconciliado com eventos/API do provedor, nunca do redirect de sucesso;
- chamadas mutáveis ao provedor usam idempotency key estável;
- catálogo, regras de grace period e overrides administrativos são versionados e auditados no servidor;
- logs omitem corpo de webhook, dados de cartão, segredo, checkout URL e PII.

Interface conceitual:

```ts
interface BillingGateway {
  createCheckout(input: ServerResolvedCheckout): Promise<CheckoutReference>;
  createPortal(input: ServerResolvedPortal): Promise<PortalReference>;
  verifyWebhook(rawBody: Buffer, signature: string): VerifiedBillingEvent;
}
```

## Consequências

### Positivas

- Ciclo recorrente e meios de pagamento ficam com provedor especializado.
- Inbox e reconciliação tornam o provisionamento auditável.
- A porta limita lock-in no núcleo da aplicação.

### Custos e riscos

- Taxas, impostos, chargebacks, indisponibilidade e mudanças do provedor.
- Ordem e duplicação de webhooks exigem estado idempotente, não processamento ingênuo por sequência.
- Cobrança não resolve o risco regulatório do posicionamento ligado a apostas.

## Alternativas rejeitadas

- Implementar cobrança diretamente: amplia PCI, fraude e operação sem vantagem.
- Liberar acesso no callback do navegador: callback pode ser forjado ou ocorrer antes do estado definitivo.
- Usar claim do provedor de identidade como plano: mistura autenticação com fonte financeira.

## Validação e rollback

- Antes de ativar: comprador real, margem após dados/gateway/impostos, termos, privacidade e parecer jurídico aplicável.
- Testar assinatura inválida, evento duplicado, fora de ordem, replay, timeout e reconciliação.
- Rollback: bloquear novas sessões de checkout, manter portal e reconciliação, aplicar grace period server-side auditado e preservar histórico. Nunca aceitar estado informado pelo cliente.

## Referências

- [Stripe Billing: Subscriptions overview](https://docs.stripe.com/billing/subscriptions/overview)
- [Stripe: Webhooks](https://docs.stripe.com/webhooks)
- [Stripe: Manage products and prices](https://docs.stripe.com/products-prices/manage-prices)
- [Stripe API: Idempotent requests](https://docs.stripe.com/api/idempotent_requests)
