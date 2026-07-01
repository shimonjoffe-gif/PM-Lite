-- PM4: budget on projects, amount on tasks, saved_reports table, ReportType enum

-- New fields
ALTER TABLE "projects" ADD COLUMN "budget" DECIMAL(14, 2);
ALTER TABLE "tasks" ADD COLUMN "amount" DECIMAL(14, 2);

-- ReportType enum
CREATE TYPE "ReportType" AS ENUM (
  'projects_summary',
  'team_load',
  'tasks_completion',
  'billable_stages'
);

-- SavedReport
CREATE TABLE "saved_reports" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "user_id"         UUID NOT NULL,
  "name"            TEXT NOT NULL,
  "report_type"     "ReportType" NOT NULL,
  "filters"         JSONB NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "saved_reports_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE,
  CONSTRAINT "saved_reports_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX "saved_reports_org_user_idx" ON "saved_reports"("organization_id", "user_id");
