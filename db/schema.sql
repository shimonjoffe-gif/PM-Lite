-- =============================================================
-- PM Lite — PostgreSQL Schema
-- =============================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- =============================================================
-- ENUMS
-- =============================================================

CREATE TYPE user_role        AS ENUM ('admin', 'pm', 'executor');
CREATE TYPE plan_type        AS ENUM ('free', 'paid');
CREATE TYPE task_status      AS ENUM ('todo', 'in_progress', 'review', 'done', 'cancelled');
CREATE TYPE absence_type     AS ENUM ('vacation', 'sick', 'other');
CREATE TYPE feedback_type    AS ENUM ('bug', 'feedback');
CREATE TYPE prompt_key       AS ENUM ('project_status', 'task_summary');
CREATE TYPE feature_key      AS ENUM (
    'project_create',
    'project_archive',
    'task_create',
    'task_status_change',
    'kanban_drag',
    'calendar_view',
    'resource_view',
    'report_export',
    'ai_project_status',
    'ai_task_summary'
);

-- =============================================================
-- BLOCK 1 — CORE: organizations, users
-- =============================================================

CREATE TABLE organizations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT        NOT NULL,
    slug        TEXT        NOT NULL UNIQUE,
    plan_type   plan_type   NOT NULL DEFAULT 'free',
    logo_url    TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id      UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    email                TEXT        NOT NULL UNIQUE,
    password_hash        TEXT        NOT NULL,
    full_name            TEXT        NOT NULL,
    role                 user_role   NOT NULL DEFAULT 'executor',
    -- рабочая доступность: часов в день (по умолчанию 8)
    daily_capacity_hours NUMERIC(4,2) NOT NULL DEFAULT 8,
    is_active            BOOLEAN     NOT NULL DEFAULT true,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users (organization_id);

-- =============================================================
-- BLOCK 2 — AUTH: invitations, password reset
-- =============================================================

CREATE TABLE invitations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    invited_by      UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    email           TEXT        NOT NULL,
    role            user_role   NOT NULL DEFAULT 'executor',
    token           TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at      TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
    accepted_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invitations_token ON invitations (token);

CREATE TABLE password_reset_tokens (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token       TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '1 hour',
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pwd_reset_token ON password_reset_tokens (token);

-- =============================================================
-- BLOCK 3 — PROJECT LAYER: clients, project_statuses, projects, board_columns
-- =============================================================

CREATE TABLE clients (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    contact_info    TEXT,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_clients_org ON clients (organization_id);

-- Кастомные статусы проектов (настраиваются администратором)
CREATE TABLE project_statuses (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    color           TEXT        NOT NULL DEFAULT '#6B7280',
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (organization_id, name)
);

CREATE INDEX idx_proj_statuses_org ON project_statuses (organization_id);

CREATE TABLE projects (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    client_id       UUID        REFERENCES clients (id) ON DELETE SET NULL,
    status_id       UUID        REFERENCES project_statuses (id) ON DELETE SET NULL,
    -- ответственный РП
    owner_id        UUID        REFERENCES users (id) ON DELETE SET NULL,
    name            TEXT        NOT NULL,
    description     TEXT,
    start_date      DATE,
    end_date        DATE,
    is_archived     BOOLEAN     NOT NULL DEFAULT false,
    created_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_projects_org      ON projects (organization_id);
CREATE INDEX idx_projects_owner    ON projects (owner_id);
CREATE INDEX idx_projects_client   ON projects (client_id);
CREATE INDEX idx_projects_archived ON projects (organization_id, is_archived);

-- Колонки Канбан-доски: независимы от статусов задач, настраиваются per-project
CREATE TABLE board_columns (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    name        TEXT        NOT NULL,
    color       TEXT,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (project_id, name)
);

CREATE INDEX idx_board_cols_project ON board_columns (project_id);

-- =============================================================
-- BLOCK 4 — TASKS: tasks, comments
-- =============================================================

CREATE TABLE tasks (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id      UUID        NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
    -- рекурсивная иерархия без ограничения глубины
    parent_id       UUID        REFERENCES tasks (id) ON DELETE CASCADE,
    assignee_id     UUID        REFERENCES users (id) ON DELETE SET NULL,
    -- позиция на канбан-доске: независима от status
    board_column_id UUID        REFERENCES board_columns (id) ON DELETE SET NULL,
    title           TEXT        NOT NULL,
    description     TEXT,
    status          task_status NOT NULL DEFAULT 'todo',
    effort_hours    NUMERIC(6,2),
    start_date      DATE,
    due_date        DATE,
    -- порядок среди sibling-задач
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_by      UUID        REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tasks_project    ON tasks (project_id);
CREATE INDEX idx_tasks_parent     ON tasks (parent_id);
CREATE INDEX idx_tasks_assignee   ON tasks (assignee_id);
CREATE INDEX idx_tasks_due        ON tasks (due_date) WHERE due_date IS NOT NULL;
CREATE INDEX idx_tasks_status     ON tasks (project_id, status);

CREATE TABLE comments (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id     UUID        NOT NULL REFERENCES tasks (id) ON DELETE CASCADE,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    text        TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ,
    -- мягкое удаление: текст затирается, запись остаётся для AI-резюме
    deleted_at  TIMESTAMPTZ
);

CREATE INDEX idx_comments_task ON comments (task_id);

-- =============================================================
-- BLOCK 5 — RESOURCES: absences
-- =============================================================

CREATE TABLE absences (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    organization_id UUID         NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    type            absence_type NOT NULL DEFAULT 'vacation',
    start_date      DATE         NOT NULL,
    end_date        DATE         NOT NULL,
    notes           TEXT,
    created_by      UUID         REFERENCES users (id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT chk_absence_dates CHECK (end_date >= start_date)
);

CREATE INDEX idx_absences_user ON absences (user_id);
CREATE INDEX idx_absences_dates ON absences (user_id, start_date, end_date);

-- =============================================================
-- BLOCK 6 — AI: ai_prompts, ai_usage_logs
-- =============================================================

-- organization_id = NULL  →  системный дефолт (поставляется командой разработки)
-- organization_id = <id>  →  кастомный override для конкретной организации (платный тариф)
CREATE TABLE ai_prompts (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        REFERENCES organizations (id) ON DELETE CASCADE,
    prompt_key      prompt_key  NOT NULL,
    prompt_text     TEXT        NOT NULL,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- одна запись дефолта + одна per org
    UNIQUE (organization_id, prompt_key)
);

-- Индекс для быстрого поиска: сначала ищем кастомный, fallback на NULL
CREATE INDEX idx_ai_prompts_lookup ON ai_prompts (prompt_key, organization_id);

CREATE TABLE ai_usage_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    prompt_key      prompt_key  NOT NULL,
    -- для будущего биллинга
    tokens_used     INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_org_month ON ai_usage_logs (organization_id, created_at);

-- =============================================================
-- BLOCK 7 — ANALYTICS & FEEDBACK
-- =============================================================

CREATE TABLE feature_usage_logs (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    feature         feature_key NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_usage_org ON feature_usage_logs (organization_id, created_at);
CREATE INDEX idx_feature_usage_user ON feature_usage_logs (user_id, created_at);

CREATE TABLE feedback (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID          NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
    user_id         UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type            feedback_type NOT NULL,
    text            TEXT          NOT NULL,
    -- URL/маршрут экрана, с которого отправлен отзыв
    screen_context  TEXT,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_feedback_org ON feedback (organization_id, created_at);

-- =============================================================
-- TRIGGER: auto-update updated_at
-- =============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tasks_updated_at
    BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ai_prompts_updated_at
    BEFORE UPDATE ON ai_prompts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================
-- SEED: системные дефолтные AI-промты
-- =============================================================

INSERT INTO ai_prompts (organization_id, prompt_key, prompt_text) VALUES
(NULL, 'project_status',
 'Ты помощник проектного менеджера. На основе следующих данных о проекте составь краткий текстовый статус (3–5 предложений) для стейкхолдеров.

Проект: {{project_name}}
Период: {{start_date}} — {{end_date}}
Статус: {{status}}

Задачи:
{{tasks_summary}}

Напиши статус в деловом стиле. Укажи, что выполнено, что в работе, есть ли риски по срокам.'),

(NULL, 'task_summary',
 'Ты помощник проектного менеджера. Сделай краткое резюме (2–4 предложения) обсуждения по задаче.

Задача: {{task_title}}

Комментарии:
{{comments}}

Выдели ключевые решения и открытые вопросы.');
