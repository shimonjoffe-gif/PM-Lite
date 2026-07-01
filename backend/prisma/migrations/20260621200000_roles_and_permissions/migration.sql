-- CreateEnum
CREATE TYPE "PermissionKey" AS ENUM ('project_view', 'project_create', 'project_edit', 'project_archive', 'task_view', 'task_create', 'task_edit', 'task_change_status', 'schedule_view', 'schedule_edit', 'budget_view', 'budget_edit', 'team_view', 'team_manage', 'report_view', 'report_export', 'ai_use', 'settings_manage');

-- AlterTable users
ALTER TABLE "users" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "org_role_id" UUID;
UPDATE "users" SET "is_admin" = true WHERE "role" = 'admin';
ALTER TABLE "users" DROP COLUMN "role";

-- AlterTable invitations
ALTER TABLE "invitations" DROP COLUMN "role";
ALTER TABLE "invitations" ADD COLUMN "org_role_id" UUID;
ALTER TABLE "invitations" ALTER COLUMN "token" SET DEFAULT encode(gen_random_bytes(32), 'hex');
ALTER TABLE "invitations" ALTER COLUMN "expires_at" SET DEFAULT (now() + INTERVAL '7 days');

ALTER TABLE "password_reset_tokens" ALTER COLUMN "token" SET DEFAULT encode(gen_random_bytes(32), 'hex');
ALTER TABLE "password_reset_tokens" ALTER COLUMN "expires_at" SET DEFAULT (now() + INTERVAL '1 hour');

-- DropEnum
DROP TYPE "UserRole";

-- CreateTable org_roles
CREATE TABLE "org_roles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "org_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable role_permissions
CREATE TABLE "role_permissions" (
    "role_id" UUID NOT NULL,
    "permission" "PermissionKey" NOT NULL,
    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("role_id","permission")
);

-- CreateIndex
CREATE INDEX "org_roles_organization_id_idx" ON "org_roles"("organization_id");
CREATE UNIQUE INDEX "org_roles_organization_id_name_key" ON "org_roles"("organization_id", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_org_role_id_fkey" FOREIGN KEY ("org_role_id") REFERENCES "org_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "org_roles" ADD CONSTRAINT "org_roles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "org_roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_role_id_fkey" FOREIGN KEY ("org_role_id") REFERENCES "org_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
