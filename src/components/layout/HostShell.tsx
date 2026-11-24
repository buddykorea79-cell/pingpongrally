import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { LayoutList, LogOut, Moon, RotateCcw } from 'lucide-react'
import { backend, isDemo } from '@/lib/backend'
import { toggleTheme, useSession } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Logo } from '../ui/Display'
import { Menu } from '../ui/Overlay'

export function HostShell({ children, wide, bare }: { children: ReactNode; wide?: boolean; bare?: boolean }) {
  const { session } = useSession()
  const nav = useNavigate()
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
        <div className={cn('mx-auto flex h-14 items-center gap-4 px-4 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-5xl')}>
          <Link to="/host" className="shrink-0">
            <Logo size="sm" />
          </Link>
          <Link to="/host" className="hidden text-[13.5px] text-fg-3 transition hover:text-fg sm:block">
            내 강의
          </Link>
          <div className="ml-auto flex items-center gap-2">
            {isDemo && <span className="hidden text-xs text-fg-3 sm:inline">데모 모드</span>}
            <Menu
              items={[
                { heading: session?.email ?? '강사' },
                { label: '내 강의', icon: <LayoutList />, onSelect: () => nav('/host') },
                'divider' as const,
                { label: '화면 테마 바꾸기', icon: <Moon />, onSelect: toggleTheme },
                ...(isDemo
                  ? [
                      {
                        label: '데모 데이터 초기화',
                        icon: <RotateCcw />,
                        onSelect: async () => {
                          const { resetDemoData } = await import('@/lib/backend/demo')
                          await resetDemoData()
                          location.assign('/host')
                        },
                      },
                    ]
                  : []),
                {
                  label: '로그아웃',
                  icon: <LogOut />,
                  danger: true,
                  onSelect: async () => {
                    await backend.signOut()
                    nav('/host/login')
                  },
                },
              ]}
              trigger={(p) => (
                <button {...p} className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-2.5 text-[13px] text-fg-2 transition hover:bg-surface-3 hover:text-fg">
                  <span className="flex size-7 items-center justify-center rounded-full text-xs text-fg ring-1 ring-line-strong">
                    {(session?.email?.[0] ?? '강').toUpperCase()}
                  </span>
                  <span className="hidden max-w-[180px] truncate lg:inline">{session?.email}</span>
                </button>
              )}
            />
          </div>
        </div>
      </header>
      {bare ? children : <main className={cn('mx-auto px-4 py-10 sm:px-6', wide ? 'max-w-[1600px]' : 'max-w-5xl')}>{children}</main>}
    </div>
  )
}

export function PageHeader({ title, description, actions, eyebrow }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <div className="mb-2">{eyebrow}</div>}
        <h1 className="text-[30px] font-extralight tracking-[-0.03em] text-fg">{title}</h1>
        {description && <p className="mt-2 text-[14px] leading-relaxed text-fg-3">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
