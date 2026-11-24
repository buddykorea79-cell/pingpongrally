import { forwardRef, useEffect, useImperativeHandle, useRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const fieldBase =
  'w-full rounded-lg bg-surface text-[15px] text-fg ring-1 ring-inset ring-line-strong transition-[box-shadow,background] duration-150 placeholder:text-fg-3/80 hover:ring-fg-3/50 focus:outline-none focus:ring-fg/60 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-fg-3 aria-[invalid=true]:ring-danger'

export function Label({ children, htmlFor, required, optional, className }: { children: ReactNode; htmlFor?: string; required?: boolean; optional?: boolean; className?: string }) {
  return (
    <label htmlFor={htmlFor} className={cn('mb-2 flex items-center gap-1.5 text-[13px] text-fg-2', className)}>
      {children}
      {required && <span className="text-ping-500" aria-label="필수">*</span>}
      {optional && <span className="text-fg-3">(선택)</span>}
    </label>
  )
}

export function Field({
  label,
  htmlFor,
  required,
  optional,
  hint,
  error,
  children,
  className,
  aside,
}: {
  label?: ReactNode
  htmlFor?: string
  required?: boolean
  optional?: boolean
  hint?: ReactNode
  error?: string | null
  children: ReactNode
  className?: string
  aside?: ReactNode
}) {
  return (
    <div className={className}>
      {label && (
        <div className="flex items-end justify-between gap-2">
          <Label htmlFor={htmlFor} required={required} optional={optional}>
            {label}
          </Label>
          {aside && <div className="mb-1.5 text-xs text-fg-3">{aside}</div>}
        </div>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg-3">{hint}</p>
      ) : null}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode
  trailing?: ReactNode
  inputSize?: 'md' | 'lg'
  invalid?: boolean
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, leading, trailing, inputSize = 'md', invalid, ...rest },
  ref,
) {
  return (
    <div className="relative">
      {leading && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-fg-3 [&_svg]:size-[17px] [&_svg]:stroke-[1.5]">{leading}</span>}
      <input
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(fieldBase, inputSize === 'md' ? 'h-10 px-3.5' : 'h-12 px-4 text-base', leading && 'pl-10', trailing && 'pr-11', className)}
        {...rest}
      />
      {trailing && <span className="absolute inset-y-0 right-2 flex items-center">{trailing}</span>}
    </div>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  autoGrow?: boolean
  maxRows?: number
  invalid?: boolean
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, autoGrow = true, maxRows = 12, invalid, onInput, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement>(null)
  useImperativeHandle(ref, () => inner.current!)
  const resize = () => {
    const el = inner.current
    if (!el || !autoGrow) return
    el.style.height = 'auto'
    const line = parseFloat(getComputedStyle(el).lineHeight) || 22
    el.style.height = `${Math.min(el.scrollHeight + 2, line * maxRows + 24)}px`
  }
  useEffect(resize, [rest.value, autoGrow, maxRows])
  return (
    <textarea
      ref={inner}
      aria-invalid={invalid || undefined}
      onInput={(e) => {
        resize()
        onInput?.(e)
      }}
      className={cn(fieldBase, 'block min-h-[96px] resize-none px-3.5 py-3 leading-relaxed', className)}
      {...rest}
    />
  )
})

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(fieldBase, 'h-10 appearance-none pl-3.5 pr-10', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  )
})

export function CharCount({ value, max, className }: { value: string; max: number; className?: string }) {
  const n = value.length
  return (
    <span className={cn('tabular text-xs', n > max ? 'text-danger' : n > max * 0.9 ? 'text-warning' : 'text-fg-3', className)}>
      {n.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}
