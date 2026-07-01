import { PrismaClient } from '@prisma/client'
import { XMLParser } from 'fast-xml-parser'

// ── Import result ─────────────────────────────────────────────────────────────

export interface ImportResult {
  projectsCreated: number
  tasksCreated: number
  dependenciesCreated: number
  warnings: string[]
}

// ── MS Project XML ────────────────────────────────────────────────────────────

export async function importMSProjectXml(
  prisma: PrismaClient,
  orgId: string,
  createdBy: string,
  xmlBuffer: Buffer,
): Promise<ImportResult> {
  const parser = new XMLParser({ ignoreAttributes: false })
  const doc = parser.parse(xmlBuffer.toString('utf-8'))
  const project = doc?.Project

  if (!project) throw new Error('Неверный формат MS Project XML')

  const result: ImportResult = { projectsCreated: 0, tasksCreated: 0, dependenciesCreated: 0, warnings: [] }

  const projectName = project.Name ?? `Импорт ${new Date().toLocaleDateString('ru')}`

  // Find or create default status
  const status = await prisma.projectStatus.findFirst({ where: { organizationId: orgId }, orderBy: { sortOrder: 'asc' } })

  // Create project
  const dbProject = await prisma.project.create({
    data: {
      organizationId: orgId,
      name: projectName,
      statusId: status?.id ?? null,
      createdBy,
      ownerId: createdBy,
      startDate: project.StartDate ? new Date(project.StartDate) : null,
      endDate: project.FinishDate ? new Date(project.FinishDate) : null,
    },
  })
  result.projectsCreated++

  // Add creator as owner
  await prisma.projectMember.create({
    data: { projectId: dbProject.id, userId: createdBy, role: 'owner' },
  })

  // Parse tasks
  const rawTasks = Array.isArray(project.Tasks?.Task) ? project.Tasks.Task : project.Tasks?.Task ? [project.Tasks.Task] : []
  const taskMap = new Map<string, string>() // UID → db id

  for (const t of rawTasks) {
    if (t.Summary === '1' || t.Summary === true) continue // skip summary tasks
    if (!t.Name) continue

    const taskType = t.Milestone === '1' || t.Milestone === true ? 'milestone' : 'task'

    const dbTask = await prisma.task.create({
      data: {
        projectId: dbProject.id,
        title: String(t.Name),
        description: t.Notes ? String(t.Notes) : null,
        status: 'todo',
        taskType: taskType as any,
        effortHours: t.Work ? parseWorkDuration(String(t.Work)) : null,
        startDate: t.Start ? new Date(t.Start) : null,
        dueDate: t.Finish ? new Date(t.Finish) : null,
        createdBy,
        sortOrder: Number(t.ID ?? 0),
      },
    })
    taskMap.set(String(t.UID), dbTask.id)
    result.tasksCreated++
  }

  // Parse dependencies
  const rawDeps = Array.isArray(project.Tasks?.Task) ? project.Tasks.Task : []
  for (const t of rawDeps) {
    const preds = t.PredecessorLink
      ? Array.isArray(t.PredecessorLink) ? t.PredecessorLink : [t.PredecessorLink]
      : []
    for (const pred of preds) {
      const taskId = taskMap.get(String(t.UID))
      const predId = taskMap.get(String(pred.PredecessorUID))
      if (!taskId || !predId) continue
      const typeMap: Record<string, string> = { '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS' }
      const depType = typeMap[String(pred.Type ?? '1')] ?? 'FS'
      const lag = pred.LinkLag ? Math.round(Number(pred.LinkLag) / 4800) : 0 // MS Project lag in 1/10 mins
      try {
        await prisma.taskDependency.create({ data: { taskId, predecessorId: predId, type: depType as any, lagDays: lag } })
        result.dependenciesCreated++
      } catch {
        result.warnings.push(`Пропущена зависимость (возможный цикл)`)
      }
    }
  }

  return result
}

function parseWorkDuration(work: string): number {
  // MS Project: "PT8H0M0S" format
  const match = work.match(/PT(\d+)H/)
  return match ? Number(match[1]) : 0
}

// ── Excel / CSV ───────────────────────────────────────────────────────────────

export async function importExcel(
  prisma: PrismaClient,
  orgId: string,
  createdBy: string,
  buffer: Buffer,
  filename: string,
): Promise<ImportResult> {
  const result: ImportResult = { projectsCreated: 0, tasksCreated: 0, dependenciesCreated: 0, warnings: [] }
  const isCSV = filename.toLowerCase().endsWith('.csv')
  const ExcelJS = await import('exceljs')
  const wb = new ExcelJS.Workbook()

  try {
    if (isCSV) {
      const Readable = (await import('stream')).Readable
      const stream = Readable.from(buffer.toString('utf-8'))
      await wb.csv.read(stream as any)
    } else {
      await wb.xlsx.load(buffer as any)
    }
  } catch {
    throw new Error('Не удалось прочитать файл. Проверьте формат.')
  }

  const ws = wb.worksheets[0]
  if (!ws) throw new Error('Файл не содержит листов')

  // Expected columns: Название | Описание | Тип | Статус | Исполнитель | Дата начала | Дата окончания | Трудоёмкость (ч)
  const header = ws.getRow(1).values as any[]
  const colIdx = (name: string) => {
    const aliases: Record<string, string[]> = {
      title: ['название', 'name', 'task', 'задача'],
      description: ['описание', 'description', 'notes'],
      taskType: ['тип', 'type', 'task type'],
      status: ['статус', 'status'],
      assignee: ['исполнитель', 'assignee', 'assigned to', 'ответственный'],
      startDate: ['дата начала', 'start', 'start date', 'начало'],
      dueDate: ['срок', 'finish', 'due date', 'окончание', 'дата окончания'],
      effort: ['трудоёмкость', 'effort', 'hours', 'work', 'часы'],
    }
    const targets = aliases[name] ?? [name]
    for (let i = 1; i < header.length; i++) {
      const h = String(header[i] ?? '').toLowerCase().trim()
      if (targets.some(t => h.includes(t))) return i
    }
    return -1
  }

  const titleCol = colIdx('title')
  if (titleCol < 0) throw new Error('Не найдена колонка «Название»')

  const status = await prisma.projectStatus.findFirst({ where: { organizationId: orgId }, orderBy: { sortOrder: 'asc' } })
  const projectName = `Импорт из ${isCSV ? 'CSV' : 'Excel'} ${new Date().toLocaleDateString('ru')}`
  const dbProject = await prisma.project.create({
    data: {
      organizationId: orgId,
      name: projectName,
      statusId: status?.id ?? null,
      createdBy,
      ownerId: createdBy,
    },
  })
  await prisma.projectMember.create({ data: { projectId: dbProject.id, userId: createdBy, role: 'owner' } })
  result.projectsCreated++

  // Cache users by name
  const orgUsers = await prisma.user.findMany({ where: { organizationId: orgId }, select: { id: true, fullName: true } })
  const userByName = new Map(orgUsers.map(u => [u.fullName.toLowerCase(), u.id]))

  const descCol = colIdx('description')
  const typeCol = colIdx('taskType')
  const assigneeCol = colIdx('assignee')
  const startCol = colIdx('startDate')
  const dueCol = colIdx('dueDate')
  const effortCol = colIdx('effort')

  for (let r = 2; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    const title = String(row.getCell(titleCol).value ?? '').trim()
    if (!title) continue

    const rawType = String(row.getCell(typeCol).value ?? '').toLowerCase()
    const taskType = rawType.includes('milestone') || rawType.includes('веха') ? 'milestone'
      : rawType.includes('billable') || rawType.includes('акти') ? 'billable_stage'
      : rawType.includes('manag') || rawType.includes('управл') ? 'management'
      : 'task'

    const assigneeName = assigneeCol > 0 ? String(row.getCell(assigneeCol).value ?? '').trim() : ''
    const assigneeId = assigneeName ? (userByName.get(assigneeName.toLowerCase()) ?? null) : null
    if (assigneeName && !assigneeId) {
      result.warnings.push(`Пользователь «${assigneeName}» не найден, пропущен`)
    }

    const parseDate = (v: any) => {
      if (!v) return null
      if (v instanceof Date) return v
      const d = new Date(String(v))
      return isNaN(d.getTime()) ? null : d
    }

    await prisma.task.create({
      data: {
        projectId: dbProject.id,
        title,
        description: descCol > 0 ? (String(row.getCell(descCol).value ?? '') || null) : null,
        taskType: taskType as any,
        status: 'todo',
        assigneeId,
        startDate: startCol > 0 ? parseDate(row.getCell(startCol).value) : null,
        dueDate: dueCol > 0 ? parseDate(row.getCell(dueCol).value) : null,
        effortHours: effortCol > 0 ? (Number(row.getCell(effortCol).value) || null) : null,
        createdBy,
        sortOrder: r - 1,
      },
    })
    result.tasksCreated++
  }

  return result
}

// ── Primavera P6 XML ──────────────────────────────────────────────────────────

export async function importPrimaveraXml(
  prisma: PrismaClient,
  orgId: string,
  createdBy: string,
  xmlBuffer: Buffer,
): Promise<ImportResult> {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' })
  const doc = parser.parse(xmlBuffer.toString('utf-8'))
  const result: ImportResult = { projectsCreated: 0, tasksCreated: 0, dependenciesCreated: 0, warnings: [] }

  // P6 XML: APIBusinessObjects > Project
  const apiObj = doc?.APIBusinessObjects ?? doc
  const projects = apiObj?.Project
    ? Array.isArray(apiObj.Project) ? apiObj.Project : [apiObj.Project]
    : []

  if (!projects.length) throw new Error('Не найдены проекты в файле Primavera P6 XML')

  for (const p of projects.slice(0, 5)) { // Limit to 5 projects
    const status = await prisma.projectStatus.findFirst({ where: { organizationId: orgId }, orderBy: { sortOrder: 'asc' } })
    const dbProject = await prisma.project.create({
      data: {
        organizationId: orgId,
        name: p.Name ?? p.Id ?? 'Primavera Project',
        statusId: status?.id ?? null,
        createdBy,
        ownerId: createdBy,
        startDate: p.PlannedStartDate ? new Date(p.PlannedStartDate) : null,
        endDate: p.MustFinishByDate ? new Date(p.MustFinishByDate) : null,
      },
    })
    await prisma.projectMember.create({ data: { projectId: dbProject.id, userId: createdBy, role: 'owner' } })
    result.projectsCreated++

    const activities = apiObj?.Activity
      ? Array.isArray(apiObj.Activity) ? apiObj.Activity : [apiObj.Activity]
      : []

    const actMap = new Map<string, string>()
    for (const a of activities.filter((act: any) => act.ProjectObjectId === p.ObjectId || !p.ObjectId)) {
      const isMilestone = a.Type === 'StartMilestone' || a.Type === 'FinishMilestone'
      const dbTask = await prisma.task.create({
        data: {
          projectId: dbProject.id,
          title: String(a.Name ?? a.Id ?? 'Task'),
          status: 'todo',
          taskType: isMilestone ? 'milestone' : 'task',
          startDate: a.PlannedStartDate ? new Date(a.PlannedStartDate) : null,
          dueDate: a.PlannedFinishDate ? new Date(a.PlannedFinishDate) : null,
          effortHours: a.PlannedDuration ? parseFloat(a.PlannedDuration) : null,
          createdBy,
        },
      })
      actMap.set(String(a.ObjectId ?? a.Id), dbTask.id)
      result.tasksCreated++
    }

    // Relationships
    const rels = apiObj?.Relationship
      ? Array.isArray(apiObj.Relationship) ? apiObj.Relationship : [apiObj.Relationship]
      : []
    for (const r of rels) {
      const taskId = actMap.get(String(r.SuccessorActivityObjectId))
      const predId = actMap.get(String(r.PredecessorActivityObjectId))
      if (!taskId || !predId) continue
      const typeMap: Record<string, string> = { 'FS': 'FS', 'FF': 'FF', 'SS': 'SS', 'SF': 'SF' }
      const depType = typeMap[r.Type] ?? 'FS'
      try {
        await prisma.taskDependency.create({ data: { taskId, predecessorId: predId, type: depType as any, lagDays: Number(r.Lag ?? 0) } })
        result.dependenciesCreated++
      } catch {
        result.warnings.push('Пропущена дублирующая зависимость')
      }
    }
  }

  return result
}
