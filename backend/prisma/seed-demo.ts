/**
 * Demo seed — полностью перезаписывает демо-организацию "ООО ПМ Групп"
 * Логин: admin@pmgroup.ru / Demo1234!  (все пользователи имеют тот же пароль)
 * Запуск: npm run db:seed-demo (из папки backend)
 */
import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { DEFAULT_ROLE_PERMISSIONS } from '../src/utils/permissions'

const prisma = new PrismaClient()
const DEMO_SLUG = 'pm-group-demo'
const DEMO_PASSWORD = 'Demo1234!'

// Фиксированные UUID — не меняются при пересеве, JWT остаётся валидным
const DEMO_ORG_ID   = 'aaaaaaaa-0000-0000-0000-000000000001'
const DEMO_ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000002'

const d = (s: string) => new Date(s)

// ─── helpers ────────────────────────────────────────────────────────────────

async function createProject(data: {
  orgId: string
  clientId?: string
  statusId: string
  ownerId: string
  creatorId: string
  name: string
  description: string
  startDate: Date
  endDate: Date
  budget?: number
  priority?: number
  isArchived?: boolean
}) {
  return prisma.project.create({
    data: {
      organizationId: data.orgId,
      clientId: data.clientId,
      statusId: data.statusId,
      ownerId: data.ownerId,
      createdBy: data.creatorId,
      name: data.name,
      description: data.description,
      startDate: data.startDate,
      endDate: data.endDate,
      budget: data.budget,
      effortUnit: 'hours',
      schedulingPriority: data.priority ?? 5,
      isArchived: data.isArchived ?? false,
    },
  })
}

async function cols(projectId: string) {
  const [todo, prog, rev, done] = await Promise.all([
    prisma.boardColumn.create({ data: { projectId, name: 'К выполнению', color: '#6B7280', sortOrder: 0, statusMapping: 'todo' } }),
    prisma.boardColumn.create({ data: { projectId, name: 'В работе',     color: '#3B82F6', sortOrder: 1, statusMapping: 'in_progress' } }),
    prisma.boardColumn.create({ data: { projectId, name: 'На проверке', color: '#F59E0B', sortOrder: 2, statusMapping: 'review' } }),
    prisma.boardColumn.create({ data: { projectId, name: 'Выполнено',   color: '#10B981', sortOrder: 3, statusMapping: 'done' } }),
  ])
  return { todo, prog, rev, done }
}

// ─── main ────────────────────────────────────────────────────────────────────

async function main() {
  // ── System document types (idempotent) ────────────────────────
  console.log('📄  Сидирую системные типы документов...')
  const docCategories = [
    { code: 'organizational', name: 'Организационные',  sortOrder: 1 },
    { code: 'management',     name: 'Управленческие',   sortOrder: 2 },
    { code: 'work_results',   name: 'Результаты работ', sortOrder: 3 },
    { code: 'financial',      name: 'Финансовые',       sortOrder: 4 },
  ]
  const catMap: Record<string, string> = {}
  for (const cat of docCategories) {
    const c = await prisma.documentTypeCategory.upsert({
      where: { code: cat.code },
      create: cat,
      update: { name: cat.name, sortOrder: cat.sortOrder },
    })
    catMap[cat.code] = c.id
  }

  console.log('🧹  Удаляю старую демо-организацию...')
  const demoOrg = await prisma.organization.findUnique({ where: { slug: DEMO_SLUG } })
  if (demoOrg) {
    // Break FK cycles before cascading org delete:
    // 1. Documents reference DocumentTypes without cascade — delete docs first
    await prisma.document.deleteMany({ where: { organizationId: demoOrg.id } })
    // 2. UserWorkSchedule→WorkSchedulePreset (SET NULL) conflicts with org→preset (cascade)
    await prisma.userWorkSchedule.deleteMany({ where: { user: { organizationId: demoOrg.id } } })
    await prisma.workSchedulePreset.deleteMany({ where: { organizationId: demoOrg.id } })
    // 3. AbsenceRequest steps and requests before org cascade
    await prisma.absenceRequestStep.deleteMany({ where: { request: { organizationId: demoOrg.id } } })
    await prisma.absenceRequest.deleteMany({ where: { organizationId: demoOrg.id } })
    await prisma.absenceType.deleteMany({ where: { organizationId: demoOrg.id } })
    await prisma.department.deleteMany({ where: { organizationId: demoOrg.id } })
  }
  await prisma.organization.deleteMany({ where: { slug: DEMO_SLUG } })

  // Cascade delete removed all org documents — now safe to recreate system doc types
  await prisma.documentType.deleteMany({ where: { organizationId: null } })
  await prisma.documentType.createMany({
    data: [
      { code: 'project_charter',    name: 'Устав проекта',            categoryId: catMap['organizational'], isSystem: true, sortOrder: 1 },
      { code: 'contract',           name: 'Договор',                  categoryId: catMap['organizational'], isSystem: true, sortOrder: 2 },
      { code: 'raci_matrix',        name: 'Матрица ответственности',  categoryId: catMap['organizational'], isSystem: true, sortOrder: 3 },
      { code: 'terms_of_reference', name: 'Техническое задание',      categoryId: catMap['organizational'], isSystem: true, sortOrder: 4 },
      { code: 'project_status',     name: 'Статус-отчёт',             categoryId: catMap['management'],     isSystem: true, sortOrder: 1 },
      { code: 'meeting_minutes',    name: 'Протокол совещания',       categoryId: catMap['management'],     isSystem: true, sortOrder: 2 },
      { code: 'correspondence_in',  name: 'Входящая переписка',       categoryId: catMap['management'],     isSystem: true, sortOrder: 3 },
      { code: 'correspondence_out', name: 'Исходящая переписка',      categoryId: catMap['management'],     isSystem: true, sortOrder: 4 },
      { code: 'task_result',        name: 'Результат задачи',         categoryId: catMap['work_results'],   isSystem: true, sortOrder: 1 },
      { code: 'interim_result',     name: 'Промежуточный результат',  categoryId: catMap['work_results'],   isSystem: true, sortOrder: 2 },
      { code: 'delivery_act',       name: 'Акт сдачи-приёмки',       categoryId: catMap['work_results'],   isSystem: true, sortOrder: 3 },
      { code: 'invoice',            name: 'Счёт',                     categoryId: catMap['financial'],      isSystem: true, sortOrder: 1 },
      { code: 'completion_act',     name: 'Акт выполненных работ',    categoryId: catMap['financial'],      isSystem: true, sortOrder: 2 },
      { code: 'payment_order',      name: 'Платёжное поручение',      categoryId: catMap['financial'],      isSystem: true, sortOrder: 3 },
    ],
  })

  // ── Organization ──────────────────────────────────────────────
  console.log('🏢  Создаю организацию ООО "ПМ Групп"...')
  const org = await prisma.organization.create({
    data: {
      id: DEMO_ORG_ID,
      name: 'ООО "ПМ Групп"',
      slug: DEMO_SLUG,
      planType: 'paid',
      defaultEffortUnit: 'hours',
    },
  })

  // ── Absence Types (system) ───────────────────────────────────
  console.log('📋  Создаю типы отсутствий...')
  await prisma.absenceType.createMany({
    data: [
      { organizationId: org.id, code: 'vacation', name: 'Отпуск', color: '#3B82F6', isSystem: true, approvalSteps: [{ order: 1, role: 'pm', action: 'approve' }, { order: 2, role: 'line_manager', action: 'approve' }] },
      { organizationId: org.id, code: 'sick', name: 'Больничный', color: '#EF4444', isSystem: true, approvalSteps: [{ order: 1, role: 'line_manager', action: 'notify' }] },
      { organizationId: org.id, code: 'other', name: 'Другое', color: '#6B7280', isSystem: true, approvalSteps: [] },
    ],
  })

  // ── Roles ────────────────────────────────────────────────────
  console.log('👔  Создаю роли...')
  const roles: Record<string, string> = {}
  for (const [name, perms] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
    const role = await prisma.orgRole.create({
      data: {
        organizationId: org.id,
        name,
        isSystem: true,
        permissions: { create: perms.map(p => ({ permission: p })) },
      },
    })
    roles[name] = role.id
  }

  const R = {
    pm:     roles['Руководитель проектов'],
    dept:   roles['Руководитель подразделения'],
    padmin: roles['Администратор проекта'],
    exec:   roles['Исполнитель'],
    obs:    roles['Наблюдатель'],
  }

  // ── Users ─────────────────────────────────────────────────────
  console.log('👤  Создаю пользователей...')
  const hash = await bcrypt.hash(DEMO_PASSWORD, 10)

  const mkUser = (
    email: string, fullName: string,
    isAdmin: boolean, orgRoleId?: string,
    capacityHours = 8, fixedId?: string,
  ) =>
    prisma.user.create({
      data: {
        ...(fixedId ? { id: fixedId } : {}),
        organizationId: org.id,
        email, fullName,
        passwordHash: hash,
        isAdmin,
        orgRoleId: orgRoleId ?? null,
        isActive: true,
        emailVerifiedAt: new Date(),
        dailyCapacityHours: capacityHours,
      },
    })

  const admin   = await mkUser('admin@pmgroup.ru',   'Алексей Воронов',   true,  undefined, 8, DEMO_ADMIN_ID)
  const pm1     = await mkUser('petrov@pmgroup.ru',  'Мария Петрова',     false, R.pm)
  const pm2     = await mkUser('sidorov@pmgroup.ru', 'Иван Сидоров',      false, R.pm)
  const dept1   = await mkUser('zaharov@pmgroup.ru', 'Дмитрий Захаров',   false, R.dept)
  const dept2   = await mkUser('morozov@pmgroup.ru', 'Елена Морозова',    false, R.dept)
  const padmin1 = await mkUser('kozlov@pmgroup.ru',  'Андрей Козлов',     false, R.padmin)
  const exec1   = await mkUser('novikov@pmgroup.ru', 'Сергей Новиков',    false, R.exec)
  const exec2   = await mkUser('belova@pmgroup.ru',  'Ольга Белова',      false, R.exec)
  const exec3   = await mkUser('lebedev@pmgroup.ru', 'Кирилл Лебедев',    false, R.exec)
  const exec4   = await mkUser('smirnov@pmgroup.ru', 'Татьяна Смирнова',  false, R.exec, 6)
  const obs1    = await mkUser('popov@pmgroup.ru',   'Владимир Попов',    false, R.obs)

  // ── Work schedule ─────────────────────────────────────────────
  await prisma.workSchedule.create({
    data: {
      organizationId: org.id,
      scheduleType: 'five_two',
      hoursPerDay: 8,
      workDays: [1, 2, 3, 4, 5],
      shiftStart: '09:00',
      shiftEnd: '18:00',
    },
  })

  // ── System work schedule presets (shared across all orgs) ─────
  const existingPresets = await prisma.workSchedulePreset.count({ where: { isSystem: true } })
  if (existingPresets === 0) {
    await prisma.workSchedulePreset.createMany({
      data: [
        {
          organizationId: null,
          name: '5/2, 8 ч/день',
          scheduleType: 'five_two',
          hoursPerDay: 8,
          workDays: [1, 2, 3, 4, 5],
          cycleDays: null,
          workDaysInCycle: null,
          isSystem: true,
        },
        {
          organizationId: null,
          name: '2/2, 12 ч/смену',
          scheduleType: 'two_two',
          hoursPerDay: 12,
          workDays: [],
          cycleDays: 4,
          workDaysInCycle: 2,
          isSystem: true,
        },
        {
          organizationId: null,
          name: 'Сокращённый, 4 ч/день',
          scheduleType: 'custom',
          hoursPerDay: 4,
          workDays: [1, 2, 3, 4, 5],
          cycleDays: null,
          workDaysInCycle: null,
          isSystem: true,
        },
      ],
    })
  }

  // ── Non-working days (РФ 2026) ────────────────────────────────
  const holidays: [string, string][] = [
    ['2026-01-01', 'Новый год'],
    ['2026-01-02', 'Новогодние каникулы'],
    ['2026-01-05', 'Новогодние каникулы'],
    ['2026-01-06', 'Новогодние каникулы'],
    ['2026-01-07', 'Рождество Христово'],
    ['2026-01-08', 'Новогодние каникулы'],
    ['2026-02-23', 'День защитника Отечества'],
    ['2026-03-09', 'Международный женский день'],
    ['2026-05-01', 'Праздник Весны и Труда'],
    ['2026-05-04', 'Праздник Весны и Труда (перенос)'],
    ['2026-05-11', 'День Победы (перенос)'],
    ['2026-06-12', 'День России'],
    ['2026-11-04', 'День народного единства'],
    ['2026-12-31', 'Новогодние каникулы'],
  ]
  for (const [date, name] of holidays) {
    await prisma.nonWorkingDay.create({
      data: { organizationId: org.id, date: d(date), type: 'holiday', name },
    })
  }

  // ── Absences ──────────────────────────────────────────────────
  await prisma.absence.createMany({
    data: [
      { userId: exec1.id, organizationId: org.id, type: 'vacation', startDate: d('2026-07-14'), endDate: d('2026-07-24'), notes: 'Ежегодный отпуск', createdBy: admin.id },
      { userId: exec2.id, organizationId: org.id, type: 'sick',     startDate: d('2026-06-09'), endDate: d('2026-06-13'), notes: 'Больничный лист', createdBy: admin.id },
      { userId: exec3.id, organizationId: org.id, type: 'vacation', startDate: d('2026-08-03'), endDate: d('2026-08-14'), notes: 'Ежегодный отпуск', createdBy: admin.id },
      { userId: exec4.id, organizationId: org.id, type: 'vacation', startDate: d('2026-09-01'), endDate: d('2026-09-12'), createdBy: admin.id },
    ],
  })

  // ── Clients ───────────────────────────────────────────────────
  console.log('🏗   Создаю клиентов...')
  const technostroy  = await prisma.client.create({ data: { organizationId: org.id, name: 'ООО "ТехноСтрой"',        contactInfo: '+7 495 123-45-67 | pm@technostroy.ru',      notes: 'Крупный строительный застройщик. Ключевой клиент с 2024 г.' } })
  const energomash   = await prisma.client.create({ data: { organizationId: org.id, name: 'АО "ЭнергоМаш"',          contactInfo: '+7 812 987-65-43 | projects@energomash.ru', notes: 'Производство энергооборудования.' } })
  const infraplus    = await prisma.client.create({ data: { organizationId: org.id, name: 'ГК "Инфраструктура+"',     contactInfo: '+7 495 555-11-22 | ceo@infra-plus.ru' } })
  const digitaltech  = await prisma.client.create({ data: { organizationId: org.id, name: 'ООО "ДиджиталТех"',        contactInfo: '+7 499 222-33-44 | dev@digitaltech.ru',     notes: 'Разработка корпоративного ПО.' } })

  // ── Project statuses ─────────────────────────────────────────
  console.log('📊  Создаю статусы проектов...')
  const sInit  = await prisma.projectStatus.create({ data: { organizationId: org.id, name: 'Инициация',   color: '#3B82F6', sortOrder: 1 } })
  const sPlan  = await prisma.projectStatus.create({ data: { organizationId: org.id, name: 'Планирование', color: '#F59E0B', sortOrder: 2 } })
  const sExec  = await prisma.projectStatus.create({ data: { organizationId: org.id, name: 'Исполнение',   color: '#10B981', sortOrder: 3 } })
  const sClose = await prisma.projectStatus.create({ data: { organizationId: org.id, name: 'Завершение',   color: '#8B5CF6', sortOrder: 4 } })
  const sArch  = await prisma.projectStatus.create({ data: { organizationId: org.id, name: 'Архив',        color: '#6B7280', sortOrder: 5 } })

  // ══════════════════════════════════════════════════════════════
  // PROJECT 1 — Автоматизация системы закупок
  // ══════════════════════════════════════════════════════════════
  console.log('📁  Проект 1: Автоматизация системы закупок...')
  const p1 = await createProject({
    orgId: org.id, clientId: technostroy.id, statusId: sExec.id,
    ownerId: pm1.id, creatorId: admin.id,
    name: 'Автоматизация системы закупок',
    description: 'Разработка и внедрение АС управления закупками для ООО "ТехноСтрой". Охватывает полный цикл: от потребности до оплаты поставщику.',
    startDate: d('2026-01-15'), endDate: d('2026-07-31'),
    budget: 3500000, priority: 10,
  })
  const c1 = await cols(p1.id)
  await prisma.projectMember.createMany({ data: [
    { projectId: p1.id, userId: pm1.id,     role: 'owner' },
    { projectId: p1.id, userId: padmin1.id, role: 'admin' },
    { projectId: p1.id, userId: exec1.id,   role: 'member' },
    { projectId: p1.id, userId: exec2.id,   role: 'member' },
    { projectId: p1.id, userId: obs1.id,    role: 'member' },
  ]})

  // Phase 1 — Аналитика (done)
  const p1ph1 = await prisma.task.create({ data: {
    projectId: p1.id, boardColumnId: c1.done.id, createdBy: pm1.id,
    title: 'Аналитика и проектирование', taskType: 'milestone',
    status: 'done', priority: 'high',
    startDate: d('2026-01-15'), dueDate: d('2026-02-15'), sortOrder: 0,
  }})
  const p1_req = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph1.id, boardColumnId: c1.done.id,
    assigneeId: exec2.id, createdBy: pm1.id,
    title: 'Сбор и анализ требований', status: 'done', priority: 'high',
    startDate: d('2026-01-15'), dueDate: d('2026-01-31'), effortHours: 40, sortOrder: 0,
  }})
  const p1_proc = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph1.id, boardColumnId: c1.done.id,
    assigneeId: exec2.id, createdBy: pm1.id,
    title: 'Описание бизнес-процессов "как есть"', status: 'done', priority: 'medium',
    startDate: d('2026-01-20'), dueDate: d('2026-02-05'), effortHours: 32, sortOrder: 1,
  }})
  const p1_tz = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph1.id, boardColumnId: c1.done.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Техническое задание на разработку', status: 'done', priority: 'critical',
    startDate: d('2026-02-01'), dueDate: d('2026-02-15'), effortHours: 24, sortOrder: 2,
  }})

  // Phase 2 — Разработка (in_progress)
  const p1ph2 = await prisma.task.create({ data: {
    projectId: p1.id, boardColumnId: c1.prog.id, createdBy: pm1.id,
    title: 'Разработка системы', taskType: 'milestone',
    status: 'in_progress', priority: 'high',
    startDate: d('2026-02-16'), dueDate: d('2026-06-30'), sortOrder: 10,
  }})
  const p1_arch = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph2.id, boardColumnId: c1.done.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Проектирование архитектуры', status: 'done', priority: 'critical',
    startDate: d('2026-02-16'), dueDate: d('2026-03-05'), effortHours: 48, percentComplete: 100, sortOrder: 0,
  }})
  const p1_cat = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph2.id, boardColumnId: c1.prog.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Модуль каталога товаров и услуг', status: 'in_progress', priority: 'high',
    startDate: d('2026-03-06'), dueDate: d('2026-04-30'), effortHours: 80, percentComplete: 65, sortOrder: 1,
  }})
  const p1_sup = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph2.id, boardColumnId: c1.prog.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Модуль управления поставщиками', status: 'in_progress', priority: 'high',
    startDate: d('2026-04-01'), dueDate: d('2026-05-20'), effortHours: 64, percentComplete: 30, sortOrder: 2,
  }})
  const p1_zayvka = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph2.id, boardColumnId: c1.todo.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Модуль заявок на закупку', status: 'todo', priority: 'high',
    startDate: d('2026-05-21'), dueDate: d('2026-06-20'), effortHours: 72, sortOrder: 3,
  }})
  const p1_agree = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph2.id, boardColumnId: c1.todo.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Модуль согласования и утверждения', status: 'todo', priority: 'medium',
    startDate: d('2026-06-01'), dueDate: d('2026-06-30'), effortHours: 56, sortOrder: 4,
  }})

  // Phase 3 — Тестирование
  const p1ph3 = await prisma.task.create({ data: {
    projectId: p1.id, boardColumnId: c1.todo.id, createdBy: pm1.id,
    title: 'Тестирование', taskType: 'milestone',
    status: 'todo', priority: 'high',
    startDate: d('2026-07-01'), dueDate: d('2026-07-18'), sortOrder: 20,
  }})
  const p1_tc = await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph3.id, boardColumnId: c1.todo.id,
    assigneeId: exec2.id, createdBy: pm1.id,
    title: 'Разработка тест-кейсов', status: 'todo', priority: 'medium',
    startDate: d('2026-07-01'), dueDate: d('2026-07-05'), effortHours: 24, sortOrder: 0,
  }})
  await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph3.id, boardColumnId: c1.todo.id,
    assigneeId: exec2.id, createdBy: pm1.id,
    title: 'Системное тестирование', status: 'todo', priority: 'high',
    startDate: d('2026-07-06'), dueDate: d('2026-07-18'), effortHours: 80, sortOrder: 1,
  }})

  // Phase 4 — Внедрение (billable)
  const p1ph4 = await prisma.task.create({ data: {
    projectId: p1.id, boardColumnId: c1.todo.id, createdBy: pm1.id,
    title: 'Внедрение и обучение', taskType: 'billable_stage',
    status: 'todo', priority: 'high',
    startDate: d('2026-07-21'), dueDate: d('2026-07-31'), amount: 500000, sortOrder: 30,
  }})
  await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph4.id, boardColumnId: c1.todo.id,
    assigneeId: exec1.id, createdBy: pm1.id,
    title: 'Настройка production-окружения', status: 'todo', priority: 'high',
    startDate: d('2026-07-21'), dueDate: d('2026-07-24'), effortHours: 16, sortOrder: 0,
  }})
  await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph4.id, boardColumnId: c1.todo.id,
    assigneeId: exec2.id, createdBy: pm1.id,
    title: 'Обучение пользователей (5 чел.)', status: 'todo', priority: 'medium',
    startDate: d('2026-07-25'), dueDate: d('2026-07-29'), effortHours: 32, sortOrder: 1,
  }})
  await prisma.task.create({ data: {
    projectId: p1.id, parentId: p1ph4.id, boardColumnId: c1.todo.id,
    createdBy: pm1.id,
    title: 'Ввод системы в эксплуатацию', taskType: 'milestone',
    status: 'todo', priority: 'critical',
    startDate: d('2026-07-31'), dueDate: d('2026-07-31'), sortOrder: 2,
  }})

  // Dependencies p1
  await prisma.taskDependency.createMany({ data: [
    { taskId: p1ph2.id,     predecessorId: p1ph1.id,  type: 'FS' },
    { taskId: p1_arch.id,   predecessorId: p1_tz.id,  type: 'FS' },
    { taskId: p1_cat.id,    predecessorId: p1_arch.id, type: 'FS' },
    { taskId: p1_sup.id,    predecessorId: p1_arch.id, type: 'FS' },
    { taskId: p1_zayvka.id, predecessorId: p1_cat.id, type: 'FS' },
    { taskId: p1_agree.id,  predecessorId: p1_zayvka.id, type: 'FS' },
    { taskId: p1ph3.id,     predecessorId: p1ph2.id,  type: 'FS' },
    { taskId: p1ph4.id,     predecessorId: p1ph3.id,  type: 'FS' },
  ]})

  // Time entries p1
  await prisma.timeEntry.createMany({ data: [
    { taskId: p1_req.id,  userId: exec2.id, date: d('2026-01-20'), hours: 8, note: 'Интервью с отделом закупок' },
    { taskId: p1_req.id,  userId: exec2.id, date: d('2026-01-21'), hours: 8 },
    { taskId: p1_req.id,  userId: exec2.id, date: d('2026-01-22'), hours: 6 },
    { taskId: p1_proc.id, userId: exec2.id, date: d('2026-01-26'), hours: 8 },
    { taskId: p1_proc.id, userId: exec2.id, date: d('2026-01-27'), hours: 7 },
    { taskId: p1_tz.id,   userId: exec1.id, date: d('2026-02-02'), hours: 8 },
    { taskId: p1_tz.id,   userId: exec1.id, date: d('2026-02-03'), hours: 8 },
    { taskId: p1_arch.id, userId: exec1.id, date: d('2026-02-17'), hours: 8 },
    { taskId: p1_arch.id, userId: exec1.id, date: d('2026-02-18'), hours: 8 },
    { taskId: p1_arch.id, userId: exec1.id, date: d('2026-02-19'), hours: 8 },
    { taskId: p1_cat.id,  userId: exec1.id, date: d('2026-03-10'), hours: 8 },
    { taskId: p1_cat.id,  userId: exec1.id, date: d('2026-03-11'), hours: 8 },
    { taskId: p1_cat.id,  userId: exec1.id, date: d('2026-06-16'), hours: 8 },
    { taskId: p1_cat.id,  userId: exec1.id, date: d('2026-06-17'), hours: 6 },
    { taskId: p1_sup.id,  userId: exec1.id, date: d('2026-06-18'), hours: 8 },
    { taskId: p1_sup.id,  userId: exec1.id, date: d('2026-06-19'), hours: 8 },
    { taskId: p1_sup.id,  userId: exec1.id, date: d('2026-06-20'), hours: 5 },
  ]})

  // Comments p1
  await prisma.comment.createMany({ data: [
    { taskId: p1_cat.id, userId: pm1.id,     text: 'Важно согласовать структуру каталога с заказчиком до конца спринта. Встреча назначена на 20 июня в 14:00.' },
    { taskId: p1_cat.id, userId: exec1.id,   text: 'Структура согласована. Приступаю к реализации фильтров и поиска.' },
    { taskId: p1_sup.id, userId: padmin1.id, text: 'Заказчик запросил интеграцию с реестром поставщиков ФНС. Добавили в scope, оценка +40ч.' },
    { taskId: p1_req.id, userId: exec2.id,   text: 'Проведено 12 интервью с сотрудниками отдела закупок. Требования задокументированы в Confluence.' },
    { taskId: p1_tz.id,  userId: pm1.id,     text: 'ТЗ согласовано со стороны заказчика. Подпись договора 15.02.' },
  ]})

  // ══════════════════════════════════════════════════════════════
  // PROJECT 2 — Реконструкция котельной цеха №3
  // ══════════════════════════════════════════════════════════════
  console.log('📁  Проект 2: Реконструкция котельной...')
  const p2 = await createProject({
    orgId: org.id, clientId: energomash.id, statusId: sPlan.id,
    ownerId: pm2.id, creatorId: admin.id,
    name: 'Реконструкция котельной цеха №3',
    description: 'Полная реконструкция котельного оборудования пр. цеха. Замена 3 котлов ДКВР-20 на КСАВ-1000 с автоматизацией.',
    startDate: d('2026-03-01'), endDate: d('2026-12-31'),
    budget: 15000000, priority: 8,
  })
  const c2 = await cols(p2.id)
  await prisma.projectMember.createMany({ data: [
    { projectId: p2.id, userId: pm2.id,   role: 'owner' },
    { projectId: p2.id, userId: dept2.id, role: 'admin' },
    { projectId: p2.id, userId: exec3.id, role: 'member' },
    { projectId: p2.id, userId: exec4.id, role: 'member' },
    { projectId: p2.id, userId: obs1.id,  role: 'member' },
  ]})

  // Phase 1 — Проектирование
  const p2ph1 = await prisma.task.create({ data: {
    projectId: p2.id, boardColumnId: c2.prog.id, createdBy: pm2.id,
    title: 'Этап 1: Проектирование', taskType: 'milestone',
    status: 'in_progress', priority: 'high',
    startDate: d('2026-03-01'), dueDate: d('2026-05-31'), sortOrder: 0,
  }})
  const p2_surv = await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph1.id, boardColumnId: c2.done.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Обследование объекта', status: 'done', priority: 'high',
    startDate: d('2026-03-01'), dueDate: d('2026-03-15'), effortHours: 40, sortOrder: 0,
  }})
  const p2_proj = await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph1.id, boardColumnId: c2.prog.id,
    assigneeId: exec4.id, createdBy: pm2.id,
    title: 'Разработка проектной документации', status: 'in_progress', priority: 'critical',
    startDate: d('2026-03-16'), dueDate: d('2026-05-15'), effortHours: 160, sortOrder: 1,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph1.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Согласование с Ростехнадзором', status: 'todo', priority: 'high',
    startDate: d('2026-05-16'), dueDate: d('2026-05-31'), effortHours: 80, sortOrder: 2,
  }})

  // Phase 2 — Закупки
  const p2ph2 = await prisma.task.create({ data: {
    projectId: p2.id, boardColumnId: c2.todo.id, createdBy: pm2.id,
    title: 'Этап 2: Поставка оборудования', taskType: 'billable_stage',
    status: 'todo', priority: 'high',
    startDate: d('2026-06-01'), dueDate: d('2026-08-31'), amount: 9000000, sortOrder: 10,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph2.id, boardColumnId: c2.todo.id,
    assigneeId: padmin1.id, createdBy: pm2.id,
    title: 'Тендер на поставку оборудования', status: 'todo', priority: 'high',
    startDate: d('2026-06-01'), dueDate: d('2026-06-30'), effortHours: 48, sortOrder: 0,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph2.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Котлы КСАВ-1000 (3 ед.) — приёмка', status: 'todo', priority: 'medium',
    startDate: d('2026-07-15'), dueDate: d('2026-07-31'), effortHours: 16, sortOrder: 1,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph2.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Насосные агрегаты и арматура — приёмка', status: 'todo', priority: 'medium',
    startDate: d('2026-08-01'), dueDate: d('2026-08-15'), effortHours: 16, sortOrder: 2,
  }})

  // Phase 3 — СМР
  const p2ph3 = await prisma.task.create({ data: {
    projectId: p2.id, boardColumnId: c2.todo.id, createdBy: pm2.id,
    title: 'Этап 3: Строительно-монтажные работы', taskType: 'billable_stage',
    status: 'todo', priority: 'high',
    startDate: d('2026-09-01'), dueDate: d('2026-11-30'), amount: 4500000, sortOrder: 20,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph3.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Демонтаж старого оборудования', status: 'todo', priority: 'high',
    startDate: d('2026-09-01'), dueDate: d('2026-09-20'), effortHours: 80, sortOrder: 0,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph3.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Монтаж фундаментов под котлы', status: 'todo', priority: 'high',
    startDate: d('2026-09-21'), dueDate: d('2026-10-15'), effortHours: 120, sortOrder: 1,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph3.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Установка и обвязка котлов', status: 'todo', priority: 'high',
    startDate: d('2026-10-16'), dueDate: d('2026-11-30'), effortHours: 200, sortOrder: 2,
  }})

  // Phase 4 — ПНР
  const p2ph4 = await prisma.task.create({ data: {
    projectId: p2.id, boardColumnId: c2.todo.id, createdBy: pm2.id,
    title: 'Этап 4: Пусконаладочные работы', taskType: 'billable_stage',
    status: 'todo', priority: 'high',
    startDate: d('2026-12-01'), dueDate: d('2026-12-20'), amount: 1500000, sortOrder: 30,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph4.id, boardColumnId: c2.todo.id,
    assigneeId: exec3.id, createdBy: pm2.id,
    title: 'Гидравлические испытания', status: 'todo', priority: 'high',
    startDate: d('2026-12-01'), dueDate: d('2026-12-10'), effortHours: 40, sortOrder: 0,
  }})
  await prisma.task.create({ data: {
    projectId: p2.id, parentId: p2ph4.id, boardColumnId: c2.todo.id,
    createdBy: pm2.id,
    title: 'Сдача объекта заказчику', taskType: 'milestone',
    status: 'todo', priority: 'critical',
    startDate: d('2026-12-22'), dueDate: d('2026-12-22'), sortOrder: 1,
  }})

  // Dependencies p2
  await prisma.taskDependency.createMany({ data: [
    { taskId: p2_proj.id, predecessorId: p2_surv.id, type: 'FS' },
    { taskId: p2ph2.id,   predecessorId: p2ph1.id,   type: 'FS' },
    { taskId: p2ph3.id,   predecessorId: p2ph2.id,   type: 'FS' },
    { taskId: p2ph4.id,   predecessorId: p2ph3.id,   type: 'FS' },
  ]})

  // Time entries p2
  await prisma.timeEntry.createMany({ data: [
    { taskId: p2_surv.id,  userId: exec3.id, date: d('2026-03-03'), hours: 8, note: 'Осмотр котельного оборудования' },
    { taskId: p2_surv.id,  userId: exec3.id, date: d('2026-03-04'), hours: 8 },
    { taskId: p2_surv.id,  userId: exec3.id, date: d('2026-03-05'), hours: 6 },
    { taskId: p2_proj.id,  userId: exec4.id, date: d('2026-03-18'), hours: 8 },
    { taskId: p2_proj.id,  userId: exec4.id, date: d('2026-03-19'), hours: 8 },
    { taskId: p2_proj.id,  userId: exec4.id, date: d('2026-06-16'), hours: 8 },
    { taskId: p2_proj.id,  userId: exec4.id, date: d('2026-06-17'), hours: 8 },
    { taskId: p2_proj.id,  userId: exec4.id, date: d('2026-06-18'), hours: 7 },
  ]})

  // Comments p2
  await prisma.comment.createMany({ data: [
    { taskId: p2_proj.id, userId: pm2.id,   text: 'Ростехнадзор запросил дополнительные расчёты по взрывобезопасности. Срок +2 недели.' },
    { taskId: p2_proj.id, userId: dept2.id, text: 'Расчёты выполнены внешней экспертной организацией. Готовы к согласованию.' },
    { taskId: p2_surv.id, userId: exec3.id, text: 'Обследование завершено. Котлы ДКВР-20 физически изношены на 80%. Подтверждаем необходимость замены.' },
  ]})

  // ══════════════════════════════════════════════════════════════
  // PROJECT 3 — Разработка CRM-модуля
  // ══════════════════════════════════════════════════════════════
  console.log('📁  Проект 3: Разработка CRM-модуля...')
  const p3 = await createProject({
    orgId: org.id, clientId: digitaltech.id, statusId: sExec.id,
    ownerId: padmin1.id, creatorId: admin.id,
    name: 'Разработка CRM-модуля',
    description: 'Разработка модуля CRM для корпоративной ERP-системы. Управление клиентами, сделками, воронкой продаж.',
    startDate: d('2026-02-01'), endDate: d('2026-05-31'),
    budget: 1200000, priority: 7,
  })
  const c3 = await cols(p3.id)
  await prisma.projectMember.createMany({ data: [
    { projectId: p3.id, userId: padmin1.id, role: 'owner' },
    { projectId: p3.id, userId: dept1.id,   role: 'admin' },
    { projectId: p3.id, userId: exec1.id,   role: 'member' },
    { projectId: p3.id, userId: exec2.id,   role: 'member' },
  ]})

  const p3_db = await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.done.id, assigneeId: exec1.id, createdBy: padmin1.id,
    title: 'Проектирование схемы БД', status: 'done', priority: 'high',
    startDate: d('2026-02-01'), dueDate: d('2026-02-10'), effortHours: 24, sortOrder: 0,
  }})
  const p3_ux = await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.done.id, assigneeId: exec2.id, createdBy: padmin1.id,
    title: 'UI/UX-макеты (Figma)', status: 'done', priority: 'high',
    startDate: d('2026-02-05'), dueDate: d('2026-02-25'), effortHours: 32, sortOrder: 1,
  }})
  const p3_api = await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.prog.id, assigneeId: exec1.id, createdBy: padmin1.id,
    title: 'Бэкенд API (REST)', status: 'in_progress', priority: 'high',
    startDate: d('2026-02-26'), dueDate: d('2026-04-15'), effortHours: 80, sortOrder: 2,
  }})
  const p3_ui = await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.prog.id, assigneeId: exec2.id, createdBy: padmin1.id,
    title: 'Фронтенд-компоненты (React)', status: 'in_progress', priority: 'high',
    startDate: d('2026-03-15'), dueDate: d('2026-04-30'), effortHours: 60, sortOrder: 3,
  }})
  const p3_1c = await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.todo.id, assigneeId: exec1.id, createdBy: padmin1.id,
    title: 'Интеграция с 1С:Предприятие', status: 'todo', priority: 'medium',
    startDate: d('2026-04-16'), dueDate: d('2026-05-10'), effortHours: 48, sortOrder: 4,
  }})
  await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.todo.id, assigneeId: exec2.id, createdBy: padmin1.id,
    title: 'Тестирование (QA)', status: 'todo', priority: 'high',
    startDate: d('2026-05-11'), dueDate: d('2026-05-24'), effortHours: 40, sortOrder: 5,
  }})
  await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.todo.id, assigneeId: exec1.id, createdBy: padmin1.id,
    title: 'Деплой на production', status: 'todo', priority: 'medium',
    startDate: d('2026-05-25'), dueDate: d('2026-05-31'), effortHours: 16, sortOrder: 6,
  }})
  await prisma.task.create({ data: {
    projectId: p3.id, boardColumnId: c3.todo.id, createdBy: padmin1.id,
    title: 'Сдача проекта заказчику', taskType: 'milestone',
    status: 'todo', priority: 'critical',
    startDate: d('2026-05-31'), dueDate: d('2026-05-31'), sortOrder: 7,
  }})

  await prisma.taskDependency.createMany({ data: [
    { taskId: p3_api.id, predecessorId: p3_db.id, type: 'FS' },
    { taskId: p3_ui.id,  predecessorId: p3_ux.id, type: 'FS' },
    { taskId: p3_1c.id,  predecessorId: p3_api.id, type: 'FS' },
  ]})

  await prisma.timeEntry.createMany({ data: [
    { taskId: p3_db.id,  userId: exec1.id, date: d('2026-02-03'), hours: 8 },
    { taskId: p3_db.id,  userId: exec1.id, date: d('2026-02-04'), hours: 8 },
    { taskId: p3_ux.id,  userId: exec2.id, date: d('2026-02-10'), hours: 8 },
    { taskId: p3_ux.id,  userId: exec2.id, date: d('2026-02-11'), hours: 8 },
    { taskId: p3_api.id, userId: exec1.id, date: d('2026-03-02'), hours: 8 },
    { taskId: p3_api.id, userId: exec1.id, date: d('2026-06-16'), hours: 8 },
    { taskId: p3_ui.id,  userId: exec2.id, date: d('2026-06-17'), hours: 8 },
    { taskId: p3_ui.id,  userId: exec2.id, date: d('2026-06-18'), hours: 6 },
  ]})

  await prisma.comment.createMany({ data: [
    { taskId: p3_api.id, userId: padmin1.id, text: 'Заказчик добавил требование: поддержка webhooks для уведомлений. Оценка +8ч, согласовано.' },
    { taskId: p3_ui.id,  userId: exec2.id,   text: 'Перешла на новую дизайн-систему по запросу заказчика. Макеты обновлены.' },
  ]})

  // ══════════════════════════════════════════════════════════════
  // PROJECT 4 — Строительство склада (ЗАВЕРШЁН / АРХИВ)
  // ══════════════════════════════════════════════════════════════
  console.log('📁  Проект 4: Строительство склада (архив)...')
  const p4 = await createProject({
    orgId: org.id, clientId: infraplus.id, statusId: sArch.id,
    ownerId: pm1.id, creatorId: admin.id,
    name: 'Строительство склада логистического центра',
    description: 'Строительство склада площадью 2400 м² с холодным и тёплым отсеком. Проект завершён в срок.',
    startDate: d('2025-06-01'), endDate: d('2025-12-31'),
    budget: 8500000, priority: 1, isArchived: true,
  })
  const c4 = await cols(p4.id)
  await prisma.projectMember.createMany({ data: [
    { projectId: p4.id, userId: pm1.id,   role: 'owner' },
    { projectId: p4.id, userId: exec3.id, role: 'member' },
    { projectId: p4.id, userId: exec4.id, role: 'member' },
  ]})

  const doneTask = (title: string, assigneeId: string, startDate: string, dueDate: string, effortHours: number, sortOrder: number) =>
    prisma.task.create({ data: {
      projectId: p4.id, boardColumnId: c4.done.id,
      assigneeId, createdBy: pm1.id,
      title, status: 'done', priority: 'medium',
      startDate: d(startDate), dueDate: d(dueDate),
      effortHours, sortOrder,
    }})

  await doneTask('Разработка проектной документации',   exec4.id, '2025-06-01', '2025-07-15', 120, 0)
  await doneTask('Согласование и получение разрешений', exec3.id, '2025-07-16', '2025-08-15', 48,  1)
  await doneTask('Земляные работы и фундамент',         exec3.id, '2025-08-16', '2025-09-30', 200, 2)
  await doneTask('Каркас и кровля',                     exec3.id, '2025-10-01', '2025-11-15', 240, 3)
  await doneTask('Внутренняя отделка и коммуникации',   exec4.id, '2025-11-01', '2025-12-10', 160, 4)
  await doneTask('Сдача объекта',                       exec3.id, '2025-12-15', '2025-12-31', 24,  5)

  // ══════════════════════════════════════════════════════════════
  // PROJECT 5 — Модернизация ИТ-инфраструктуры (внутренний)
  // ══════════════════════════════════════════════════════════════
  console.log('📁  Проект 5: Модернизация ИТ-инфраструктуры...')
  const p5 = await createProject({
    orgId: org.id, clientId: undefined, statusId: sExec.id,
    ownerId: dept1.id, creatorId: dept1.id,
    name: 'Модернизация серверной инфраструктуры',
    description: 'Внутренний проект: замена серверов, переход на виртуализацию (VMware), настройка резервного копирования.',
    startDate: d('2026-04-01'), endDate: d('2026-08-31'),
    budget: 600000, priority: 6,
  })
  const c5 = await cols(p5.id)
  await prisma.projectMember.createMany({ data: [
    { projectId: p5.id, userId: dept1.id, role: 'owner' },
    { projectId: p5.id, userId: exec1.id, role: 'member' },
    { projectId: p5.id, userId: admin.id, role: 'admin' },
  ]})

  const p5_audit = await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.done.id, assigneeId: exec1.id, createdBy: dept1.id,
    title: 'Аудит текущей инфраструктуры', status: 'done', priority: 'high',
    startDate: d('2026-04-01'), dueDate: d('2026-04-15'), effortHours: 32, sortOrder: 0,
  }})
  const p5_plan = await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.done.id, assigneeId: dept1.id, createdBy: dept1.id,
    title: 'План миграции и закупочная спецификация', status: 'done', priority: 'high',
    startDate: d('2026-04-16'), dueDate: d('2026-04-30'), effortHours: 24, sortOrder: 1,
  }})
  const p5_buy = await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.prog.id, assigneeId: exec1.id, createdBy: dept1.id,
    title: 'Закупка и поставка серверов (3 ед.)', status: 'in_progress', priority: 'high',
    startDate: d('2026-05-01'), dueDate: d('2026-06-15'), effortHours: 16, sortOrder: 2,
  }})
  const p5_vm = await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.todo.id, assigneeId: exec1.id, createdBy: dept1.id,
    title: 'Развёртывание VMware vSphere', status: 'todo', priority: 'high',
    startDate: d('2026-06-16'), dueDate: d('2026-07-15'), effortHours: 48, sortOrder: 3,
  }})
  await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.todo.id, assigneeId: exec1.id, createdBy: dept1.id,
    title: 'Миграция виртуальных машин', status: 'todo', priority: 'medium',
    startDate: d('2026-07-16'), dueDate: d('2026-08-10'), effortHours: 64, sortOrder: 4,
  }})
  await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.todo.id, assigneeId: exec1.id, createdBy: dept1.id,
    title: 'Настройка резервного копирования (Veeam)', status: 'todo', priority: 'high',
    startDate: d('2026-08-11'), dueDate: d('2026-08-25'), effortHours: 24, sortOrder: 5,
  }})
  await prisma.task.create({ data: {
    projectId: p5.id, boardColumnId: c5.todo.id, createdBy: dept1.id,
    title: 'Приёмо-сдаточное тестирование', taskType: 'milestone',
    status: 'todo', priority: 'high',
    startDate: d('2026-08-31'), dueDate: d('2026-08-31'), sortOrder: 6,
  }})

  await prisma.taskDependency.createMany({ data: [
    { taskId: p5_plan.id, predecessorId: p5_audit.id, type: 'FS' },
    { taskId: p5_buy.id,  predecessorId: p5_plan.id,  type: 'FS' },
    { taskId: p5_vm.id,   predecessorId: p5_buy.id,   type: 'FS' },
  ]})

  await prisma.timeEntry.createMany({ data: [
    { taskId: p5_audit.id, userId: exec1.id, date: d('2026-04-02'), hours: 8 },
    { taskId: p5_audit.id, userId: exec1.id, date: d('2026-04-03'), hours: 8 },
    { taskId: p5_plan.id,  userId: dept1.id, date: d('2026-04-17'), hours: 6 },
    { taskId: p5_buy.id,   userId: exec1.id, date: d('2026-05-05'), hours: 4 },
  ]})

  // ── Summary ──────────────────────────────────────────────────
  const counts = {
    users:    await prisma.user.count({ where: { organizationId: org.id } }),
    projects: await prisma.project.count({ where: { organizationId: org.id } }),
    tasks:    await prisma.task.count({ where: { project: { organizationId: org.id } } }),
    entries:  await prisma.timeEntry.count({ where: { task: { project: { organizationId: org.id } } } }),
    comments: await prisma.comment.count({ where: { task: { project: { organizationId: org.id } } } }),
  }

  console.log('')
  console.log('✅  Демо-данные успешно загружены!')
  console.log(`    Организация : ${org.name}`)
  console.log(`    Пользователи: ${counts.users}`)
  console.log(`    Проекты     : ${counts.projects}`)
  console.log(`    Задачи      : ${counts.tasks}`)
  console.log(`    Трудозатраты: ${counts.entries}`)
  console.log(`    Комментарии : ${counts.comments}`)
  console.log('')
  console.log('🔑  Логин  : admin@pmgroup.ru')
  console.log('🔑  Пароль : Demo1234!')
  console.log('    (все пользователи имеют тот же пароль)')
  console.log('')
  console.log('👤  Учётные записи:')
  console.log('    admin@pmgroup.ru    — Администратор')
  console.log('    petrov@pmgroup.ru   — Рук. проектов (Петрова М.)')
  console.log('    sidorov@pmgroup.ru  — Рук. проектов (Сидоров И.)')
  console.log('    zaharov@pmgroup.ru  — Рук. подразделения ИТ')
  console.log('    morozov@pmgroup.ru  — Рук. подразделения Стр-во')
  console.log('    kozlov@pmgroup.ru   — Администратор проекта')
  console.log('    novikov@pmgroup.ru  — Исполнитель (разработчик)')
  console.log('    belova@pmgroup.ru   — Исполнитель (аналитик)')
  console.log('    lebedev@pmgroup.ru  — Исполнитель (инженер)')
  console.log('    smirnov@pmgroup.ru  — Исполнитель (проектировщик)')
  console.log('    popov@pmgroup.ru    — Наблюдатель')
}

main()
  .catch(e => { console.error('❌  Ошибка:', e); process.exit(1) })
  .finally(() => prisma.$disconnect())
