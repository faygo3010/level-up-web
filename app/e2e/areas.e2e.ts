import { expect, test } from './fixtures'

test.describe('Areas', () => {
  test('adds a routine with chosen days in a bottom sheet, edits it, then archives it', async ({ app, page }) => {
    await app.open('areas')
    await page.getByRole('button', { name: 'Open Trading' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Trading/ })).toBeVisible()

    await page.getByRole('button', { name: 'Add routine' }).click()
    const sheet = app.sheet()
    await expect(sheet.getByRole('heading', { name: 'New routine' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByRole('alert').filter({ hasText: 'Say what you do.' })).toBeVisible()

    await sheet.getByLabel('What do you do?').fill('Review charts')
    const days = sheet.getByRole('group', { name: 'Days' })
    await expect(days.getByRole('button', { name: 'Mon' })).toHaveAttribute('aria-pressed', 'true')
    await days.getByRole('button', { name: 'Sat' }).click()
    await expect(days.getByRole('button', { name: 'Sat' })).toHaveAttribute('aria-pressed', 'true')
    await app.save()

    const routines = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Routines' }) })
    const added = routines.getByRole('listitem').filter({ hasText: 'Review charts' })
    await expect(added).toBeVisible()
    let stored = await app.stored()
    expect(stored.routines.at(-1)).toMatchObject({ title: 'Review charts', areaId: 'trading', days: [1, 2, 3, 4, 5, 6] })

    await added.getByText('Review charts').click()
    await expect(sheet.getByRole('heading', { name: 'Edit routine' })).toBeVisible()
    await expect(sheet.getByLabel('What do you do?')).toHaveValue('Review charts')
    await sheet.getByLabel('What do you do?').fill('Review charts & levels')
    await app.save()
    await expect(routines.getByText('Review charts & levels')).toBeVisible()

    await routines.getByText('Review charts & levels').click()
    await sheet.getByRole('button', { name: 'Archive' }).click()
    await expect(sheet).toBeHidden()
    await expect(routines.getByText('Review charts & levels')).toHaveCount(0)
    stored = await app.stored()
    expect(stored.routines.find((r: { title: string }) => r.title === 'Review charts & levels')).toMatchObject({ archived: true })

    // An archived routine is no longer offered on Today.
    await app.tab('Today')
    await expect(page.getByRole('checkbox', { name: 'Pre-market prep & levels' }).or(page.getByRole('checkbox', { name: '10k steps' })).first()).toBeVisible()
    await expect(page.getByRole('checkbox', { name: /Review charts/ })).toHaveCount(0)
  })

  test('adds a new area and refuses an empty name', async ({ app, page }) => {
    await app.open('areas')
    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(4)

    await page.getByRole('button', { name: 'Add area' }).click()
    const sheet = app.sheet()
    await sheet.getByRole('button', { name: 'Save' }).click()
    await expect(sheet.getByRole('alert').filter({ hasText: 'Give the area a name.' })).toBeVisible()

    await sheet.getByLabel('Name').fill('Health')
    await sheet.getByRole('group', { name: 'Colour' }).getByRole('button', { name: 'Yellow' }).click()
    await app.save()

    await expect(page.getByRole('button', { name: /^Open / })).toHaveCount(5)
    await page.getByRole('button', { name: 'Open Health' }).click()
    await expect(page.getByRole('heading', { level: 1, name: /Health/ })).toBeVisible()
    await expect(page.getByRole('heading', { name: /No routines yet/ })).toBeVisible()

    await page.reload()
    await expect(page.getByRole('button', { name: 'Open Health' })).toBeVisible()
    expect((await app.stored()).areas.at(-1)).toMatchObject({ name: 'Health', color: '#fcd34d', archived: false })
  })
})
