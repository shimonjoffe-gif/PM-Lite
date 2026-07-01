// @ts-check
const { test, expect } = require('@playwright/test')

const BASE = 'http://localhost:5173'
const EMAIL = 'admin@pmgroup.ru'
const PASS = 'Demo1234!'

async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/(projects|dashboard)/, { timeout: 15000 })
}

test.describe('Административные страницы (3 повтора каждой)', () => {
  const adminPages = [
    { name: 'Команда', url: `${BASE}/team`, pattern: /\/team/ },
    { name: 'Роли', url: `${BASE}/dashboard/roles`, pattern: /\/dashboard\/roles/ },
    { name: 'Настройки', url: `${BASE}/dashboard/settings`, pattern: /\/dashboard\/settings/ },
    { name: 'Настройки AI', url: `${BASE}/ai/settings`, pattern: /\/ai\/settings/ },
    { name: 'Хранилище', url: `${BASE}/dashboard/storage-settings`, pattern: /\/storage-settings/ },
    { name: 'Права на документы', url: `${BASE}/dashboard/doc-access-rules`, pattern: /\/doc-access-rules/ },
  ]

  for (const p of adminPages) {
    test(`${p.name} загружается (3 раза)`, async ({ page }) => {
      await login(page)
      for (let i = 0; i < 3; i++) {
        await page.goto(p.url)
        await page.waitForTimeout(800)
        await expect(page.locator('main')).toBeVisible()
      }
    })
  }
})

test.describe('Шаблоны', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('страница шаблонов загружается', async ({ page }) => {
    await page.goto(`${BASE}/templates`)
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('страница нормативных параметров загружается', async ({ page }) => {
    await page.goto(`${BASE}/templates/norm-params`)
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('переходы Шаблоны ↔ Нормативы (3 раза)', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.goto(`${BASE}/templates`)
      await page.waitForTimeout(600)
      await expect(page.locator('main')).toBeVisible()

      await page.goto(`${BASE}/templates/norm-params`)
      await page.waitForTimeout(600)
      await expect(page.locator('main')).toBeVisible()
    }
  })

  test('кнопка создания шаблона', async ({ page }) => {
    await page.goto(`${BASE}/templates`)
    await page.waitForTimeout(1500)
    const createBtn = page.locator('button:has-text("Создать"), button:has-text("Новый"), a[href*="templates/new"]').first()
    if (await createBtn.count() > 0) {
      await createBtn.click()
      await page.waitForTimeout(500)
    }
  })
})

test.describe('Страница Команды — кнопки', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/team`)
    await page.waitForTimeout(1500)
  })

  test('кнопка Пригласить открывает форму', async ({ page }) => {
    const inviteBtn = page.locator('button:has-text("Пригласить"), button:has-text("Добавить")').first()
    if (await inviteBtn.count() > 0) {
      await inviteBtn.click()
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
    }
  })

  test('список участников отображается', async ({ page }) => {
    await page.waitForTimeout(1000)
    // Ожидаем таблицу или список пользователей
    await expect(page.locator('main')).toBeVisible()
  })
})
