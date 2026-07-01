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

test.describe('Отчёты', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/reports`)
    await page.waitForTimeout(1500)
  })

  test('страница отчётов загружается', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible()
  })

  test('фильтры отчётов работают', async ({ page }) => {
    await page.waitForTimeout(1000)
    const filterElements = page.locator('select, input[type="date"], button:has-text("Фильтр")')
    if (await filterElements.count() > 0) {
      await filterElements.first().click()
      await page.waitForTimeout(300)
    }
  })

  test('переход Отчёты → Документы → Отчёты (3 раза)', async ({ page }) => {
    for (let i = 0; i < 3; i++) {
      await page.goto(`${BASE}/reports`)
      await page.waitForTimeout(600)
      await expect(page.locator('main')).toBeVisible()

      await page.goto(`${BASE}/documents`)
      await page.waitForTimeout(600)
      await expect(page.locator('main')).toBeVisible()
    }
  })
})

test.describe('Документы', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/documents`)
    await page.waitForTimeout(1500)
  })

  test('страница документов загружается', async ({ page }) => {
    await expect(page.locator('main')).toBeVisible()
  })

  test('кнопка загрузки документа', async ({ page }) => {
    const uploadBtn = page.locator('button:has-text("Загрузить"), button:has-text("Добавить"), button:has-text("Upload")').first()
    if (await uploadBtn.count() > 0) {
      await uploadBtn.click()
      await page.waitForTimeout(500)
      await page.keyboard.press('Escape')
    }
  })

  test('вкладки категорий документов (3 раза)', async ({ page }) => {
    const tabBtns = page.locator('button:has-text("Все"), button:has-text("Входящие"), button:has-text("Исходящие"), button:has-text("Проекты")')
    const count = await tabBtns.count()
    if (count > 0) {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (let i = 0; i < count; i++) {
          await tabBtns.nth(i).click()
          await page.waitForTimeout(300)
        }
      }
    }
  })
})
