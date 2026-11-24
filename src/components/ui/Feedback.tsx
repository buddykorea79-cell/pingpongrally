import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('size-5 animate-spin', className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path d="M21.5 12a9.5 9.5 0 0 0-9.5-9.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** 탁구공이 통통 튀는 로딩 */
export function BallLoader({ label = '불러오는 중', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-16 text-fg-3', className)} role="status">
      <div className="relative h-10 w-16">
        <span className="absolute bottom-0 left-1/2 size-3 -translate-x-1/2 animate-ball rounded-full bg-ping-500" />
        <span className="absolute -bottom-1 left-1/2 h-px w-6 -translate-x-1/2 bg-fg/15" />
      </div>
      <span className="text-[13px]">{label}</span>
    </div>
  )
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode
  title: string
  description?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-12 text-center', className)}>
      {icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-full ring-1 ring-line text-fg-3 [&_svg]:size-5 [&_svg]:stroke-[1.5]">{icon}</div>
      )}
      <p className="text-[15px] font-medium text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-fg-2">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

type Tone = 'info' | 'success' | 'warning' | 'danger' | 'neutral' | 'ping'

const toneStyles: Record<Tone, string> = {
  info: 'bg-surface text-fg-2 ring-line',
  success: 'bg-success-soft text-fg-2 ring-success/20',
  warning: 'bg-warning-soft text-fg-2 ring-warning/20',
  danger: 'bg-danger-soft text-fg-2 ring-danger/20',
  neutral: 'bg-surface-2 text-fg-2 ring-line',
  ping: 'bg-ping-50/60 text-fg-2 ring-ping-200/60 dark:bg-ping-950/30 dark:ring-ping-900/60',
}

const toneIcons: Record<Tone, ReactNode> = {
  info: <Info className="text-pong-500" />,
  success: <CheckCircle2 className="text-success" />,
  warning: <AlertTriangle className="text-warning" />,
  danger: <XCircle className="text-danger" />,
  neutral: <Info className="text-fg-3" />,
  ping: <Info className="text-ping-500" />,
}

export function Callout({
  tone = 'info',
  title,
  children,
  icon,
  className,
  action,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  icon?: ReactNode | false
  className?: string
  action?: ReactNode
}) {
  return (
    <div className={cn('flex gap-3 rounded-xl px-4 py-3 text-[13.5px] ring-1 ring-inset', toneStyles[tone], className)}>
      {icon !== false && <span className="mt-0.5 shrink-0 [&_svg]:size-4 [&_svg]:stroke-[1.75]">{icon ?? toneIcons[tone]}</span>}
      <div className="min-w-0 flex-1 leading-relaxed">
        {title && <p className="font-medium text-fg">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5')}>{children}</div>}
      </div>
      {action && <div className="shrink-0 self-center">{action}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------
interface ToastItem {
  id: number
  tone: 'success' | 'danger' | 'info'
  message: string
}

const ToastCtx = createContext<{ show: (message: string, tone?: ToastItem['tone']) => void } | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const seq = useRef(0)
  const show = useCallback((message: string, tone: ToastItem['tone'] = 'success') => {
    const id = ++seq.current
    setItems((prev) => [...prev.slice(-2), { id, tone, message }])
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), tone === 'danger' ? 5200 : 2800)
  }, [])
  const value = useMemo(() => ({ show }), [show])
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 px-4 pb-[max(env(safe-area-inset-bottom),20px)] sm:bottom-auto sm:top-5 sm:pb-0">
        {items.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex max-w-md animate-pop-in items-center gap-2.5 rounded-xl bg-inverse py-2.5 pl-3.5 pr-2 text-[13.5px] text-on-inverse shadow-pop"
          >
            {t.tone === 'success' && <CheckCircle2 className="size-4 shrink-0 stroke-[1.75] text-reply-400" />}
            {t.tone === 'danger' && <XCircle className="size-4 shrink-0 stroke-[1.75] text-[#ff8a8d]" />}
            {t.tone === 'info' && <Info className="size-4 shrink-0 stroke-[1.75] text-pong-300" />}
            <span className="leading-snug">{t.message}</span>
            <button
              className="ml-1 rounded-md p-1 opacity-50 hover:opacity-100"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              aria-label="닫기"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastCtx)
  if (!ctx) throw new Error('ToastProvider missing')
  return ctx
}
