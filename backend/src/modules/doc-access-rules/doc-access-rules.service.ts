import { PrismaClient } from '@prisma/client'

function mapRule(r: any) {
  return {
    id: r.id,
    organizationId: r.organizationId,
    projectId: r.projectId ?? null,
    documentTypeId: r.documentTypeId ?? null,
    orgRoleId: r.orgRoleId,
    orgRoleName: r.orgRole?.name ?? '',
    canView: r.canView,
    canUpload: r.canUpload,
  }
}

const ruleSelect = {
  id: true,
  organizationId: true,
  projectId: true,
  documentTypeId: true,
  orgRoleId: true,
  orgRole: { select: { name: true } },
  canView: true,
  canUpload: true,
}

// ─── Org-level defaults ───────────────────────────────────────────────────────

export async function getOrgAccessRules(prisma: PrismaClient, orgId: string) {
  const rules = await prisma.documentAccessRule.findMany({
    where: { organizationId: orgId, projectId: null },
    select: ruleSelect,
    orderBy: { orgRoleId: 'asc' },
  })
  return rules.map(mapRule)
}

export async function upsertOrgAccessRules(
  prisma: PrismaClient,
  orgId: string,
  rules: { documentTypeId: string | null; orgRoleId: string; canView: boolean; canUpload: boolean }[],
) {
  // Delete all existing org-level defaults and replace
  await prisma.documentAccessRule.deleteMany({ where: { organizationId: orgId, projectId: null } })

  if (rules.length > 0) {
    await prisma.documentAccessRule.createMany({
      data: rules.map(r => ({
        organizationId: orgId,
        projectId: null,
        documentTypeId: r.documentTypeId ?? null,
        orgRoleId: r.orgRoleId,
        canView: r.canView,
        canUpload: r.canUpload,
      })),
    })
  }

  return getOrgAccessRules(prisma, orgId)
}

// ─── Project-level overrides ──────────────────────────────────────────────────

export async function getProjectAccessRules(prisma: PrismaClient, orgId: string, projectId: string) {
  const rules = await prisma.documentAccessRule.findMany({
    where: { organizationId: orgId, projectId },
    select: ruleSelect,
    orderBy: { orgRoleId: 'asc' },
  })
  return rules.map(mapRule)
}

export async function upsertProjectAccessRules(
  prisma: PrismaClient,
  orgId: string,
  projectId: string,
  rules: { documentTypeId: string | null; orgRoleId: string; canView: boolean; canUpload: boolean }[],
) {
  await prisma.documentAccessRule.deleteMany({ where: { organizationId: orgId, projectId } })

  if (rules.length > 0) {
    await prisma.documentAccessRule.createMany({
      data: rules.map(r => ({
        organizationId: orgId,
        projectId,
        documentTypeId: r.documentTypeId ?? null,
        orgRoleId: r.orgRoleId,
        canView: r.canView,
        canUpload: r.canUpload,
      })),
    })
  }

  return getProjectAccessRules(prisma, orgId, projectId)
}

// ─── Seed default rules for a new org ────────────────────────────────────────

export async function seedDefaultAccessRules(prisma: PrismaClient, orgId: string) {
  // Find "Исполнитель" system role for this org
  const executorRole = await prisma.orgRole.findFirst({
    where: { organizationId: orgId, name: 'Исполнитель', isSystem: true },
  })
  if (!executorRole) return

  // Find financial document types
  const financialTypes = await prisma.documentType.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: orgId }],
      category: { code: 'financial' },
    },
    select: { id: true },
  })

  // Executor cannot view financial documents
  const rules = financialTypes.map(t => ({
    organizationId: orgId,
    projectId: null as string | null,
    documentTypeId: t.id,
    orgRoleId: executorRole.id,
    canView: false,
    canUpload: false,
  }))

  if (rules.length > 0) {
    await prisma.documentAccessRule.createMany({ data: rules, skipDuplicates: true })
  }

}
