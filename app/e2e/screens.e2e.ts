import { expect, SCREENS, test } from './fixtures'

test.describe('Every screen', () => {
  for (const screen of SCREENS) {
    test(`${screen.tab} renders without console errors or horizontal overflow`, async ({ app, page, consoleErrors }) => {
      await app.open(screen.hash)
      await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible()
      await expect(page.locator('body')).not.toContainText('Loading')

      const overflow = await page.evaluate(() => ({
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        body: document.body.scrollWidth - document.body.clientWidth,
      }))
      expect(overflow, 'page must not scroll sideways').toEqual({ doc: 0, body: 0 })
      // The fixture asserts this too; asserting here gives a clearer failure tied to the screen.
      expect(consoleErrors).toEqual([])
    })
  }

  test('tab bar navigates between screens and keeps the hash', async ({ app, page }) => {
    await app.open('today')
    for (const screen of SCREENS.slice(1)) {
      await app.tab(screen.tab)
      await expect(page).toHaveURL(new RegExp(`#${screen.hash}$`))
      await expect(page.getByRole('heading', { level: 1, name: screen.heading })).toBeVisible()
    }
  })
})
