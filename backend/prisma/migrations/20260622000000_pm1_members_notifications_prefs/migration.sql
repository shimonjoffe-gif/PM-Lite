-- CreateEnum
CREATE TYPE "ProjectMemberRole" AS ENUM ('owner', 'admin', 'member');

-- CreateTable project_members
CREATE TABLE "project_members" (
    "project_id" UUID NOT NULL,
    "user_id"    UUID NOT NULL,
    "role"       "ProjectMemberRole" NOT NULL DEFAULT 'member',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "project_members_pkey" PRIMARY KEY ("project_id", "user_id")
);

CREATE INDEX "project_members_user_id_idx" ON "project_members"("user_id");

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_project_id_fkey"
    FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "project_members"
    ADD CONSTRAINT "project_members_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable notifications
CREATE TABLE "notifications" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "org_id"     UUID NOT NULL,
    "type"       TEXT NOT NULL,
    "payload"    JSONB NOT NULL,
    "is_read"    BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

ALTER TABLE "notifications"
    ADD CONSTRAINT "notifications_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable user_column_prefs
CREATE TABLE "user_column_prefs" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"    UUID NOT NULL,
    "table_name" TEXT NOT NULL,
    "columns"    JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_column_prefs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_column_prefs_user_id_table_name_key" ON "user_column_prefs"("user_id", "table_name");

ALTER TABLE "user_column_prefs"
    ADD CONSTRAINT "user_column_prefs_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed "Новый" status for existing organisations (idempotent)
INSERT INTO "project_statuses" ("organization_id", "name", "color", "sort_order")
SELECT id, 'Новый', '#6366F1', 0
FROM "organizations"
ON CONFLICT DO NOTHING;
