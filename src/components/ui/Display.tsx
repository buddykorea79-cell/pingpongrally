import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from '@/lib/utils'

type BadgeTone = 'neutral' | 'ping' | 'pong' | 'reply' | 'poll' | 'success' | 'warning' | 'danger' | 'inverse' | 'outline'

// 색을 채운 알약 대신, 옅은 바탕 + 같은 계열 글자로 조용하게 표시한다.
const badgeTones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-3 text-fg-2',
  ping: 'bg-ping-50 text-ping-700 dark:bg-ping-950/60 dark:text-ping-300',
  pong: 'bg-pong-50 text-pong-700 dark:bg-pong-950/60 dark:text-pong-300',
  reply: 'bg-reply-50 text-reply-700 dark:bg-reply-950/60 dark:text-reply-300',
  poll: 'bg-poll-50 text-poll-700 dark:bg-poll-950/60 dark:text-poll-300',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  inverse: 'bg-inverse text-on-inverse',
  outline: 'text-fg-2 ring-1 ring-inset ring-line-strong',
}

export function Badge({
  tone = 'neutral',
  children,
  className,
  icon,
  size = 'md',
}: {
  tone?: BadgeTone
  children: ReactNode
  className?: string
  icon?: ReactNode
  size?: 'sm' | 'md'
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-medium [&_svg]:size-3.5 [&_svg]:stroke-[1.75]',
        size === 'md' ? 'h-6 px-2.5 text-xs' : 'h-5 px-2 text-[11px]',
        badgeTones[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}

export function LiveDot({ className, tone = 'success' }: { className?: string; tone?: 'success' | 'ping' | 'warning' | 'muted' }) {
  return (
    <span
      className={cn(
        'relative inline-block size-2 shrink-0 rounded-full',
        tone === 'success' && 'animate-live-dot bg-success text-success',
        tone === 'ping' && 'animate-live-dot bg-ping-500 text-ping-500',
        tone === 'warning' && 'bg-warning',
        tone === 'muted' && 'bg-fg-3',
        className,
      )}
    />
  )
}

export function Avatar({
  name,
  color,
  size = 'md',
  host,
  className,
}: {
  name: string
  color?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  host?: boolean
  className?: string
}) {
  const initial = host ? '강' : (name.trim()[0] ?? '?')
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full font-medium text-white',
        size === 'xs' && 'size-5 text-[10px]',
        size === 'sm' && 'size-7 text-xs',
        size === 'md' && 'size-9 text-sm',
        size === 'lg' && 'size-12 text-lg',
        size === 'xl' && 'size-20 text-3xl font-light',
        host && 'bg-ink-900 ring-1 ring-ping-500 ring-offset-2 ring-offset-surface dark:bg-ink-700',
        className,
      )}
      style={host ? undefined : { background: color ?? '#5A68F8' }}
    >
      {initial}
    </span>
  )
}

export function Card({ className, children, padded = true, ...rest }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return (
    <div className={cn('rounded-2xl bg-surface ring-1 ring-line', padded && 'p-5 sm:p-6', className)} {...rest}>
      {children}
    </div>
  )
}

export function SectionTitle({ children, aside, className, sub }: { children: ReactNode; aside?: ReactNode; className?: string; sub?: ReactNode }) {
  return (
    <div className={cn('mb-3 flex items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h3 className="text-[15px] font-medium tracking-tight text-fg">{children}</h3>
        {sub && <p className="mt-0.5 text-[13px] text-fg-3">{sub}</p>}
      </div>
      {aside}
    </div>
  )
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded-md bg-white/10 px-1.5 font-mono text-[11px] ring-1 ring-inset ring-white/15">
      {children}
    </kbd>
  )
}

export function Stat({ label, value, sub, tone, className }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: 'ping' | 'pong' | 'reply' | 'poll' | 'danger'; className?: string }) {
  return (
    <div className={cn('rounded-2xl bg-surface p-4 ring-1 ring-line', className)}>
      <p className="text-[13px] text-fg-3">{label}</p>
      <p
        className={cn(
          'tabular mt-2 text-[28px] font-light leading-none tracking-tight',
          tone === 'ping' && 'text-ping-500',
          tone === 'pong' && 'text-pong-500',
          tone === 'reply' && 'text-reply-500',
          tone === 'poll' && 'text-poll-500',
          tone === 'danger' && 'text-danger',
          !tone && 'text-fg',
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-1.5 text-xs text-fg-3">{sub}</p>}
    </div>
  )
}

/** PingPongRally 로고: 공(핑)과 점(퐁) 사이를 오가는 가는 궤적 */
export function LogoMark({ className, mono }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={cn('size-7', className)} aria-hidden fill="none">
      <path d="M8 23.5C10 14 16.5 9 23 9.5" stroke="currentColor" strokeOpacity={mono ? 0.6 : 0.35} strokeWidth="1.2" strokeLinecap="round" strokeDasharray="0.1 3.2" />
      <circle cx="8" cy="23.5" r="3" className={mono ? 'fill-white' : 'fill-pong-500'} />
      <circle cx="23.5" cy="9.5" r="4.5" className="fill-ping-500" />
    </svg>
  )
}

export function Logo({ className, compact, size = 'md' }: { className?: string; compact?: boolean; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark className={cn(size === 'sm' && 'size-6', size === 'md' && 'size-7', size === 'lg' && 'size-9')} />
      {!compact && (
        <span className={cn('font-normal tracking-[-0.02em]', size === 'sm' && 'text-[15px]', size === 'md' && 'text-[16px]', size === 'lg' && 'text-[22px]')}>
          PingPong<span className="font-light text-fg-3">Rally</span>
        </span>
      )}
    </span>
  )
}

export function Divider({ className, label }: { className?: string; label?: ReactNode }) {
  if (!label) return <div className={cn('h-px bg-line', className)} />
  return (
    <div className={cn('flex items-center gap-3 text-xs text-fg-3', className)}>
      <span className="h-px flex-1 bg-line" />
      {label}
      <span className="h-px flex-1 bg-line" />
    </div>
  )
}
