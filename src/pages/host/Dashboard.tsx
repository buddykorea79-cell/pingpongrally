import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, MonitorPlay, Plus, Trash2 } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RoomSummary } from '@/lib/types'
import { roomPhase, useDocumentTitle, useNow } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatRemaining, formatShortDate } from '@/lib/utils'
import { HostShell, PageHeader } from '@/components/layout/HostShell'
import { Button, ButtonLink } from '@/components/ui/Button'
import { LiveDot } from '@/components/ui/Display'
import { Skeleton, useToast } from '@/components/ui/Feedback'
import { useConfirm } from '@/components/ui/Overlay'
import { CreateRoomModal } from '@/components/host/CreateRoomModal'

/** 강사 첫 화면: 지금 강의 하나와 지난 강의 목록만 둔다. 템플릿·등록·설문은 각 강의의 [관리]에서. */
export default function Dashboard() {
  const [rooms, setRooms] = useState<RoomSummary[] | null>(null)
  const [creating, setCreating] = useState(false)
  const now = useNow(30_000)
  const toast = useToast()
  const confirm = useConfirm()
  useDocumentTitle('내 강의')
  const load = () =>
    backend
      .listMyRooms()
      .then(setRooms)
      .catch((e) => toast.show(errorMessage(e), 'danger'))
  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 강사 1명은 열린(준비·진행) 강의를 1개만 가진다.
  const current = useMemo(() => (rooms ?? []).find((r) => roomPhase(r, now) !== 'ended') ?? null, [rooms, now])
  const past = useMemo(() => (rooms ?? []).filter((r) => roomPhase(r, now) === 'ended'), [rooms, now])

  const remove = async (r: RoomSummary) => {
    const ok = await confirm({
      title: `‘${r.title}’ 강의를 삭제할까요?`,
      description: '준비한 핑, 붙인 설문, 미리 받은 참석자 등록이 함께 지워지고 되돌릴 수 없어요.',
      confirmText: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend.deleteRoom(r.id)
      toast.show('강의를 삭제했어요.')
      void load()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  return (
    <HostShell>
      <PageHeader title="내 강의" description="강의는 한 번에 하나만 열 수 있어요. 끝난 강의는 아래에 남아 결과를 내려받을 수 있어요." />

      {rooms === null ? (
        <div className="space-y-3">
          <Skeleton className="h-44 rounded-2xl" />
          <Skeleton className="h-16 rounded-2xl" />
        </div>
      ) : (
        <div className="space-y-12">
          <section>
            <p className="eyebrow mb-3">지금 강의</p>
            {current ? (
              <CurrentRoomCard room={current} now={now} onDelete={() => void remove(current)} />
            ) : (
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-dashed border-line-strong px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[17px] font-light">열린 강의가 없어요</p>
                  <p className="mt-1 text-[13.5px] text-fg-3">제목만 정하면 바로 만들어져요. 핑·설문·참석자 등록은 만든 뒤에 준비해요.</p>
                </div>
                <Button icon={<Plus className="size-4 stroke-[1.6]" />} onClick={() => setCreating(true)}>
                  새 강의 만들기
                </Button>
              </div>
            )}
          </section>

          {past.length > 0 && (
            <section>
              <p className="eyebrow mb-3">지난 강의 {past.length}</p>
              <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
                {past.map((r) => (
                  <EndedRoomRow key={r.id} room={r} now={now} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <CreateRoomModal open={creating} onClose={() => setCreating(false)} />
    </HostShell>
  )
}

function CurrentRoomCard({ room, now, onDelete }: { room: RoomSummary; now: number; onDelete: () => void }) {
  const live = roomPhase(room, now) === 'live'
  const left = live ? new Date(room.expires_at!).getTime() - now : 0
  return (
    <article className="rounded-2xl bg-surface ring-1 ring-line">
      <div className="flex flex-wrap items-start gap-6 p-6 sm:p-7">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[13px] text-fg-3">
            {live ? (
              <>
                <LiveDot className="size-1.5" /> 진행 중 · {formatRemaining(left)} 남음
              </>
            ) : (
              <>
                <span className="size-1.5 rounded-full bg-warning" /> 준비 중
              </>
            )}
          </p>
          <Link to={`/host/rooms/${room.id}`} className="mt-2 block text-[24px] font-light leading-snug tracking-[-0.02em] hover:underline hover:decoration-line-strong hover:underline-offset-4">
            {room.title}
          </Link>
          <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-fg-3">
            {live && <span>{room.member_count}명 참여</span>}
            <span>핑 {room.ping_count}</span>
            {live && <span>퐁·리플 {room.pong_count}</span>}
            <span>참석자 등록 {room.registration === 'open' ? '받는 중' : room.registration === 'closed' ? '마감' : '안 받음'}</span>
          </p>
        </div>
        {live && room.code && (
          <div className="text-right">
            <p className="text-xs text-fg-3">입장 코드</p>
            <p className="mt-1 font-mono text-[30px] font-light tracking-[0.14em]">{room.code}</p>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-line px-6 py-3.5 sm:px-7">
        <ButtonLink to={`/host/rooms/${room.id}`} size="sm" iconRight={<ArrowRight className="size-3.5 stroke-[1.6]" />}>
          {live ? '진행 화면 열기' : '준비하기'}
        </ButtonLink>
        <ButtonLink to={`/host/rooms/${room.id}/manage`} size="sm" variant="ghost">
          관리
        </ButtonLink>
        {live && (
          <ButtonLink to={`/present/${room.id}`} target="_blank" size="sm" variant="ghost" icon={<MonitorPlay className="size-4 stroke-[1.5]" />}>
            발표 화면
          </ButtonLink>
        )}
        {!live && (
          <Button size="sm" variant="ghost" className="ml-auto text-fg-3 hover:text-danger" icon={<Trash2 className="size-4 stroke-[1.5]" />} onClick={onDelete}>
            삭제
          </Button>
        )}
      </div>
    </article>
  )
}

function EndedRoomRow({ room, now }: { room: RoomSummary; now: number }) {
  const contentLeft = room.purge_content_at ? new Date(room.purge_content_at).getTime() - now : 0
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 transition hover:bg-surface-2">
      <span className="tabular w-20 shrink-0 text-[13px] text-fg-3">{room.started_at ? formatShortDate(room.started_at) : '—'}</span>
      <div className="min-w-0 flex-1">
        <Link to={`/host/rooms/${room.id}`} className="block truncate text-[15px] hover:underline hover:decoration-line-strong hover:underline-offset-4">
          {room.title}
        </Link>
        <p className="mt-0.5 text-[12.5px] text-fg-3">
          {room.member_count}명 · 퐁·리플 {room.pong_count} · {contentLeft > 0 ? `글·파일 ${formatRemaining(contentLeft)} 뒤 삭제` : '글·파일 삭제됨'}
        </p>
      </div>
      <div className="flex gap-1">
        <ButtonLink to={`/host/rooms/${room.id}/manage#export`} size="sm" variant="ghost">
          내보내기
        </ButtonLink>
        <ButtonLink to={`/host/rooms/${room.id}/surveys`} size="sm" variant="ghost">
          결과
        </ButtonLink>
      </div>
    </div>
  )
}
