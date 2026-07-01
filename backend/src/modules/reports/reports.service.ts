import { PrismaClient } from '@prisma/client'

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReportFilters {
  from?: string
  to?: string
  projectId?: string
  userId?: string
  status?: string
  granularity?: 'day' | 'week' | 'month'
}

// ── Access helpers ────────────────────────────────────────────────────────────

export async function canViewOrgReports(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
): Promise<boolean> {
  if (isAdmin) return true
  if (!orgRoleId) return false
  const perm = await prisma.rolePermission.findUnique({
    where: { roleId_permission: { roleId: orgRoleId, permission: 'report_view' } },
  })
  return !!perm
}

// ── 1. Projects Summary ───────────────────────────────────────────────────────

export async function getProjectsSummary(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  filters: ReportFilters,
) {
  const projects = await prisma.project.findMany({
    where: {
      organizationId: orgId,
      isArchived: false,
      ...(filters.projectId ? { id: filters.projectId } : {}),
      ...(isAdmin
        ? {}
        : {
            OR: [
              { ownerId: userId },
              { members: { some: { userId } } },
            ],
          }),
    },
    select: {
      id: true,
      name: true,
      startDate: true,
      endDate: true,
      budget: true,
      owner: { select: { fullName: true } },
      status: { select: { name: true, color: true } },
      tasks: {
        select: {
          id: true,
          status: true,
          dueDate: true,
          effortHours: true,
        },
      },
    },
    orderBy: { name: 'asc' },
  })

  const today = new Date()

  return projects.map(p => {
    const total = p.tasks.length
    const done = p.tasks.filter(t => t.status === 'done').length
    const overdue = p.tasks.filter(
      t => t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled',
    ).length
    const effortTotal = p.tasks.reduce((s, t) => s + (t.effortHours ? Number(t.effortHours) : 0), 0)
    const completionPct = total > 0 ? Math.round((done / total) * 100) : 0

    return {
      projectId: p.id,
      projectName: p.name,
      ownerName: p.owner?.fullName ?? null,
      statusName: p.status?.name ?? null,
      statusColor: p.status?.color ?? null,
      startDate: p.startDate?.toISOString().slice(0, 10) ?? null,
      endDate: p.endDate?.toISOString().slice(0, 10) ?? null,
      budget: p.budget !== null ? Number(p.budget) : null,
      totalTasks: total,
      doneTasks: done,
      overdueTasks: overdue,
      completionPct,
      effortHours: Math.round(effortTotal * 10) / 10,
    }
  })
}

// ── 2. Team Load ──────────────────────────────────────────────────────────────

export async function getTeamLoad(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  orgRoleId: string | null,
  filters: ReportFilters,
) {
  const fromDate = filters.from ? new Date(filters.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const toDate = filters.to ? new Date(filters.to) : new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)

  // Get visible users
  let userWhere: any = { organizationId: orgId }
  if (!isAdmin) {
    if (orgRoleId) {
      const hasPerm = await prisma.rolePermission.findUnique({
        where: { roleId_permission: { roleId: orgRoleId, permission: 'team_manage' } },
      })
      if (!hasPerm) userWhere = { id: userId }
    } else {
      userWhere = { id: userId }
    }
  }
  if (filters.userId) userWhere = { ...userWhere, id: filters.userId }

  const users = await prisma.user.findMany({
    where: userWhere,
    select: { id: true, fullName: true, dailyCapacityHours: true },
  })

  // Get tasks in range for these users
  const tasks = await prisma.task.findMany({
    where: {
      project: { organizationId: orgId },
      assigneeId: { in: users.map(u => u.id) },
      status: { notIn: ['cancelled'] },
      OR: [
        { startDate: { lte: toDate }, dueDate: { gte: fromDate } },
        { startDate: { gte: fromDate, lte: toDate } },
        { dueDate: { gte: fromDate, lte: toDate } },
      ],
    },
    select: {
      assigneeId: true,
      effortHours: true,
      startDate: true,
      dueDate: true,
      status: true,
    },
  })

  const rangeMs = toDate.getTime() - fromDate.getTime()
  const rangeDays = Math.max(1, Math.round(rangeMs / 86400000) + 1)
  // Approx working days (exclude weekends) = rangeDays * 5/7
  const workDays = Math.round(rangeDays * 5 / 7)

  return users.map(u => {
    const userTasks = tasks.filter(t => t.assigneeId === u.id)
    const capacityHours = Number(u.dailyCapacityHours ?? 8) * workDays
    const assignedHours = userTasks.reduce((s, t) => s + (t.effortHours ? Number(t.effortHours) : 0), 0)
    const loadPct = capacityHours > 0 ? Math.round((assignedHours / capacityHours) * 100) : 0
    const doneTasks = userTasks.filter(t => t.status === 'done').length

    return {
      userId: u.id,
      fullName: u.fullName,
      capacityHours: Math.round(capacityHours),
      assignedHours: Math.round(assignedHours * 10) / 10,
      loadPct,
      taskCount: userTasks.length,
      doneTasks,
    }
  })
}

// ── 3. Tasks Completion ───────────────────────────────────────────────────────

export async function getTasksCompletion(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  filters: ReportFilters,
) {
  const fromDate = filters.from ? new Date(filters.from) : subMonths(new Date(), 3)
  const toDate = filters.to ? new Date(filters.to) : new Date()

  const taskWhere: any = {
    project: { organizationId: orgId },
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.userId ? { assigneeId: filters.userId } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
  }

  if (!isAdmin) {
    taskWhere.project = {
      organizationId: orgId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    }
  }

  const tasks = await prisma.task.findMany({
    where: taskWhere,
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      taskType: true,
      dueDate: true,
      updatedAt: true,
      project: { select: { id: true, name: true } },
      assignee: { select: { fullName: true } },
    },
    orderBy: { dueDate: 'asc' },
  })

  // Group by granularity period
  const granularity = filters.granularity ?? 'week'
  const periodMap = new Map<string, { period: string; created: number; done: number; overdue: number }>()

  // Build periods
  const d = new Date(fromDate)
  while (d <= toDate) {
    const key = getPeriodKey(d, granularity)
    if (!periodMap.has(key)) {
      periodMap.set(key, { period: key, created: 0, done: 0, overdue: 0 })
    }
    d.setDate(d.getDate() + (granularity === 'day' ? 1 : granularity === 'week' ? 7 : 30))
  }

  const today = new Date()
  tasks.forEach(t => {
    const refDate = t.dueDate ?? t.updatedAt
    if (refDate < fromDate || refDate > toDate) return
    const key = getPeriodKey(refDate, granularity)
    const entry = periodMap.get(key)
    if (!entry) return
    entry.created++
    if (t.status === 'done') entry.done++
    if (t.dueDate && t.dueDate < today && t.status !== 'done' && t.status !== 'cancelled') entry.overdue++
  })

  // Burndown: total tasks - cumulative done per period
  let totalTasks = tasks.filter(t => t.status !== 'cancelled').length
  let cumulativeDone = 0
  const periods = [...periodMap.values()]
  const burndown = periods.map(p => {
    cumulativeDone += p.done
    return { period: p.period, remaining: Math.max(0, totalTasks - cumulativeDone) }
  })

  return {
    periods: [...periodMap.values()],
    burndown,
    tasks: tasks.slice(0, 500).map(t => ({
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      taskType: t.taskType,
      projectName: t.project?.name ?? null,
      assigneeName: t.assignee?.fullName ?? null,
      dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    })),
  }
}

function getPeriodKey(date: Date, granularity: 'day' | 'week' | 'month'): string {
  if (granularity === 'day') return date.toISOString().slice(0, 10)
  if (granularity === 'month') return date.toISOString().slice(0, 7)
  // Week: ISO week start (Mon)
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - (day === 0 ? 6 : day - 1)
  d.setDate(diff)
  return d.toISOString().slice(0, 10)
}

function subMonths(date: Date, months: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() - months)
  return d
}

// ── 4. Billable Stages ────────────────────────────────────────────────────────

export async function getBillableStages(
  prisma: PrismaClient,
  orgId: string,
  userId: string,
  isAdmin: boolean,
  filters: ReportFilters,
) {
  const where: any = {
    project: { organizationId: orgId },
    taskType: 'billable_stage',
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.status ? { status: filters.status as any } : {}),
    ...(filters.from || filters.to ? {
      dueDate: {
        ...(filters.from ? { gte: new Date(filters.from) } : {}),
        ...(filters.to ? { lte: new Date(filters.to) } : {}),
      },
    } : {}),
  }

  if (!isAdmin) {
    where.project = {
      organizationId: orgId,
      OR: [{ ownerId: userId }, { members: { some: { userId } } }],
    }
  }

  const stages = await prisma.task.findMany({
    where,
    select: {
      id: true,
      title: true,
      status: true,
      dueDate: true,
      startDate: true,
      effortHours: true,
      amount: true,
      project: { select: { id: true, name: true } },
      assignee: { select: { id: true, fullName: true } },
    },
    orderBy: [{ project: { name: 'asc' } }, { dueDate: 'asc' }],
  })

  const totalAmount = stages.reduce((s, st) => s + (st.amount ? Number(st.amount) : 0), 0)
  const totalEffort = stages.reduce((s, st) => s + (st.effortHours ? Number(st.effortHours) : 0), 0)
  const doneCount = stages.filter(st => st.status === 'done').length

  return {
    stages: stages.map(st => ({
      id: st.id,
      title: st.title,
      status: st.status,
      startDate: st.startDate?.toISOString().slice(0, 10) ?? null,
      dueDate: st.dueDate?.toISOString().slice(0, 10) ?? null,
      effortHours: st.effortHours !== null ? Number(st.effortHours) : null,
      amount: st.amount !== null ? Number(st.amount) : null,
      projectId: st.project?.id ?? null,
      projectName: st.project?.name ?? null,
      assigneeId: st.assignee?.id ?? null,
      assigneeName: st.assignee?.fullName ?? null,
    })),
    summary: {
      total: stages.length,
      done: doneCount,
      totalAmount: Math.round(totalAmount * 100) / 100,
      totalEffortHours: Math.round(totalEffort * 10) / 10,
    },
  }
}

// ── Excel Export ──────────────────────────────────────────────────────────────

export async function exportToExcel(
  data: any,
  reportType: string,
  reportTitle: string,
): Promise<Buffer> {
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PM Lite'
  const ws = wb.addWorksheet(reportTitle)

  const headerStyle: any = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } },
    alignment: { vertical: 'middle', horizontal: 'center' },
  }

  if (reportType === 'projects_summary') {
    ws.columns = [
      { header: 'Проект', key: 'projectName', width: 30 },
      { header: 'Владелец', key: 'ownerName', width: 20 },
      { header: 'Статус', key: 'statusName', width: 15 },
      { header: '% выполнения', key: 'completionPct', width: 14 },
      { header: 'Всего задач', key: 'totalTasks', width: 12 },
      { header: 'Выполнено', key: 'doneTasks', width: 12 },
      { header: 'Просрочено', key: 'overdueTasks', width: 12 },
      { header: 'Трудоёмкость (ч)', key: 'effortHours', width: 16 },
      { header: 'Бюджет', key: 'budget', width: 14 },
      { header: 'Начало', key: 'startDate', width: 12 },
      { header: 'Окончание', key: 'endDate', width: 12 },
    ]
    ws.getRow(1).eachCell(c => Object.assign(c, headerStyle))
    ;(data as any[]).forEach(r => ws.addRow(r))
  } else if (reportType === 'team_load') {
    ws.columns = [
      { header: 'Сотрудник', key: 'fullName', width: 25 },
      { header: 'Ёмкость (ч)', key: 'capacityHours', width: 14 },
      { header: 'Назначено (ч)', key: 'assignedHours', width: 14 },
      { header: '% загрузки', key: 'loadPct', width: 12 },
      { header: 'Всего задач', key: 'taskCount', width: 12 },
      { header: 'Выполнено', key: 'doneTasks', width: 12 },
    ]
    ws.getRow(1).eachCell(c => Object.assign(c, headerStyle))
    ;(data as any[]).forEach(r => ws.addRow(r))
  } else if (reportType === 'tasks_completion') {
    const { tasks } = data as any
    ws.columns = [
      { header: 'Задача', key: 'title', width: 35 },
      { header: 'Проект', key: 'projectName', width: 25 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Приоритет', key: 'priority', width: 12 },
      { header: 'Тип', key: 'taskType', width: 14 },
      { header: 'Исполнитель', key: 'assigneeName', width: 20 },
      { header: 'Срок', key: 'dueDate', width: 12 },
    ]
    ws.getRow(1).eachCell(c => Object.assign(c, headerStyle))
    ;(tasks as any[]).forEach(r => ws.addRow(r))
  } else if (reportType === 'billable_stages') {
    const { stages, summary } = data as any
    ws.columns = [
      { header: 'Этап', key: 'title', width: 35 },
      { header: 'Проект', key: 'projectName', width: 25 },
      { header: 'Статус', key: 'status', width: 14 },
      { header: 'Исполнитель', key: 'assigneeName', width: 20 },
      { header: 'Начало', key: 'startDate', width: 12 },
      { header: 'Срок', key: 'dueDate', width: 12 },
      { header: 'Трудоёмкость (ч)', key: 'effortHours', width: 16 },
      { header: 'Сумма', key: 'amount', width: 14 },
    ]
    ws.getRow(1).eachCell(c => Object.assign(c, headerStyle))
    ;(stages as any[]).forEach(r => ws.addRow(r))
    ws.addRow([])
    ws.addRow(['Итого:', '', '', '', '', '', summary.totalEffortHours, summary.totalAmount])
  }

  ws.getRow(1).height = 20
  const buf = await wb.xlsx.writeBuffer()
  return Buffer.from(buf)
}

// ── PDF Export (Puppeteer) ────────────────────────────────────────────────────

export async function exportToPdf(
  data: any,
  reportType: string,
  reportTitle: string,
): Promise<Buffer> {
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
  const page = await browser.newPage()

  const html = buildReportHtml(data, reportType, reportTitle)
  await page.setContent(html, { waitUntil: 'load' })
  const pdf = await page.pdf({
    format: 'A4',
    landscape: true,
    printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '10mm', right: '10mm' },
  })
  await browser.close()
  return Buffer.from(pdf)
}

function buildReportHtml(data: any, reportType: string, title: string): string {
  let tableHtml = ''

  if (reportType === 'projects_summary') {
    const rows = (data as any[]).map(r => `
      <tr>
        <td>${r.projectName}</td><td>${r.ownerName ?? '—'}</td><td>${r.statusName ?? '—'}</td>
        <td>${r.completionPct}%</td><td>${r.doneTasks}/${r.totalTasks}</td>
        <td style="color:${r.overdueTasks > 0 ? '#dc2626' : 'inherit'}">${r.overdueTasks}</td>
        <td>${r.effortHours}ч</td><td>${r.budget ?? '—'}</td>
        <td>${r.startDate ?? '—'}</td><td>${r.endDate ?? '—'}</td>
      </tr>`)
    tableHtml = `<table><thead><tr>
      <th>Проект</th><th>Владелец</th><th>Статус</th><th>% выполнения</th>
      <th>Выполнено</th><th>Просрочено</th><th>Трудоёмкость</th><th>Бюджет</th>
      <th>Начало</th><th>Конец</th>
    </tr></thead><tbody>${rows.join('')}</tbody></table>`
  } else if (reportType === 'team_load') {
    const rows = (data as any[]).map(r => `
      <tr>
        <td>${r.fullName}</td><td>${r.capacityHours}ч</td><td>${r.assignedHours}ч</td>
        <td style="color:${r.loadPct > 100 ? '#dc2626' : r.loadPct > 80 ? '#d97706' : 'inherit'}">${r.loadPct}%</td>
        <td>${r.taskCount}</td><td>${r.doneTasks}</td>
      </tr>`)
    tableHtml = `<table><thead><tr>
      <th>Сотрудник</th><th>Ёмкость</th><th>Назначено</th><th>% загрузки</th>
      <th>Всего задач</th><th>Выполнено</th>
    </tr></thead><tbody>${rows.join('')}</tbody></table>`
  } else if (reportType === 'tasks_completion') {
    const { tasks } = data as any
    const rows = (tasks as any[]).map(r => `
      <tr>
        <td>${r.title}</td><td>${r.projectName ?? '—'}</td><td>${r.status}</td>
        <td>${r.priority}</td><td>${r.assigneeName ?? '—'}</td><td>${r.dueDate ?? '—'}</td>
      </tr>`)
    tableHtml = `<table><thead><tr>
      <th>Задача</th><th>Проект</th><th>Статус</th><th>Приоритет</th><th>Исполнитель</th><th>Срок</th>
    </tr></thead><tbody>${rows.join('')}</tbody></table>`
  } else if (reportType === 'billable_stages') {
    const { stages, summary } = data as any
    const rows = (stages as any[]).map(r => `
      <tr>
        <td>${r.title}</td><td>${r.projectName ?? '—'}</td><td>${r.status}</td>
        <td>${r.assigneeName ?? '—'}</td><td>${r.startDate ?? '—'}</td><td>${r.dueDate ?? '—'}</td>
        <td>${r.effortHours ?? '—'}</td><td>${r.amount ?? '—'}</td>
      </tr>`)
    tableHtml = `<table><thead><tr>
      <th>Этап</th><th>Проект</th><th>Статус</th><th>Исполнитель</th>
      <th>Начало</th><th>Срок</th><th>Трудоёмкость (ч)</th><th>Сумма</th>
    </tr></thead><tbody>${rows.join('')}
    <tr class="total"><td colspan="6"><b>Итого</b></td><td><b>${summary.totalEffortHours}ч</b></td><td><b>${summary.totalAmount}</b></td></tr>
    </tbody></table>`
  }

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<style>
  * { font-family: -apple-system, Arial, sans-serif; font-size: 11px; box-sizing: border-box; }
  body { padding: 0; margin: 0; color: #1f2937; }
  h1 { font-size: 16px; margin: 0 0 12px; color: #111827; }
  .meta { color: #6b7280; margin-bottom: 16px; font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #2563eb; color: #fff; padding: 6px 8px; text-align: left; font-weight: 600; }
  td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; }
  tr:nth-child(even) td { background: #f9fafb; }
  tr.total td { border-top: 2px solid #d1d5db; background: #f3f4f6; }
</style>
</head>
<body>
  <h1>${title}</h1>
  <div class="meta">Сформировано: ${new Date().toLocaleString('ru')}</div>
  ${tableHtml}
</body>
</html>`
}
