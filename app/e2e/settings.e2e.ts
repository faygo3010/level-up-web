import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures'

test.describe('Settings: your data', () => {
  test('exports a backup, then imports it back to restore deleted data', async ({ app, page }, testInfo) => {
    await app.open('prefs')

    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export backup (JSON)' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toMatch(/^levelup-backup-\d{4}-\d{2}-\d{2}\.json$/)
    const backupPath = testInfo.outputPath(download.suggestedFilename())
    await download.saveAs(backupPath)
    const backup = JSON.parse(await readFile(backupPath, 'utf8'))
    expect(backup).toMatchObject({ version: 1 })
    expect(backup.areas).toHaveLength(4)

    // Delete all data is a two-tap action.
    await page.getByRole('button', { name: 'Delete all data' }).click()
    const confirm = page.getByRole('button', { name: 'Tap again to delete everything' })
    await expect(confirm).toBeVisible()
    expect((await app.stored()).areas).toHaveLength(4)
    await confirm.click()
    await expect(page.getByRole('status').filter({ hasText: 'All data cleared.' })).toBeVisible()
    await expect.poll(async () => (await app.stored()).areas).toHaveLength(0)

    const choosing = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import backup' }).click()
    await (await choosing).setFiles(backupPath)
    await expect(page.getByText('Backup checked. Tap "Replace all data" to restore it.')).toBeVisible()
    expect((await app.stored()).areas).toHaveLength(0)

    await page.getByRole('button', { name: 'Replace all data' }).click()
    await page.getByRole('button', { name: 'Tap again to replace' }).click()
    await expect(page.getByText('Backup restored.')).toBeVisible()
    await expect.poll(async () => (await app.stored()).areas).toHaveLength(4)

    await app.tab('Areas')
    await expect(page.getByRole('button', { name: 'Open Trading' })).toBeVisible()
  })

  test('rejects a file that is not a backup', async ({ app, page }, testInfo) => {
    await app.open('prefs')
    const bogus = testInfo.outputPath('not-a-backup.json')
    await import('node:fs/promises').then((fs) => fs.writeFile(bogus, 'not json'))
    const choosing = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Import backup' }).click()
    await (await choosing).setFiles(bogus)
    await expect(page.getByText('File is not valid JSON.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Replace all data' })).toHaveCount(0)
  })

  test('downloads routines as a calendar file', async ({ app, page }) => {
    await app.open('prefs')
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Add routines to my calendar (.ics)' }).click()
    const download = await downloading
    expect(download.suggestedFilename()).toBe('levelup-routines.ics')
    const ics = await readFile((await download.path())!, 'utf8')
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('SUMMARY:Pre-market prep & levels (Trading)')
    expect(ics).toMatch(/RRULE:FREQ=WEEKLY/)
  })
})
