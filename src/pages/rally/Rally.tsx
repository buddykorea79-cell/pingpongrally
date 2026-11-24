import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import {
  ArrowDown,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Home,
  List,
  Lock,
  MessageCircle,
  MessagesSquare,
  Moon,
  MoreVertical,
  PenLine,
  Sparkles,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RallyNode, RoomMember, RoomSurvey } from '@/lib/types'
import { roomPhase, toggleTheme, useDocumentTitle, useNow, useRoomState, useSession } from '@/lib/hooks'
import { indexRally, pingLabel, rallyCount } from '@/lib/rally'
import { cn, formatRemaining } from '@/lib/utils'
import type { RallyIndex } from '@/lib/rally'
import { errorMessage } from '@/lib/errors'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, LiveDot, LogoMark } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Controls'
import { Menu, Modal, useConfirm } from '@/components/ui/Overlay'
import { PongCard, type Viewer } from '@/components/rally/PongCard'
import { clipboardFiles, Composer } from '@/components/rally/Composer'
import { RichText } from '@/components/rally/RichText'
import { AttachmentList } from '@/components/rally/Attachments'
import { PollStatusBadge, pollMeta, StudentPoll } from '@/components/rally/Poll'
import { useReactions } from '@/lib/reactions'

export default function Rally() {
  const { roomId } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const { session, loading: sessionLoading } = useSession()
  const state = useRoomState(session ? roomId : undefined)
  const { room, nodes, members, surveys } = state
  const now = useNow(30_000)
  const [me, setMe] = useState<RoomMember | null>(null)
  const [memberChecked, setMemberChecked] = useState(false)
  useDocumentTitle(room?.title)

  // ---------- 참여자 확인 ----------
  useEffect(() => {
    if (sessionLoading) return
    if (!session) {
      nav('/', { replace: true })
      return
    }
    if (!roomId) return
    backend
      .getMyMembership(roomId)
      .then((m) => {
        setMe(m)
        setMemberChecked(true)
      })
      .catch(() => setMemberChecked(true))
  }, [session, sessionLoading, roomId, nav])

  const isHost = !!room && !!session && room.host_id === session.userId

  // ---------- 참석자 등록 안내: 등록 폼이 열려 있고 아직 등록하지 않았으면 한 줄로 알려 준다 ----------
  const regOpen = room?.registration === 'open' && !isHost && !!me
  const [registered, setRegistered] = useState<boolean | null>(null)
  const [regDismissed, setRegDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(`ppr-reg-dismiss:${roomId}`) === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    if (!regOpen || !roomId) return
    backend
      .getMyParticipant(roomId)
      .then((p) => setRegistered(!!p))
      .catch(() => setRegistered(null))
  }, [regOpen, roomId])

  useEffect(() => {
    if (!memberChecked || me || isHost || state.status !== 'ready' || !room) return
    if (room.code && roomPhase(room) === 'live') nav(`/j/${room.code}`, { replace: true })
  }, [memberChecked, me, isHost, state.status, room, nav])

  // ---------- 트리 정리 ----------
  const idx = useMemo(() => indexRally(nodes), [nodes])
  const openPings = useMemo(() => idx.pings.filter((p) => p.opened_at || isHost), [idx, isHost])
  const colors = useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((x: RoomMember) => m.set(x.user_id, x.color))
    return m
  }, [members])
  const colorOf = useCallback((uid: string) => colors.get(uid), [colors])

  // ---------- 포커스 따라가기(5.2) ----------
  const activeId = room?.active_ping_id ?? null
  const [manualId, setManualId] = useState<string | null>(null)
  const [frozenId, setFrozenId] = useState<string | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false)
  const [pastedFiles, setPastedFiles] = useState<File[] | undefined>(undefined)
  const [dirty, setDirty] = useState(false)
  const prevActive = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (prevActive.current === undefined) {
      prevActive.current = activeId
      return
    }
    if (prevActive.current !== activeId) {
      if (composerOpen && dirty && prevActive.current) setFrozenId((f) => f ?? prevActive.current!)
      else {
        setManualId(null)
        setFrozenId(null)
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }
      prevActive.current = activeId
    }
  }, [activeId, composerOpen, dirty])

  const fallbackId = openPings.length ? openPings[openPings.length - 1].id : null
  const viewId = manualId ?? frozenId ?? (activeId && idx.byId.has(activeId) ? activeId : fallbackId)
  const ping = viewId ? (idx.byId.get(viewId) ?? null) : null
  const behind = !!activeId && !!viewId && viewId !== activeId && idx.byId.has(activeId)

  // ---------- 새로 들어온 글 강조 ----------
  const initialIds = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (state.status === 'ready' && !initialIds.current) initialIds.current = new Set(nodes.map((n) => n.id))
  }, [state.status, nodes])

  const [sort, setSort] = useState<'latest' | 'replies'>('latest')
  const pongs = useMemo(() => {
    if (!ping) return []
    const list = (idx.pongsByPing.get(ping.id) ?? []).slice()
    if (sort === 'latest') list.sort((a, b) => b.created_at.localeCompare(a.created_at))
    else list.sort((a, b) => (idx.repliesByPong.get(b.id)?.length ?? 0) - (idx.repliesByPong.get(a.id)?.length ?? 0) || b.created_at.localeCompare(a.created_at))
    return list
  }, [idx, ping, sort])

  // ---------- 설문 안내 ----------
  const [answered, setAnswered] = useState<Record<string, boolean>>({})
  const openSurveys = useMemo(() => surveys.filter((s: RoomSurvey) => s.status === 'open'), [surveys])
  useEffect(() => {
    for (const s of openSurveys) {
      if (answered[s.id] !== undefined) continue
      backend
        .getMySurveyResponse(s.id)
        .then((r) => setAnswered((a) => ({ ...a, [s.id]: !!r })))
        .catch(() => {})
    }
  }, [openSurveys, answered])
  const pendingSurvey = openSurveys.find((s) => answered[s.id] === false)

  const phase = roomPhase(room, now)
  const canWrite = phase === 'live' && (!!me || isHost)
  const viewer: Viewer = { userId: session?.userId ?? '', isHost }

  // ---------- 동작 ----------
  const sendPong = async (content: string, attachments: RallyNode['attachments']) => {
    if (!ping || !roomId) return
    const n = await backend.createNode({ room_id: roomId, type: 'pong', parent_id: ping.id, content, attachments })
    state.upsertNode(n)
    setComposerOpen(false)
    setDirty(false)
    setSort('latest')
    toast.show('퐁을 보냈어요!')
  }
  const reply = useCallback(
    async (pong: RallyNode, text: string) => {
      const n = await backend.createNode({ room_id: pong.room_id, type: 'reply', parent_id: pong.id, content: text })
      state.upsertNode(n)
    },
    [state],
  )
  const edit = useCallback(
    async (node: RallyNode, content: string) => {
      try {
        const n = await backend.updateNode(node.id, { content })
        if (n) state.upsertNode(n)
      } catch (e) {
        toast.show(errorMessage(e), 'danger')
        throw e
      }
    },
    [state, toast],
  )
  const remove = useCallback(
    async (node: RallyNode) => {
      const ok = await confirm({ title: '글을 삭제할까요?', description: '삭제하면 다른 참석자 화면에서도 사라져요.', confirmText: '삭제', tone: 'danger' })
      if (!ok) return
      try {
        await backend.updateNode(node.id, { is_hidden: true })
        state.removeNode(node.id)
        toast.show('삭제했어요.')
      } catch (e) {
        toast.show(errorMessage(e), 'danger')
      }
    },
    [confirm, state, toast],
  )

  // ---------- 퐁 반응 ----------
  const reactions = useReactions(roomId, {
    enabled: state.status === 'ready' && (!!me || isHost),
    live: roomPhase(room, now) === 'live',
    onError: (m) => toast.show(m, 'danger'),
  })

  // ---------- 휴대폰: 고른 핑 칩이 보이도록 가로 스크롤 ----------
  const chipRefs = useRef(new Map<string, HTMLButtonElement>())
  useEffect(() => {
    if (viewId) chipRefs.current.get(viewId)?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' })
  }, [viewId])

  // ---------- 화면 캡처 붙여 넣기: 어디서든 Ctrl+V 하면 그 이미지를 붙인 퐁 작성 창이 열린다 ----------
  const canPastePong = canWrite && !!ping && ping.type !== 'poll' && !ping.is_closed && !composerOpen
  useEffect(() => {
    if (!canPastePong) return
    const onPaste = (e: ClipboardEvent) => {
      if (e.defaultPrevented || document.querySelector('[role=dialog]')) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable]')) return
      const files = clipboardFiles(e.clipboardData)
      if (!files.length) return
      e.preventDefault()
      setPastedFiles(files)
      setComposerOpen(true)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [canPastePong])

  // ---------- 화면 ----------
  if (sessionLoading || state.status === 'loading' || (!memberChecked && state.status !== 'not_found')) {
    return <BallLoader className="min-h-dvh" label="랠리 화면을 여는 중" />
  }
  if (state.status === 'not_found' || !room || (memberChecked && !me && !isHost && phase !== 'live')) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState
          icon={<Lock />}
          title="이 강의에 들어갈 수 없어요"
          description="입장하지 않은 강의이거나, 강의가 끝나 자료가 정리되었을 수 있어요."
          action={<Button onClick={() => nav('/')}>처음 화면으로</Button>}
        />
      </div>
    )
  }

  const counts = ping ? rallyCount(idx, ping.id) : { pongs: 0, replies: 0 }
  const isPoll = ping?.type === 'poll'
  const pingClosed = !!ping?.is_closed
  const pos = ping ? openPings.findIndex((p) => p.id === ping.id) : -1
  const goTo = (id: string) => {
    setManualId(id === activeId ? null : id)
    setFrozenId(null)
    setListOpen(false)
    window.scrollTo({ top: 0 })
  }
  const pingList = <PingList pings={openPings} idx={idx} viewId={viewId} activeId={activeId} onPick={goTo} />
  const backToLive = () => {
    setManualId(null)
    setFrozenId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="min-h-dvh bg-bg pb-32 lg:pb-16">
      {/* 상단 바 */}
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-3 px-4 py-2.5 lg:max-w-[1200px] lg:px-6">
          <Link to="/" aria-label="처음 화면">
            <LogoMark className="size-6" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] tracking-tight">{room.title}</p>
            <div className="flex items-center gap-2 text-xs text-fg-3">
              <ConnectionBadge state={state.connection} phase={phase} />
              <span>·</span>
              <span className="tabular">{members.length}명 참여</span>
              {phase === 'live' && room.expires_at && (
                <span className="hidden min-[380px]:inline">· {formatRemaining(new Date(room.expires_at).getTime() - now)} 남음</span>
              )}
            </div>
          </div>
          {openSurveys.length > 0 && (
            <IconButton label="설문" badge={pendingSurvey ? 1 : undefined} onClick={() => nav(`/r/${room.id}/survey/${(pendingSurvey ?? openSurveys[0]).id}`)}>
              <ClipboardList />
            </IconButton>
          )}
          <Menu
            items={[
              { label: '내 정보', icon: <UserRound />, onSelect: () => nav(`/r/${room.id}/me`), hint: me?.nickname },
              ...openSurveys.map((s) => ({ label: s.title, icon: <ClipboardList />, onSelect: () => nav(`/r/${room.id}/survey/${s.id}`), hint: answered[s.id] ? '응답함' : '' })),
              'divider' as const,
              { label: '화면 테마 바꾸기', icon: <Moon />, onSelect: toggleTheme },
              { label: '처음 화면으로', icon: <Home />, onSelect: () => nav('/') },
            ]}
            trigger={(p) => (
              <IconButton label="메뉴" {...p}>
                <MoreVertical />
              </IconButton>
            )}
          />
        </div>

        {/* 휴대폰: 핑 골라 보기(PC 는 왼쪽 목록) */}
        {openPings.length > 1 && (
          <div className="mx-auto flex max-w-[640px] items-center gap-1.5 pb-2.5 pl-4 pr-3 lg:hidden">
            <div className="scrollbar-none flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
              {openPings.map((p) => {
                const selected = p.id === viewId
                const isActive = p.id === activeId
                return (
                  <button
                    key={p.id}
                    ref={(el) => {
                      if (el) chipRefs.current.set(p.id, el)
                      else chipRefs.current.delete(p.id)
                    }}
                    onClick={() => goTo(p.id)}
                    className={cn(
                      'flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] transition',
                      selected ? 'bg-inverse text-on-inverse' : 'bg-surface text-fg-2 ring-1 ring-inset ring-line hover:text-fg',
                    )}
                  >
                    {isActive && <span className={cn('size-1.5 rounded-full', selected ? 'bg-ping-400' : 'bg-ping-500')} />}
                    {p.type === 'poll' && <BarChart3 className="size-3.5" />}
                    {pingLabel(idx, p)}
                    {p.type === 'ping' && <span className={cn('tabular text-[11px]', selected ? 'opacity-60' : 'text-fg-3')}>{idx.pongsByPing.get(p.id)?.length ?? 0}</span>}
                  </button>
                )
              })}
            </div>
            <button
              onClick={() => setListOpen(true)}
              className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[13px] text-fg-2 ring-1 ring-inset ring-line hover:text-fg"
              aria-label="핑 전체 목록"
            >
              <List className="size-3.5 stroke-[1.6]" /> 전체
            </button>
          </div>
        )}
      </header>

      <div className="mx-auto max-w-[640px] px-4 pt-4 lg:grid lg:max-w-[1200px] lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start lg:gap-6 lg:px-6 lg:pt-6">
        {/* PC: 강사 화면처럼 왼쪽에 핑 목록 */}
        <aside className="scrollbar-thin hidden lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)] lg:overflow-y-auto lg:pb-6">
          <h2 className="eyebrow mb-3 px-1">
            핑 목록 <span className="tabular ml-1 text-fg-2">{openPings.length}</span>
          </h2>
          {openPings.length === 0 ? <p className="px-1 text-[13px] leading-relaxed text-fg-3">강사가 핑을 띄우면 여기에 차례로 쌓여요.</p> : pingList}
        </aside>

        <main className="min-w-0 space-y-4">
          {behind &&
            (frozenId && !manualId ? (
              <button
                onClick={backToLive}
                className="flex w-full animate-pop-in items-center gap-3 rounded-xl bg-surface px-4 py-3 text-left ring-1 ring-ping-300 dark:ring-ping-800"
              >
                <span className="size-2 animate-live-dot rounded-full bg-ping-500 text-ping-500" />
                <span className="flex-1 text-sm">강사가 새 핑으로 넘어갔어요</span>
                <span className="text-[13px] text-ping-600 dark:text-ping-300">새 핑으로 이동 →</span>
              </button>
            ) : (
              <button
                onClick={backToLive}
                className="flex w-full animate-fade-in items-center gap-2.5 rounded-xl bg-surface px-4 py-2.5 text-left ring-1 ring-line transition hover:ring-line-strong"
              >
                <span className="size-1.5 rounded-full bg-ping-500" />
                <span className="flex-1 text-[13px] text-fg-2">지난 핑을 보고 있어요</span>
                <span className="flex items-center gap-1 text-[13px] text-fg">
                  지금 핑으로 <ArrowDown className="size-3.5 -rotate-90" />
                </span>
              </button>
            ))}

          {phase === 'ended' && (
            <div className="rounded-xl px-4 py-3 text-[13px] leading-relaxed text-fg-2 ring-1 ring-inset ring-line">
              <span className="text-fg">강의가 종료되었어요.</span> 지금은 읽기만 할 수 있고, 글과 파일은 강의 시작 72시간 뒤 자동으로 지워져요.
            </div>
          )}

          {pendingSurvey && (
            <Link
              to={`/r/${room.id}/survey/${pendingSurvey.id}`}
              className="flex animate-pop-in items-center gap-3 rounded-xl bg-surface p-3.5 ring-1 ring-line transition hover:ring-line-strong"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full text-pong-500 ring-1 ring-pong-200 dark:ring-pong-900">
                <ClipboardList className="size-4 stroke-[1.5]" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-pong-600 dark:text-pong-300">
                  {pendingSurvey.timing === 'pre' ? '사전 설문' : pendingSurvey.timing === 'post' ? '사후 설문' : '설문'}이 열려 있어요
                </span>
                <span className="block truncate text-[15px]">{pendingSurvey.title}</span>
              </span>
              <span className="text-[13px] text-fg-2">참여하기 →</span>
            </Link>
          )}

          {regOpen && registered === false && !regDismissed && (
            <div className="flex animate-fade-in items-center gap-3 rounded-xl bg-surface px-4 py-3 ring-1 ring-line">
              <span className="min-w-0 flex-1 text-[13px] leading-snug text-fg-2">
                출석 확인을 위해 <span className="text-fg">참석자 등록</span>을 부탁드려요. 1분이면 끝나요.
              </span>
              <Link to={`/reg/${room.reg_token}`} className="shrink-0 text-[13px] text-fg underline decoration-line-strong underline-offset-4 hover:decoration-fg">
                등록하기
              </Link>
              <button
                onClick={() => {
                  setRegDismissed(true)
                  try {
                    sessionStorage.setItem(`ppr-reg-dismiss:${roomId}`, '1')
                  } catch {
                    /* 무시 */
                  }
                }}
                className="-mr-1 shrink-0 rounded-md p-1 text-fg-3 hover:text-fg"
                aria-label="닫기"
              >
                <X className="size-3.5 stroke-[1.6]" />
              </button>
            </div>
          )}

          {!ping ? (
            <div className="rounded-2xl bg-surface py-6 ring-1 ring-line">
              <EmptyState
                icon={<Sparkles />}
                title="곧 첫 번째 핑이 도착해요"
                description="강사가 질문을 띄우면 이 화면이 자동으로 바뀌어요. 화면을 켜 둔 채 잠시 기다려 주세요."
              />
            </div>
          ) : (
            <>
              <PingHero
                ping={ping}
                label={pingLabel(idx, ping)}
                isFocus={ping.id === activeId}
                counts={counts}
                pos={pos}
                total={openPings.length}
                onPrev={() => pos > 0 && goTo(openPings[pos - 1].id)}
                onNext={() => pos < openPings.length - 1 && goTo(openPings[pos + 1].id)}
              />
              {isPoll ? (
                <div className="rounded-2xl bg-surface p-5 ring-1 ring-line">
                  <StudentPoll key={ping.id} node={ping} canVote={canWrite && !!me} />
                </div>
              ) : (
                <>
                  {/* PC: 퐁 쓰기 상자(휴대폰은 아래 고정 바) */}
                  {canWrite && !pingClosed && (
                    <button
                      onClick={() => setComposerOpen(true)}
                      className="hidden w-full items-center gap-3 rounded-2xl bg-surface py-2 pl-4 pr-2 text-left ring-1 ring-line transition hover:ring-line-strong lg:flex"
                    >
                      <PenLine className="size-[18px] stroke-[1.5] text-fg-3" />
                      <span className="flex-1 truncate text-[15px] text-fg-3">{dirty ? '쓰던 퐁 이어서 쓰기…' : '이 핑에 대한 생각을 적어 주세요 · 캡처는 Ctrl+V'}</span>
                      <span className="flex h-10 items-center gap-1.5 rounded-xl bg-pong-500 px-4 text-sm text-white">
                        <MessageCircle className="size-4" />
                        퐁 보내기
                      </span>
                    </button>
                  )}
                  <div className="flex items-center justify-between pt-2">
                    <h2 className="flex items-center gap-2 text-[15px]">
                      퐁 <span className="tabular text-fg-3">{counts.pongs}</span>
                    </h2>
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
                  {pongs.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-line-strong">
                      <EmptyState
                        icon={<MessagesSquare />}
                        title={pingClosed ? '퐁이 마감되었어요' : '아직 퐁이 없어요'}
                        description={pingClosed ? undefined : '첫 번째 퐁을 보내 랠리를 시작해 보세요.'}
                        action={
                          canWrite && !pingClosed ? (
                            <Button variant="pong" onClick={() => setComposerOpen(true)} icon={<PenLine className="size-4" />}>
                              첫 퐁 보내기
                            </Button>
                          ) : undefined
                        }
                      />
                    </div>
                  ) : (
                    <div className="grid items-start gap-3 2xl:grid-cols-2">
                      {pongs.map((p) => (
                        <PongCard
                          key={p.id}
                          pong={p}
                          replies={idx.repliesByPong.get(p.id) ?? []}
                          colorOf={colorOf}
                          viewer={viewer}
                          canWrite={canWrite && !pingClosed}
                          onReply={reply}
                          onEdit={edit}
                          onDelete={remove}
                          fresh={!!initialIds.current && !initialIds.current.has(p.id)}
                          now={now}
                          reactions={reactions.counts[p.id]}
                          myReactions={reactions.mine[p.id]}
                          onReact={canWrite ? reactions.toggle : undefined}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>

      {/* 휴대폰: 하단 작성 바 */}
      {ping && !isPoll && (
        <div className="fixed inset-x-0 bottom-0 z-30 lg:hidden">
          <div className="mx-auto max-w-[640px] px-4 pb-[max(env(safe-area-inset-bottom),14px)] pt-3">
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-bg via-bg/90 to-transparent" />
            {canWrite && !pingClosed ? (
              <button
                onClick={() => setComposerOpen(true)}
                className="relative flex w-full items-center gap-3 rounded-2xl bg-surface py-2 pl-4 pr-2 text-left shadow-pop ring-1 ring-line transition hover:ring-pong-300 active:scale-[0.99]"
              >
                <PenLine className="size-[18px] text-fg-3" />
                <span className="flex-1 truncate text-[15px] text-fg-3">{dirty ? '쓰던 퐁 이어서 쓰기…' : '이 핑에 대한 생각을 적어 주세요'}</span>
                <span className="flex h-10 items-center gap-1.5 rounded-2xl bg-pong-500 px-4 text-sm font-bold text-white">
                  <MessageCircle className="size-4" />
                  퐁 보내기
                </span>
              </button>
            ) : (
              <div className="relative flex items-center justify-center gap-2 rounded-2xl bg-surface-3 px-4 py-3.5 text-sm font-semibold text-fg-2">
                <Lock className="size-4" />
                {phase !== 'live' ? '강의가 종료되어 읽기만 할 수 있어요' : pingClosed ? '이 핑은 퐁이 마감되었어요' : '입장한 참여자만 쓸 수 있어요'}
              </div>
            )}
          </div>
        </div>
      )}

      <Modal
        open={composerOpen}
        onClose={() => {
          setComposerOpen(false)
          setPastedFiles(undefined)
        }}
        title="퐁 보내기"
        description={ping ? <span className="line-clamp-2">{ping.content}</span> : undefined}
        size="lg"
      >
        {ping && roomId && (
          <Composer
            roomId={roomId}
            onSubmit={async (c, a) => {
              await sendPong(c, a)
              setPastedFiles(undefined)
            }}
            autoFocus
            initialFiles={pastedFiles}
            onDirtyChange={setDirty}
            draftKey={`ppr-draft:${ping.id}`}
            placeholder="이 핑에 대한 생각, 경험, 질문을 자유롭게 적어 주세요"
            footerHint="캡처는 Ctrl+V · 보내기는 Ctrl+Enter"
          />
        )}
      </Modal>

      <Modal open={listOpen} onClose={() => setListOpen(false)} title={`핑 목록 ${openPings.length}`} size="md">
        {pingList}
      </Modal>
    </div>
  )
}

/** 핑 목록: PC 왼쪽 칸과 휴대폰 [전체] 시트에서 함께 쓴다. */
function PingList({ pings, idx, viewId, activeId, onPick }: { pings: RallyNode[]; idx: RallyIndex; viewId: string | null; activeId: string | null; onPick: (id: string) => void }) {
  return (
    <ol className="space-y-2">
      {pings.map((p, i) => {
        const selected = p.id === viewId
        const live = p.id === activeId
        const poll = p.type === 'poll'
        const c = rallyCount(idx, p.id)
        const status = poll ? pollMeta(p).status : null
        return (
          <li key={p.id}>
            <button
              onClick={() => onPick(p.id)}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'relative w-full overflow-hidden rounded-xl bg-surface p-3.5 pl-4 text-left ring-1 ring-inset transition',
                selected ? 'ring-fg' : 'ring-line hover:ring-line-strong',
              )}
            >
              {live && <span className={cn('absolute inset-y-0 left-0 w-0.5', poll ? 'bg-poll-500' : 'bg-ping-500')} />}
              <span className="flex items-center gap-2 text-[11.5px]">
                <span className="font-mono text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                <span className={poll ? 'text-poll-600 dark:text-poll-300' : 'text-ping-600 dark:text-ping-300'}>{pingLabel(idx, p)}</span>
                {live && (
                  <span className="flex items-center gap-1 text-ping-600 dark:text-ping-300">
                    <LiveDot tone="ping" className="size-1.5" /> 지금
                  </span>
                )}
              </span>
              <span className="mt-1.5 line-clamp-2 block text-[14px] leading-snug">{p.content}</span>
              <span className="mt-1.5 block text-xs text-fg-3">
                {poll ? (status === 'open' ? '투표 중' : status === 'closed' ? '투표 마감' : '투표 시작 전') : `퐁 ${c.pongs} · 리플 ${c.replies}`}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

function ConnectionBadge({ state, phase }: { state: string; phase: string }) {
  if (phase === 'ended') return <span className="flex items-center gap-1.5"><LiveDot tone="muted" /> 종료됨</span>
  if (state === 'live') return <span className="flex items-center gap-1.5 text-success"><LiveDot /> 실시간</span>
  if (state === 'offline') return <span className="flex items-center gap-1.5 text-danger"><WifiOff className="size-3.5" /> 오프라인</span>
  if (state === 'polling') return <span className="flex items-center gap-1.5 text-warning"><LiveDot tone="warning" /> 자동 새로고침</span>
  return <span className="flex items-center gap-1.5"><LiveDot tone="muted" /> 연결 중</span>
}

function PingHero({
  ping,
  label,
  isFocus,
  counts,
  pos,
  total,
  onPrev,
  onNext,
}: {
  ping: RallyNode
  label: string
  isFocus: boolean
  counts: { pongs: number; replies: number }
  pos: number
  total: number
  onPrev: () => void
  onNext: () => void
}) {
  const poll = ping.type === 'poll'
  return (
    <section
      key={ping.id}
      className={cn('relative animate-pop-in overflow-hidden rounded-2xl bg-surface px-5 pb-5 pt-5 ring-1 sm:px-6', isFocus ? (poll ? 'ring-poll-300 dark:ring-poll-800' : 'ring-ping-300 dark:ring-ping-800') : 'ring-line')}
    >
      <div className="relative flex flex-wrap items-center gap-2">
        {isFocus ? (
          <span className={cn('inline-flex items-center gap-1.5 text-xs', poll ? 'text-poll-600 dark:text-poll-300' : 'text-ping-600 dark:text-ping-300')}>
            <span className={cn('size-1.5 animate-pulse rounded-full', poll ? 'bg-poll-500' : 'bg-ping-500')} /> 지금 다루는 {poll ? '퀵폴' : '핑'}
          </span>
        ) : (
          <span className="text-xs text-fg-3">지난 {poll ? '퀵폴' : '핑'}</span>
        )}
        <span className="text-xs text-fg-3">· {label}</span>
        {poll && <PollStatusBadge node={ping} />}
        {!poll && ping.is_closed && (
          <Badge size="sm" icon={<Lock />}>
            퐁 마감
          </Badge>
        )}
        {total > 1 && pos >= 0 && (
          <div className="-my-1 -mr-2 ml-auto flex items-center text-xs text-fg-3">
            <button onClick={onPrev} disabled={pos <= 0} aria-label="이전 핑" className="rounded-md p-1.5 transition hover:bg-surface-3 hover:text-fg disabled:opacity-30">
              <ChevronLeft className="size-4 stroke-[1.6]" />
            </button>
            <span className="tabular min-w-[2.6rem] text-center">
              {pos + 1} / {total}
            </span>
            <button onClick={onNext} disabled={pos >= total - 1} aria-label="다음 핑" className="rounded-md p-1.5 transition hover:bg-surface-3 hover:text-fg disabled:opacity-30">
              <ChevronRight className="size-4 stroke-[1.6]" />
            </button>
          </div>
        )}
      </div>
      <RichText text={ping.content} className="relative mt-3 text-[20px] font-light leading-[1.55] tracking-[-0.02em] sm:text-[22px]" />
      {ping.attachments.length > 0 && <AttachmentList items={ping.attachments} className="relative mt-4" />}
      {!poll && (
        <div className="relative mt-4 flex items-center gap-3 text-[13px] text-fg-3">
          <span>퐁 {counts.pongs}</span>
          <span className="h-3 w-px bg-line-strong" />
          <span>리플 {counts.replies}</span>
        </div>
      )}
    </section>
  )
}
