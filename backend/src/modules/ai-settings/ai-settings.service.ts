import { PrismaClient, PromptKey } from '@prisma/client'

const PLAN_LIMITS: Record<string, { dailyCallsLimit: number | null }> = {
  free: { dailyCallsLimit: 10 },
  paid: { dailyCallsLimit: null },
}

export const AI_CASE_META: Record<PromptKey, { label: string; description: string }> = {
  project_status: {
    label: 'Автостатус проекта',
    description: 'Генерирует краткое резюме текущего состояния проекта на основе статусов задач.',
  },
  task_summary: {
    label: 'Резюме обсуждения задачи',
    description: 'Суммирует комментарии к задаче в краткие ключевые тезисы.',
  },
  task_suggest: {
    label: 'Авто-заполнение задачи',
    description: 'Предлагает описание, срок, приоритет и подзадачи по названию задачи.',
  },
}

export const PROMPT_DEFAULTS: Record<PromptKey, { text: string; variables: string[] }> = {
  project_status: {
    text: 'На основе статусов задач проекта «{{project_name}}» подготовь краткое резюме текущего состояния в 2–3 предложениях.\n\nЗадач всего: {{total_tasks}}. Выполнено: {{done_tasks}}. Просрочено: {{overdue_tasks}}.\nКоманда: {{team}}.\nОписание проекта: {{description}}.',
    variables: ['{{project_name}}', '{{total_tasks}}', '{{done_tasks}}', '{{overdue_tasks}}', '{{team}}', '{{description}}'],
  },
  task_summary: {
    text: 'Проанализируй обсуждение задачи «{{task_title}}» и составь краткое резюме (2–4 ключевых тезиса) из следующих комментариев:\n\n{{comments}}',
    variables: ['{{task_title}}', '{{comments}}'],
  },
  task_suggest: {
    text: 'По названию задачи «{{task_name}}» в контексте проекта «{{project_name}}» (описание: {{project_description}}, дедлайн проекта: {{project_end_date}}) предложи:\n1. Краткое описание задачи (2–3 предложения)\n2. Предполагаемый срок в формате YYYY-MM-DD\n3. Приоритет: low / medium / high / critical\n4. 3–5 подзадач\n\nОтветь строго в JSON без markdown:\n{"description":"...","dueDate":"YYYY-MM-DD","priority":"medium","subtasks":["..."]}',
    variables: ['{{task_name}}', '{{project_name}}', '{{project_description}}', '{{project_end_date}}'],
  },
}

export async function getPlanInfo(prisma: PrismaClient, orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw { statusCode: 404, message: 'Организация не найдена' }

  const limits = PLAN_LIMITS[org.planType] ?? { dailyCallsLimit: null }

  const now = new Date()
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const [callsToday, callsThisMonth] = await Promise.all([
    prisma.aiUsageLog.count({ where: { organizationId: orgId, createdAt: { gte: startOfDay } } }),
    prisma.aiUsageLog.count({ where: { organizationId: orgId, createdAt: { gte: startOfMonth } } }),
  ])

  return {
    planType: org.planType as 'free' | 'paid',
    limits,
    usage: { callsToday, callsThisMonth },
  }
}

export async function listAiCases(prisma: PrismaClient, orgId: string) {
  const settings = await prisma.orgAiSetting.findMany({ where: { organizationId: orgId } })
  const settingMap = new Map(settings.map(s => [s.promptKey, s]))

  return (Object.keys(AI_CASE_META) as PromptKey[]).map(key => {
    const s = settingMap.get(key)
    return {
      promptKey: key,
      label: AI_CASE_META[key].label,
      description: AI_CASE_META[key].description,
      isEnabled: s?.isEnabled ?? true,
      dailyCallLimit: s?.dailyCallLimit ?? null,
      monthlyTokenLimit: s?.monthlyTokenLimit ?? null,
    }
  })
}

export async function toggleAiCase(
  prisma: PrismaClient,
  orgId: string,
  promptKey: PromptKey,
  isEnabled: boolean,
) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw { statusCode: 404, message: 'Организация не найдена' }
  if (org.planType !== 'paid') throw { statusCode: 403, message: 'Управление AI-кейсами доступно только на платном тарифе' }

  await prisma.orgAiSetting.upsert({
    where: { organizationId_promptKey: { organizationId: orgId, promptKey } },
    create: { organizationId: orgId, promptKey, isEnabled },
    update: { isEnabled, updatedAt: new Date() },
  })
}

export async function listPrompts(prisma: PrismaClient, orgId: string) {
  const customPrompts = await prisma.aiPrompt.findMany({
    where: { organizationId: orgId, isActive: true },
  })
  const customMap = new Map(customPrompts.map(p => [p.promptKey, p.promptText]))

  return (Object.keys(PROMPT_DEFAULTS) as PromptKey[]).map(key => {
    const isCustom = customMap.has(key)
    return {
      promptKey: key,
      label: AI_CASE_META[key].label,
      isCustom,
      promptText: isCustom ? customMap.get(key)! : PROMPT_DEFAULTS[key].text,
      variables: PROMPT_DEFAULTS[key].variables,
    }
  })
}

export async function updatePrompt(
  prisma: PrismaClient,
  orgId: string,
  promptKey: PromptKey,
  promptText: string,
) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw { statusCode: 404, message: 'Организация не найдена' }
  if (org.planType !== 'paid') throw { statusCode: 403, message: 'Кастомизация промтов доступна только на платном тарифе' }

  await prisma.aiPrompt.upsert({
    where: { organizationId_promptKey: { organizationId: orgId, promptKey } },
    create: { organizationId: orgId, promptKey, promptText, isActive: true },
    update: { promptText, isActive: true, updatedAt: new Date() },
  })
}

export async function resetPrompt(prisma: PrismaClient, orgId: string, promptKey: PromptKey) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } })
  if (!org) throw { statusCode: 404, message: 'Организация не найдена' }
  if (org.planType !== 'paid') throw { statusCode: 403, message: 'Управление промтами доступно только на платном тарифе' }

  await prisma.aiPrompt.deleteMany({ where: { organizationId: orgId, promptKey } })
}

export async function updateLimits(
  prisma: PrismaClient,
  orgId: string,
  promptKey: PromptKey,
  dailyCallLimit: number | null,
  monthlyTokenLimit: number | null,
) {
  await prisma.orgAiSetting.upsert({
    where: { organizationId_promptKey: { organizationId: orgId, promptKey } },
    create: {
      organizationId: orgId,
      promptKey,
      isEnabled: true,
      dailyCallLimit,
      monthlyTokenLimit,
    },
    update: { dailyCallLimit, monthlyTokenLimit, updatedAt: new Date() },
  })
}
