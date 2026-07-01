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

test.describe('Страница Ресурсов', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/resources`)
    await page.waitForTimeout(1500)
  })

  test('страница ресурсов загружается', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible()
    await page.waitForTimeout(1000)
  })

  test('кнопка "Пригласить" или "Добавить" работает', async ({ page }) => {
    const addBtn = page.locator('button:has-text("Пригласить"), button:has-text("Добавить"), button:has-text("Создать")').first()
    if (await addBtn.count() > 0) {
      await addBtn.click()
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
    }
  })
})

test.describe('Загрузка ресурсов', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  test('страница загрузки ресурсов загружается', async ({ page }) => {
    await page.goto(`${BASE}/resources/load`)
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('страница рабочего графика загружается', async ({ page }) => {
    await page.goto(`${BASE}/resources/work-schedule`)
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('страница производственного календаря загружается', async ({ page }) => {
    await page.goto(`${BASE}/resources/calendar`)
    await page.waitForTimeout(1500)
    await expect(page.locator('main')).toBeVisible()
  })

  test('переходы Ресурсы → Загрузка → Рабочий график (3 раза)', async ({ page }) => {
    const pages = [
      `${BASE}/resources`,
      `${BASE}/resources/load`,
      `${BASE}/resources/work-schedule`,
      `${BASE}/resources/calendar`,
    ]
    for (let i = 0; i < 3; i++) {
      for (const url of pages) {
        await page.goto(url)
        await page.waitForTimeout(600)
        await expect(page.locator('main')).toBeVisible()
      }
    }
  })
})
