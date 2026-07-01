-- PM2: TaskPriority enum, EffortUnit enum, Task.priority, BoardColumn.statusMapping,
--      TaskStatusTransition, Organization.defaultEffortUnit, Project.effortUnit

-- Enums
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "EffortUnit" AS ENUM ('hours', 'days', 'weeks');

-- Organization: add defaultEffortUnit
ALTER TABLE "organizations"
  ADD COLUMN "default_effort_unit" "EffortUnit" NOT NULL DEFAULT 'hours';

-- Project: add effortUnit (nullable override)
ALTER TABLE "projects"
  ADD COLUMN "effort_unit" "EffortUnit";

-- Task: add priority
ALTER TABLE "tasks"
  ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'medium';

-- BoardColumn: add statusMapping
ALTER TABLE "board_columns"
  ADD COLUMN "status_mapping" "TaskStatus";

-- TaskStatusTransition table
CREATE TABLE "task_status_transitions" (
  "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id"      UUID NOT NULL,
  "from_status"          "TaskStatus" NOT NULL,
  "to_status"            "TaskStatus" NOT NULL,
  "allowed_org_role_ids" JSONB NOT NULL DEFAULT '[]',

  CONSTRAINT "task_status_transitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "task_status_transitions_org_from_to_key"
    UNIQUE ("organization_id", "from_status", "to_status"),
  CONSTRAINT "task_status_transitions_organization_id_fkey"
    FOREIGN KEY ("organization_id")
    REFERENCES "organizations"("id") ON DELETE CASCADE
);

CREATE INDEX "task_status_transitions_organization_id_idx"
  ON "task_status_transitions"("organization_id");
