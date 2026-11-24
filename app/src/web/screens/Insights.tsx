import { areaAdherence, bestStreak, currentStreak, scoreHistory } from '../../core/adherence'
import { addDays, formatDay, monthKey, periodRange } from '../../core/dates'
import { moneySummary, tradeStats, workoutSummary } from '../../core/stats'
import { Empty, ProgressBar, Section, Stat, money, pct } from '../components/ui'
import { useAreas, useStore } from '../store'

const HEATMAP_DAYS = 35

function heatLevel(score: number | null): string {
  if (score === null) return 'rest'
  if (score >= 1) return 'l4'
  if (score >= 0.8) return 'l3'
  if (score >= 0.5) return 'l2'
  if (score > 0) return 'l1'
  return 'l0'
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
  const scored = history.filter((h) => h.score !== null)
  const avg30 = scored.length ? scored.slice(-30).reduce((s, h) => s + (h.score ?? 0), 0) / Math.min(scored.length, 30) : null

  const month = periodRange(today, 'monthly', state.settings.weekStartsOn)
  const trades = tradeStats(state.logs, month.start, month.end)
  const cash = moneySummary(state.logs, monthKey(today))
  const workouts = workoutSummary(state.logs, month.start, month.end)

  return (
    <div className="screen">
      <header className="hero-head">
        <h1>Insights</h1>
        <p className="sub">How closely you're following your system.</p>
      </header>

      <div className="stats">
        <Stat label="Current streak" value={`${currentStreak(state, today)}d`} hint={`days ≥ ${pct(state.settings.streakThreshold)}`} />
        <Stat label="Best (1 yr)" value={`${bestStreak(state, addDays(today, -364), today)}d`} />
        <Stat label="30-day adherence" value={pct(avg30)} />
      </div>

      <Section title={`Last ${HEATMAP_DAYS} days`}>
        <div className="heatmap" role="img" aria-label="Daily adherence heatmap">
          {history.map((h) => (
            <span key={h.date} className={`heat ${heatLevel(h.score)}`} title={`${formatDay(h.date)}: ${pct(h.score)}`} />
          ))}
        </div>
      </Section>

      <Section title="By area (7 days)">
        {active.map((a) => {
          const r = areaAdherence(state, a.id, today, 7)
          return (
            <div key={a.id} className="area-row">
              <div className="goal-top">
                <span>
                  {a.icon} {a.name}
                </span>
                <span className="goal-num">{pct(r)}</span>
              </div>
              <ProgressBar ratio={r ?? 0} color={a.color} />
            </div>
          )
        })}
      </Section>

      <Section title="Trading this month">
        {trades.count === 0 ? (
          <Empty>No trades logged this month.</Empty>
        ) : (
          <>
            <div className="stats">
              <Stat label="P&L" value={<span className={trades.totalPnl >= 0 ? 'pos' : 'neg'}>{money(trades.totalPnl, currency)}</span>} />
              <Stat label="Win rate" value={pct(trades.winRate)} hint={`${trades.count} trades`} />
              <Stat label="Followed plan" value={pct(trades.planAdherence)} />
            </div>
            <p className="verdict">{tradingVerdict(trades.followed.pnl, trades.broken.pnl, trades.broken.count, currency)}</p>
          </>
        )}
      </Section>

      <Section title="Money this month">
        {cash.income === 0 && cash.spending === 0 ? (
          <Empty>No money entries this month.</Empty>
        ) : (
          <>
            <div className="stats">
              <Stat label="In" value={money(cash.income, currency)} />
              <Stat label="Out" value={money(cash.spending, currency)} />
              <Stat label="Net" value={<span className={cash.net >= 0 ? 'pos' : 'neg'}>{money(cash.net, currency)}</span>} />
            </div>
            {cash.byCategory.slice(0, 5).map((c) => (
              <div key={c.category} className="area-row">
                <div className="goal-top">
                  <span>{c.category}</span>
                  <span className="goal-num">{money(c.total, currency)}</span>
                </div>
                <ProgressBar ratio={cash.spending ? c.total / cash.spending : 0} color="#c4b5fd" />
              </div>
            ))}
          </>
        )}
      </Section>

      <Section title="Training this month">
        <div className="stats">
          <Stat label="Sessions" value={workouts.sessions} />
          <Stat label="Minutes" value={workouts.minutes} />
        </div>
      </Section>
    </div>
  )
}
