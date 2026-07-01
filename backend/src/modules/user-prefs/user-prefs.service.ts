import { PrismaClient } from '@prisma/client'
import { PROJECT_COLUMNS, ProjectColumnKey } from './user-prefs.schemas'

const DEFAULTS: Record<string, string[]> = {
  projects: ['name', 'status', 'owner', 'client', 'endDate', 'completionPct', 'overdueTasks'],
}

export async function getColumnPrefs(
  prisma: PrismaClient,
  userId: string,
  tableName: string,
): Promise<{ tableName: string; columns: string[] }> {
  const pref = await prisma.userColumnPref.findUnique({
    where: { userId_tableName: { userId, tableName } },
  })
  return {
    tableName,
    columns: pref ? (pref.columns as string[]) : (DEFAULTS[tableName] ?? []),
  }
}

export async function setColumnPrefs(
  prisma: PrismaClient,
  userId: string,
  tableName: string,
  columns: string[],
): Promise<{ tableName: string; columns: string[] }> {
  // Validate against known columns for known tables
  if (tableName === 'projects') {
    const valid = new Set<string>(PROJECT_COLUMNS)
    const unknown = columns.filter(c => !valid.has(c as ProjectColumnKey))
    if (unknown.length) throw { statusCode: 400, message: `Неизвестные колонки: ${unknown.join(', ')}` }
  }

  await prisma.userColumnPref.upsert({
    where: { userId_tableName: { userId, tableName } },
    create: { userId, tableName, columns },
    update: { columns },
  })

  return { tableName, columns }
}
