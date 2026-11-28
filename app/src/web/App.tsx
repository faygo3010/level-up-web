import { AppShell } from '@astryxdesign/core/AppShell'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { VStack } from '@astryxdesign/core/VStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { lazy, Suspense, useEffect, useState } from 'react'
import { isOnboarded } from '../core/templates'
import { AccountSection } from './components/AccountSection'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { Welcome } from './screens/Welcome'
import { useStore } from './store'
import { useSync } from './sync/useSync'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'

// Home is the landing screen; the rest load on first visit to keep startup light.
const Today = lazy(() => import('./screens/Today').then((m) => ({ default: m.Today })))
const Calendar = lazy(() => import('./screens/Calendar').then((m) => ({ default: m.Calendar })))
const Areas = lazy(() => import('./screens/Areas').then((m) => ({ default: m.Areas })))
const Journal = lazy(() => import('./screens/Journal').then((m) => ({ default: m.Journal })))
const Insights = lazy(() => import('./screens/Insights').then((m) => ({ default: m.Insights })))
const Coach = lazy(() => import('./screens/Coach').then((m) => ({ default: m.Coach })))
const Settings = lazy(() => import('./screens/Settings').then((m) => ({ default: m.Settings })))

const TABS = [
  { key: 'home', label: 'Home', Screen: Home },
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
  return isTab(key) ? key : 'home'
}

/**
 * What someone sees before they have a system: the welcome and sign-in
 * screen, then (once their account has loaded) first-run setup. Returning
 * users skip straight to the app because their account already has a system.
 */
function FirstRun({ onDone }: { onDone: () => void }) {
  const sync = useSync()
  const [guest, setGuest] = useState(false)
  const signedIn = sync.configured && sync.status !== 'signedOut'
  if (sync.recoveringPassword) return <AccountSection />
  if (!signedIn && !guest) return <Welcome onGuest={() => setGuest(true)} />
  if (signedIn && sync.lastSynced === null && !sync.error) return <Spinner label="Loading your account" />
  return (
    <VStack gap={4}>
      {sync.error && (
        <Banner
          status="warning"
          title="Couldn't load your account"
          description="If you've used Level Up before, try again so your system isn't set up twice."
          endContent={<Button size="sm" variant="secondary" label="Try again" onClick={sync.syncNow} />}
        />
      )}
      <Onboarding onDone={onDone} />
    </VStack>
  )
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
  const ready = isOnboarded(useStore().state)

  useEffect(() => {
    document.title = ready ? `${label} · Level Up` : 'Welcome · Level Up'
  }, [label, ready])

  return (
    <AppShell
      height="auto"
      contentPadding={4}
      variant="section"
      topNav={<TopNav label="Level Up" heading={<TopNavHeading heading="Level Up" subheading="Follow your system" />} />}
    >
      <VStack hAlign="center">
        <VStack gap={6} maxWidth={720} width="100%">
        {ready ? (
          <>
            <TabList value={tab} onChange={go} overflow="auto" aria-label="Main">
              {TABS.map((t) => (
                <Tab key={t.key} value={t.key} label={t.label} />
              ))}
            </TabList>
            <Suspense fallback={<Spinner label="Loading" />}>
              <Screen />
            </Suspense>
          </>
        ) : (
          <FirstRun onDone={() => go('home')} />
        )}
        </VStack>
      </VStack>
    </AppShell>
  )
}
