import nodemailer from 'nodemailer'
import { env } from '../config/env'

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
})

async function send(to: string, subject: string, html: string) {
  await transporter.sendMail({ from: env.EMAIL_FROM, to, subject, html })
}

export async function sendVerificationEmail(to: string, token: string) {
  const url = `${env.APP_URL}/verify-email?token=${token}`
  await send(
    to,
    'Подтвердите e-mail — PM Lite',
    `<p>Добро пожаловать в PM Lite!</p>
     <p>Для подтверждения e-mail перейдите по ссылке:</p>
     <p><a href="${url}">${url}</a></p>
     <p>Ссылка действительна 24 часа.</p>`,
  )
}

export async function sendInvitationEmail(
  to: string,
  orgName: string,
  inviterName: string,
  token: string,
) {
  const url = `${env.APP_URL}/invite/${token}`
  await send(
    to,
    `${inviterName} приглашает вас в ${orgName} — PM Lite`,
    `<p>${inviterName} приглашает вас присоединиться к организации <strong>${orgName}</strong> в PM Lite.</p>
     <p><a href="${url}">Принять приглашение</a></p>
     <p>Ссылка действительна 7 дней.</p>`,
  )
}

export async function sendJoinRequestEmail(
  adminEmail: string,
  requesterName: string,
  requesterEmail: string,
  orgName: string,
) {
  await send(
    adminEmail,
    `Запрос на вступление в ${orgName} — PM Lite`,
    `<p><strong>${requesterName}</strong> (${requesterEmail}) хочет присоединиться к организации <strong>${orgName}</strong>.</p>
     <p>Перейдите в <a href="${env.APP_URL}/settings/users">настройки пользователей</a>, чтобы одобрить или отклонить запрос.</p>`,
  )
}

export async function sendProjectDelegatedEmail(
  to: string,
  data: { projectId: string; projectName: string; delegatedBy: string; role: string },
) {
  const url = `${env.APP_URL}/projects/${data.projectId}`
  await send(
    to,
    `Вам передан проект «${data.projectName}» — PM Lite`,
    `<p>${data.delegatedBy} назначил вас владельцем проекта <strong>${data.projectName}</strong>.</p>
     <p><a href="${url}">Перейти к проекту</a></p>`,
  )
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = `${env.APP_URL}/reset-password?token=${token}`
  await send(
    to,
    'Сброс пароля — PM Lite',
    `<p>Вы запросили сброс пароля в PM Lite.</p>
     <p>Перейдите по ссылке для создания нового пароля:</p>
     <p><a href="${url}">${url}</a></p>
     <p>Ссылка действительна 1 час. Если вы не запрашивали сброс — просто проигнорируйте это письмо.</p>`,
  )
}

export async function sendFeedbackNotification(
  type: string,
  text: string,
  screen: string,
  fromEmail: string,
) {
  await send(
    env.EMAIL_FROM,
    `[PM Lite] Новый ${type === 'bug' ? 'баг-репорт' : 'отзыв'} от ${fromEmail}`,
    `<p><strong>Тип:</strong> ${type === 'bug' ? 'Баг-репорт' : 'Отзыв'}</p>
     <p><strong>От:</strong> ${fromEmail}</p>
     <p><strong>Экран:</strong> ${screen || '—'}</p>
     <hr/>
     <p>${text.replace(/\n/g, '<br/>')}</p>`,
  )
}
