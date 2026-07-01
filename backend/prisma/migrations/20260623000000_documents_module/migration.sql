-- Documents module: categories, types, documents, versions, access rules, storage settings

-- Enums
CREATE TYPE "StorageMode" AS ENUM ('cloud', 'external');
CREATE TYPE "DocumentParentType" AS ENUM ('project', 'task', 'client');

-- New permission values (extend existing enum)
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'document_view';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'document_upload';
ALTER TYPE "PermissionKey" ADD VALUE IF NOT EXISTS 'document_manage';

-- Document type categories
CREATE TABLE "document_type_categories" (
  "id"         UUID        NOT NULL DEFAULT gen_random_uuid(),
  "code"       TEXT        NOT NULL,
  "name"       TEXT        NOT NULL,
  "sort_order" INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT "document_type_categories_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_type_categories_code_key" UNIQUE ("code")
);

-- Document types (system + org-custom)
CREATE TABLE "document_types" (
  "id"              UUID        NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID,
  "category_id"     UUID        NOT NULL,
  "name"            TEXT        NOT NULL,
  "code"            TEXT,
  "is_system"       BOOLEAN     NOT NULL DEFAULT false,
  "is_archived"     BOOLEAN     NOT NULL DEFAULT false,
  "sort_order"      INTEGER     NOT NULL DEFAULT 0,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "document_types_category_id_fkey"     FOREIGN KEY ("category_id")     REFERENCES "document_type_categories"("id"),
  CONSTRAINT "document_types_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE INDEX "document_types_organization_id_idx" ON "document_types"("organization_id");

-- Documents (master record, no file — file is in versions)
CREATE TABLE "documents" (
  "id"               UUID                  NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  UUID                  NOT NULL,
  "title"            TEXT                  NOT NULL,
  "description"      TEXT,
  "document_type_id" UUID                  NOT NULL,
  "parent_type"      "DocumentParentType"  NOT NULL,
  "parent_id"        UUID                  NOT NULL,
  "project_id"       UUID,
  "created_by"       UUID                  NOT NULL,
  "created_at"       TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ           NOT NULL DEFAULT now(),
  "deleted_at"       TIMESTAMPTZ,
  CONSTRAINT "documents_pkey"                  PRIMARY KEY ("id"),
  CONSTRAINT "documents_organization_id_fkey"  FOREIGN KEY ("organization_id")  REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "documents_document_type_id_fkey" FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id"),
  CONSTRAINT "documents_project_id_fkey"       FOREIGN KEY ("project_id")       REFERENCES "projects"("id") ON DELETE SET NULL,
  CONSTRAINT "documents_created_by_fkey"       FOREIGN KEY ("created_by")       REFERENCES "users"("id")
);
CREATE INDEX "documents_organization_id_idx"          ON "documents"("organization_id");
CREATE INDEX "documents_project_id_idx"               ON "documents"("project_id");
CREATE INDEX "documents_parent_type_parent_id_idx"    ON "documents"("parent_type", "parent_id");
CREATE INDEX "documents_deleted_at_idx"               ON "documents"("deleted_at") WHERE "deleted_at" IS NULL;

-- Document versions
CREATE TABLE "document_versions" (
  "id"             UUID        NOT NULL DEFAULT gen_random_uuid(),
  "document_id"    UUID        NOT NULL,
  "version_number" INTEGER     NOT NULL,
  "file_name"      TEXT        NOT NULL,
  "file_size"      BIGINT,
  "mime_type"      TEXT,
  "storage_path"   TEXT,
  "external_id"    TEXT,
  "external_url"   TEXT,
  "checksum"       TEXT,
  "comment"        TEXT,
  "created_by"     UUID        NOT NULL,
  "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_versions_pkey"                              PRIMARY KEY ("id"),
  CONSTRAINT "document_versions_document_id_version_number_key"   UNIQUE ("document_id", "version_number"),
  CONSTRAINT "document_versions_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE,
  CONSTRAINT "document_versions_created_by_fkey"  FOREIGN KEY ("created_by")  REFERENCES "users"("id")
);
CREATE INDEX "document_versions_document_id_idx" ON "document_versions"("document_id");

-- Document access rules (org defaults + project overrides)
CREATE TABLE "document_access_rules" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"  UUID        NOT NULL,
  "project_id"       UUID,
  "document_type_id" UUID,
  "org_role_id"      UUID        NOT NULL,
  "can_view"         BOOLEAN     NOT NULL DEFAULT true,
  "can_upload"       BOOLEAN     NOT NULL DEFAULT false,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "document_access_rules_pkey"               PRIMARY KEY ("id"),
  CONSTRAINT "document_access_rules_org_id_fkey"        FOREIGN KEY ("organization_id")  REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "document_access_rules_project_id_fkey"    FOREIGN KEY ("project_id")       REFERENCES "projects"("id") ON DELETE CASCADE,
  CONSTRAINT "document_access_rules_doc_type_id_fkey"   FOREIGN KEY ("document_type_id") REFERENCES "document_types"("id") ON DELETE CASCADE,
  CONSTRAINT "document_access_rules_org_role_id_fkey"   FOREIGN KEY ("org_role_id")      REFERENCES "org_roles"("id") ON DELETE CASCADE
);
CREATE INDEX "document_access_rules_org_project_idx" ON "document_access_rules"("organization_id", "project_id");

-- Storage provider settings per org
CREATE TABLE "storage_provider_settings" (
  "id"                  UUID          NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"     UUID          NOT NULL,
  "storage_mode"        "StorageMode" NOT NULL DEFAULT 'cloud',
  "plugin_url"          TEXT,
  "plugin_api_key_hash" TEXT,
  "plugin_verified_at"  TIMESTAMPTZ,
  "plugin_version"      TEXT,
  "created_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT "storage_provider_settings_pkey"             PRIMARY KEY ("id"),
  CONSTRAINT "storage_provider_settings_org_id_key"       UNIQUE ("organization_id"),
  CONSTRAINT "storage_provider_settings_org_id_fkey"      FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Trigger for updated_at
CREATE TRIGGER trg_documents_updated_at
  BEFORE UPDATE ON "documents"
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Seed: system document type categories and types ─────────────────────────

INSERT INTO "document_type_categories" ("code", "name", "sort_order") VALUES
  ('organizational', 'Организационные', 1),
  ('management',     'Управленческие',  2),
  ('work_results',   'Результаты работ', 3),
  ('financial',      'Финансовые',      4);

INSERT INTO "document_types" ("organization_id", "category_id", "name", "code", "is_system", "sort_order")
SELECT NULL, dc.id, t.name, t.code, true, t.sort
FROM (VALUES
  ('organizational', 'Устав проекта',          'project_charter',    1),
  ('organizational', 'Договор',                'contract',           2),
  ('organizational', 'Матрица RACI',           'raci_matrix',        3),
  ('organizational', 'Техническое задание',    'terms_of_reference', 4),
  ('management',     'Статус проекта',         'project_status_doc', 1),
  ('management',     'Протокол совещания',     'meeting_minutes',    2),
  ('management',     'Входящая переписка',     'correspondence_in',  3),
  ('management',     'Исходящая переписка',    'correspondence_out', 4),
  ('work_results',   'Результат задачи',       'task_result',        1),
  ('work_results',   'Промежуточный результат','interim_result',     2),
  ('work_results',   'Акт сдачи-приёмки',      'delivery_act',       3),
  ('financial',      'Счёт',                   'invoice',            1),
  ('financial',      'Акт выполненных работ',  'completion_act',     2),
  ('financial',      'Платёжное поручение',    'payment_order',      3)
) AS t(cat_code, name, code, sort)
JOIN "document_type_categories" dc ON dc.code = t.cat_code;
