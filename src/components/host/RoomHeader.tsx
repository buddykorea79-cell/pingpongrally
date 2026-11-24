import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { BarChart3, Play, Settings2, UserCheck } from 'lucide-react'
import type { Room } from '@/lib/types'
import { roomPhase } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import { Badge, LiveDot } from '../ui/Display'

export function PhaseBadge({ room, now }: { room: Room; now?: number }) {
  const phase = roomPhase(room, now)
  if (phase === 'live')
    return (
      <Badge tone="success">
        <LiveDot className="mr-0.5 size-1.5" /> 진행 중
      </Badge>
    )
  if (phase === 'draft') return <Badge tone="warning">준비 중</Badge>
  return <Badge tone="neutral">종료됨</Badge>
}

export function RoomHeader({ room, actions, now }: { room: Room; actions?: ReactNode; now?: number }) {
  const tabs = [
    { to: `/host/rooms/${room.id}`, label: '진행', icon: <Play />, end: true },
    { to: `/host/rooms/${room.id}/manage`, label: '관리', icon: <Settings2 /> },
    { to: `/host/rooms/${room.id}/attendance`, label: '참석자 명단', icon: <UserCheck />, hidden: room.registration === 'off' },
    { to: `/host/rooms/${room.id}/surveys`, label: '설문 결과', icon: <BarChart3 /> },
  ].filter((t) => !t.hidden)
  return (
    <div className="border-b border-line bg-bg">
      <div className="mx-auto max-w-[1600px] px-4 pt-6 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto sm:flex-1">
            <h1 className="line-clamp-2 text-[22px] font-light leading-snug tracking-[-0.03em] sm:truncate sm:text-[24px]">{room.title}</h1>
            <PhaseBadge room={room} now={now} />
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
        <div className="scrollbar-none -mb-px mt-3 flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  'mr-4 flex h-11 shrink-0 items-center gap-2 border-b text-[13.5px] transition [&_svg]:size-4 [&_svg]:stroke-[1.5]',
                  isActive ? 'border-fg text-fg' : 'border-transparent text-fg-3 hover:text-fg-2',
                )
              }
            >
              {t.icon}
              {t.label}
            </NavLink>
          ))}
        </div>
      </div>
    </div>
  )
}
