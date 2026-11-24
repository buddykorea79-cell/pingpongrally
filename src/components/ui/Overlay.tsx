import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './Button'

let openCount = 0
function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return
    openCount++
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      openCount--
      if (openCount === 0) document.body.style.overflow = prev
    }
  }, [active])
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  sheetOnMobile = true,
  hideClose,
  className,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  sheetOnMobile?: boolean
  hideClose?: boolean
  className?: string
}) {
  const panel = useRef<HTMLDivElement>(null)
  useScrollLock(open)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const t = window.setTimeout(() => {
      const el = panel.current?.querySelector<HTMLElement>('[data-autofocus], input:not([type=hidden]), textarea, select')
      ;(el ?? panel.current)?.focus({ preventScroll: true })
    }, 40)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, onClose])
  if (!open) return null
  return createPortal(
    <div className={cn('fixed inset-0 z-[80] flex justify-center', sheetOnMobile ? 'items-end sm:items-center' : 'items-center p-4', 'sm:p-6')}>
      <div className="absolute inset-0 animate-fade-in bg-ink-950/30" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[min(92dvh,900px)] w-full flex-col overflow-hidden bg-surface shadow-pop outline-none ring-1 ring-line',
          sheetOnMobile
            ? 'animate-sheet-up rounded-t-2xl sm:animate-scale-in sm:rounded-2xl'
            : 'animate-scale-in rounded-2xl',
          size === 'sm' && 'sm:max-w-sm',
          size === 'md' && 'sm:max-w-lg',
          size === 'lg' && 'sm:max-w-2xl',
          size === 'xl' && 'sm:max-w-4xl',
          className,
        )}
      >
        {sheetOnMobile && <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" />}
        {(title || !hideClose) && (
          <div className="flex shrink-0 items-start gap-3 px-6 pb-1 pt-6">
            <div className="min-w-0 flex-1">
              {title && <h2 className="text-[19px] font-normal tracking-tight text-fg">{title}</h2>}
              {description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-3">{description}</p>}
            </div>
            {!hideClose && (
              <button onClick={onClose} className="-mr-2 -mt-1 rounded-lg p-2 text-fg-3 transition hover:bg-surface-3 hover:text-fg" aria-label="닫기">
                <X className="size-[18px] stroke-[1.5]" />
              </button>
            )}
          </div>
        )}
        <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-3">{children}</div>
        {footer && <div className="safe-bottom flex shrink-0 items-center justify-end gap-2 border-t border-line px-6 py-3.5">{footer}</div>}
      </div>
    </div>,
    document.body,
  )
}

// ---------------------------------------------------------------------------
// 확인 대화상자: const ok = await confirm({...})
// ---------------------------------------------------------------------------
interface ConfirmOptions {
  title: ReactNode
  description?: ReactNode
  confirmText?: string
  cancelText?: string
  tone?: 'danger' | 'primary' | 'brand'
  body?: ReactNode
}

const ConfirmCtx = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), [])
  const close = (v: boolean) => {
    state?.resolve(v)
    setState(null)
  }
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title}
        description={state?.description}
        size="sm"
        hideClose
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)}>
              {state?.cancelText ?? '취소'}
            </Button>
            <Button data-autofocus variant={state?.tone === 'danger' ? 'danger' : state?.tone === 'brand' ? 'brand' : 'primary'} onClick={() => close(true)}>
              {state?.confirmText ?? '확인'}
            </Button>
          </>
        }
      >
        {state?.body}
      </Modal>
    </ConfirmCtx.Provider>
  )
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx)
  if (!ctx) throw new Error('ConfirmProvider missing')
  return ctx
}

// ---------------------------------------------------------------------------
// 드롭다운 메뉴
// ---------------------------------------------------------------------------
export interface MenuItem {
  label: ReactNode
  icon?: ReactNode
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  hint?: ReactNode
}

export function Menu({
  trigger,
  items,
  align = 'end',
  className,
}: {
  trigger: (props: { onClick: () => void; 'aria-expanded': boolean }) => ReactNode
  items: (MenuItem | 'divider' | { heading: ReactNode })[]
  align?: 'start' | 'end'
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [flipUp, setFlipUp] = useState(false)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])
  useLayoutEffect(() => {
    if (!open || !pop.current || !root.current) return
    const r = root.current.getBoundingClientRect()
    const h = pop.current.offsetHeight
    setFlipUp(r.bottom + h + 12 > window.innerHeight && r.top > h + 12)
  }, [open])
  return (
    <div ref={root} className={cn('relative inline-flex', className)}>
      {trigger({ onClick: () => setOpen((v) => !v), 'aria-expanded': open })}
      {open && (
        <div
          ref={pop}
          role="menu"
          className={cn(
            'absolute z-[70] min-w-[200px] origin-top animate-scale-in rounded-xl bg-surface p-1 shadow-pop ring-1 ring-line',
            align === 'end' ? 'right-0' : 'left-0',
            flipUp ? 'bottom-full mb-2' : 'top-full mt-2',
          )}
        >
          {items.map((it, i) => {
            if (it === 'divider') return <div key={i} className="my-1.5 h-px bg-line" />
            if ('heading' in it)
              return (
                <div key={i} className="truncate px-3 pb-1 pt-2 text-xs text-fg-3">
                  {it.heading}
                </div>
              )
            return (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false)
                  it.onSelect()
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors disabled:opacity-40 [&_svg]:size-4 [&_svg]:stroke-[1.6]',
                  it.danger ? 'text-danger hover:bg-danger-soft' : 'text-fg hover:bg-surface-3',
                )}
              >
                {it.icon && <span className={cn('shrink-0', !it.danger && 'text-fg-2')}>{it.icon}</span>}
                <span className="flex-1">{it.label}</span>
                {it.hint && <span className="text-xs text-fg-3">{it.hint}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
