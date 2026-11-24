import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router'
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  BookmarkPlus,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  LibraryBig,
  Lock,
  LockOpen,
  MessageSquareText,
  MonitorPlay,
  MoreHorizontal,
  Pencil,
  Play,
  Plus,
  Square,
} from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RallyNode, ReactionCounts, ReactionKind, Room, RoomSurvey } from '@/lib/types'
import { addToMyTemplates, templateFromNode } from '@/lib/templates'
import { useReactions } from '@/lib/reactions'
import { clipboardFiles } from '@/components/rally/Composer'
import { roomPhase, useDocumentTitle, useNow, useRoomState, useSession } from '@/lib/hooks'
import { indexRally, pingLabel, rallyCount } from '@/lib/rally'
import { errorMessage } from '@/lib/errors'
import { cn, timeAgo } from '@/lib/utils'
import { HostShell } from '@/components/layout/HostShell'
import { RoomHeader } from '@/components/host/RoomHeader'
import { PingEditorModal, type PingDraft } from '@/components/host/PingEditorModal'
import { DemoCard, PeopleCard, PresentCard, StatusCard, SurveysCard } from '@/components/host/RoomPanel'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, LiveDot } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Menu, useConfirm } from '@/components/ui/Overlay'
import { PongCard } from '@/components/rally/PongCard'
import { Composer } from '@/components/rally/Composer'
import { RichText } from '@/components/rally/RichText'
import { AttachmentList } from '@/components/rally/Attachments'
import { PollBars, pollMeta, PollStatusBadge, usePollResults } from '@/components/rally/Poll'

export default function Control() {
  const { id } = useParams()
  const { session } = useSession()
  const toast = useToast()
  const confirm = useConfirm()
  const state = useRoomState(id)
  const { room, nodes, members, surveys } = state
  const now = useNow(15_000)
  useDocumentTitle(room ? `진행 · ${room.title}` : '진행')

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [editor, setEditor] = useState<{ open: boolean; node: RallyNode | null; type: 'ping' | 'poll' | 'template'; files?: File[] }>({ open: false, node: null, type: 'ping' })
  const [mobilePane, setMobilePane] = useState<'list' | 'detail' | 'room'>('detail')
  const [showHidden, setShowHidden] = useState(true)

  const idx = useMemo(() => indexRally(nodes, { includeHidden: showHidden }), [nodes, showHidden])
  const allPings = useMemo(() => indexRally(nodes, { includeHidden: true }).pings, [nodes])
  const selected = (selectedId && idx.byId.get(selectedId)) || (room?.active_ping_id && idx.byId.get(room.active_ping_id)) || allPings[0] || null

  const colors = useMemo(() => new Map(members.map((m) => [m.user_id, m.color])), [members])
  const colorOf = useCallback((uid: string) => colors.get(uid), [colors])

  const setRoom = state.setRoom
  const phase = roomPhase(room, now)
  const reactions = useReactions(id, { enabled: state.status === 'ready', live: phase === 'live', onError: (m) => toast.show(m, 'danger') })

  // 키보드: ↑/↓ 핑 이동, F 포커스
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (t.closest('input, textarea, select, [contenteditable], [role=dialog]')) return
      if (!selected) return
      const i = allPings.findIndex((p) => p.id === selected.id)
      if (e.key === 'ArrowDown' && i < allPings.length - 1) setSelectedId(allPings[i + 1].id)
      else if (e.key === 'ArrowUp' && i > 0) setSelectedId(allPings[i - 1].id)
      else if ((e.key === 'f' || e.key === 'F') && phase === 'live') void focus(selected)
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 화면 캡처를 아무 데서나 붙여 넣으면(Ctrl+V) 그 이미지를 붙인 새 핑 창을 연다.
  // 작성기가 열려 있으면 작성기가 먼저 받아 간다(defaultPrevented).
  useEffect(() => {
    if (!room || room.status === 'closed') return
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role=dialog]')) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable]')) return
      const files = clipboardFiles(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      setEditor({ open: true, node: null, type: 'ping', files })
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [room])

  if (state.status === 'loading') return <HostShell wide bare><BallLoader className="min-h-[70dvh]" label="진행 화면을 여는 중" /></HostShell>
  if (!room || state.status !== 'ready') {
    return (
      <HostShell>
        <EmptyState icon={<Layers />} title="강의를 찾을 수 없어요" description="삭제되었거나 다른 강사의 강의예요. 개인정보 파기 일정이 지난 강의는 자동으로 사라져요." />
      </HostShell>
    )
  }
  if (session && room.host_id !== session.userId) {
    return (
      <HostShell>
        <EmptyState icon={<Lock />} title="다른 강사의 강의예요" />
      </HostShell>
    )
  }

  async function focus(p: RallyNode) {
    if (!room) return
    try {
      setRoom(await backend.updateRoom(room.id, { active_ping_id: p.id }))
      toast.show(`${pingLabel(idx, p)} · 모두의 화면에 띄웠어요.`)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  async function patchNode(n: RallyNode, patch: Parameters<typeof backend.updateNode>[1], msg?: string) {
    try {
      const r = await backend.updateNode(n.id, patch)
      if (r) state.upsertNode(r)
      if (msg) toast.show(msg)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  async function move(p: RallyNode, dir: -1 | 1) {
    const i = allPings.findIndex((x) => x.id === p.id)
    const other = allPings[i + dir]
    if (!other) return
    await patchNode(p, { sort_order: other.sort_order })
    await patchNode(other, { sort_order: p.sort_order })
  }
  async function saveDraft(d: PingDraft) {
    if (!room) return
    if (editor.node) {
      const r = await backend.updateNode(editor.node.id, { content: d.content, attachments: d.attachments, ...(d.meta ? { meta: d.meta as RallyNode['meta'] } : {}) })
      if (r) state.upsertNode(r)
      toast.show('저장했어요.')
    } else {
      const n = await backend.createNode({ room_id: room.id, type: d.type, content: d.content, attachments: d.attachments, meta: (d.meta ?? {}) as RallyNode['meta'] })
      state.upsertNode(n)
      setSelectedId(n.id)
      setMobilePane('detail')
      let saved = ''
      if (d.saveTemplate) {
        try {
          await addToMyTemplates(templateFromNode(n))
          saved = ' 내 템플릿에도 저장했어요.'
        } catch (e) {
          saved = ` 템플릿 저장은 실패했어요: ${errorMessage(e)}`
        }
      }
      toast.show((d.type === 'poll' ? '퀵폴을 만들었어요.' : '핑을 만들었어요.') + saved)
    }
  }
  async function addTemplates(items: Parameters<typeof backend.applyPingSet>[1]) {
    if (!room) return
    try {
      await backend.applyPingSet(room.id, items)
      await state.refresh()
      toast.show(`템플릿에서 ${items.length}개를 넣었어요.`)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
      throw e
    }
  }
  async function saveTemplate(n: RallyNode) {
    try {
      const r = await addToMyTemplates(templateFromNode(n))
      toast.show(r.duplicate ? '이미 내 템플릿에 있어요.' : '내 템플릿에 저장했어요. [추가] → [템플릿]에서 다시 쓸 수 있어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  const presentSurvey = async (s: RoomSurvey) => {
    const q = s.questions.find((x) => x.type !== 'long') ?? s.questions[0]
    if (!q) return
    try {
      setRoom(await backend.updateRoom(room.id, { present: { ...room.present, surveyShare: { roomSurveyId: s.id, questionId: q.id } } }))
      toast.show('발표 화면에 설문 결과를 띄웠어요. [설문 결과] 탭에서 문항을 바꿀 수 있어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  const headerActions = (
    <Button variant="secondary" size="sm" icon={<MonitorPlay className="size-4" />} onClick={() => window.open(`/present/${room.id}`, `present-${room.id}`)}>
      발표 화면
    </Button>
  )
  const openNew = (type: 'ping' | 'poll' | 'template' = 'ping') => setEditor({ open: true, node: null, type })

  const listPane = (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="eyebrow">
          핑 목록 <span className="tabular ml-1 text-fg-2">{allPings.length}</span>
        </h2>
        <Button size="sm" icon={<Plus className="size-4 stroke-[1.6]" />} onClick={() => openNew()} title="핑·퀵폴을 새로 만들거나 템플릿에서 골라요">
          추가
        </Button>
      </div>
      {allPings.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong p-2">
          <EmptyState
            icon={<MessageSquareText />}
            title="아직 핑이 없어요"
            description="교육생에게 던질 질문을 미리 준비해 두세요. 화면 캡처를 Ctrl+V로 붙여 넣어도 바로 만들어져요."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button size="sm" onClick={() => openNew()}>
                  핑 만들기
                </Button>
                <Button size="sm" variant="secondary" icon={<LibraryBig className="size-4 stroke-[1.5]" />} onClick={() => openNew('template')}>
                  템플릿에서 고르기
                </Button>
              </div>
            }
          />
        </div>
      ) : (
        <ol className="space-y-2">
          {allPings.map((p, i) => {
            const c = rallyCount(idx, p.id)
            const isFocus = room.active_ping_id === p.id
            const isSel = selected?.id === p.id
            return (
              <li key={p.id}>
                <button
                  onClick={() => {
                    setSelectedId(p.id)
                    setMobilePane('detail')
                  }}
                  className={cn(
                    'group relative w-full overflow-hidden rounded-xl bg-surface p-3.5 pl-4 text-left ring-inset transition',
                    isSel ? 'ring-1 ring-fg' : 'ring-1 ring-line hover:ring-line-strong',
                    p.is_hidden && 'opacity-55',
                  )}
                >
                  {isFocus && <span className={cn('absolute inset-y-0 left-0 w-0.5', p.type === 'poll' ? 'bg-poll-500' : 'bg-ping-500')} />}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] font-bold text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                    {p.type === 'poll' ? (
                      <Badge tone="poll" size="sm" icon={<BarChart3 />}>
                        {pingLabel(idx, p)}
                      </Badge>
                    ) : (
                      <Badge tone="ping" size="sm">
                        {pingLabel(idx, p)}
                      </Badge>
                    )}
                    {isFocus && (
                      <span className="flex items-center gap-1 text-[11px] font-bold text-ping-600 dark:text-ping-400">
                        <LiveDot tone="ping" className="size-1.5" /> 포커스
                      </span>
                    )}
                    {p.is_hidden && <EyeOff className="size-3.5 text-danger" />}
                    {p.is_closed && p.type === 'ping' && <Lock className="size-3.5 text-fg-3" />}
                  </div>
                  <p className="mt-2 line-clamp-2 text-[14px] leading-snug">{p.content}</p>
                  <div className="mt-2 flex items-center gap-2 text-xs text-fg-3">
                    {p.type === 'poll' ? (
                      <PollStatusBadge node={p} />
                    ) : (
                      <span className="tabular">
                        퐁 {c.pongs} · 리플 {c.replies}
                      </span>
                    )}
                    <span className="ml-auto">{p.opened_at ? '공개됨' : '미공개'}</span>
                  </div>
                </button>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )

  const roomPane = (
    <div className="space-y-4">
      <StatusCard room={room} now={now} pingCount={allPings.length} surveyCount={surveys.length} onChange={setRoom} />
      <DemoCard room={room} />
      {phase !== 'draft' && <PeopleCard members={members} />}
      <PresentCard room={room} onChange={setRoom} />
      {surveys.length > 0 && <SurveysCard room={room} surveys={surveys} onPresent={(s) => void presentSurvey(s)} compact />}
    </div>
  )

  return (
    <HostShell wide bare>
      <RoomHeader room={room} now={now} actions={headerActions} />
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        <div className="mb-4 lg:hidden">
          <Segmented
            block
            value={mobilePane}
            onChange={setMobilePane}
            options={[
              { value: 'list', label: `핑 목록 ${allPings.length}` },
              { value: 'detail', label: '선택한 핑' },
              { value: 'room', label: '현황' },
            ]}
          />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)_340px]">
          <aside className={cn('xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:pb-6 scrollbar-thin', mobilePane !== 'list' && 'hidden lg:block')}>{listPane}</aside>
          <section className={cn('min-w-0', mobilePane !== 'detail' && 'hidden lg:block')}>
            {selected ? (
              <PingDetail
                key={selected.id}
                room={room}
                ping={selected}
                label={pingLabel(idx, selected)}
                idx={idx}
                isFirst={allPings[0]?.id === selected.id}
                isLast={allPings[allPings.length - 1]?.id === selected.id}
                phase={phase}
                now={now}
                colorOf={colorOf}
                viewerId={session?.userId ?? ''}
                showHidden={showHidden}
                setShowHidden={setShowHidden}
                onFocus={() => focus(selected)}
                onEdit={() => setEditor({ open: true, node: selected, type: selected.type === 'poll' ? 'poll' : 'ping' })}
                onSaveTemplate={() => void saveTemplate(selected)}
                reactionCounts={reactions.counts}
                myReactions={reactions.mine}
                onReact={reactions.toggle}
                onMove={(d) => void move(selected, d)}
                onPatch={(patch, msg) => patchNode(selected, patch, msg)}
                upsert={state.upsertNode}
                onToggleHidden={async (n) => {
                  if (!n.is_hidden) {
                    const ok = await confirm({ title: '이 글을 숨길까요?', description: '교육생 화면과 발표 화면에서 사라져요. 강사 화면에서는 흐리게 남아 다시 보이게 할 수 있어요.', confirmText: '숨기기', tone: 'danger' })
                    if (!ok) return
                  }
                  void patchNode(n, { is_hidden: !n.is_hidden }, n.is_hidden ? '다시 보이게 했어요.' : '숨겼어요.')
                }}
              />
            ) : (
              <div className="rounded-2xl bg-surface py-16 ring-1 ring-line">
                <EmptyState icon={<Crosshair />} title="핑을 골라 주세요" description="왼쪽 목록에서 핑을 고르면 퐁·리플을 함께 보며 진행할 수 있어요." />
              </div>
            )}
          </section>
          <aside className={cn('space-y-4 lg:col-span-2 xl:col-span-1 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-7rem)] xl:overflow-y-auto xl:pb-6 scrollbar-thin', mobilePane !== 'room' && 'hidden lg:block')}>
            {roomPane}
          </aside>
        </div>
      </div>

      <PingEditorModal
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false, files: undefined }))}
        roomId={room.id}
        initial={editor.node}
        defaultType={editor.type}
        initialFiles={editor.files}
        onSave={saveDraft}
        onAddTemplates={addTemplates}
        manageHref={`/host/rooms/${room.id}/manage#templates`}
      />
    </HostShell>
  )
}

// ---------------------------------------------------------------------------
function PingDetail({
  room,
  ping,
  label,
  idx,
  isFirst,
  isLast,
  phase,
  now,
  colorOf,
  viewerId,
  showHidden,
  setShowHidden,
  onFocus,
  onEdit,
  onSaveTemplate,
  onMove,
  onPatch,
  upsert,
  onToggleHidden,
  reactionCounts,
  myReactions,
  onReact,
}: {
  room: Room
  ping: RallyNode
  label: string
  idx: ReturnType<typeof indexRally>
  isFirst: boolean
  isLast: boolean
  phase: ReturnType<typeof roomPhase>
  now: number
  colorOf: (uid: string) => string | undefined
  viewerId: string
  showHidden: boolean
  setShowHidden: (v: boolean) => void
  onFocus: () => Promise<void>
  onEdit: () => void
  onSaveTemplate: () => void
  onMove: (d: -1 | 1) => void
  onPatch: (patch: Parameters<typeof backend.updateNode>[1], msg?: string) => Promise<void>
  upsert: (n: RallyNode) => void
  onToggleHidden: (n: RallyNode) => void
  reactionCounts: Record<string, ReactionCounts>
  myReactions: Record<string, ReactionKind[]>
  onReact: (pong: RallyNode, kind: ReactionKind) => void
}) {
  const toast = useToast()
  const isFocus = room.active_ping_id === ping.id
  const poll = ping.type === 'poll'
  const [sort, setSort] = useState<'latest' | 'replies'>('latest')
  const [composing, setComposing] = useState(false)
  const counts = rallyCount(idx, ping.id)
  const pongs = useMemo(() => {
    const list = (idx.pongsByPing.get(ping.id) ?? []).slice()
    if (sort === 'latest') list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    else list.sort((a, b) => (idx.repliesByPong.get(b.id)?.length ?? 0) - (idx.repliesByPong.get(a.id)?.length ?? 0))
    return list
  }, [idx, ping.id, sort])

  const canWrite = phase === 'live'
  const viewer = { userId: viewerId, isHost: true }

  return (
    <div className="space-y-5">
      <article className={cn('relative overflow-hidden rounded-2xl bg-surface p-6 ring-1', isFocus ? (poll ? 'ring-poll-400' : 'ring-ping-400') : 'ring-line')}>
        <div className="relative flex flex-wrap items-center gap-2">
          <Badge tone={poll ? 'poll' : 'ping'} icon={poll ? <BarChart3 /> : undefined}>
            {label}
          </Badge>
          {isFocus ? (
            <Badge tone={poll ? 'poll' : 'ping'} className="bg-transparent px-1">
              <LiveDot tone="ping" className="mr-1 size-1.5" /> 모두의 화면에 띄우는 중
            </Badge>
          ) : ping.opened_at ? (
            <span className="text-xs font-medium text-fg-3">{timeAgo(ping.opened_at, now)} 공개됨</span>
          ) : (
            <span className="text-xs font-medium text-fg-3">교육생에게 아직 안 보여요</span>
          )}
          {ping.is_hidden && (
            <Badge tone="danger" icon={<EyeOff />}>
              숨김
            </Badge>
          )}
          <div className="ml-auto flex items-center gap-1">
            <IconButton label="고치기" size="sm" onClick={onEdit}>
              <Pencil />
            </IconButton>
            <Menu
              items={[
                { label: '위로 옮기기', icon: <ArrowUp />, onSelect: () => onMove(-1), disabled: isFirst },
                { label: '아래로 옮기기', icon: <ArrowDown />, onSelect: () => onMove(1), disabled: isLast },
                'divider',
                { label: '템플릿으로 저장', icon: <BookmarkPlus />, onSelect: onSaveTemplate },
                'divider',
                ping.is_hidden
                  ? { label: '숨김 해제', icon: <Eye />, onSelect: () => onToggleHidden(ping) }
                  : { label: '숨기기', icon: <EyeOff />, danger: true, onSelect: () => onToggleHidden(ping) },
              ]}
              trigger={(p) => (
                <IconButton label="더 보기" size="sm" {...p}>
                  <MoreHorizontal />
                </IconButton>
              )}
            />
          </div>
        </div>
        <RichText text={ping.content} className="relative mt-4 text-[22px] font-light leading-[1.5] tracking-[-0.02em]" />
        {ping.attachments.length > 0 && <AttachmentList items={ping.attachments} className="relative mt-4" />}

        <div className="relative mt-6 flex flex-wrap items-center gap-2">
          {isFocus ? (
            <span className={cn('inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm ring-1 ring-inset', poll ? 'text-poll-700 ring-poll-300 dark:text-poll-200 dark:ring-poll-800' : 'text-ping-700 ring-ping-300 dark:text-ping-200 dark:ring-ping-800')}>
              <Crosshair className="size-4 stroke-[1.5]" /> 포커스 중
            </span>
          ) : (
            <Button variant="brand" icon={<Crosshair className="size-4" />} onClick={() => void onFocus()} disabled={phase !== 'live'} title={phase === 'draft' ? '강의를 시작한 뒤 포커스할 수 있어요' : undefined}>
              포커스 <kbd className="ml-1 rounded bg-white/20 px-1.5 font-mono text-[10px]">F</kbd>
            </Button>
          )}
          {poll ? (
            <PollControls ping={ping} isFocus={isFocus} phase={phase} onPatch={onPatch} onFocus={onFocus} />
          ) : (
            <Button
              variant="secondary"
              icon={ping.is_closed ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
              onClick={() => void onPatch({ is_closed: !ping.is_closed }, ping.is_closed ? '퐁을 다시 받아요.' : '퐁을 마감했어요.')}
            >
              {ping.is_closed ? '퐁 다시 받기' : '퐁 마감'}
            </Button>
          )}
        </div>
      </article>

      {poll ? (
        <PollLive ping={ping} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 px-1">
            <h2 className="text-[15px] font-bold">
              퐁 <span className="tabular text-fg-3">{counts.pongs}</span>
              <span className="mx-2 text-line-strong">/</span>
              리플 <span className="tabular text-fg-3">{counts.replies}</span>
            </h2>
            <div className="ml-auto flex items-center gap-3">
              <Switch size="sm" checked={showHidden} onChange={setShowHidden} label={<span className="text-[13px] font-semibold text-fg-2">숨긴 글 보기</span>} />
              <Segmented
                size="sm"
                value={sort}
                onChange={setSort}
                options={[
                  { value: 'latest', label: '최신순' },
                  { value: 'replies', label: '리플 많은 순' },
                ]}
              />
            </div>
          </div>

          {canWrite && !ping.is_closed && (
            <div className="rounded-3xl bg-surface p-4 ring-1 ring-line">
              {composing ? (
                <Composer
                  roomId={room.id}
                  autoFocus
                  submitLabel="강사로 퐁 남기기"
                  minRows={2}
                  onCancel={() => setComposing(false)}
                  onSubmit={async (content, attachments) => {
                    const n = await backend.createNode({ room_id: room.id, type: 'pong', parent_id: ping.id, content, attachments })
                    upsert(n)
                    setComposing(false)
                    toast.show('퐁을 남겼어요.')
                  }}
                />
              ) : (
                <button onClick={() => setComposing(true)} className="flex w-full items-center gap-3 text-left text-[15px] text-fg-3">
                  <span className="flex size-9 items-center justify-center rounded-full bg-ink-900 text-xs font-bold text-white ring-2 ring-ping-500 ring-offset-2 ring-offset-surface dark:bg-ink-700">강</span>
                  강사로 퐁 남기기…
                </button>
              )}
            </div>
          )}

          {pongs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-line-strong">
              <EmptyState
                icon={<MessageSquareText />}
                title="아직 퐁이 없어요"
                description={phase === 'live' ? (isFocus ? '교육생이 답을 보내면 여기에 실시간으로 쌓여요.' : '[포커스]를 누르면 교육생 화면에 이 핑이 떠요.') : phase === 'draft' ? '강의를 시작하고 포커스하면 답이 쌓여요.' : undefined}
              />
            </div>
          ) : (
            <div className="grid gap-3 2xl:grid-cols-2">
              {pongs.map((p) => (
                <PongCard
                  key={p.id}
                  pong={p}
                  replies={idx.repliesByPong.get(p.id) ?? []}
                  colorOf={colorOf}
                  viewer={viewer}
                  canWrite={canWrite && !ping.is_closed}
                  now={now}
                  onReply={async (pong, text) => upsert(await backend.createNode({ room_id: room.id, type: 'reply', parent_id: pong.id, content: text }))}
                  onEdit={async (n, content) => {
                    const r = await backend.updateNode(n.id, { content })
                    if (r) upsert(r)
                  }}
                  onDelete={(n) => onToggleHidden(n)}
                  onToggleHidden={onToggleHidden}
                  reactions={reactionCounts[p.id]}
                  myReactions={myReactions[p.id]}
                  onReact={canWrite ? onReact : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function PollControls({
  ping,
  isFocus,
  phase,
  onPatch,
  onFocus,
}: {
  ping: RallyNode
  isFocus: boolean
  phase: ReturnType<typeof roomPhase>
  onPatch: (patch: Parameters<typeof backend.updateNode>[1], msg?: string) => Promise<void>
  onFocus: () => Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const m = pollMeta(ping)
  const set = (status: 'ready' | 'open' | 'closed', msg: string) => onPatch({ meta: { ...ping.meta, status } }, msg)
  if (phase !== 'live') return null
  if (m.status === 'open')
    return (
      <Button variant="secondary" icon={<Square className="size-3.5 fill-current" />} onClick={() => void set('closed', '투표를 마감했어요.')}>
        투표 마감
      </Button>
    )
  return (
    <Button
      className="bg-poll-500 text-white hover:bg-poll-600"
      loading={busy}
      icon={<Play className="size-4 fill-current" />}
      onClick={async () => {
        // 포커스와 상태 변경을 차례로 보내야 서로 덮어쓰지 않는다
        setBusy(true)
        try {
          if (!isFocus) await onFocus()
          await set('open', m.status === 'closed' ? '투표를 다시 열었어요.' : '투표를 시작했어요.')
        } finally {
          setBusy(false)
        }
      }}
    >
      {m.status === 'closed' ? '투표 다시 열기' : '투표 시작'}
    </Button>
  )
}

function PollLive({ ping }: { ping: RallyNode }) {
  const { results } = usePollResults(ping, 2000)
  const m = pollMeta(ping)
  return (
    <section className="rounded-2xl bg-surface p-6 ring-1 ring-line">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-[15px] font-bold">투표 결과</h2>
        <div className="flex items-center gap-2 text-xs text-fg-3">
          {m.status === 'open' && <span className="flex items-center gap-1.5"><LiveDot className="size-1.5" /> 2초마다 갱신</span>}
          <Badge size="sm" tone="outline">
            {m.multiple ? '복수 선택' : '단일 선택'}
          </Badge>
          <Badge size="sm" tone="outline">
            {m.show_results === 'live' ? '교육생에게 실시간 공개' : '마감 후 공개'}
          </Badge>
        </div>
      </div>
      <PollBars meta={m} results={results} />
      <p className="mt-4 text-xs text-fg-3">누가 어디에 투표했는지는 강사에게도 보이지 않아요.</p>
    </section>
  )
}
