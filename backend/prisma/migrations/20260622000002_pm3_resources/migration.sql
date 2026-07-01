-- PM3: TaskType, DependencyType, ConstraintType, WorkScheduleType, NonWorkingDayType enums
-- TaskDependency, OrgTaskType, WorkSchedule, UserWorkSchedule, NonWorkingDay tables
-- New columns: tasks.task_type, tasks.constraint_type, tasks.constraint_date, tasks.queue_order
--              projects.scheduling_priority

-- Enums
CREATE TYPE "TaskType" AS ENUM ('task', 'milestone', 'billable_stage', 'management');
CREATE TYPE "DependencyType" AS ENUM ('FS', 'SS', 'FF', 'SF');
CREATE TYPE "ConstraintType" AS ENUM ('asap', 'alap', 'snet', 'snlt', 'fnet', 'fnlt', 'exact', 'hammock');
CREATE TYPE "WorkScheduleType" AS ENUM ('five_two', 'two_two', 'six_one', 'custom');
CREATE TYPE "NonWorkingDayType" AS ENUM ('holiday', 'extra_workday');

-- New columns on tasks
ALTER TABLE "tasks"
  ADD COLUMN "task_type"       "TaskType"       NOT NULL DEFAULT 'task',
  ADD COLUMN "constraint_type" "ConstraintType",
  ADD COLUMN "constraint_date" DATE,
  ADD COLUMN "queue_order"     INTEGER;

CREATE INDEX "tasks_assignee_queue_idx" ON "tasks"("assignee_id", "queue_order")
  WHERE "assignee_id" IS NOT NULL AND "queue_order" IS NOT NULL;

-- New column on projects
ALTER TABLE "projects"
  ADD COLUMN "scheduling_priority" INTEGER NOT NULL DEFAULT 0;

-- TaskDependency
CREATE TABLE "task_dependencies" (
  "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
  "task_id"        UUID NOT NULL,
  "predecessor_id" UUID NOT NULL,
  "type"           "DependencyType" NOT NULL DEFAULT 'FS',
  "lag_days"       INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "task_dependencies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_dependencies_task_predecessor_key" UNIQUE ("task_id", "predecessor_id"),
  CONSTRAINT "task_dependencies_task_id_fkey"
    FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE CASCADE,
  CONSTRAINT "task_dependencies_predecessor_id_fkey"
    FOREIGN KEY ("predecessor_id") REFERENCES "tasks"("id") ON DELETE CASCADE
);
CREATE INDEX "task_dependencies_task_id_idx" ON "task_dependencies"("task_id");
CREATE INDEX "task_dependencies_predecessor_id_idx" ON "task_dependencies"("predecessor_id");

-- OrgTaskType (custom task types per org)
CREATE TABLE "org_task_types" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "name"            TEXT NOT NULL,
  "color"           TEXT NOT NULL DEFAULT '#6B7280',
  "is_system"       BOOLEAN NOT NULL DEFAULT false,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "org_task_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "org_task_types_org_name_key" UNIQUE ("organization_id", "name"),
  CONSTRAINT "org_task_types_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE INDEX "org_task_types_organization_id_idx" ON "org_task_types"("organization_id");

-- Seed system task types for existing orgs
INSERT INTO "org_task_types" ("organization_id", "name", "color", "is_system")
SELECT id, 'Задача',              '#3B82F6', true FROM "organizations"
ON CONFLICT ("organization_id", "name") DO NOTHING;
INSERT INTO "org_task_types" ("organization_id", "name", "color", "is_system")
SELECT id, 'Веха',               '#8B5CF6', true FROM "organizations"
ON CONFLICT ("organization_id", "name") DO NOTHING;
INSERT INTO "org_task_types" ("organization_id", "name", "color", "is_system")
SELECT id, 'Актируемый этап',    '#F59E0B', true FROM "organizations"
ON CONFLICT ("organization_id", "name") DO NOTHING;
INSERT INTO "org_task_types" ("organization_id", "name", "color", "is_system")
SELECT id, 'Управление проектом','#6B7280', true FROM "organizations"
ON CONFLICT ("organization_id", "name") DO NOTHING;

-- WorkSchedule (org-level)
CREATE TABLE "work_schedules" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL UNIQUE,
  "schedule_type"   "WorkScheduleType" NOT NULL DEFAULT 'five_two',
  "hours_per_day"   DECIMAL(4,2) NOT NULL DEFAULT 8,
  "work_days"       JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  "shift_start"     TEXT NOT NULL DEFAULT '09:00',
  "shift_end"       TEXT NOT NULL DEFAULT '18:00',
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "work_schedules_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);

-- Seed default schedule for existing orgs
INSERT INTO "work_schedules" ("organization_id")
SELECT id FROM "organizations"
ON CONFLICT ("organization_id") DO NOTHING;

-- UserWorkSchedule (per-user override)
CREATE TABLE "user_work_schedules" (
  "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id"       UUID NOT NULL UNIQUE,
  "schedule_type" "WorkScheduleType" NOT NULL DEFAULT 'five_two',
  "hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8,
  "work_days"     JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  "shift_start"   TEXT NOT NULL DEFAULT '09:00',
  "shift_end"     TEXT NOT NULL DEFAULT '18:00',
  "updated_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "user_work_schedules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_work_schedules_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

-- NonWorkingDay
CREATE TABLE "non_working_days" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "date"            DATE NOT NULL,
  "type"            "NonWorkingDayType" NOT NULL DEFAULT 'holiday',
  "name"            TEXT,

  CONSTRAINT "non_working_days_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "non_working_days_org_date_key" UNIQUE ("organization_id", "date"),
  CONSTRAINT "non_working_days_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE
);
CREATE INDEX "non_working_days_org_date_idx" ON "non_working_days"("organization_id", "date");
