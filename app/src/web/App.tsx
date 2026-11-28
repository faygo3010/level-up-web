import { AppShell } from '@astryxdesign/core/AppShell'
import { Tab, TabList } from '@astryxdesign/core/TabList'
import { TopNav, TopNavHeading } from '@astryxdesign/core/TopNav'
import { VStack } from '@astryxdesign/core/VStack'
import { Spinner } from '@astryxdesign/core/Spinner'
import { lazy, Suspense, useEffect, useState } from 'react'
import { isOnboarded } from '../core/templates'
import { AccountSection } from './components/AccountSection'
import { PageHeader, focusPageTitle } from './components/ui'
import { HStack } from '@astryxdesign/core/HStack'
import { Home } from './screens/Home'
import { Onboarding } from './screens/Onboarding'
import { Welcome } from './screens/Welcome'
import { useStore } from './store'
import { useSync } from './sync/useSync'
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

const LOAD_TIMEOUT_MS = 15_000

/**
 * What someone sees before they have a system: the welcome and sign-in
 * screen, then (once their account has loaded) first-run setup. Returning
 * users skip straight to the app because their account already has a system.
 */
function FirstRun({ onDone }: { onDone: () => void }) {
  const sync = useSync()
  const [guest, setGuest] = useState(false)
  const [setUpAnyway, setSetUpAnyway] = useState(false)
  const [slow, setSlow] = useState(false)
  const signedIn = sync.configured && sync.status !== 'signedOut'
  const loading = signedIn && sync.lastSynced === null && !sync.error

  useEffect(() => {
    setSlow(false)
    if (!loading) return
    const id = window.setTimeout(() => setSlow(true), LOAD_TIMEOUT_MS)
    return () => window.clearTimeout(id)
  }, [loading])

  const signOut = <Button size="sm" variant="ghost" label="Sign out" onClick={() => void sync.signOut()} />

  if (sync.checkingSession) return <Spinner label="Loading" />
  if (!signedIn && !guest) return <Welcome onGuest={() => setGuest(true)} />
  if (loading && !slow) return <Spinner label="Loading your account" />

  // Loading failed or is taking too long. Setting up now could bring back things
  // deleted on the account when it does load, so make that an explicit choice.
  if ((loading || sync.error) && !setUpAnyway) {
    return (
      <VStack gap={4}>
        <PageHeader title="Couldn't load your account" subtitle={`Signed in as ${sync.email ?? 'your account'}. Check your connection and try again.`} />
        <HStack gap={2} wrap="wrap">
          <Button variant="primary" label="Try again" onClick={sync.syncNow} isLoading={sync.status === 'syncing'} />
          {signOut}
        </HStack>
        <Button variant="ghost" label="I'm new here, set up anyway" onClick={() => setSetUpAnyway(true)} />
      </VStack>
    )
  }
  return <Onboarding onDone={onDone} />
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
  const sync = useSync()

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
        {sync.recoveringPassword ? (
          // A reset link signs you in; keep the new-password form up even once the account loads.
          <AccountSection />
        ) : ready ? (
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
          <FirstRun
            onDone={() => {
              go('home')
              requestAnimationFrame(focusPageTitle)
            }}
          />
        )}
        </VStack>
      </VStack>
    </AppShell>
  )
}
