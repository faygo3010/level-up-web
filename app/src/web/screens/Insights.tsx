import { Banner } from '@astryxdesign/core/Banner'
import { Card } from '@astryxdesign/core/Card'
import { Grid } from '@astryxdesign/core/Grid'
import { List, ListItem } from '@astryxdesign/core/List'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { AspectRatio } from '@astryxdesign/core/AspectRatio'
import { VStack } from '@astryxdesign/core/VStack'
import { areaAdherence, bestStreak, currentStreak, scoreHistory } from '../../core/adherence'
import { addDays, formatDay, monthKey, periodRange } from '../../core/dates'
import type { AppState } from '../../core/types'
import { moneySummary, tradeStats, workoutSummary } from '../../core/stats'
import { weekSummary } from '../../core/summary'

export { weekSummary }
import { Empty, HeatLegend, PageHeader, Section, Stat, heatTone, money, pct, plural } from '../components/ui'
import { useAreas, useStore } from '../store'
import { amountOf, headline } from '../components/logText'

const HEATMAP_DAYS = 35

/** Below this many trades, comparing on-plan and off-plan results is mostly noise. */
export const MIN_TRADES_TO_COMPARE = 10

/** Plain facts about trading discipline. No causal claims from small samples. */
export function tradingVerdict(
  followed: { count: number; pnl: number },
  broken: { count: number; pnl: number },
  currency: string,
): string {
  if (broken.count === 0) return 'Every trade this month followed the plan.'
  const off = `Off-plan: ${money(broken.pnl, currency)} across ${plural(broken.count, 'trade')}.`
  const on = followed.count > 0 ? ` On-plan: ${money(followed.pnl, currency)} across ${plural(followed.count, 'trade')}.` : ' No on-plan trades yet.'
  const total = followed.count + broken.count
  const note = total < MIN_TRADES_TO_COMPARE ? ` Too few trades (${total}) to read much into the difference yet.` : ''
  return `${off}${on}${note}`
}

/** The largest money-out entries in a month, with their reasons. */
export function biggestSpends(state: AppState, month: string, limit = 5) {
  return state.logs
    .filter((l) => l.kind === 'money' && l.money.amount < 0 && monthKey(l.date) === month)
    .sort((a, b) => (a.kind === 'money' && b.kind === 'money' ? a.money.amount - b.money.amount : 0))
    .slice(0, limit)
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
  const bigSpends = biggestSpends(state, monthKey(today))

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
        <HeatLegend />
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
              <Stat label="Win rate" value={pct(trades.winRate)} hint={`${trades.wins}W · ${trades.losses}L · ${trades.breakeven} BE`} />
              <Stat label="Followed plan" value={pct(trades.planAdherence)} />
              <Stat label="Avg win" value={money(trades.avgWin, currency)} />
              <Stat label="Avg loss" value={money(trades.avgLoss, currency)} />
              <Stat label="Per trade" value={money(trades.expectancy, currency)} hint="expectancy" />
            </Grid>
            <Banner
              status={trades.broken.count > 0 ? 'warning' : 'info'}
              title={tradingVerdict(trades.followed, trades.broken, currency)}
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
            {bigSpends.length > 0 && (
              <VStack gap={1}>
                <Text type="label">Biggest spends</Text>
                <List hasDividers>
                  {bigSpends.map((l) => (
                    <ListItem
                      key={l.id}
                      label={headline(l)}
                      description={`${formatDay(l.date)} · ${l.kind === 'money' ? l.money.category : ''}`}
                      endContent={
                        <Text weight="semibold" hasTabularNumbers>
                          {amountOf(l, currency)?.text}
                        </Text>
                      }
                    />
                  ))}
                </List>
              </VStack>
            )}
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
