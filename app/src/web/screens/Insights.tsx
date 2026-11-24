import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { VisuallyHidden } from '@astryxdesign/core/VisuallyHidden'
import { VStack } from '@astryxdesign/core/VStack'
import { areaAdherence, bestStreak, currentStreak, scoreHistory } from '../../core/adherence'
import { addDays, formatDay, monthKey, periodRange } from '../../core/dates'
import { moneySummary, tradeStats, workoutSummary } from '../../core/stats'
import { Empty, PageHeader, Section, Stat, money, pct } from '../components/ui'
import { useAreas, useStore } from '../store'

const HEATMAP_DAYS = 35

type HeatTone = 'default' | 'muted' | 'orange' | 'yellow' | 'teal' | 'green'

export function heatTone(score: number | null): HeatTone {
  if (score === null) return 'default'
  if (score >= 1) return 'green'
  if (score >= 0.8) return 'teal'
  if (score >= 0.5) return 'yellow'
  if (score > 0) return 'orange'
  return 'muted'
}

/** One honest sentence about trading discipline. */
export function tradingVerdict(followedPnl: number, brokenPnl: number, brokenCount: number, currency: string): string {
  if (brokenCount === 0) return 'Every trade this month followed the plan.'
  if (brokenPnl < 0) return `Breaking your rules cost ${money(-brokenPnl, currency)} this month. Following them made ${money(followedPnl, currency)}.`
  return `Off-plan trades made ${money(brokenPnl, currency)} this month. Luck isn't a system; keep tracking.`
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

  return (
    <VStack gap={6}>
      <PageHeader title="Insights" subtitle="How closely you're following your system." />

      <Grid columns={3} gap={2}>
        <Stat label="Current streak" value={`${currentStreak(state, today)}d`} hint={`days ≥ ${pct(state.settings.streakThreshold)}`} />
        <Stat label="Best (1 yr)" value={`${bestStreak(state, addDays(today, -364), today)}d`} />
        <Stat label="30-day adherence" value={pct(avg30)} />
      </Grid>

      <Section title={`Last ${HEATMAP_DAYS} days`}>
        <Grid columns={7} gap={1} role="img" aria-label={`Daily adherence heatmap: ${passing} of the last ${HEATMAP_DAYS} days met your streak target`}>
          {history.map((h) => (
            <Card key={h.date} variant={heatTone(h.score)} minHeight={32} padding={0} aria-hidden>
              <VisuallyHidden>{`${formatDay(h.date)}: ${pct(h.score)}`}</VisuallyHidden>
            </Card>
          ))}
        </Grid>
        <Text type="supporting" color="secondary">
          Green: everything done. Teal: streak target met. Yellow: half or more. Orange: started. Grey: missed. Outlined: before you started or nothing scheduled.
        </Text>
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
              <Stat label="Win rate" value={pct(trades.winRate)} hint={`${trades.count} trades`} />
              <Stat label="Followed plan" value={pct(trades.planAdherence)} />
            </Grid>
            <Banner
              status={trades.broken.count > 0 && trades.broken.pnl < 0 ? 'warning' : 'info'}
              title={tradingVerdict(trades.followed.pnl, trades.broken.pnl, trades.broken.count, currency)}
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
