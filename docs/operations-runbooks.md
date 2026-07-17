# Runbooks operacionais

Todos começam com: abrir incidente, atribuir owner/substituto, registrar UTC e
request/job IDs, impedir PII em logs e definir próxima atualização. Mudanças
destrutivas ou bypass de RLS são proibidos.

## 1. Indisponibilidade

Owner: engenharia on-call. Confirmar por rede externa; separar frontend/API/Auth0;
abrir status independente; congelar deploy; verificar métricas e último release;
rollback se correlação e smoke forem seguros; comunicar a cada 30 min.

## 2. Banco degradado

Owner: database owner. Colocar writers/jobs pesados em contenção; verificar pool,
locks, latência, storage e réplica; preservar evidência de query por fingerprint;
escalar provedor; failover somente com RPO/RTO e aprovação; reconciliar jobs após.

## 3. Redis ou fila parada

Owner: platform owner. Distinguir rate-limit cache de BullMQ; conferir `noeviction`,
memória e conexão; pausar producers se backlog crescer; não recriar job manualmente
sem idempotency key; restaurar, acompanhar DLQ e reconciliar banco/outbox.

## 4. Falha de ingestão

Owner: data owner. Bloquear apresentação de dado velho como atual; verificar licença,
quota, circuit breaker e provider; não usar fallback; reexecutar com mesma chave;
validar dataset/versionamento, rejeitados, freshness e correções propagadas.

## 5. Dado incorreto

Owner: data owner. Marcar issue, origem e timestamp; ocultar se risco material;
resolver alias/registro no admin; reprocessar estatísticas/modelos afetados; comparar
antes/depois; comunicar alcance e correção sem apagar trilha.

## 6. Vazamento suspeito

Owner: security & privacy owner. Restringir acesso, preservar logs redigidos e hashes,
rotacionar credencial afetada, identificar categorias/titulares/janela, impedir
exfiltração adicional e acionar responsável jurídico. Comunicação a ANPD/titulares é
**decisão profissional**, não automática pelo software.

## 7. Comprometimento de conta

Owner: security on-call. Revogar todas as sessões, bloquear usuário no Auth0 e local,
revogar API keys/convites, exigir recuperação+MFA, revisar audit trail e alterações de
role/owner, restaurar somente após verificação proporcional do titular.

## 8. Falha de billing

Owner: billing owner. Não alterar entitlement pelo frontend; congelar reconciliação
se eventos divergirem; comparar IDs/hash/status sem abrir payload; reprocessar webhook
idempotente; comunicar acesso/cobrança; reembolso só por política aprovada.

## 9. Restauração de backup

Owner: database owner. Declarar desastre; restaurar isolado; validar checksum e RPO;
desabilitar integrações; reaplicar ledger de exclusões e expurgo; smoke e segurança;
aprovação de duas pessoas antes do tráfego; documentar perda/reconciliação.

## 10. Rollback de release

Owner: engenharia on-call. Confirmar compatibilidade backward de migrations; parar
rollout; voltar imagem assinada anterior; nunca reverter migration destrutivamente;
smoke de auth/RLS/export/freshness; observar por 30 min e abrir forward-fix.

## 11. Rotação de segredo

Owner: security owner. Inventariar consumidores; criar nova versão no secret manager;
deploy dual-read quando aplicável; validar; revogar anterior; para chave AES, executar
recriptografia auditada antes de remover versão antiga; buscar vazamento sem imprimir
o segredo; atualizar data/owner do próximo giro.

## Encerramento

Confirmar serviço e jobs, status público, chamados afetados, ações temporárias com
prazo, evidências cifradas e postmortem. O incident commander encerra; suporte não
encerra incidente técnico sem confirmação do owner.
