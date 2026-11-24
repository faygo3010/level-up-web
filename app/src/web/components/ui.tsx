import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { EmptyState } from '@astryxdesign/core/EmptyState'
import { Heading } from '@astryxdesign/core/Heading'
import { HStack } from '@astryxdesign/core/HStack'
import { StackItem } from '@astryxdesign/core/Stack'
import { Text } from '@astryxdesign/core/Text'
import { Token } from '@astryxdesign/core/Token'
import { VStack } from '@astryxdesign/core/VStack'
import { useEffect, useState, type ReactNode } from 'react'
import type { GoalStatus } from '../../core/progress'
import type { Area } from '../../core/types'

/** Area colours are stored as hex (shared with the AI connector); map them onto Astryx's colour roles. */
const AREA_TONES: Record<string, TokenColor> = {
  '#7dd3fc': 'cyan',
  '#86efac': 'green',
  '#fcd34d': 'yellow',
  '#c4b5fd': 'purple',
  '#f9a8d4': 'pink',
  '#fdba74': 'orange',
  '#5eead4': 'teal',
}
export type TokenColor = 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'teal' | 'cyan' | 'blue' | 'purple' | 'pink' | 'gray'
export const areaTone = (color: string): TokenColor => AREA_TONES[color.toLowerCase()] ?? 'gray'

export function AreaTag({ area }: { area: Area | undefined }) {
  if (!area) return null
  return <Token label={area.name} color={areaTone(area.color)} size="sm" />
}

/** Progress bar colour carries the goal's status, so it reads at a glance. */
export const statusVariant = (status?: GoalStatus) =>
  status === 'behind' ? 'warning' : status === 'over' ? 'error' : status === 'done' ? 'success' : 'accent'

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <HStack justify="between" vAlign="start" gap={3}>
      <StackItem size="fill">
        <VStack gap={1}>
        {eyebrow && (
          <Text type="label" color="secondary">
            {eyebrow}
          </Text>
        )}
        <Heading level={1}>{title}</Heading>
          {subtitle && <Text color="secondary">{subtitle}</Text>}
        </VStack>
      </StackItem>
      {action && <StackItem size="static">{action}</StackItem>}
    </HStack>
  )
}

export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <VStack gap={2} as="section">
      <HStack justify="between" vAlign="center">
        <Heading level={2}>{title}</Heading>
        {action}
      </HStack>
      {children}
    </VStack>
  )
}

export function Empty({ title, children }: { title?: string; children: string }) {
  return <EmptyState title={title ?? children} description={title ? children : undefined} isCompact headingLevel={3} />
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <Card padding={3}>
      <VStack gap={0.5}>
        <Text type="large" weight="bold" hasTabularNumbers>
          {value}
        </Text>
        <Text type="supporting" color="secondary">
          {label}
        </Text>
        {hint && (
          <Text type="supporting" color="secondary">
            {hint}
          </Text>
        )}
      </VStack>
    </Card>
  )
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

export const pct = (r: number | null): string => (r === null ? '—' : `${Math.round(r * 100)}%`)

export function money(amount: number, currency: string): string {
  const sign = amount < 0 ? '-' : ''
  return `${sign}${currency}${Math.abs(amount).toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
}

/**
 * Two-tap confirm for destructive actions. Works everywhere, including
 * embedded viewers where window.confirm() is blocked.
 */
export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = 'ghost',
  size = 'md',
}: {
  label: string
  confirmLabel: string
  onConfirm: () => void
  variant?: 'secondary' | 'ghost' | 'destructive'
  size?: 'sm' | 'md'
}) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <Button
      size={size}
      variant={armed ? 'destructive' : variant}
      label={armed ? confirmLabel : label}
      onClick={() => {
        if (!armed) return setArmed(true)
        setArmed(false)
        onConfirm()
      }}
    />
  )
}
