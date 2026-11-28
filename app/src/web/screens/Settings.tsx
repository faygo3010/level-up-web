import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { FileInput } from '@astryxdesign/core/FileInput'
import { FormLayout } from '@astryxdesign/core/FormLayout'
import { Selector } from '@astryxdesign/core/Selector'
import { Slider } from '@astryxdesign/core/Slider'
import { Text } from '@astryxdesign/core/Text'
import { TextInput } from '@astryxdesign/core/TextInput'
import { VStack } from '@astryxdesign/core/VStack'
import { useState } from 'react'
import { emptyState, starterState } from '../../core/defaults'
import { parseState, serializeState } from '../../core/storage'
import type { AppState } from '../../core/types'
import { routinesToIcs } from '../../core/calendar'
import { AccountSection } from '../components/AccountSection'
import { ConfirmButton, PageHeader, Section } from '../components/ui'
import { useStore } from '../store'

const MAX_IMPORT_BYTES = 10 * 1024 * 1024

/** Read a file as text; FileReader fallback covers older mobile browsers. */
export function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

function download(filename: string, contents: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Release the file a moment later: Safari can cancel a download whose URL is revoked immediately.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function backupAge(at: number | undefined, now = Date.now()): string {
  if (!at) return 'No backup exported yet.'
  const days = Math.floor((now - at) / 86_400_000)
  return days === 0 ? 'Last backup: today.' : `Last backup: ${days} day${days === 1 ? '' : 's'} ago.`
}

export function Settings() {
  const { state, dispatch, today, saveFailed } = useStore()
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [pending, setPending] = useState<AppState | null>(null)
  const { settings } = state

  const onImport = async (files: File | File[] | null) => {
    const picked = Array.isArray(files) ? (files[0] ?? null) : files
    setFile(picked)
    setPending(null)
    if (!picked) return
    if (picked.size > MAX_IMPORT_BYTES) return setMessage('That file is too large to be a Level Up backup.')
    let text: string
    try {
      text = await readText(picked)
    } catch {
      return setMessage("Couldn't read that file.")
    }
    const result = parseState(text)
    if (!result.ok) return setMessage(result.error)
    setPending(result.state)
    setMessage('Backup checked. Tap "Replace all data" to restore it.')
  }

  const replace = (next: AppState, note: string) => {
    dispatch({ type: 'replace', state: next })
    setPending(null)
    setFile(null)
    setMessage(note)
  }

  const exportBackup = () => {
    download(`levelup-backup-${today}.json`, serializeState(state))
    dispatch({ type: 'updateSettings', settings: { lastBackupAt: Date.now() } })
    setMessage('Backup saved to your downloads.')
  }

  const copyBackup = async () => {
    try {
      await navigator.clipboard.writeText(serializeState(state))
      setMessage('Backup copied. Paste it into a note or file to keep it.')
    } catch {
      setMessage("Couldn't copy here. Use Export backup instead.")
    }
  }

  return (
    <VStack gap={6}>
      <PageHeader title="Settings" subtitle="Your data lives on this device. Signing in is optional and adds sync." />

      {saveFailed && <Banner status="error" title="Couldn't save to this browser's storage. Export a backup so you don't lose anything." />}

      <AccountSection />

      <Section title="Calendar">
        <VStack gap={2} hAlign="stretch">
          <Text color="secondary">
            Download your routines as a calendar file and open it to add them to Google, Apple or Outlook calendar as repeating events.
          </Text>
          <Button
            variant="secondary"
            label="Add routines to my calendar (.ics)"
            onClick={() => download('levelup-routines.ics', routinesToIcs(state, today), 'text/calendar')}
          />
        </VStack>
      </Section>

      <Section title="Preferences">
        <FormLayout>
          <TextInput
            label="Currency symbol"
            value={settings.currency}
            onChange={(v) => v.trim() && dispatch({ type: 'updateSettings', settings: { currency: v.trim().slice(0, 4) } })}
          />
          <Selector
            label="Week starts on"
            value={String(settings.weekStartsOn)}
            onChange={(v) => dispatch({ type: 'updateSettings', settings: { weekStartsOn: v === '0' ? 0 : 1 } })}
            options={[
              { value: '1', label: 'Monday' },
              { value: '0', label: 'Sunday' },
            ]}
          />
          <Slider
            label={`A day counts for your streak at ${Math.round(settings.streakThreshold * 100)}%`}
            min={50}
            max={100}
            step={5}
            value={Math.round(settings.streakThreshold * 100)}
            formatValue={(v: number) => `${v}%`}
            onChange={(v: number) => dispatch({ type: 'updateSettings', settings: { streakThreshold: Number(v) / 100 } })}
          />
        </FormLayout>
      </Section>

      <Section title="Your data">
        <VStack gap={2} hAlign="stretch">
          <Text color="secondary">{backupAge(settings.lastBackupAt)}</Text>
          <Button variant="secondary" label="Export backup (JSON)" onClick={exportBackup} />
          <Button variant="secondary" label="Copy backup to clipboard" onClick={copyBackup} />
          <FileInput label="Import backup" accept=".json,application/json" value={file} onChange={onImport} />
          {pending && (
            <ConfirmButton variant="destructive" label="Replace all data" confirmLabel="Tap again to replace" onConfirm={() => replace(pending, 'Backup restored.')} />
          )}
          {message && (
            <Text color="secondary" role="status">
              {message}
            </Text>
          )}
        </VStack>
      </Section>

      <Section title="Danger zone">
        <VStack gap={2} hAlign="stretch">
          <Text color="secondary">These replace everything on this device. Export a backup first.</Text>
          <ConfirmButton
            variant="destructive"
            label="Load starter system"
            confirmLabel="Tap again: replaces everything"
            onConfirm={() => replace(starterState(today), 'Starter system loaded.')}
          />
          <ConfirmButton
            variant="destructive"
            label="Delete all data"
            confirmLabel="Tap again to delete everything"
            // Stays in the app (rather than back to setup) so a backup can be restored straight away.
            onConfirm={() => replace({ ...emptyState(), startedOn: today, settings: { ...emptyState().settings, onboardedAt: Date.now() } }, 'All data cleared.')}
          />
        </VStack>
      </Section>
    </VStack>
  )
}
