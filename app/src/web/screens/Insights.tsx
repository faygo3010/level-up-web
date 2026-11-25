import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { AspectRatio } from '@astryxdesign/core/AspectRatio'
import { HStack } from '@astryxdesign/core/HStack'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { areaAdherence, bestStreak, currentStreak, scoreHistory } from '../../core/adherence'
import { addDays, dateRange, formatDay, monthKey, periodRange } from '../../core/dates'
import { goalProgress } from '../../core/progress'
import type { AppState, DateKey } from '../../core/types'
import { moneySummary, tradeStats, workoutSummary } from '../../core/stats'
import { Empty, PageHeader, Section, Stat, money, pct, plural } from '../components/ui'
import { useAreas, useStore } from '../store'

const HEATMAP_DAYS = 35

type HeatTone = 'default' | 'gray' | 'orange' | 'yellow' | 'teal' | 'green'

export function heatTone(score: number | null): HeatTone {
  if (score === null) return 'default'
  if (score >= 1) return 'green'
  if (score >= 0.8) return 'teal'
  if (score >= 0.5) return 'yellow'
  if (score > 0) return 'orange'
  return 'gray'
}

/** One honest sentence about trading discipline. */
export function tradingVerdict(followedPnl: number, brokenPnl: number, brokenCount: number, currency: string, followedCount = 1): string {
  if (brokenCount === 0) return 'Every trade this month followed the plan.'
  if (brokenPnl < 0) {
    const followed = followedCount > 0 ? ` Following them made ${money(followedPnl, currency)}.` : ' Every trade this month was off-plan.'
    return `Breaking your rules cost ${money(-brokenPnl, currency)} this month.${followed}`
  }
  return `Off-plan trades made ${money(brokenPnl, currency)} this month. Luck isn't a system; keep tracking.`
}

/** The numbers behind "how is my week going?", in one place. */
export function weekSummary(state: AppState, today: DateKey) {
  const start = addDays(today, -6)
  const avg = (end: DateKey) => {
    const s = scoreHistory(state, end, 7).map((h) => h.score).filter((x): x is number => x !== null)
    return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null
  }
  const days = dateRange(start, today)
  const rulesBroken = days.reduce((n, d) => n + Object.values(state.ruleChecks[d] ?? {}).filter((k) => k === false).length, 0)
  const spent = state.logs.reduce((s, l) => (l.kind === 'money' && l.date >= start && l.money.amount < 0 ? s - l.money.amount : s), 0)
  const budgetGoal = state.goals.find((g) => !g.archived && g.direction === 'atMost' && g.tracks === 'spending')
  const budget = budgetGoal
    ? { title: budgetGoal.title, used: goalProgress(budgetGoal, state.goalEntries, today, state.settings.weekStartsOn, state.logs).current / budgetGoal.target }
    : null
  return { adherence: avg(today), previous: avg(addDays(today, -7)), rulesBroken, trades: tradeStats(state.logs, start, today), spent, budget }
}

export function Insights() {
  const { state, today } = useStore()
  const { active } = useAreas()
  const { currency } = state.settings
  const history = scoreHistory(state, today, HEATMAP_DAYS)
  const scored = history.filter((h) => h.score !== null).slice(-30)
  const avg30 = scored.length ? scored.reduce((s, h) => s + (h.score ?? 0), 0) / scored.length : null
  const passing = history.filter((h) => h.score !== null && h.score >= state.settings.streakThreshold).length

  const month = periodRange(today, 'monthly', state.settings.weekStartsOn)
  const trades = tradeStats(state.logs, month.start, month.end)
  const cash = moneySummary(state.logs, monthKey(today))
  const workouts = workoutSummary(state.logs, month.start, month.end)
  const week = weekSummary(state, today)

  return (
    <VStack gap={6}>
      <PageHeader title="Insights" subtitle="How closely you're following your system." />

      <Section title="This week">
        <Grid columns={2} gap={2}>
          <Stat label="Adherence (7 days)" value={pct(week.adherence)} hint={week.adherence !== null && week.previous !== null ? `last week ${pct(week.previous)}` : undefined} />
          <Stat label="Rules broken" value={week.rulesBroken} />
          <Stat label="Trading P&L" value={money(week.trades.totalPnl, currency)} hint={plural(week.trades.count, 'trade')} />
          <Stat label="Spent" value={money(week.spent, currency)} hint={week.budget ? `${pct(week.budget.used)} of ${week.budget.title}` : undefined} />
        </Grid>
      </Section>

      <Grid columns={3} gap={2}>
        <Stat label="Current streak" value={`${currentStreak(state, today)}d`} hint={`days ≥ ${pct(state.settings.streakThreshold)}`} />
        <Stat label="Best (1 yr)" value={`${bestStreak(state, addDays(today, -364), today)}d`} />
        <Stat label="30-day adherence" value={pct(avg30)} />
      </Grid>

      <Section title={`Last ${HEATMAP_DAYS} days`}>
        <Text type="supporting" color="secondary">
          {passing} of the last {HEATMAP_DAYS} days met your streak target.
        </Text>
        <Grid columns={7} gap={1} role="list" aria-label="Daily adherence, oldest first">
          {history.map((h) => (
            <AspectRatio key={h.date} ratio={1} role="listitem" aria-label={`${formatDay(h.date)}: ${h.score === null ? 'nothing scheduled' : pct(h.score)}`}>
              <Card variant={heatTone(h.score)} height="100%" padding={0} />
            </AspectRatio>
          ))}
        </Grid>
        <HStack gap={1} wrap="wrap" aria-label="Legend">
          <Token label="All done" color="green" size="sm" />
          <Token label="Target met" color="teal" size="sm" />
          <Token label="Half or more" color="yellow" size="sm" />
          <Token label="Started" color="orange" size="sm" />
          <Token label="Missed" color="gray" size="sm" />
          <Token label="Nothing scheduled" color="default" size="sm" />
        </HStack>
      </Section>

      <Section title="By area (7 days)">
        {active.length === 0 ? (
          <Empty>No areas yet.</Empty>
        ) : (
          <VStack gap={3}>
            {active.map((a) => {
              const r = areaAdherence(state, a.id, today, 7)
              return (
                <ProgressBar
                  key={a.id}
                  label={`${a.icon} ${a.name}`}
                  value={Math.round((r ?? 0) * 100)}
                  max={100}
                  hasValueLabel
                  formatValueLabel={() => pct(r)}
                />
              )
            })}
          </VStack>
        )}
      </Section>

      <Section title="Trading this month">
        {trades.count === 0 ? (
          <Empty>No trades logged this month.</Empty>
        ) : (
          <VStack gap={3}>
            <Grid columns={3} gap={2}>
              <Stat label="P&L" value={money(trades.totalPnl, currency)} />
              <Stat label="Win rate" value={pct(trades.winRate)} hint={plural(trades.count, 'trade')} />
              <Stat label="Followed plan" value={pct(trades.planAdherence)} />
            </Grid>
            <Banner
              status={trades.broken.count > 0 && trades.broken.pnl < 0 ? 'warning' : 'info'}
              title={tradingVerdict(trades.followed.pnl, trades.broken.pnl, trades.broken.count, currency, trades.followed.count)}
            />
          </VStack>
        )}
      </Section>

      <Section title="Money this month">
        {cash.income === 0 && cash.spending === 0 ? (
          <Empty>No money entries this month.</Empty>
        ) : (
          <VStack gap={3}>
            <Grid columns={3} gap={2}>
              <Stat label="In" value={money(cash.income, currency)} />
              <Stat label="Out" value={money(cash.spending, currency)} />
              <Stat label="Net" value={money(cash.net, currency)} />
            </Grid>
            {cash.byCategory.slice(0, 5).map((c) => (
              <ProgressBar
                key={c.category}
                label={c.category}
                value={c.total}
                max={cash.spending || 1}
                hasValueLabel
                formatValueLabel={() => money(c.total, currency)}
                variant="neutral"
              />
            ))}
          </VStack>
        )}
      </Section>

      <Section title="Training this month">
        <Grid columns={2} gap={2}>
          <Stat label="Sessions" value={workouts.sessions} />
          <Stat label="Minutes" value={workouts.minutes} />
        </Grid>
      </Section>
    </VStack>
  )
}
