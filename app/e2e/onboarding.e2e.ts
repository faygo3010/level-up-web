import { expect, test } from './fixtures'

test.describe('First run', () => {
  test.use({ seeded: false })

  test('a new user sets up their system and lands on the dashboard, which survives a reload', async ({ app, page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: 'Build your system. Then follow it.' })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Get started' }).click()

    await page.getByLabel('What should we call you?').fill('Sam')
    await page.getByRole('radio', { name: 'Sunday' }).click()
    await page.getByRole('button', { name: 'Next' }).click()

    await page.getByRole('checkbox', { name: /Trading/ }).check()
    await page.getByRole('checkbox', { name: /Fitness/ }).check()
    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Choose your goals' })).toBeVisible()
    await page.getByLabel('Target for Training sessions (sessions)').fill('3')
    await page.getByLabel('Target for Training sessions (sessions)').press('Enter')
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('checkbox', { name: 'Weekly trade review' }).uncheck()
    await page.getByRole('button', { name: 'Finish setup' }).click()

    await expect(page.getByRole('heading', { level: 1, name: /, Sam\.$/ })).toBeVisible()
    await expect(page).toHaveURL(/#home$/)
    await expect(page.getByText('3 sessions to go this week.')).toBeVisible()

    const stored = await app.stored()
    expect(stored.settings).toMatchObject({ name: 'Sam', weekStartsOn: 0 })
    expect(stored.areas.map((a: { id: string }) => a.id)).toEqual(['fitness', 'trading'])
    expect(stored.routines.map((r: { id: string }) => r.id)).not.toContain('trade-review')

    await page.reload()
    await expect(page.getByRole('heading', { level: 1, name: /, Sam\.$/ })).toBeVisible()
    await page.getByRole('button', { name: "Open today's checklist" }).click()
    await expect(page).toHaveURL(/#today$/)
  })
})
