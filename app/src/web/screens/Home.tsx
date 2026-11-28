import { AspectRatio } from '@astryxdesign/core/AspectRatio'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { ClickableCard } from '@astryxdesign/core/ClickableCard'
import { Grid } from '@astryxdesign/core/Grid'
import { HStack } from '@astryxdesign/core/HStack'
import { List, ListItem } from '@astryxdesign/core/List'
import { ProgressBar } from '@astryxdesign/core/ProgressBar'
import { Text } from '@astryxdesign/core/Text'
import { VStack } from '@astryxdesign/core/VStack'
import { areaAdherence, currentStreak, dayScore, scheduledRoutines, scoreHistory } from '../../core/adherence'
import { formatDay } from '../../core/dates'
import { goalProgress } from '../../core/progress'
import { weekSummary } from '../../core/summary'
import { describeProgress } from '../components/GoalRow'
import { AreaTag, Empty, PageHeader, Section, Stat, heatTone, money, pct, plural, statusVariant } from '../components/ui'
import { useAreas, useStore } from '../store'
import { amountOf, headline } from './Journal'

const go = (hash: string) => () => {
  window.location.hash = hash
}

export function greeting(hour: number, name?: string): string {
  const part = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}.` : `${part}.`
}

/** One line on what's left today: the next routines, then rules still to review. */
export function nextUp(routines: readonly string[], rulesLeft: number): string {
  if (routines.length > 0) return `Up next: ${routines.join(' · ')}`
  if (rulesLeft > 0) return `Routines done. ${plural(rulesLeft, 'rule')} left to check.`
  return 'Everything done today. Nice work.'
}

/** The dashboard: how today and this week are going, with a way into everything else. */
export function Home() {
  const { state, today } = useStore()
  const { active, byId } = useAreas()
  const { currency, name } = state.settings
  const score = dayScore(state, today)
  const streak = currentStreak(state, today)
  const week = weekSummary(state, today)
  const done = new Set(state.completions[today] ?? [])
  const upNext = scheduledRoutines(state, today).filter((r) => !done.has(r.id)).slice(0, 3)
  const rulesLeft = state.rules.filter((r) => !r.archived && state.ruleChecks[today]?.[r.id] === undefined).length
  const goals = state.goals.filter((g) => !g.archived)
  const recent = [...state.logs].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 3)
  const last7 = scoreHistory(state, today, 7)
  const hasTrading = state.logs.some((l) => l.kind === 'trade') || active.some((a) => a.id === 'trading')

  return (
    <VStack gap={6}>
      <PageHeader eyebrow={formatDay(today)} title={greeting(new Date().getHours(), name)} subtitle="Here's how your system is going." />

      <Card padding={4}>
        <VStack gap={3}>
          <HStack justify="between" vAlign="center" gap={2}>
            <Text type="large" weight="bold">
              Today
            </Text>
            <Text color="secondary" hasTabularNumbers>
              {score.total === 0 ? 'Nothing scheduled' : `${score.done} of ${score.total} done`}
            </Text>
          </HStack>
          <ProgressBar label="Today's progress" isLabelHidden value={score.done} max={Math.max(score.total, 1)} variant={score.total > 0 && score.done === score.total ? 'success' : 'accent'} />
          {score.total > 0 && <Text color="secondary">{nextUp(upNext.map((r) => r.title), rulesLeft)}</Text>}
          <Button variant="primary" label="Open today's checklist" onClick={go('today')} />
        </VStack>
      </Card>

      <Grid columns={2} gap={2}>
        <Stat label="Streak" value={`${streak}d`} hint={`days ≥ ${pct(state.settings.streakThreshold)}`} />
        <Stat label="Last 7 days" value={pct(week.adherence)} hint={week.previous !== null ? `week before ${pct(week.previous)}` : 'adherence'} />
        {hasTrading && <Stat label="Trading this week" value={money(week.trades.totalPnl, currency)} hint={plural(week.trades.count, 'trade')} />}
        <Stat label="Spent this week" value={money(week.spent, currency)} hint={week.budget ? `${pct(week.budget.used)} of ${week.budget.title}` : undefined} />
      </Grid>

      <Section title="This week" action={<Button size="sm" variant="ghost" label="Open calendar" onClick={go('calendar')} />}>
        <Grid columns={7} gap={1} role="list" aria-label="Last 7 days, oldest first">
          {last7.map((h) => (
            <VStack key={h.date} gap={0.5} role="listitem" aria-label={`${formatDay(h.date)}: ${h.score === null ? 'nothing scheduled' : pct(h.score)}`}>
              <AspectRatio ratio={1}>
                <Card variant={heatTone(h.score)} height="100%" padding={0} />
              </AspectRatio>
              <Text type="supporting" color="secondary" aria-hidden>
                {formatDay(h.date).slice(0, 2)}
              </Text>
            </VStack>
          ))}
        </Grid>
      </Section>

      <Section title="Goals" action={<Button size="sm" variant="ghost" label="Edit goals" onClick={go('areas')} />}>
        {goals.length === 0 ? (
          <Empty>No goals yet. Add one in Areas.</Empty>
        ) : (
          <VStack gap={4}>
            {goals.map((g) => {
              const p = goalProgress(g, state.goalEntries, today, state.settings.weekStartsOn, state.logs)
              return (
                <VStack key={g.id} gap={1}>
                  <ProgressBar
                    label={`${byId.get(g.areaId)?.icon ?? ''} ${g.title}`.trim()}
                    value={Math.round(p.ratio * 100)}
                    max={100}
                    variant={statusVariant(p.status)}
                  />
                  <Text type="supporting" color="secondary">
                    {describeProgress(g, p)}
                  </Text>
                </VStack>
              )
            })}
          </VStack>
        )}
      </Section>

      {active.length > 0 && (
        <Section title="Your areas">
          <Grid columns={{ minWidth: 150 }} gap={2}>
            {active.map((a) => {
              const r = areaAdherence(state, a.id, today, 7)
              return (
                <ClickableCard key={a.id} label={`${a.name}: ${pct(r)} over 7 days`} onClick={go('areas')} padding={3}>
                  <VStack gap={1}>
                    <Text weight="semibold">
                      {a.icon} {a.name}
                    </Text>
                    <Text type="supporting" color="secondary">
                      {r === null ? 'Nothing scheduled yet' : `${pct(r)} over 7 days`}
                    </Text>
                  </VStack>
                </ClickableCard>
              )
            })}
          </Grid>
        </Section>
      )}

      <Section title="Recent journal" action={<Button size="sm" variant="ghost" label="Open journal" onClick={go('journal')} />}>
        {recent.length === 0 ? (
          <Empty>Nothing logged yet. Log a trade, workout or spend in Journal.</Empty>
        ) : (
          <List hasDividers>
            {recent.map((l) => {
              const amount = amountOf(l, currency)
              return (
                <ListItem
                  key={l.id}
                  label={headline(l)}
                  description={formatDay(l.date)}
                  startContent={<AreaTag area={byId.get(l.areaId)} />}
                  endContent={
                    amount && (
                      <Text weight="semibold" hasTabularNumbers color={amount.positive ? 'primary' : 'accent'}>
                        {amount.text}
                      </Text>
                    )
                  }
                />
              )
            })}
          </List>
        )}
      </Section>
    </VStack>
  )
}
