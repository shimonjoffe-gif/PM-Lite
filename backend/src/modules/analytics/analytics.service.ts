import { PrismaClient } from '@prisma/client'

export async function getStats(prisma: PrismaClient, orgId: string, from: Date, to: Date) {
  const [featureLogs, aiLogs, users] = await Promise.all([
    prisma.featureUsageLog.findMany({
      where: {
        organizationId: orgId,
        feature: { in: ['project_create', 'task_create'] },
        createdAt: { gte: from, lte: to },
      },
    }),
    prisma.aiUsageLog.findMany({
      where: { organizationId: orgId, createdAt: { gte: from, lte: to } },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId, isActive: true },
      select: { id: true, fullName: true, email: true },
      orderBy: { fullName: 'asc' },
    }),
  ])

  const projectsCreated = featureLogs.filter(l => l.feature === 'project_create').length
  const tasksCreated = featureLogs.filter(l => l.feature === 'task_create').length
  const aiCalls = aiLogs.length

  const byUser = users.map(u => ({
    userId: u.id,
    fullName: u.fullName,
    email: u.email,
    projectsCreated: featureLogs.filter(l => l.feature === 'project_create' && l.userId === u.id).length,
    tasksCreated: featureLogs.filter(l => l.feature === 'task_create' && l.userId === u.id).length,
    aiCalls: aiLogs.filter(l => l.userId === u.id).length,
  }))

  return {
    period: { from: from.toISOString(), to: to.toISOString() },
    totals: { projectsCreated, tasksCreated, aiCalls },
    byUser,
  }
}

export async function createFeedback(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  data: { type: 'bug' | 'feedback'; text: string; screenContext?: string },
) {
  return prisma.feedback.create({
    data: {
      organizationId: orgId,
      userId,
      type: data.type,
      text: data.text,
      screenContext: data.screenContext ?? null,
    },
  })
}
