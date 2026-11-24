import { useEffect, useState, type ReactNode } from 'react'
import type { GoalStatus } from '../../core/progress'

export function ProgressBar({ ratio, color, status }: { ratio: number; color?: string; status?: GoalStatus }) {
  const pct = Math.round(Math.max(0, Math.min(ratio, 1)) * 100)
  const tone = status === 'behind' ? 'warn' : status === 'over' ? 'bad' : status === 'done' ? 'good' : ''
  return (
    <div className={`bar ${tone}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="bar-fill" style={{ width: `${pct}%`, background: tone ? undefined : color }} />
    </div>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

export function Dot({ color }: { color: string }) {
  return <span className="dot" style={{ background: color }} aria-hidden />
}

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  )
}

export const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`)

export function money(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  return `${sign}${currency}${abs.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}

/**
 * Two-tap confirm for destructive actions. Works everywhere, including
 * embedded viewers where window.confirm() is blocked.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  className = 'btn ghost danger',
  ariaLabel,
}: {
  label: ReactNode
  confirmLabel: string
  onConfirm: () => void
  className?: string
  ariaLabel?: string
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      className={`${className} ${armed ? 'armed' : ''}`}
      aria-label={armed ? confirmLabel : ariaLabel}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    >
      {armed ? confirmLabel : label}
    </button>
  )
}
