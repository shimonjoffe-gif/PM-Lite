import { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { authenticate, requireAdmin, JwtPayload } from '../../plugins/authenticate'

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  // GET / — список пользователей организации
  app.get(
    '/',
    { preHandler: authenticate },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload

      const [users, org] = await Promise.all([
        app.prisma.user.findMany({
          where: { organizationId: orgId },
          orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
          include: { orgRole: { select: { id: true, name: true } } },
        }),
        app.prisma.organization.findUniqueOrThrow({ where: { id: orgId } }),
      ])

      return reply.send({
        users: users.map(u => ({
          id: u.id,
          email: u.email,
          fullName: u.fullName,
          isAdmin: u.isAdmin,
          orgRoleId: u.orgRoleId,
          orgRoleName: u.orgRole?.name ?? (u.isAdmin ? 'Администратор' : null),
          isActive: u.isActive,
          dailyCapacityHours: Number(u.dailyCapacityHours),
          emailVerifiedAt: u.emailVerifiedAt?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
          departmentId: u.departmentId ?? null,
        })),
        org: { id: org.id, name: org.name, slug: org.slug, planType: org.planType },
      })
    },
  )

  // PATCH /:id/activate — одобрить заявку
  app.patch(
    '/:id/activate',
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      await app.prisma.user.update({ where: { id: request.params.id }, data: { isActive: true } })
      return reply.send({ message: 'Пользователь активирован' })
    },
  )

  // PATCH /:id/role — сменить роль (только admin)
  app.patch(
    '/:id/role',
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ orgRoleId: z.string().uuid().nullable() }),
      },
    },
    async (request, reply) => {
      const { orgId, sub } = request.currentUser as JwtPayload
      if (request.params.id === sub) {
        return reply.status(400).send({ error: 'Нельзя изменить собственную роль' })
      }
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      if (request.body.orgRoleId) {
        const role = await app.prisma.orgRole.findUnique({ where: { id: request.body.orgRoleId } })
        if (!role || role.organizationId !== orgId) {
          return reply.status(400).send({ error: 'Роль не принадлежит этой организации' })
        }
      }
      await app.prisma.user.update({
        where: { id: request.params.id },
        data: { orgRoleId: request.body.orgRoleId },
      })
      return reply.send({ message: 'Роль обновлена' })
    },
  )

  // PATCH /:id/capacity — настройка рабочих часов (только admin)
  app.patch(
    '/:id/capacity',
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({ dailyCapacityHours: z.number().min(0.5).max(24) }),
      },
    },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      await app.prisma.user.update({
        where: { id: request.params.id },
        data: { dailyCapacityHours: request.body.dailyCapacityHours },
      })
      return reply.send({ message: 'Доступность обновлена' })
    },
  )

  // DELETE /:id — деактивация пользователя (данные остаются)
  app.delete(
    '/:id',
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      const { orgId, sub } = request.currentUser as JwtPayload
      if (request.params.id === sub) {
        return reply.status(400).send({ error: 'Нельзя деактивировать самого себя' })
      }
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      await app.prisma.user.update({ where: { id: request.params.id }, data: { isActive: false } })
      return reply.send({ message: 'Пользователь деактивирован' })
    },
  )

  // GET /:id/absences — список отсутствий сотрудника
  app.get(
    '/:id/absences',
    { preHandler: requireAdmin, schema: { params: z.object({ id: z.string() }) } },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      const absences = await app.prisma.absence.findMany({
        where: { userId: request.params.id },
        orderBy: { startDate: 'asc' },
      })
      return reply.send(
        absences.map(a => ({
          id: a.id,
          type: a.type,
          startDate: a.startDate.toISOString().slice(0, 10),
          endDate: a.endDate.toISOString().slice(0, 10),
          notes: a.notes,
        })),
      )
    },
  )

  // POST /:id/absences — добавить отсутствие, вернуть затронутые задачи (AC US-A2.3)
  app.post(
    '/:id/absences',
    {
      preHandler: requireAdmin,
      schema: {
        params: z.object({ id: z.string() }),
        body: z.object({
          type: z.enum(['vacation', 'sick', 'other']),
          startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          notes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      const { orgId, sub } = request.currentUser as JwtPayload
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }

      const start = new Date(request.body.startDate)
      const end = new Date(request.body.endDate)
      if (end < start) {
        return reply.status(400).send({ error: 'Дата окончания не может быть раньше начала' })
      }

      const absence = await app.prisma.absence.create({
        data: {
          userId: request.params.id,
          organizationId: orgId,
          type: request.body.type,
          startDate: start,
          endDate: end,
          notes: request.body.notes,
          createdBy: sub,
        },
      })

      // AC: задачи сотрудника с dueDate в периоде отсутствия (незавершённые)
      const affectedTasks = await app.prisma.task.findMany({
        where: {
          assigneeId: request.params.id,
          dueDate: { gte: start, lte: end },
          status: { notIn: ['done', 'cancelled'] },
        },
        select: {
          id: true,
          title: true,
          dueDate: true,
          project: { select: { id: true, name: true } },
        },
      })

      return reply.status(201).send({
        absence: {
          id: absence.id,
          type: absence.type,
          startDate: absence.startDate.toISOString().slice(0, 10),
          endDate: absence.endDate.toISOString().slice(0, 10),
          notes: absence.notes,
        },
        affectedTasks: affectedTasks.map(t => ({
          id: t.id,
          title: t.title,
          dueDate: t.dueDate!.toISOString().slice(0, 10),
          projectName: t.project.name,
        })),
      })
    },
  )

  // DELETE /:id/absences/:absenceId — удалить отсутствие
  app.delete(
    '/:id/absences/:absenceId',
    {
      preHandler: requireAdmin,
      schema: { params: z.object({ id: z.string(), absenceId: z.string() }) },
    },
    async (request, reply) => {
      const { orgId } = request.currentUser as JwtPayload
      const user = await app.prisma.user.findUnique({ where: { id: request.params.id } })
      if (!user || user.organizationId !== orgId) {
        return reply.status(404).send({ error: 'Пользователь не найден' })
      }
      const absence = await app.prisma.absence.findUnique({
        where: { id: request.params.absenceId },
      })
      if (!absence || absence.userId !== request.params.id) {
        return reply.status(404).send({ error: 'Отсутствие не найдено' })
      }
      await app.prisma.absence.delete({ where: { id: request.params.absenceId } })
      return reply.send({ message: 'Отсутствие удалено' })
    },
  )
}
