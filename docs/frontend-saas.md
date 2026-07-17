# Frontend SaaS e UX honesta

O frontend autenticado organiza a experiência em uma sala de análise: navegação à
esquerda, trabalho no centro e uma trilha de evidências à direita.
A trilha deixa origem, período, amostra, versão do modelo, atualização, incerteza e
limitações próximas da probabilidade. Percentuais não são apresentados como certeza
ou recomendação.

## Fluxos disponíveis

- cadastro, verificação, login, recuperação, MFA e reautenticação pelo Auth0
  Universal Login;
- onboarding inicial vinculado ao ambiente pessoal provisionado pelo servidor;
- perfil, segurança, sessões e dispositivos;
- visão de planos, assinatura, uso, limites e faturas obtida do servidor;
- abertura de checkout e portal apenas quando um gateway real está configurado;
- jogos e análise probabilística;
- suporte, base de conhecimento, termos, privacidade e aviso ético.

O billing responde como não configurado e não exibe
catálogo, faturas ou checkout fictícios.

## Dados, cache e atualização

O cliente HTTP é tipado, aceita `AbortSignal`, invalida cache após mutações e propaga
401 como sessão expirada. Partidas e predições usam cache curto de cinco minutos. A
tela atualiza por ação do usuário, reconexão, retorno à aba após a janela de frescor e
no próximo horário de início conhecido; não há polling agressivo. Uma falha de
predição é exibida na própria partida e nunca vira percentual estimado.

`VITE_OPERATIONAL_UNAVAILABLE=true` é a única forma de abrir a página global de
indisponibilidade. Falhas ordinárias permanecem visíveis nos componentes, com nova
tentativa explícita. `VITE_SUPPORT_EMAIL` é opcional. Analytics não é inicializado
por padrão e só pode ser conectado depois do consentimento de analytics.

O modo `?demo=1` só funciona em build de desenvolvimento. O modo de autenticação
E2E exige simultaneamente `import.meta.env.DEV`, `VITE_E2E_MODE=true` e hostname
local; ele não entra em produção.

## Verificação

```bash
npm run test:frontend
npm run test:e2e
npm run test:a11y
npm run typecheck
npm run build
```

Os testes Playwright interceptam a API somente durante o teste. Eles cobrem
onboarding, dashboard e evidências, troca do contexto interno da conta,
sessão expirada, desktop, viewport móvel e auditoria automatizada com axe. Os testes
Vitest cobrem cache/invalidação/cancelamento, sessão expirada, consentimento e
onboarding.
