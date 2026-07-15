# Infraestrutura, ambientes e continuidade

- Estado: fundação implementada; provisionamento e evidências externas pendentes
- Plataforma-alvo: Render + GHCR + GitHub Actions
- Aplicação: API, worker, scheduler e migration usam a mesma imagem imutável

## 1. Ambientes e isolamento

| Ambiente | Finalidade | Banco | Redis | Identidade | Dados |
| --- | --- | --- | --- | --- | --- |
| development | estação local | container local | container local | tenant/app de desenvolvimento | somente dados locais |
| staging | homologação e drills | instância Render exclusiva | instâncias/namespaces exclusivos | tenant Auth0 exclusivo | dados sintéticos de teste ou anonimizados |
| production | tráfego real | instância Render exclusiva | instâncias exclusivas | tenant Auth0 de produção | dados licenciados |

Staging e production não compartilham banco, credenciais, Redis, tenant Auth0,
environment group, bucket, serviço Render ou chave de criptografia. Backups de
produção não são restaurados em staging sem aprovação de privacidade e
anonimização. BETINTEL_ENVIRONMENT identifica o ambiente e REDIS_KEY_PREFIX
precisa contê-lo.

## 2. Imagem e processos

O [Dockerfile](../Dockerfile) possui estágios de dependências, build,
dependências de produção e runtime. A base Node é fixada por versão e digest. O
runtime recebe somente node_modules de produção, JavaScript compilado e
migrations. Ele executa como o usuário node, não contém .env, dados locais,
artefatos, frontend ou toolchain TypeScript.

Comandos da mesma imagem:

| Processo | Comando |
| --- | --- |
| API | node backend/dist/server.js |
| worker | node backend/dist/worker.js |
| scheduler | node backend/dist/scheduler.js |
| migration | node backend/dist/cli/migrate.js |

Render deve configurar maxShutdownDelaySeconds=30. API, workers e scheduler
interrompem novas entradas e fecham Fastify, BullMQ, Redis e pools PostgreSQL em
até SHUTDOWN_GRACE_PERIOD_MS. Após o prazo o processo encerra com falha para não
fingir um shutdown limpo.

## 3. Desenvolvimento local

Compose é exclusivamente local:

~~~bash
docker compose -f compose.dev.yaml up --build
~~~

Se uma porta local ja estiver ocupada, use BETINTEL_COMPOSE_API_PORT,
BETINTEL_COMPOSE_POSTGRES_PORT ou BETINTEL_COMPOSE_REDIS_PORT para alterar apenas
o binding do host.

PostgreSQL e Redis têm health checks. A API só inicia depois que o serviço
migrate conclui todo o histórico. Workers são opcionais:

~~~bash
docker compose -f compose.dev.yaml --profile jobs up --build
~~~

Credenciais presentes no Compose são deliberadamente locais e não podem ser
reutilizadas. Não promover volumes ou imagens locais para ambientes gerenciados.

## 4. Configuração e segredos

Cada entrypoint chama validateRuntimeConfiguration antes de abrir sockets ou
conexões. A validação falha no boot para URL inválida, placeholder, loopback em
deploy, CORS sem HTTPS, prefixo Redis incorreto, papel PostgreSQL reutilizado,
porta/limite inválido, rota legada habilitada ou variável obrigatória ausente.

.env é somente conveniência local e está ignorado por .gitignore e
.dockerignore. O projeto não contém parser de .env: os scripts locais usam
node --env-file-if-exists=.env. Staging e production não montam nem geram
arquivo .env.

Fontes de segredo:

- runtime: Render Environment Groups/secret store, um grupo diferente por
  ambiente e por privilégio;
- CI/CD: GitHub Environments staging e production;
- GitHub production: required reviewers, prevenção de self-review e branches
  protegidas;
- imagem: nenhum segredo em ARG, ENV, layer, label ou arquivo.

Segredos mínimos do runtime incluem URLs PostgreSQL/Redis, credenciais M2M Auth0,
REQUEST_IP_HASH_KEY e chaves de providers. O job de deploy recebe apenas:

- secret MIGRATION_DATABASE_URL, de uma role exclusiva de migration;
- secret RENDER_API_TOKEN, com menor escopo possível;
- variável RENDER_SERVICE_IDS, ordenada como worker, scheduler e API;
- variável pública SMOKE_BASE_URL.

Rotacionar credenciais a cada 90 dias e imediatamente após suspeita. A rotação
usa credencial nova, validação, troca atômica no secret manager e revogação da
anterior. Valores não entram em logs nem outputs do workflow.

## 5. Liveness e readiness

| Endpoint | Semântica | Dependências |
| --- | --- | --- |
| /v1/health/live | processo/event loop responde | nenhuma |
| /v1/health/ready | instância pode receber tráfego | PostgreSQL e Redis |

Readiness limita cada probe por READINESS_TIMEOUT_MS, retorna somente up, down ou
not_configured e responde 503 se uma dependência essencial cair. Não retorna
hostname, erro, credencial ou stack. A ausência de modelo é exibida como
modelLoaded=false, mas não inventa modelo e não mascara a saúde do banco.

Render deve usar /v1/health/ready como healthCheckPath. O Dockerfile usa o mesmo
endpoint. Alertas devem separar falha de liveness de falha de dependência.

## 6. TLS e borda

- Render termina TLS com certificado gerenciado e redireciona HTTP para HTTPS;
- domínio de produção não aceita bypass HTTP nem acesso direto fora da borda;
- Fastify confia em exatamente HTTP_TRUST_PROXY_HOPS=1;
- HSTS: um ano, includeSubDomains e preload;
- Helmet mantém X-Content-Type-Options, frame deny, referrer policy e demais
  headers; CORS usa allowlist HTTPS;
- PostgreSQL externo usa TLS; Redis público exige rediss://. Preferir private
  network e bloquear acesso público por allowlist.

O redirecionamento é responsabilidade da borda para evitar loops e não deve ser
inferido de headers enviados diretamente pelo cliente.

## 7. Pipeline CI/CD

O workflow [.github/workflows/ci-cd.yml](../.github/workflows/ci-cd.yml):

1. instala com npm ci e cache derivado do lockfile;
2. executa ESLint e typecheck estrito;
3. executa testes unitários;
4. executa integração com PostgreSQL e Redis reais;
5. executa evals e audit de dependências de produção;
6. constrói a imagem e bloqueia HIGH/CRITICAL no Trivy;
7. publica no GHCR com tag do commit, provenance, SBOM e digest;
8. aplica migrations expand-only em job único;
9. implanta o mesmo digest em staging;
10. executa smoke de liveness/readiness;
11. aguarda aprovação do GitHub Environment production;
12. repete migration, deploy e smoke em production.

Actions são fixadas por commit SHA. O Trivy está fixado em release posterior ao
incidente de supply chain de março de 2026; atualizações exigem conferir release,
assinatura/advisory e novo SHA.

## 8. Deploy e rollback

scripts/render-deploy.mjs registra o deploy ativo anterior de cada serviço,
implanta a imagem por digest, espera o estado live e executa smoke. Se deploy ou
smoke falhar, solicita rollback dos serviços já alterados em ordem inversa.
Migration não recebe rollback automático: toda migration usada pelo pipeline
deve ser expand-only e compatível com a imagem anterior.

Para ensaiar em staging:

1. executar workflow_dispatch com rollback_drill=true;
2. o pipeline aplica migrations, implanta o digest e valida saúde;
3. o script reimplanta os deploys anteriores via API Render;
4. o smoke é executado novamente;
5. guardar URL da execução, IDs sem segredo, duração e resultado como evidência;
6. production é omitida nessa execução.

O critério “rollback comprovado em homologação” só é atendido após uma execução
real registrar rollback_drill_passed. Teste unitário ou revisão do YAML não
substituem essa evidência.

Rollback manual:

1. pausar novos deploys e scheduler;
2. identificar último digest saudável e conferir compatibilidade de schema;
3. acionar rollback Render por deploy ID/digest;
4. aguardar readiness e executar npm run smoke;
5. drenar/verificar outbox, filas e DLQ;
6. manter a migration expandida e criar forward-fix; migration destrutiva exige
   plano específico e backup validado.

## 9. Backup, retenção, RPO e RTO

Política mínima de produção:

- Render Postgres pago, workspace Pro ou superior;
- PITR contínuo automático habilitado e monitorado, com janela de 7 dias;
- criptografia AES-256 do primário, réplicas e backups, e TLS em trânsito;
- export lógico semanal para bucket S3 separado, privado, com SSE-KMS,
  versionamento e Object Lock quando o adapter/storage for aprovado;
- retenção secundária: 35 dias para semanais e 12 meses para um mensal;
- acesso ao backup por role exclusiva, MFA e trilha de auditoria;
- alerta para falha de checkpoint/WAL/export e teste trimestral.

Objetivos aprováveis:

| Objetivo | Meta | Como medir |
| --- | --- | --- |
| RPO | 15 minutos | timestamp recuperável versus último write confirmado |
| RTO | 120 minutos | incidente declarado até API pronta e smoke aprovado |

O plano gratuito não atende. O export S3 secundário continua bloqueado até a
aprovação do object storage e sua role; PITR pago é requisito de go-live, não um
fallback opcional.

## 10. Procedimento de restauração

### Ensaio local automatizado

Com o Compose ativo:

~~~bash
npm run backup:drill
~~~

O job cria dump temporário, recusa sobrescrever a origem, restaura apenas em
betintel_restore*, compara schemas, migrations e contagens críticas e remove o
dump em trap. Esse dump efêmero não é um backup de produção.

### PITR de staging/production

1. declarar incidente e congelar writers/scheduler;
2. selecionar ponto anterior, respeitando que Render não permite os dez minutos
   mais recentes;
3. restaurar para uma nova instância, nunca sobre a original;
4. executar queries de integridade, migrations, contagens e amostras sem PII;
5. iniciar uma API isolada apontando para a instância restaurada;
6. validar readiness, autenticação, isolamento RLS, fixtures e jobs;
7. registrar RPO/RTO observado e aprovação de duas pessoas;
8. trocar environment group de forma controlada e executar smoke;
9. manter a instância anterior intacta até encerrar a janela de rollback;
10. remover a cópia somente após retenção/evidência aprovada.

Falha em qualquer validação aborta a troca. Nunca corrigir a restauração com
fixture simulada, edição manual de auditoria ou desativação de RLS.

## 11. Evidência local de 2026-07-15

- imagem reconstruída do zero, 94.548.833 bytes, configurada com `USER node` e
  processo confirmado como UID/GID 1000;
- scan Trivy HIGH/CRITICAL: zero vulnerabilidades corrigíveis na imagem. Avisos
  sem correção do Debian permanecem visíveis no relatório e exigem revisão
  contínua de risco e atualização da base;
- `lint`, `typecheck`, build frontend/backend e 21 evals aprovados;
- 64 testes backend aprovados contra PostgreSQL e Redis reais, sem skips;
- liveness permaneceu 200 e readiness retornou 503 em quedas reais e separadas
  de PostgreSQL e Redis;
- boot do Compose com migration do zero, smoke e encerramento por SIGTERM
  aprovados;
- restore drill local aprovado, com schema, migrations e contagens críticas
  equivalentes;
- audit das dependências de produção: zero vulnerabilidades. O toolchain de
  desenvolvimento ainda reporta cinco avisos via Vite/esbuild/drizzle-kit e
  requer atualização major separada, sem alcançar a imagem de runtime.

## 12. Gates ainda externos

- provisionar serviços, bancos e Redis separados em Render;
- cadastrar registry credential para o GHCR;
- configurar GitHub Environments e required reviewers;
- comprovar rollback_drill_passed em staging;
- comprovar restore PITR e RPO/RTO observados;
- aprovar e provisionar o backup lógico S3/KMS.

Sem essas evidências a fundação é reproduzível localmente, mas produção não está aprovada.
