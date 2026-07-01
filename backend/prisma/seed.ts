import 'dotenv/config'
import { PrismaClient } from '@prisma/client'
import { DEFAULT_ROLE_PERMISSIONS } from '../src/utils/permissions'

const prisma = new PrismaClient()

async function seedDocumentAccessRules(orgId: string) {
  const executorRole = await prisma.orgRole.findFirst({
    where: { organizationId: orgId, name: 'Исполнитель', isSystem: true },
  })
  if (!executorRole) return

  const financialTypes = await prisma.documentType.findMany({
    where: {
      OR: [{ organizationId: null }, { organizationId: orgId }],
      category: { code: 'financial' },
    },
    select: { id: true },
  })

  if (financialTypes.length === 0) return

  const existingCount = await prisma.documentAccessRule.count({
    where: { organizationId: orgId, projectId: null, orgRoleId: executorRole.id },
  })
  if (existingCount > 0) return

  await prisma.documentAccessRule.createMany({
    data: financialTypes.map(t => ({
      organizationId: orgId,
      projectId: null,
      documentTypeId: t.id,
      orgRoleId: executorRole.id,
      canView: false,
      canUpload: false,
    })),
    skipDuplicates: true,
  })
  console.log(`Org "${orgId}": created ${financialTypes.length} executor document access rules`)
}

async function main() {
  const orgs = await prisma.organization.findMany()

  for (const org of orgs) {
    const existingRoles = await prisma.orgRole.count({ where: { organizationId: org.id } })
    if (existingRoles > 0) {
      console.log(`Org "${org.name}": roles already exist, skipping`)
    } else {
      for (const [name, permissions] of Object.entries(DEFAULT_ROLE_PERMISSIONS)) {
        await prisma.orgRole.create({
          data: {
            organizationId: org.id,
            name,
            isSystem: true,
            permissions: { create: permissions.map(p => ({ permission: p })) },
          },
        })
      }
      console.log(`Org "${org.name}": created ${Object.keys(DEFAULT_ROLE_PERMISSIONS).length} default roles`)
    }

    await seedDocumentAccessRules(org.id)
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
