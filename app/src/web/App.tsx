import { AppShell } from '@astryxdesign/core/AppShell'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { VStack } from '@astryxdesign/core/VStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Today } from './screens/Today'

// Today is the landing screen; the rest load on first visit to keep startup light.
const Calendar = lazy(() => import('./screens/Calendar').then((m) => ({ default: m.Calendar })))
const Areas = lazy(() => import('./screens/Areas').then((m) => ({ default: m.Areas })))
const Journal = lazy(() => import('./screens/Journal').then((m) => ({ default: m.Journal })))
const Insights = lazy(() => import('./screens/Insights').then((m) => ({ default: m.Insights })))
const Coach = lazy(() => import('./screens/Coach').then((m) => ({ default: m.Coach })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))

const TABS = [
  { key: 'today', label: 'Today', Screen: Today },
  { key: 'calendar', label: 'Calendar', Screen: Calendar },
  { key: 'areas', label: 'Areas', Screen: Areas },
  { key: 'journal', label: 'Journal', Screen: Journal },
  { key: 'insights', label: 'Insights', Screen: Insights },
  { key: 'coach', label: 'Coach', Screen: Coach },
  { key: 'prefs', label: 'Settings', Screen: Settings },
] as const

type TabKey = (typeof TABS)[number]['key']

const isTab = (key: string): key is TabKey => TABS.some((t) => t.key === key)
const fromHash = (): TabKey => {
  const key = window.location.hash.replace('#', '')
  return isTab(key) ? key : 'today'
}

export function App() {
  const [tab, setTab] = useState<TabKey>(fromHash)

  useEffect(() => {
    const onHash = () => setTab(fromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (key: string) => {
    if (!isTab(key)) return
    window.location.hash = key
    setTab(key)
    window.scrollTo?.({ top: 0 })
  }

  const { Screen, label } = TABS.find((t) => t.key === tab) ?? TABS[0]

  useEffect(() => {
    document.title = `${label} · Level Up`
  }, [label])

  return (
    <AppShell
      height="auto"
      contentPadding={4}
      variant="section"
      topNav={<TopNav label="Level Up" heading={<TopNavHeading heading="Level Up" subheading="Follow your system" />} />}
    >
      <VStack hAlign="center">
        <VStack gap={6} maxWidth={720} width="100%">
        <TabList value={tab} onChange={go} overflow="auto" aria-label="Main">
          {TABS.map((t) => (
            <Tab key={t.key} value={t.key} label={t.label} />
          ))}
        </TabList>
        <Suspense fallback={<Spinner label="Loading" />}>
          <Screen />
        </Suspense>
        </VStack>
      </VStack>
    </AppShell>
  )
}
