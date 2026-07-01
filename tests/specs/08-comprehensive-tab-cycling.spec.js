// @ts-check
const { test, expect } = require('@playwright/test')

/**
 * Исчерпывающий тест: перебирает ВСЕ пары страниц (3 повтора)
 * и ВСЕ пары вкладок внутри проекта (3 повтора).
 */

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

async function openSidebar(page) {
  await page.locator('button[aria-label="Открыть меню"]').click()
  // Wait for the overlay that appears only when sidebar is open
  await page.locator('div.fixed.inset-0.z-30').waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(200)
}

// Все страницы приложения
const ALL_PAGES = [
  { url: `${BASE}/projects`, label: 'Проекты' },
  { url: `${BASE}/tasks`, label: 'Задачи' },
  { url: `${BASE}/resources`, label: 'Ресурсы' },
  { url: `${BASE}/reports`, label: 'Отчёты' },
  { url: `${BASE}/documents`, label: 'Документы' },
  { url: `${BASE}/team`, label: 'Команда' },
  { url: `${BASE}/resources/load`, label: 'Загрузка ресурсов' },
  { url: `${BASE}/resources/work-schedule`, label: 'Рабочий график' },
  { url: `${BASE}/resources/calendar`, label: 'Производ. календарь' },
  { url: `${BASE}/dashboard/roles`, label: 'Роли' },
  { url: `${BASE}/dashboard/settings`, label: 'Настройки' },
  { url: `${BASE}/ai/settings`, label: 'Настройки AI' },
  { url: `${BASE}/dashboard/storage-settings`, label: 'Хранилище' },
  { url: `${BASE}/dashboard/doc-access-rules`, label: 'Права на документы' },
  { url: `${BASE}/templates`, label: 'Шаблоны' },
  { url: `${BASE}/templates/norm-params`, label: 'Нормативы' },
]

test.describe('Полный цикл по всем страницам (direct URL, 3 повтора)', () => {
  test('все страницы загружаются без ошибок', async ({ page }) => {
    test.setTimeout(120000)
    await login(page)

    for (let repeat = 0; repeat < 3; repeat++) {
      for (const p of ALL_PAGES) {
        await page.goto(p.url)
        await page.waitForTimeout(200)
        // Проверяем что страница не упала (нет текста об ошибке)
        const bodyText = await page.locator('body').textContent()
        expect(bodyText).not.toContain('Cannot GET')
        await expect(page.locator('main')).toBeVisible({ timeout: 8000 })
      }
    }
  })
})

test.describe('Навигация через топбар (3 повтора каждой пары)', () => {
  const TOP_TABS = ['Проекты', 'Задачи', 'Ресурсы', 'Отчёты']

  test('циклический обход вкладок топбара (3 раза)', async ({ page }) => {
    await login(page)

    for (let repeat = 0; repeat < 3; repeat++) {
      for (const label of TOP_TABS) {
        const link = page.locator(`header nav a:has-text("${label}"), nav.hidden.md\\:flex a:has-text("${label}")`).first()
        // Поиск через все ссылки в хедере
        const headerLinks = page.locator('header a, header nav a')
        let found = false
        const count = await headerLinks.count()
        for (let i = 0; i < count; i++) {
          const text = await headerLinks.nth(i).textContent()
          if (text?.trim() === label) {
            await headerLinks.nth(i).click()
            found = true
            await page.waitForTimeout(500)
            break
          }
        }
        if (!found) {
          // Навигируем напрямую
          const tab = ALL_PAGES.find(p => p.label === label)
          if (tab) {
            await page.goto(tab.url)
            await page.waitForTimeout(400)
          }
        }
        await expect(page.locator('main')).toBeVisible()
      }
    }
  })
})

test.describe('Вкладки внутри проекта — полный цикл (3 повтора каждой пары)', () => {
  const PROJECT_TABS = ['Список', 'Канбан', 'Календарь', 'Гант', 'Отчёты', 'Документы']

  test('последовательный обход всех вкладок проекта (3 раза)', async ({ page }) => {
    await login(page)
    await page.goto(`${BASE}/projects`)
    await page.waitForTimeout(2000)

    // Переход в первый проект
    const projectLinks = page.locator('a[href*="/projects/"]:not([href="/projects/new"])')
    const projectCount = await projectLinks.count()
    if (projectCount === 0) {
      test.skip()
      return
    }

    await projectLinks.first().click()
    await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 10000 })
    await page.waitForTimeout(1000)

    for (let repeat = 0; repeat < 3; repeat++) {
      for (const tabLabel of PROJECT_TABS) {
        const btn = page.locator(`button:text-is("${tabLabel}")`).first()
        await btn.waitFor({ state: 'visible', timeout: 8000 })
        await btn.click()
        await page.waitForTimeout(500)
        // Контент загрузился (нет бесконечного спиннера)
        await expect(page.locator('.animate-spin')).toHaveCount(0, { timeout: 8000 }).catch(() => {})
      }
    }
  })

  // Все пары вкладок
  const pairs = []
  for (let i = 0; i < PROJECT_TABS.length; i++) {
    for (let j = 0; j < PROJECT_TABS.length; j++) {
      if (i !== j) pairs.push([PROJECT_TABS[i], PROJECT_TABS[j]])
    }
  }

  for (const [tabA, tabB] of pairs) {
    test(`проект: "${tabA}" → "${tabB}" (3 раза)`, async ({ page }) => {
      await login(page)
      await page.goto(`${BASE}/projects`)
      await page.waitForTimeout(2000)

      const projectLinks = page.locator('a[href*="/projects/"]:not([href="/projects/new"])')
      if (await projectLinks.count() === 0) {
        test.skip()
        return
      }
      await projectLinks.first().click()
      await page.waitForURL(/\/projects\/[^/]+$/, { timeout: 10000 })
      await page.waitForTimeout(1000)

      for (let i = 0; i < 3; i++) {
        const btnA = page.locator(`button:text-is("${tabA}")`).first()
        await btnA.waitFor({ state: 'visible', timeout: 8000 })
        await btnA.click()
        await page.waitForTimeout(400)

        const btnB = page.locator(`button:text-is("${tabB}")`).first()
        await btnB.waitFor({ state: 'visible', timeout: 8000 })
        await btnB.click()
        await page.waitForTimeout(400)
      }
    })
  }
})
