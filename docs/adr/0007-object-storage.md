# ADR 0007 — Object storage S3-compatible

- Estado: Proposto
- Data: 2026-07-15
- Decisores: engenharia, segurança e operações

## Contexto

Modelos, relatórios e futuras exportações são hoje arquivos locais. Containers têm filesystem efêmero e múltiplas réplicas não compartilham esses arquivos. Binários grandes também não pertencem ao PostgreSQL principal.

## Decisão

Usar object storage privado compatível com S3, inicialmente AWS S3, atrás de `ObjectStorage`. PostgreSQL guarda metadados; o objeto guarda conteúdo imutável.

Políticas:

- bloquear acesso público, exigir TLS e criptografia em repouso; avaliar SSE-KMS conforme classificação e requisitos contratuais;
- habilitar versionamento onde recuperação justificar o custo e lifecycle para expiração/arquivamento;
- gerar chaves no servidor, nunca aceitar bucket/key arbitrário do cliente;
- URLs pré-assinadas têm operação, objeto e validade mínimos e são tratadas como bearer tokens;
- exportações privadas usam `organizations/{organizationId}/exports/{exportId}/{version}`;
- artefatos compartilhados usam `shared/models/{modelVersion}/...` e não recebem `organization_id` fictício;
- metadata contém proprietário quando privado, hash, tamanho, content type, estado, retenção e versão;
- upload termina em estado `pending`; hash/tamanho e, se aplicável, inspeção são validados antes de `available`;
- API e worker usam diretórios temporários apenas durante a operação e os eliminam ao concluir.

## Consequências

### Positivas

- Réplicas e workers acessam os mesmos artefatos sem volume persistente.
- Retenção, versionamento e acesso temporário são controláveis.
- Download pode ocorrer sem transportar o binário pela API.

### Custos e riscos

- Egress, lifecycle incorreto, URLs vazadas e objetos órfãos.
- Consistência entre metadata e objeto exige estados e compensação.
- Compatibilidade S3 não garante portabilidade total entre provedores.

## Alternativas rejeitadas

- Disco do container ou volume anexado: acopla instância, deploy e disponibilidade.
- `bytea` no PostgreSQL para todos os artefatos: aumenta backup e I/O do banco principal.
- Bucket público com URLs difíceis de adivinhar: não é controle de acesso.

## Validação e rollback

- Copiar arquivos existentes com hash, verificar leitura e somente depois trocar a referência.
- Testar expiração de URL, acesso cruzado, objeto ausente, hash incorreto e lifecycle.
- Rollback por feature flag para o leitor antigo durante a janela de migração; manter cópias até validação. Em produção stateless consolidada, indisponibilidade do storage gera erro explícito, nunca dado inventado ou fallback local silencioso.

## Referências

- [Amazon S3: Presigned URLs](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html)
- [Amazon S3: Default encryption](https://docs.aws.amazon.com/AmazonS3/latest/userguide/specifying-s3-encryption.html)
