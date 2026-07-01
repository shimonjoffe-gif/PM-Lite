// @ts-check
const { expect } = require('@playwright/test')

const BASE = 'http://localhost:5173'
const EMAIL = 'admin@pmgroup.ru'
const PASS = 'Demo1234!'

/** Login and store auth state in localStorage */
async function login(page) {
  await page.goto(`${BASE}/login`)
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.fill('input[type="email"]', EMAIL)
  await page.fill('input[type="password"]', PASS)
  await page.click('button[type="submit"]')
  // Wait for redirect to projects or dashboard
  await page.waitForURL(/\/(projects|dashboard)/, { timeout: 15000 })
}

/** Open sidebar hamburger button */
async function openSidebar(page) {
  // Find hamburger menu button (AppLayout has a toggle button)
  const btn = page.locator('button').filter({ hasText: '' }).first()
  // Try to find a button with SVG path that looks like a menu icon
  const menuBtn = page.locator('button[aria-label="menu"], button.menu-toggle').first()
  // The AppLayout has a toggle button in the header
  const headerBtn = page.locator('header button, nav button').first()
  await headerBtn.click({ timeout: 5000 }).catch(async () => {
    // Fallback: click first button in viewport
    await page.locator('button').first().click()
  })
  await page.waitForTimeout(300)
}

/** Navigate via sidebar link */
async function sidebarNav(page, label) {
  // Open sidebar
  const toggleBtn = page.locator('button').filter({
    has: page.locator('svg')
  }).first()
  await toggleBtn.click()
  await page.waitForTimeout(200)
  // Click link
  await page.locator(`nav a:has-text("${label}")`).first().click()
  await page.waitForTimeout(500)
}

/** Get first project ID from API */
async function getFirstProjectId(page) {
  const response = await page.evaluate(async () => {
    const token = localStorage.getItem('auth_token') ||
      JSON.parse(localStorage.getItem('auth-store') || '{}')?.state?.token
    if (!token) return null
    const r = await fetch('/api/projects?limit=1', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const data = await r.json()
    return data?.items?.[0]?.id || data?.[0]?.id || null
  })
  return response
}

module.exports = { login, openSidebar, sidebarNav, getFirstProjectId, BASE, EMAIL, PASS }
