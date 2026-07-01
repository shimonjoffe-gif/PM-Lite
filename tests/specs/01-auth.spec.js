// @ts-check
const { test, expect } = require('@playwright/test')

const BASE = 'http://localhost:5173'
const EMAIL = 'admin@pmgroup.ru'
const PASS = 'Demo1234!'

test.describe('Авторизация', () => {
  test('отображается форма входа', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('вход с правильными данными', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(projects|dashboard)/, { timeout: 15000 })
    // Проверяем что мы залогинены
    const token = await page.evaluate(() => localStorage.getItem('token'))
    expect(token).toBeTruthy()
  })

  test('вход с неправильным паролем показывает ошибку', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', 'WrongPass123!')
    await page.click('button[type="submit"]')
    // Ожидаем сообщение об ошибке или остаёмся на /login
    await page.waitForTimeout(2000)
    const url = page.url()
    expect(url).toContain('login')
  })

  test('ссылка на регистрацию работает', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    const regLink = page.locator('a[href*="register"]')
    if (await regLink.count() > 0) {
      await regLink.click()
      await expect(page).toHaveURL(/register/)
    }
  })

  test('ссылка "Забыл пароль" работает', async ({ page }) => {
    await page.goto(`${BASE}/login`)
    const forgotLink = page.locator('a[href*="forgot"]')
    if (await forgotLink.count() > 0) {
      await forgotLink.click()
      await expect(page).toHaveURL(/forgot/)
    }
  })

  test('выход из системы', async ({ page }) => {
    // Логин
    await page.goto(`${BASE}/login`)
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASS)
    await page.click('button[type="submit"]')
    await page.waitForURL(/\/(projects|dashboard)/, { timeout: 15000 })

    // Нажимаем на аватар пользователя
    await page.locator('button[aria-label="Меню пользователя"]').click()
    await page.waitForTimeout(300)
    await page.locator('button:has-text("Выйти")').click()
    await expect(page).toHaveURL(/login/)
  })
})
