# Suporte e operação diária

> SLAs, reembolso, manutenção e comunicação são propostas operacionais.
> **VALIDAÇÃO JURÍDICA E COMERCIAL OBRIGATÓRIA** antes de oferta paga.

## Canal e categorias

O canal primário é o formulário autenticado em “Ajuda e suporte”. Ele cria chamado
tenant-scoped com conteúdo cifrado e dono automático. E-mail é secundário somente
quando `VITE_SUPPORT_EMAIL` estiver configurado. Suporte não consulta o banco:
trabalha pelo painel restrito e APIs auditadas.

| Categoria | Dono inicial | Exemplo |
|---|---|---|
| acesso | suporte | login, convite, sessão |
| billing | billing | fatura, cancelamento, cobrança |
| dados | engenharia | atraso ou resultado incorreto |
| privacidade | privacidade | exportação, correção, exclusão |
| segurança | segurança | conta comprometida, vazamento suspeito |
| técnico | engenharia | erro funcional/API |
| outro | suporte | triagem |

## SLA interno de primeira resposta

| Severidade | Definição | Resposta | Atualização | Dono |
|---|---|---:|---:|---|
| SEV1 | indisponibilidade ampla, perda de controle ou segurança crítica | 15 min | 30 min | incident commander |
| SEV2 | função crítica degradada ou vários clientes afetados | 1 h | 2 h | engenharia on-call |
| SEV3 | impacto moderado com contorno | 8 h | 1 dia útil | equipe proprietária |
| SEV4 | dúvida, melhoria ou impacto baixo | 48 h | quando houver mudança | suporte |

O prazo é calculado e persistido no chamado. Horário comercial, feriados,
compensações e SLA contratual permanecem **[VALIDAR COMERCIAL/JURÍDICO]**.

## Base de conhecimento e onboarding

A UI cobre interpretação probabilística, `dados_insuficientes`, organização,
sessões e privacidade. Onboarding verifica e-mail, tenant, timezone e aceite ético.
Artigos novos precisam de owner, data de revisão e teste por alguém fora da equipe
autora. Nunca orientar suporte a alterar plano, role ou quota pelo frontend.

## Status e comunicação

`status-page/` é HTML/CSS/JSON autônomo, sem API, Auth0, Redis, banco, fontes ou
analytics externos. Hospedar em conta/origem separadas. Credenciais break-glass têm
MFA, dois custodians e teste trimestral.

Comunicação de incidente contém impacto confirmado, início UTC, componentes,
contorno seguro, próxima atualização e referência pública. Não inclui hipótese como
causa, PII ou detalhe explorável. Encerramento publica duração e ações; postmortem
interno sem culpa ocorre em até cinco dias úteis para SEV1/SEV2.

Manutenção programada: anunciar com 72 h **[VALIDAR CONTRATO]**, informar janela UTC
e local, impacto, rollback e canal. Atualizar status 15 min antes, durante e ao final.
Manutenção de emergência segue incidente.

Reembolso: somente o template `/cancelamento-e-reembolso`, claramente marcado para
revisão, pode orientar a decisão futura. Suporte não promete nem executa reembolso
sem gateway, política aprovada e trilha de autorização.

## Escalonamento

| Alerta/processo | Primário | Substituto | Escala executiva |
|---|---|---|---|
| API/web | engenharia on-call | tech lead | incident commander |
| PostgreSQL/backup | database owner | SRE | incident commander |
| Redis/filas | platform owner | engenharia on-call | incident commander |
| ingestão/dado incorreto | data owner | ML owner | product owner |
| privacidade/vazamento | security & privacy owner | incident commander | responsável legal |
| conta comprometida | security on-call | identity owner | incident commander |
| billing | billing owner | finance owner | product owner |
| suporte/SLA | support lead | product owner | responsável comercial |

Nomes, telefones e fuso do primário/substituto devem ser preenchidos no sistema de
plantão antes de produção; papéis acima já são donos técnicos inequívocos.

## Handover e plantão

- revisar SEV1/SEV2, mudanças e manutenções nas próximas 48 h;
- confirmar saúde de API, banco, Redis, filas, ingestão e freshness;
- listar jobs em retry/DLQ, chamados fora do SLA e incidentes abertos;
- confirmar on-call primário/substituto e acesso à status page independente;
- registrar riscos, contornos temporários e horário da próxima ação;
- nunca entregar segredo em chat/ticket; usar secret manager;
- o novo plantonista confirma recebimento e executa um health check.

O painel “Operação interna” exige simultaneamente role autorizada e Auth0 subject no
`PLATFORM_ADMIN_SUBJECTS`. Chamados, incidentes, filas e audit trail são acessados por
API; leituras e mudanças administrativas são auditadas.
