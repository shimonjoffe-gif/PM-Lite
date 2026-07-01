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

test.describe('Страница "Мои задачи" — вкладки (3 повтора)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/tasks`)
    await page.waitForTimeout(1500)
  })

  const TABS = ['Список', 'Канбан', 'Проекты']

  for (const tab of TABS) {
    test(`вкладка "${tab}" (3 раза)`, async ({ page }) => {
      await login(page)
      await page.goto(`${BASE}/tasks`)
      await page.waitForTimeout(1500)

      for (let i = 0; i < 3; i++) {
        const tabBtn = page.locator(`button:text-is("${tab}")`).first()
        if (await tabBtn.count() === 0) {
          // Попробуем с частичным совпадением
          const tabBtn2 = page.locator(`button:has-text("${tab}")`).first()
          if (await tabBtn2.count() === 0) break
          await tabBtn2.click()
        } else {
          await tabBtn.click()
        }
        await page.waitForTimeout(500)
      }
    })
  }

  // Переходы между парами
  const PAIRS = [
    ['Список', 'Канбан'],
    ['Канбан', 'Проекты'],
    ['Проекты', 'Список'],
  ]

  for (const [tabA, tabB] of PAIRS) {
    test(`"${tabA}" ↔ "${tabB}" (3 раза)`, async ({ page }) => {
      await login(page)
      await page.goto(`${BASE}/tasks`)
      await page.waitForTimeout(1500)

      for (let i = 0; i < 3; i++) {
        const btnA = page.locator(`button:has-text("${tabA}")`).first()
        if (await btnA.count() > 0) {
          await btnA.click()
          await page.waitForTimeout(400)
        }
        const btnB = page.locator(`button:has-text("${tabB}")`).first()
        if (await btnB.count() > 0) {
          await btnB.click()
          await page.waitForTimeout(400)
        }
      }
    })
  }

  test('фильтры быстрых дедлайнов', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/tasks`)
    await page.waitForTimeout(1500)

    const deadlineBtns = ['Просрочено', 'Сегодня', 'Неделя', 'Месяц']
    for (const label of deadlineBtns) {
      const btn = page.locator(`button:has-text("${label}")`).first()
      if (await btn.count() > 0) {
        await btn.click()
        await page.waitForTimeout(400)
        await btn.click() // Сбрасываем
        await page.waitForTimeout(300)
      }
    }
  })

  test('фильтр по статусу задачи', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/tasks`)
    await page.waitForTimeout(1500)

    const statusFilter = page.locator('select, [class*="filter"]').first()
    if (await statusFilter.count() > 0) {
      await statusFilter.click()
      await page.waitForTimeout(300)
    }
  })
})
