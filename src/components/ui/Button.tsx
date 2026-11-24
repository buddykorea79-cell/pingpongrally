import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/utils'
import { Spinner } from './Feedback'

type Variant = 'primary' | 'brand' | 'pong' | 'secondary' | 'ghost' | 'danger' | 'soft' | 'link'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const base =
  'relative inline-flex select-none items-center justify-center gap-2 whitespace-nowrap font-medium tracking-[-0.01em] transition-[background,color,box-shadow,opacity] duration-150 disabled:pointer-events-none disabled:opacity-40'

const variants: Record<Variant, string> = {
  primary: 'bg-inverse text-on-inverse hover:bg-inverse/85',
  brand: 'bg-ping-500 text-white hover:bg-ping-600',
  pong: 'bg-pong-500 text-white hover:bg-pong-600',
  secondary: 'bg-surface text-fg ring-1 ring-inset ring-line-strong hover:bg-surface-2',
  ghost: 'text-fg-2 hover:bg-surface-3 hover:text-fg',
  soft: 'bg-surface-3 text-fg hover:bg-line',
  danger: 'bg-danger text-white hover:opacity-90',
  link: 'text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg',
}

const sizes: Record<Size, string> = {
  xs: 'h-7 rounded-md px-2.5 text-xs',
  sm: 'h-8 rounded-lg px-3 text-[13px]',
  md: 'h-10 rounded-lg px-4 text-sm',
  lg: 'h-11 rounded-lg px-5 text-[15px]',
  xl: 'h-12 rounded-xl px-6 text-[15px]',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  loading?: boolean
  icon?: ReactNode
  iconRight?: ReactNode
  block?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, iconRight, block, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], block && 'w-full', className)}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : icon}
      {children}
      {iconRight}
    </button>
  )
})

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  icon,
  iconRight,
  block,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size; icon?: ReactNode; iconRight?: ReactNode; block?: boolean }) {
  return (
    <Link className={cn(base, variants[variant], variant !== 'link' && sizes[size], block && 'w-full', className)} {...rest}>
      {icon}
      {children}
      {iconRight}
    </Link>
  )
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  size?: 'sm' | 'md' | 'lg'
  variant?: 'ghost' | 'secondary' | 'soft' | 'primary'
  badge?: number | boolean
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, size = 'md', variant = 'ghost', badge, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center rounded-lg transition-[background,color] duration-150 disabled:opacity-40 [&_svg]:stroke-[1.6]',
        size === 'sm' && 'size-8 [&_svg]:size-4',
        size === 'md' && 'size-9 [&_svg]:size-[18px]',
        size === 'lg' && 'size-11 [&_svg]:size-5',
        variant === 'ghost' && 'text-fg-2 hover:bg-surface-3 hover:text-fg',
        variant === 'secondary' && 'bg-surface text-fg-2 ring-1 ring-inset ring-line hover:text-fg',
        variant === 'soft' && 'bg-surface-3 text-fg hover:bg-line',
        variant === 'primary' && 'bg-inverse text-on-inverse hover:opacity-90',
        className,
      )}
      {...rest}
    >
      {children}
      {badge ? (
        <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-ping-500 px-1 text-[10px] font-medium leading-4 text-white ring-2 ring-bg">
          {typeof badge === 'number' ? badge : ''}
        </span>
      ) : null}
    </button>
  )
})
