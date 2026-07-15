# ADR 0005 — Auth0 como provedor gerenciado de identidade

- Estado: Aceito com gate operacional
- Data da decisão original: 2026-07-15
- Data da substituição: 2026-07-15
- Decisores: engenharia, segurança e produto
- Decisão anterior: WorkOS AuthKit — **superseded**

## Contexto

Autenticação segura inclui credenciais, verificação de e-mail, recuperação, MFA,
sessões, detecção de abuso e revogação. Implementar esses protocolos no BetIntel
AI aumentaria o risco sem diferenciar o produto. O provedor prova a identidade;
PostgreSQL continua sendo a fonte de verdade de organizações, memberships,
papéis, permissões, billing e estado do produto.

A decisão original propunha WorkOS AuthKit. Durante a implementação do PROMPT 3,
a API pública documentada do WorkOS foi verificada e não apresentou um contrato
suportado para códigos de recuperação de MFA. Como códigos de recuperação
gerenciados são requisito obrigatório, a decisão WorkOS foi substituída. Não será
criada implementação local de senha, TOTP, refresh token ou recovery code.

## Decisão

Adotar Auth0 Universal Login com:

- aplicação SPA usando Authorization Code Flow com PKCE pelo SDK oficial;
- API Auth0 separada, com access tokens RS256 de curta duração;
- validação no backend por JWKS, exigindo algoritmo RS256, issuer, audience e
  expiração;
- conexão de banco gerenciada pelo Auth0, verificação de e-mail e recuperação de
  senha no Universal Login;
- MFA TOTP e códigos de recuperação gerenciados pelo Auth0;
- refresh token rotation, automatic reuse detection e expiração configurada no
  painel;
- proteção contra força bruta/credential stuffing habilitada no tenant;
- `sub` do access token como identificador externo imutável;
- porta `IdentityProvider` própria; tipos do Auth0 não atravessam a camada de
  infraestrutura;
- criação/sincronização idempotente de `iam.users` e autorização local por
  membership ativa;
- revogação local imediata para usuário, sessão, membership e API keys, mesmo
  enquanto um access token ainda for criptograficamente válido.

O ID token é exclusivamente informação da sessão do cliente e nunca autoriza a
API. Claims customizados, se necessários, devem usar namespace próprio. Claims de
organização, papel, plano ou permissão do frontend não substituem o banco local.

Interface mínima:

```ts
interface IdentityProvider {
  verifyAccessToken(token: string): Promise<VerifiedIdentity>;
  getAuthorizationUrl(input: AuthorizationRequest): Promise<string>;
  revokeProviderSession(sessionId: string): Promise<void>;
  listProviderSessions(subject: string): Promise<ProviderSession[]>;
  deactivateProviderUser(subject: string): Promise<void>;
  deleteProviderUser(subject: string): Promise<void>;
}
```

## Requisitos atendidos pelo Auth0

| Requisito | Mecanismo |
| --- | --- |
| Cadastro e verificação de e-mail | Universal Login + database connection |
| Login sem enumeração | Universal Login; respostas locais não distinguem usuário existente |
| Força bruta e bloqueio | Attack Protection no tenant |
| Access token curto | API access token lifetime |
| Refresh rotativo e reuso | Refresh Token Rotation + Automatic Reuse Detection |
| Recuperação | link gerenciado, de uso único e lifetime configurável |
| Sessões após troca de senha | expiração/revogação no provedor e bloqueio local |
| Alteração de e-mail | fluxo gerenciado com reverificação e confirmação |
| MFA TOTP | fator OTP/Auth0 Guardian |
| Códigos de recuperação | recovery codes do MFA Auth0 |
| Logout | SDK SPA + logout federado do tenant |
| Assinatura/JWKS | access token RS256 para a API registrada |

## Gate de plano e tenant

MFA e alguns controles variam por plano Auth0. Antes de liberar produção, o owner
de segurança deve registrar evidência no ambiente de homologação de que o plano
contratado permite TOTP e códigos de recuperação, e executar cadastro, recovery
code de uso único, rotação/reuso de refresh token, reset de senha e revogação de
sessão. Sem essa evidência, identidade permanece atrás da feature flag e o
PROMPT 3 não pode ser declarado concluído para produção.

## Segurança e limites

- Nenhum client secret entra no bundle do frontend.
- Access e refresh tokens não são gravados manualmente em `localStorage`.
- Tokens, senhas, códigos MFA e recovery codes não entram em logs ou auditoria.
- CORS usa allowlist por ambiente; cookies próprios, se adicionados, exigem
  `HttpOnly`, `Secure`, `SameSite` e proteção CSRF.
- A API falha fechada quando JWKS/Auth0 está indisponível e a chave necessária não
  está no cache válido.
- Ações destrutivas exigem autenticação recente/reverificação no Auth0.
- Management API, quando necessária, usa credencial M2M apenas no backend e os
  menores scopes possíveis.

## Consequências

### Vantagens

- Todos os fatores obrigatórios ficam em um provedor gerenciado documentado.
- Universal Login reduz o contato da aplicação com senha e códigos MFA.
- PKCE, rotação/reuso, attack protection e JWKS têm suporte nativo.
- A porta própria mantém autorização e tenancy independentes do fornecedor.

### Desvantagens, custos e dependência

- MFA, organizações e logs podem exigir plano pago e elevar custo por usuário.
- Indisponibilidade do Auth0 impede novos logins e refreshes; access tokens já
  válidos continuam sujeitos ao bloqueio local.
- Troca de fornecedor exige migração de identidades, atualização de `sub`, nova
  autenticação dos usuários e invalidação das sessões anteriores.
- Management API adiciona quota, credencial M2M e revisão de scopes. Os endpoints
  de sessão usados para listar e revogar dispositivos são documentados como
  exclusivos do plano Enterprise; sem esse plano, essa superfície permanece
  bloqueada e não recebe fallback local enganoso.
- Residência, DPA, subprocessadores e retenção precisam de privacy review.

## Estratégia de migração

1. Proteger apenas `/v1` por feature flag; manter somente health público.
2. Criar SPA e API separadas por ambiente e configurar URLs exatas.
3. Ativar Universal Login/database connection, e-mail, MFA, recovery codes,
   attack protection e rotação.
4. Fazer piloto com allowlist e usuários descartáveis em homologação.
5. Mapear `sub` Auth0 para `iam.users` idempotentemente; criar membership apenas
   por fluxo server-side autorizado.
6. Ativar rotas privadas após testes negativos de token, tenant e revogação.
7. Migrar identidades existentes por convite/reset gerenciado, sem transportar
   senha para a aplicação.

## Validação e rollback

Validação obrigatória: executar a matriz de testes de
[`docs/auth0-identity.md`](../auth0-identity.md) num tenant de homologção com o
mesmo plano e configuração da produção. Os testes locais provam o adapter e a
autorização, mas não provam entitlement comercial do tenant.

Rollback:

- Desabilitar a feature flag das rotas privadas e retornar à superfície acadêmica
  pública mínima; nunca contornar validação JWT ou membership.
- Manter colunas/migrations aditivas para permitir rollback da imagem.
- Revogar refresh tokens/sessões do piloto no Auth0 e desabilitar callbacks do
  ambiente afetado.
- Preservar usuários e auditoria locais; uma nova tentativa de integração deve ser
  idempotente.

## Referências

- [Auth0 Universal Login](https://auth0.com/docs/authenticate/login/auth0-universal-login)
- [Authorization Code Flow with PKCE](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce)
- [Validate Access Tokens](https://auth0.com/docs/secure/tokens/access-tokens/validate-access-tokens)
- [Refresh Token Rotation](https://auth0.com/docs/secure/tokens/refresh-tokens/refresh-token-rotation)
- [MFA factors and recovery codes](https://auth0.com/docs/secure/multi-factor-authentication/multi-factor-authentication-factors)
- [Brute-force protection](https://auth0.com/docs/secure/attack-protection/brute-force-protection)
