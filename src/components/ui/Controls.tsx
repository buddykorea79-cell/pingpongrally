import { useId, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
  size = 'md',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label?: ReactNode
  description?: ReactNode
  disabled?: boolean
  className?: string
  size?: 'sm' | 'md'
}) {
  const id = useId()
  const track = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50',
        size === 'md' ? 'h-6 w-10' : 'h-5 w-9',
        checked ? 'bg-inverse' : 'bg-line-strong',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] rounded-full bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.2)] transition-transform duration-200 ease-[var(--ease-out-expo)]',
          size === 'md' ? 'left-[3px] size-[18px]' : 'left-[2px] top-[2px] size-4',
          checked && (size === 'md' ? 'translate-x-4' : 'translate-x-4'),
        )}
      />
    </button>
  )
  if (!label) return track
  return (
    <div className={cn('flex items-start justify-between gap-4', className)}>
      <label htmlFor={id} className="min-w-0 cursor-pointer">
        <span className="block text-[15px] text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-relaxed text-fg-2">{description}</span>}
      </label>
      {track}
    </div>
  )
}

export function Checkbox({
  checked,
  onChange,
  children,
  disabled,
  className,
  tone = 'pong',
  shape = 'square',
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children?: ReactNode
  disabled?: boolean
  className?: string
  tone?: 'pong' | 'ping' | 'poll'
  shape?: 'square' | 'round'
}) {
  const id = useId()
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start gap-3 select-none', disabled && 'cursor-not-allowed opacity-50', className)}>
      <span className="relative mt-[1px] flex shrink-0">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span
          className={cn(
            'flex size-5 items-center justify-center ring-1 ring-inset transition-all duration-150 peer-focus-visible:outline-[1.5px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-fg',
            shape === 'square' ? 'rounded-[5px]' : 'rounded-full',
            checked
              ? cn(
                  'ring-transparent text-white',
                  tone === 'pong' && 'bg-inverse text-on-inverse',
                  tone === 'ping' && 'bg-inverse text-on-inverse',
                  tone === 'poll' && 'bg-poll-500',
                )
              : 'bg-surface ring-fg-3/60',
          )}
        >
          <Check className={cn('size-3.5 stroke-[2.5] transition-transform duration-150', checked ? 'scale-100' : 'scale-0')} />
        </span>
      </span>
      {children && <span className="min-w-0 flex-1 text-[15px] leading-snug text-fg">{children}</span>}
    </label>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  block,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; icon?: ReactNode }[]
  size?: 'sm' | 'md'
  className?: string
  block?: boolean
}) {
  return (
    <div role="tablist" className={cn('inline-flex rounded-lg bg-surface-3 p-0.5', block && 'flex w-full', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md transition-all duration-150 [&_svg]:size-4 [&_svg]:stroke-[1.6]',
              size === 'md' ? 'h-8 px-3.5 text-[13px]' : 'h-7 px-2.5 text-xs',
              active ? 'bg-surface text-fg shadow-raised ring-1 ring-line' : 'text-fg-3 hover:text-fg',
            )}
          >
            {o.icon}
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function RadioCards<T extends string>({
  value,
  onChange,
  options,
  columns = 3,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; title: ReactNode; description?: ReactNode; icon?: ReactNode }[]
  columns?: 1 | 2 | 3
  className?: string
}) {
  return (
    <div
      role="radiogroup"
      className={cn('grid gap-2.5', columns === 3 && 'sm:grid-cols-3', columns === 2 && 'sm:grid-cols-2', className)}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'group relative flex flex-col items-start rounded-xl p-4 text-left ring-1 ring-inset transition-all duration-150',
              active ? 'bg-surface ring-fg' : 'bg-surface ring-line-strong hover:ring-fg-3/60',
            )}
          >
            <span
              className={cn(
                'absolute right-3.5 top-3.5 flex size-4 items-center justify-center rounded-full ring-1 ring-inset transition-colors',
                active ? 'bg-inverse ring-inverse' : 'ring-fg-3/60',
              )}
            >
              <span className={cn('size-1.5 rounded-full bg-on-inverse transition-transform', active ? 'scale-100' : 'scale-0')} />
            </span>
            {o.icon && <span className={cn('mb-2.5 [&_svg]:size-5 [&_svg]:stroke-[1.5]', active ? 'text-fg' : 'text-fg-3')}>{o.icon}</span>}
            <span className="pr-6 text-[15px] text-fg">{o.title}</span>
            {o.description && <span className="mt-1 text-[13px] leading-relaxed text-fg-2">{o.description}</span>}
          </button>
        )
      })}
    </div>
  )
}
