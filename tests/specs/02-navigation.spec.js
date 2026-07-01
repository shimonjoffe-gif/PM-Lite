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

/** Открыть sidebar и дождаться пока он "slide-in" */
async function openSidebar(page) {
  await page.locator('button[aria-label="Открыть меню"]').click()
  // Sidebar overlay div is rendered only when open=true
  // It has a unique combination of classes: fixed inset-0 z-30 bg-black/20
  await page.locator('div.fixed.inset-0.z-30').waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(200)
}

/** Клик по ссылке в sidebar с проверкой что sidebar открыт */
async function sidebarClick(page, label) {
  await openSidebar(page)
  // After overlay appears sidebar is fully open — find the link directly
  const link = page.locator(`aside a:has-text("${label}")`).first()
  await link.waitFor({ state: 'visible', timeout: 5000 })
  await link.click()
  // Wait for overlay to disappear (sidebar closed after navigation)
  await page.locator('div.fixed.inset-0.z-30').waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
}

/** Клик по ссылке в хедере (топбар) */
async function headerNav(page, label) {
  const link = page.locator('header a').filter({ hasText: label }).first()
  await link.waitFor({ state: 'visible', timeout: 5000 })
  await link.click()
}

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Навигация по заголовку (топбар)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  const TOP_TABS = [
    { label: 'Проекты', url: /\/projects/ },
    { label: 'Задачи',  url: /\/tasks/ },
    { label: 'Ресурсы', url: /\/resources/ },
    { label: 'Отчёты',  url: /\/reports/ },
  ]

  for (const tab of TOP_TABS) {
    test(`топбар: "${tab.label}" (3 раза)`, async ({ page }) => {
      for (let i = 0; i < 3; i++) {
        await headerNav(page, tab.label)
        await page.waitForURL(tab.url, { timeout: 10000 })
        await expect(page).toHaveURL(tab.url)
        await page.waitForTimeout(300)
      }
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Навигация через Sidebar', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  const SIDEBAR_LINKS = [
    { label: 'Проекты',            url: /\/projects/ },
    { label: 'Мои задачи',         url: /\/tasks/ },
    { label: 'Ресурсы',            url: /\/resources/ },
    { label: 'Отчёты',             url: /\/reports/ },
    { label: 'Документы',          url: /\/documents/ },
    { label: 'Команда',            url: /\/team/ },
    { label: 'Загрузка ресурсов',  url: /\/resources\/load/ },
    { label: 'Рабочий график',     url: /\/resources\/work-schedule/ },
    { label: 'Производ. календарь',url: /\/resources\/calendar/ },
    { label: 'Роли',               url: /\/dashboard\/roles/ },
    { label: 'Настройки',          url: /\/dashboard\/settings/ },
    { label: 'Настройки AI',       url: /\/ai\/settings/ },
    { label: 'Хранилище',          url: /\/dashboard\/storage-settings/ },
    { label: 'Права на документы', url: /\/dashboard\/doc-access-rules/ },
    { label: 'Шаблоны',            url: /\/templates/ },
  ]

  for (const link of SIDEBAR_LINKS) {
    test(`sidebar → "${link.label}" (3 раза)`, async ({ page }) => {
      for (let i = 0; i < 3; i++) {
        await sidebarClick(page, link.label)
        await page.waitForURL(link.url, { timeout: 10000 })
        await expect(page).toHaveURL(link.url)
        await page.waitForTimeout(300)
      }
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────

test.describe('Переходы между парами страниц (3 повтора)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page)
  })

  const PAIRS = [
    ['Проекты',   /\/projects/,            'Задачи',          /\/tasks/],
    ['Задачи',    /\/tasks/,               'Ресурсы',         /\/resources/],
    ['Ресурсы',   /\/resources/,           'Отчёты',          /\/reports/],
    ['Отчёты',    /\/reports/,             'Проекты',         /\/projects/],
    ['Проекты',   /\/projects/,            'Документы',       /\/documents/],
    ['Документы', /\/documents/,           'Команда',         /\/team/],
    ['Команда',   /\/team/,                'Шаблоны',         /\/templates/],
    ['Шаблоны',   /\/templates/,           'Мои задачи',      /\/tasks/],
    ['Мои задачи',/\/tasks/,               'Загрузка ресурсов',/\/resources\/load/],
  ]

  for (const [labelA, urlA, labelB, urlB] of PAIRS) {
    test(`"${labelA}" ↔ "${labelB}" (3 раза)`, async ({ page }) => {
      for (let i = 0; i < 3; i++) {
        await sidebarClick(page, labelA)
        await page.waitForURL(urlA, { timeout: 10000 })

        await sidebarClick(page, labelB)
        await page.waitForURL(urlB, { timeout: 10000 })

        await page.waitForTimeout(200)
      }
    })
  }
})
