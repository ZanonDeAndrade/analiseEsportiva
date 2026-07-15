import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const adrDirectory = path.join(repositoryRoot, "docs", "adr");
const architecturePath = path.join(
  repositoryRoot,
  "docs",
  "target-architecture.md",
);

const expectedAdrs = [
  "0001-fastify-http-framework.md",
  "0002-managed-postgresql.md",
  "0003-drizzle-orm-and-migrations.md",
  "0004-redis-and-bullmq.md",
  "0005-managed-identity-provider.md",
  "0006-stripe-recurring-billing.md",
  "0007-object-storage.md",
  "0008-render-container-paas.md",
  "0009-shared-and-organization-data.md",
];

test("os nove ADRs são revisáveis com decisão e rollback", async () => {
  for (const filename of expectedAdrs) {
    const content = await readFile(path.join(adrDirectory, filename), "utf8");

    assert.match(content, /- Estado: (?:Proposto|Aceito com gate operacional|Aceito e implementado)/);
    assert.match(content, /## Contexto/);
    assert.match(content, /## Decisão/);
    assert.match(content, /## Consequências/);
    assert.match(content, /## Validação e rollback/);
  }
});

test("o desenho preserva isolamento, API versionada e migração incremental", async () => {
  const content = await readFile(architecturePath, "utf8");

  assert.match(
    content,
    /Dados esportivos compartilhados nunca têm `organization_id` ou `tenant_id`/,
  );
  assert.match(content, /Todo recurso privado tem `organization_id NOT NULL`/);
  assert.match(content, /## 10\. Contrato da API `\/v1`/);
  assert.match(content, /## 11\. Compatibilidade das rotas atuais/);
  assert.match(content, /## 12\. Migração incremental e rollback/);
  assert.match(content, /sem big bang/i);
  assert.match(content, /`dados_insuficientes`/);
  assert.match(content, /Nenhum banco, auth, billing, fila ou tenancy implementado/);
});
