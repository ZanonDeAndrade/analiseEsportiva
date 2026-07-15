# ADR 0001 — Fastify como framework HTTP

- Estado: Aceito e implementado
- Data: 2026-07-15
- Decisores: engenharia e produto

## Contexto

O backend atual usa `node:http`, faz roteamento, parsing, validação e serialização manualmente e mantém operações administrativas síncronas. Isso é suficiente para o protótipo, mas dificulta contratos versionados, plugins de autenticação, observabilidade, tratamento uniforme de erros e testes de integração.

## Decisão

Adotar Fastify 5 com TypeScript como adaptador HTTP da arquitetura-alvo. A API nova será montada por plugins sob `/v1`, com:

- JSON Schema para entrada e saída, definido em TypeBox e ligado ao type provider do Fastify;
- validação estrutural no boundary e autorização/consultas assíncronas em `preHandler`, não dentro de validadores;
- schemas de resposta obrigatórios, inclusive para impedir exposição acidental de campos;
- OpenAPI gerado dos mesmos schemas, sem transformá-lo no modelo do domínio;
- erros em `application/problem+json`, com código estável, `request_id` e mensagem segura;
- limite de payload, timeout, CORS, headers de segurança e logging estruturado configurados no composition root;
- plugins de rota sem acesso direto a Drizzle, Redis, Stripe ou SDK de identidade: cada handler chama um caso de uso.

O entrypoint manual de `node:http` foi substituído pelo composition root Fastify. A compatibilidade temporária ocorre por plugin e feature flag, sem reintroduzir persistência em disco.

## Consequências

### Positivas

- Contrato e serialização passam a ser verificáveis em runtime e em TypeScript.
- Plugins isolam preocupações transversais e facilitam testes por `inject` sem abrir socket.
- O prefixo `/v1` cria uma fronteira explícita para compatibilidade.

### Custos e riscos

- TypeBox, Fastify e plugins precisam ter versões compatíveis e atualizações coordenadas.
- Schemas duplicados em domínio e HTTP podem divergir; mapeadores explícitos e testes de contrato são obrigatórios.
- Validação não substitui autorização nem regras do domínio.

## Alternativas rejeitadas

- Manter `node:http`: preserva poucas dependências, mas mantém infraestrutura transversal artesanal.
- Express: ecossistema amplo, porém o fluxo schema-first e a serialização tipada exigiriam mais composição.
- NestJS: oferece estrutura completa, mas amplia a superfície e introduz abstrações desnecessárias para a migração incremental atual.

## Validação e rollback

- Criar testes de caracterização das rotas atuais antes do adaptador de compatibilidade.
- Provar `/v1/health/live`, `/v1/markets` e `/v1/predictions` com os adaptadores atuais antes de migrar persistência.
- Comparar respostas antigas e novas por campos semânticos, inclusive `dados_insuficientes` e aviso ético.
- Rollback: retirar o tráfego da release, reativar aliases protegidos pela feature flag quando necessário e restaurar a imagem anterior compatível com as migrations expand-only.

## Referências

- [Fastify: Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify: TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/)
