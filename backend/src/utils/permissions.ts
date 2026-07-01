import { PermissionKey } from '@prisma/client'

export { PermissionKey }

export const ALL_PERMISSIONS = Object.values(PermissionKey)

// Категории разрешений для отображения в UI
export const PERMISSION_GROUPS: { label: string; permissions: PermissionKey[] }[] = [
  {
    label: 'Проекты',
    permissions: ['project_view', 'project_create', 'project_edit', 'project_archive'],
  },
  {
    label: 'Задачи',
    permissions: ['task_view', 'task_create', 'task_edit', 'task_change_status'],
  },
  {
    label: 'Сроки / план',
    permissions: ['schedule_view', 'schedule_edit'],
  },
  {
    label: 'Бюджет',
    permissions: ['budget_view', 'budget_edit'],
  },
  {
    label: 'Команда и ресурсы',
    permissions: ['team_view', 'team_manage'],
  },
  {
    label: 'Отчёты',
    permissions: ['report_view', 'report_export'],
  },
  {
    label: 'AI-функции',
    permissions: ['ai_use'],
  },
  {
    label: 'Шаблоны',
    permissions: ['template_view', 'template_manage'],
  },
  {
    label: 'Настройки',
    permissions: ['settings_manage'],
  },
]

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  project_view: 'Просмотр проектов',
  project_create: 'Создание проектов',
  project_edit: 'Редактирование проектов',
  project_archive: 'Архивирование проектов',
  task_view: 'Просмотр задач',
  task_create: 'Создание задач',
  task_edit: 'Редактирование задач',
  task_change_status: 'Изменение статуса задач',
  schedule_view: 'Просмотр сроков',
  schedule_edit: 'Редактирование сроков',
  budget_view: 'Просмотр бюджета',
  budget_edit: 'Редактирование бюджета',
  team_view: 'Просмотр команды и загрузки',
  team_manage: 'Управление отсутствиями',
  report_view: 'Просмотр отчётов',
  report_export: 'Экспорт отчётов',
  ai_use: 'Использование AI-функций',
  settings_manage: 'Настройки организации',
  template_view: 'Просмотр шаблонов',
  template_manage: 'Управление шаблонами',
  document_view: 'Просмотр документов',
  document_upload: 'Загрузка документов',
  document_manage: 'Управление документами',
}

// Дефолтные наборы разрешений для каждой системной роли
export const DEFAULT_ROLE_PERMISSIONS: Record<string, PermissionKey[]> = {
  'Руководитель проектов': [
    'project_view', 'project_create', 'project_edit', 'project_archive',
    'task_view', 'task_create', 'task_edit', 'task_change_status',
    'schedule_view', 'schedule_edit',
    'budget_view', 'budget_edit',
    'team_view', 'team_manage',
    'report_view', 'report_export',
    'ai_use',
    'template_view', 'template_manage',
  ],
  'Руководитель подразделения': [
    'project_view',
    'task_view', 'task_create', 'task_edit', 'task_change_status',
    'schedule_view', 'schedule_edit',
    'budget_view',
    'team_view', 'team_manage',
    'report_view', 'report_export',
    'ai_use',
  ],
  'Администратор проекта': [
    'project_view', 'project_edit', 'project_archive',
    'task_view', 'task_create', 'task_edit', 'task_change_status',
    'schedule_view', 'schedule_edit',
    'budget_view',
    'team_view',
    'report_view', 'report_export',
    'ai_use',
  ],
  'Исполнитель': [
    'project_view',
    'task_view', 'task_change_status',
    'schedule_view',
  ],
  'Наблюдатель': [
    'project_view',
    'task_view',
    'schedule_view',
    'budget_view',
    'report_view',
  ],
}
