import Anthropic from '@anthropic-ai/sdk'
import { PrismaClient, PromptKey } from '@prisma/client'
import { PROMPT_DEFAULTS } from '../ai-settings/ai-settings.service'
import { env } from '../../config/env'

function getClient(): Anthropic {
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY ?? '' })
}

async function getPromptText(prisma: PrismaClient, orgId: string, key: PromptKey): Promise<string> {
  const custom = await prisma.aiPrompt.findUnique({
    where: { organizationId_promptKey: { organizationId: orgId, promptKey: key } },
  })
  return (custom?.isActive && custom?.promptText) ? custom.promptText : PROMPT_DEFAULTS[key].text
}

async function checkEnabled(prisma: PrismaClient, orgId: string, key: PromptKey): Promise<void> {
  const setting = await prisma.orgAiSetting.findUnique({
    where: { organizationId_promptKey: { organizationId: orgId, promptKey: key } },
  })
  if (setting && !setting.isEnabled) {
    throw { statusCode: 403, message: 'AI-функция отключена администратором' }
  }

  if (setting?.dailyCallLimit) {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const count = await prisma.aiUsageLog.count({
      where: { organizationId: orgId, promptKey: key, createdAt: { gte: start } },
    })
    if (count >= setting.dailyCallLimit) {
      throw { statusCode: 429, message: 'Превышен дневной лимит AI-запросов для этой функции' }
    }
  }
}

async function callClaude(
  prompt: string,
  orgId: string,
  userId: string,
  key: PromptKey,
  prisma: PrismaClient,
): Promise<string> {
  if (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY === 'sk-ant-...') {
    throw { statusCode: 503, message: 'API-ключ Anthropic не настроен. Укажите ANTHROPIC_API_KEY в .env' }
  }

  const client = getClient()
  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const text = msg.content.find(c => c.type === 'text')?.text ?? ''
  const tokens = msg.usage.input_tokens + msg.usage.output_tokens

  await prisma.aiUsageLog.create({
    data: { organizationId: orgId, userId, promptKey: key, tokensUsed: tokens },
  })

  return text
}

// ── Project Status ────────────────────────────────────────────────────────────

export async function generateProjectStatus(
  prisma: PrismaClient,
  projectId: string,
  orgId: string,
  userId: string,
): Promise<string> {
  await checkEnabled(prisma, orgId, 'project_status')

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      tasks: {
        select: { id: true, status: true, dueDate: true, title: true, assigneeId: true },
      },
      members: { include: { user: { select: { fullName: true } } } },
    },
  })
  if (!project) throw { statusCode: 404, message: 'Проект не найден' }

  const now = new Date()
  const total = project.tasks.length
  const done = project.tasks.filter(t => t.status === 'done').length
  const overdue = project.tasks.filter(
    t => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done' && t.status !== 'cancelled',
  ).length
  const team = [...new Set(project.members.map(m => m.user.fullName))].join(', ')

  let promptText = await getPromptText(prisma, orgId, 'project_status')
  promptText = promptText
    .replace(/{{project_name}}/g, project.name)
    .replace(/{{total_tasks}}/g, String(total))
    .replace(/{{done_tasks}}/g, String(done))
    .replace(/{{overdue_tasks}}/g, String(overdue))
    .replace(/{{team}}/g, team || 'не назначена')
    .replace(/{{description}}/g, project.description ?? 'не указано')

  return callClaude(promptText, orgId, userId, 'project_status', prisma)
}

// ── Task Summary ──────────────────────────────────────────────────────────────

export async function summarizeTask(
  prisma: PrismaClient,
  taskId: string,
  orgId: string,
  userId: string,
): Promise<string> {
  await checkEnabled(prisma, orgId, 'task_summary')

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: {
      comments: {
        where: { deletedAt: null },
        include: { user: { select: { fullName: true } } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })
  if (!task) throw { statusCode: 404, message: 'Задача не найдена' }

  if (!task.comments.length) {
    return 'К задаче нет комментариев — нечего суммировать.'
  }

  const commentsText = task.comments
    .map(c => `${c.user.fullName}: ${c.text}`)
    .join('\n\n')

  let promptText = await getPromptText(prisma, orgId, 'task_summary')
  promptText = promptText
    .replace(/{{task_title}}/g, task.title)
    .replace(/{{comments}}/g, commentsText)

  return callClaude(promptText, orgId, userId, 'task_summary', prisma)
}

// ── Task Suggest ──────────────────────────────────────────────────────────────

export interface TaskSuggestion {
  description: string
  dueDate: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  subtasks: string[]
}

export async function suggestTaskFields(
  prisma: PrismaClient,
  taskName: string,
  projectId: string,
  orgId: string,
  userId: string,
): Promise<TaskSuggestion> {
  await checkEnabled(prisma, orgId, 'task_suggest')

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, endDate: true },
  })
  if (!project) throw { statusCode: 404, message: 'Проект не найден' }

  let promptText = await getPromptText(prisma, orgId, 'task_suggest')
  promptText = promptText
    .replace(/{{task_name}}/g, taskName)
    .replace(/{{project_name}}/g, project.name)
    .replace(/{{project_description}}/g, project.description ?? 'не указано')
    .replace(/{{project_end_date}}/g, project.endDate ? project.endDate.toISOString().slice(0, 10) : 'не задан')

  const text = await callClaude(promptText, orgId, userId, 'task_suggest', prisma)

  try {
    const match = text.match(/\{[\s\S]*\}/)
    if (match) {
      const parsed = JSON.parse(match[0])
      return {
        description: parsed.description ?? '',
        dueDate: parsed.dueDate ?? null,
        priority: parsed.priority ?? 'medium',
        subtasks: Array.isArray(parsed.subtasks) ? parsed.subtasks : [],
      }
    }
  } catch {}

  return { description: text, dueDate: null, priority: 'medium', subtasks: [] }
}

// ── Usage Log ─────────────────────────────────────────────────────────────────

export async function getUsageLog(
  prisma: PrismaClient,
  orgId: string,
  days = 30,
) {
  const since = new Date()
  since.setDate(since.getDate() - days)

  const logs = await prisma.aiUsageLog.findMany({
    where: { organizationId: orgId, createdAt: { gte: since } },
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  const byUser: Record<string, { fullName: string; calls: number; tokens: number }> = {}
  const byKey: Record<string, { calls: number; tokens: number }> = {}

  for (const log of logs) {
    const uid = log.userId
    if (!byUser[uid]) byUser[uid] = { fullName: log.user.fullName, calls: 0, tokens: 0 }
    byUser[uid].calls++
    byUser[uid].tokens += log.tokensUsed ?? 0

    const k = log.promptKey
    if (!byKey[k]) byKey[k] = { calls: 0, tokens: 0 }
    byKey[k].calls++
    byKey[k].tokens += log.tokensUsed ?? 0
  }

  return {
    totalCalls: logs.length,
    totalTokens: logs.reduce((s, l) => s + (l.tokensUsed ?? 0), 0),
    byUser: Object.entries(byUser).map(([id, v]) => ({ userId: id, ...v })),
    byKey: Object.entries(byKey).map(([key, v]) => ({ promptKey: key, ...v })),
    recent: logs.slice(0, 50).map(l => ({
      id: l.id,
      promptKey: l.promptKey,
      userName: l.user.fullName,
      tokensUsed: l.tokensUsed,
      createdAt: l.createdAt,
    })),
  }
}
