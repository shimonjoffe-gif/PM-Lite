import { PrismaClient } from '@prisma/client'
import https from 'https'

// ── Calendar helpers ──────────────────────────────────────────────────────────

export interface WorkConfig {
  hoursPerDay: number
  hoursPerDayMap?: Record<number, number> | null // per-weekday override: {1:8.5, 5:6}
  workDays: number[]        // 1=Mon … 7=Sun; empty for shift schedule
  nonWorkingDates: Set<string> // 'YYYY-MM-DD'
  extraWorkDates: Set<string>  // 'YYYY-MM-DD' (normally off but work day)
  // shift schedule support
  cycleDays?: number        // total cycle length (e.g. 4 for 2/2)
  workDaysInCycle?: number  // work days per cycle (e.g. 2 for 2/2)
  cycleStartDate?: string   // 'YYYY-MM-DD' origin for rotation
}

/** Hours for a specific date, respecting per-day overrides */
export function getHoursForDate(date: Date, config: WorkConfig): number {
  if (config.hoursPerDayMap) {
    const dow = date.getDay() === 0 ? 7 : date.getDay()
    const override = config.hoursPerDayMap[dow]
    if (override != null) return override
  }
  return config.hoursPerDay
}

export async function getOrgWorkConfig(prisma: PrismaClient, orgId: string): Promise<WorkConfig> {
  const [schedule, nonWorkingDays] = await Promise.all([
    prisma.workSchedule.findUnique({ where: { organizationId: orgId } }),
    prisma.nonWorkingDay.findMany({ where: { organizationId: orgId } }),
  ])

  const workDays = schedule ? (schedule.workDays as number[]) : [1, 2, 3, 4, 5]
  const hoursPerDay = schedule ? Number(schedule.hoursPerDay) : 8

  const nonWorkingDates = new Set<string>()
  const extraWorkDates = new Set<string>()
  nonWorkingDays.forEach(d => {
    const key = d.date.toISOString().slice(0, 10)
    if (d.type === 'holiday') nonWorkingDates.add(key)
    else extraWorkDates.add(key)
  })

  return { hoursPerDay, workDays, nonWorkingDates, extraWorkDates }
}

export async function getUserWorkConfig(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
): Promise<WorkConfig> {
  const [userSchedule, base] = await Promise.all([
    prisma.userWorkSchedule.findUnique({ where: { userId }, include: { preset: true } }),
    getOrgWorkConfig(prisma, orgId),
  ])
  if (!userSchedule) return base

  const preset = userSchedule.preset
  const cycleDays = preset?.cycleDays ?? undefined
  const workDaysInCycle = preset?.workDaysInCycle ?? undefined
  const cycleStartDate = userSchedule.cycleStartDate
    ? userSchedule.cycleStartDate.toISOString().slice(0, 10)
    : undefined

  const rawMap = userSchedule.hoursPerDayMap
  const hoursPerDayMap = rawMap && !cycleDays
    ? Object.fromEntries(
        Object.entries(rawMap as Record<string, number>).map(([k, v]) => [Number(k), v])
      )
    : null

  return {
    ...base,
    hoursPerDay: Number(userSchedule.hoursPerDay),
    hoursPerDayMap,
    workDays: cycleDays ? [] : (userSchedule.workDays as number[]),
    cycleDays,
    workDaysInCycle,
    cycleStartDate,
  }
}

export function isWorkDay(date: Date, config: WorkConfig): boolean {
  const key = date.toISOString().slice(0, 10)
  if (config.nonWorkingDates.has(key)) return false
  if (config.extraWorkDates.has(key)) return true

  // Shift schedule (2/2 etc.) — rotation from cycleStartDate
  if (config.cycleDays && config.workDaysInCycle && config.cycleStartDate) {
    const origin = new Date(config.cycleStartDate)
    const diffMs = date.getTime() - origin.getTime()
    const diffDays = Math.floor(diffMs / 86_400_000)
    const posInCycle = ((diffDays % config.cycleDays) + config.cycleDays) % config.cycleDays
    return posInCycle < config.workDaysInCycle
  }

  // Weekly schedule
  // JS: 0=Sun,1=Mon…6=Sat → convert to 1=Mon…7=Sun
  const dow = date.getDay() === 0 ? 7 : date.getDay()
  return config.workDays.includes(dow)
}

/** Add workingDays business days to date, respecting calendar */
export function addWorkDays(date: Date, days: number, config: WorkConfig): Date {
  const d = new Date(date)
  let remaining = Math.abs(days)
  const step = days >= 0 ? 1 : -1
  while (remaining > 0) {
    d.setDate(d.getDate() + step)
    if (isWorkDay(d, config)) remaining--
  }
  return d
}

/** Count working days between two dates (inclusive start, exclusive end) */
export function countWorkDays(start: Date, end: Date, config: WorkConfig): number {
  let count = 0
  const d = new Date(start)
  while (d < end) {
    if (isWorkDay(d, config)) count++
    d.setDate(d.getDate() + 1)
  }
  return count
}

// ── Non-working days CRUD ─────────────────────────────────────────────────────

export async function getNonWorkingDays(prisma: PrismaClient, orgId: string, year?: number) {
  const where: any = { organizationId: orgId }
  if (year) {
    where.date = {
      gte: new Date(`${year}-01-01`),
      lte: new Date(`${year}-12-31`),
    }
  }
  const rows = await prisma.nonWorkingDay.findMany({ where, orderBy: { date: 'asc' } })
  return rows.map(r => ({
    id: r.id,
    date: r.date.toISOString().slice(0, 10),
    type: r.type,
    name: r.name ?? null,
  }))
}

export async function upsertNonWorkingDay(
  prisma: PrismaClient,
  orgId: string,
  data: { date: string; type: 'holiday' | 'extra_workday'; name?: string },
) {
  const date = new Date(data.date)
  return prisma.nonWorkingDay.upsert({
    where: { organizationId_date: { organizationId: orgId, date } },
    create: { organizationId: orgId, date, type: data.type, name: data.name ?? null },
    update: { type: data.type, name: data.name ?? null },
  })
}

export async function deleteNonWorkingDay(prisma: PrismaClient, dayId: string) {
  await prisma.nonWorkingDay.delete({ where: { id: dayId } })
}

// Fetch year's working-day data from isdayoff.ru
// Returns string of length 365/366: '0'=рабочий, '1'=выходной/праздник, '2'=сокращённый
function fetchIsdayoff(year: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = `https://isdayoff.ru/api/getdata?year=${year}&cc=ru&pre=1&covid=0`
    https.get(url, res => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => resolve(data.trim()))
      res.on('error', reject)
    }).on('error', reject)
  })
}

export async function importCountryCalendar(
  prisma: PrismaClient,
  orgId: string,
  country: string,
  year: number,
) {
  if (country.toUpperCase() !== 'RU') {
    return { imported: 0, message: `Пресет для ${country} недоступен, добавьте даты вручную` }
  }

  let dayStr: string
  try {
    dayStr = await fetchIsdayoff(year)
  } catch {
    return { imported: 0, message: 'Не удалось загрузить данные с isdayoff.ru. Проверьте подключение к интернету.' }
  }

  // Build list of non-working dates from the response string
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0
  const totalDays = isLeap ? 366 : 365
  if (dayStr.length < totalDays) {
    return { imported: 0, message: `Некорректный ответ от isdayoff.ru (длина ${dayStr.length})` }
  }

  let imported = 0
  const start = new Date(year, 0, 1)
  for (let i = 0; i < totalDays; i++) {
    const code = dayStr[i]
    if (code === '1' || code === '2') {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      const dateStr = d.toISOString().slice(0, 10)
      const name = code === '1' ? 'Нерабочий день (isdayoff.ru)' : 'Предпраздничный/сокращённый день'
      await upsertNonWorkingDay(prisma, orgId, { date: dateStr, type: 'holiday', name })
      imported++
    }
  }
  return { imported, message: `Загружено ${imported} нерабочих дней (${year}, РФ, источник: isdayoff.ru)` }
}

// ── Work Schedule CRUD ────────────────────────────────────────────────────────

export async function getOrgSchedule(prisma: PrismaClient, orgId: string) {
  const s = await prisma.workSchedule.findUnique({ where: { organizationId: orgId } })
  if (!s) return null
  return {
    scheduleType: s.scheduleType,
    hoursPerDay: Number(s.hoursPerDay),
    workDays: s.workDays as number[],
    shiftStart: s.shiftStart,
    shiftEnd: s.shiftEnd,
  }
}

export async function upsertOrgSchedule(
  prisma: PrismaClient,
  orgId: string,
  data: { scheduleType?: string; hoursPerDay?: number; workDays?: number[]; shiftStart?: string; shiftEnd?: string },
) {
  return prisma.workSchedule.upsert({
    where: { organizationId: orgId },
    create: { organizationId: orgId, ...data as any },
    update: data as any,
  })
}

export async function getUserSchedule(prisma: PrismaClient, userId: string) {
  const s = await prisma.userWorkSchedule.findUnique({ where: { userId } })
  if (!s) return null
  return {
    scheduleType: s.scheduleType,
    name: s.name ?? null,
    hoursPerDay: Number(s.hoursPerDay),
    hoursPerDayMap: (s.hoursPerDayMap as Record<string, number> | null) ?? null,
    workDays: s.workDays as number[],
    shiftStart: s.shiftStart,
    shiftEnd: s.shiftEnd,
  }
}

export async function upsertUserSchedule(
  prisma: PrismaClient,
  userId: string,
  data: { scheduleType?: string; hoursPerDay?: number; workDays?: number[]; shiftStart?: string; shiftEnd?: string },
) {
  return prisma.userWorkSchedule.upsert({
    where: { userId },
    create: { userId, ...data as any },
    update: data as any,
  })
}

export async function deleteUserSchedule(prisma: PrismaClient, userId: string) {
  await prisma.userWorkSchedule.deleteMany({ where: { userId } })
}

// ── Work Schedule Presets ─────────────────────────────────────────────────────

export async function getWorkSchedulePresets(prisma: PrismaClient, orgId: string) {
  const rows = await prisma.workSchedulePreset.findMany({
    where: { OR: [{ organizationId: null }, { organizationId: orgId }] },
    orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
  })
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    scheduleType: r.scheduleType,
    hoursPerDay: Number(r.hoursPerDay),
    hoursPerDayMap: (r.hoursPerDayMap as Record<string, number> | null) ?? null,
    workDays: r.workDays as number[],
    cycleDays: r.cycleDays ?? null,
    workDaysInCycle: r.workDaysInCycle ?? null,
    isSystem: r.isSystem,
    organizationId: r.organizationId ?? null,
  }))
}

export async function createWorkSchedulePreset(
  prisma: PrismaClient,
  orgId: string,
  data: {
    name: string
    scheduleType?: string
    hoursPerDay: number
    hoursPerDayMap?: Record<string, number> | null
    workDays: number[]
    cycleDays?: number | null
    workDaysInCycle?: number | null
  },
) {
  return prisma.workSchedulePreset.create({
    data: {
      organizationId: orgId,
      name: data.name,
      scheduleType: (data.scheduleType as any) ?? 'custom',
      hoursPerDay: data.hoursPerDay,
      hoursPerDayMap: data.cycleDays ? null : (data.hoursPerDayMap ?? null),
      workDays: data.workDays,
      cycleDays: data.cycleDays ?? null,
      workDaysInCycle: data.workDaysInCycle ?? null,
      isSystem: false,
    },
  })
}

export async function updateWorkSchedulePreset(
  prisma: PrismaClient,
  orgId: string,
  presetId: string,
  data: {
    name?: string
    hoursPerDay?: number
    hoursPerDayMap?: Record<string, number> | null
    workDays?: number[]
    cycleDays?: number | null
    workDaysInCycle?: number | null
  },
) {
  const preset = await prisma.workSchedulePreset.findFirst({
    where: { id: presetId, organizationId: orgId, isSystem: false },
  })
  if (!preset) throw new Error('Пресет не найден или является системным')
  return prisma.workSchedulePreset.update({ where: { id: presetId }, data: data as any })
}

export async function deleteWorkSchedulePreset(
  prisma: PrismaClient,
  orgId: string,
  presetId: string,
) {
  const preset = await prisma.workSchedulePreset.findFirst({
    where: { id: presetId, organizationId: orgId, isSystem: false },
  })
  if (!preset) throw new Error('Пресет не найден или является системным')
  await prisma.workSchedulePreset.delete({ where: { id: presetId } })
}

// ── Assign preset to user ─────────────────────────────────────────────────────

export async function assignPresetToUser(
  prisma: PrismaClient,
  userId: string,
  orgId: string,
  presetId: string | null,
  customData?: {
    hoursPerDay?: number
    hoursPerDayMap?: Record<string, number> | null
    workDays?: number[]
    cycleStartDate?: string | null
  },
) {
  let scheduleFields: Record<string, any> = {}

  if (presetId) {
    const preset = await prisma.workSchedulePreset.findFirst({
      where: { id: presetId, OR: [{ organizationId: null }, { organizationId: orgId }] },
    })
    if (!preset) throw new Error('Пресет не найден')
    scheduleFields = {
      presetId,
      scheduleType: preset.scheduleType,
      hoursPerDay: preset.hoursPerDay,
      hoursPerDayMap: (preset.hoursPerDayMap as any) ?? null,
      workDays: preset.workDays,
      cycleStartDate: customData?.cycleStartDate ? new Date(customData.cycleStartDate) : null,
    }
    // Auto-sync dailyCapacityHours on user record
    await prisma.user.update({
      where: { id: userId },
      data: { dailyCapacityHours: preset.hoursPerDay },
    })
  } else {
    // Fully custom — compute avg hours for dailyCapacityHours
    const hoursPerDay = customData?.hoursPerDay ?? 8
    const hoursPerDayMap = customData?.hoursPerDayMap ?? null
    const avgHours = hoursPerDayMap
      ? Object.values(hoursPerDayMap).reduce((a, b) => a + b, 0) / Object.values(hoursPerDayMap).length
      : hoursPerDay
    scheduleFields = {
      presetId: null,
      name: customData?.name ?? null,
      scheduleType: 'custom' as any,
      hoursPerDay,
      hoursPerDayMap,
      workDays: customData?.workDays ?? [1, 2, 3, 4, 5],
      cycleStartDate: null,
    }
    await prisma.user.update({
      where: { id: userId },
      data: { dailyCapacityHours: avgHours },
    })
  }

  return prisma.userWorkSchedule.upsert({
    where: { userId },
    create: { userId, ...scheduleFields },
    update: scheduleFields,
  })
}
