import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import { AArrowDown, AArrowUp, BarChart3, Expand, Layers, MessageCircle, Network, QrCode, Shrink, Users, X } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RallyNode, Room, RoomMember, RoomSurvey, SurveyResultRow } from '@/lib/types'
import { roomPhase, useDocumentTitle, useNow, useRoomState } from '@/lib/hooks'
import { indexRally, pingLabel, rallyCount, type RallyIndex } from '@/lib/rally'
import { cn, formatRemaining, timeAgo } from '@/lib/utils'
import { LogoMark } from '@/components/ui/Display'
import { BallLoader } from '@/components/ui/Feedback'
import { RichText } from '@/components/rally/RichText'
import { PollBars, pollMeta, usePollResults } from '@/components/rally/Poll'
import { REACTIONS, reactionCounts } from '@/lib/reactions'
import { QuestionSummary } from '@/components/survey/QuestionSummary'
import { joinUrl } from '@/components/host/RoomPanel'

const NetworkView = lazy(() => import('./NetworkView'))

export default function Present() {
  const { roomId } = useParams()
  const state = useRoomState(roomId)
  const { room, nodes, members, surveys } = state
  const now = useNow(20_000)
  const [scale, setScale] = useState(() => Number(localStorage.getItem('ppr-present-scale')) || 1)
  const [chrome, setChrome] = useState(true)
  const [full, setFull] = useState(false)
  const [bigQr, setBigQr] = useState(false)
  useDocumentTitle(room ? `발표 · ${room.title}` : '발표 화면')

  useEffect(() => {
    localStorage.setItem('ppr-present-scale', String(scale))
  }, [scale])

  // 마우스가 멈추면 도구 막대를 숨긴다
  useEffect(() => {
    let t: number | undefined
    const wake = () => {
      setChrome(true)
      clearTimeout(t)
      t = window.setTimeout(() => setChrome(false), 3000)
    }
    wake()
    window.addEventListener('mousemove', wake)
    return () => {
      clearTimeout(t)
      window.removeEventListener('mousemove', wake)
    }
  }, [])

  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])

  const setPresent = useCallback(
    async (patch: Partial<Room['present']>) => {
      if (!room) return
      try {
        state.setRoom(await backend.updateRoom(room.id, { present: { ...room.present, ...patch } }))
      } catch {
        /* 발표 화면에서는 조용히 넘어간다 */
      }
    },
    [room, state],
  )

  // 단축키: 1 보드, 2 네트워크, Q QR, F 전체 화면, +/- 글자 크기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea')) return
      if (e.key === '1') void setPresent({ view: 'board' })
      else if (e.key === '2') void setPresent({ view: 'network' })
      else if (e.key === 'q' || e.key === 'Q') setBigQr((v) => !v)
      else if (e.key === 'f' || e.key === 'F') void toggleFull()
      else if (e.key === '+' || e.key === '=') setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))
      else if (e.key === '-') setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))
      else if (e.key === 'Escape') setBigQr(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setPresent])

  const idx = useMemo(() => indexRally(nodes), [nodes])

  if (state.status === 'loading')
    return (
      <div className="dark fixed inset-0 bg-[#07080c] text-white">
        <BallLoader className="h-full" label="발표 화면 준비 중" />
      </div>
    )
  if (!room) return <div className="dark fixed inset-0 flex items-center justify-center bg-[#07080c] text-white/70">강의를 찾을 수 없어요.</div>

  const phase = roomPhase(room, now)
  const active = room.active_ping_id ? idx.byId.get(room.active_ping_id) ?? null : null
  const showQr = room.present.showQr && phase === 'live'
  const share = room.present.surveyShare
  const sharedSurvey = share ? surveys.find((s) => s.id === share.roomSurveyId) : undefined

  return (
    <div className="dark fixed inset-0 overflow-clip bg-[#07080c] text-white" style={{ ['--ps' as string]: scale }}>
      <Atmosphere poll={active?.type === 'poll'} />

      <header className="relative z-10 flex h-[88px] items-center gap-4 px-10">
        <LogoMark className="size-10" mono />
        <p className="min-w-0 flex-1 truncate text-xl font-semibold text-white/70">{room.title}</p>
        <div className="flex items-center gap-2.5">
          <Pill icon={<Users />}>{members.length}명 참여</Pill>
          {phase === 'live' && room.expires_at && <Pill>{formatRemaining(new Date(room.expires_at).getTime() - now)} 남음</Pill>}
          {phase === 'ended' && <Pill>강의 종료</Pill>}
          {state.connection !== 'live' && <Pill tone="warn">{state.connection === 'polling' ? '자동 새로고침' : '연결 중'}</Pill>}
        </div>
      </header>

      <main className={cn('relative z-10 grid h-[calc(100dvh-88px)] gap-8 px-10 pb-10', showQr ? 'grid-cols-[minmax(0,1fr)_300px]' : 'grid-cols-1')}>
        <section className="relative min-h-0">
          {phase === 'draft' ? (
            <Waiting title="강의 시작 전이에요" sub="강사 진행 화면에서 [강의 시작]을 누르면 입장 코드와 QR이 나타나요." />
          ) : room.present.view === 'network' ? (
            <Suspense fallback={<BallLoader className="h-full" label="네트워크를 그리는 중" />}>
              <NetworkView title={room.title} nodes={nodes} members={members} activePingId={room.active_ping_id} />
            </Suspense>
          ) : !active ? (
            phase === 'live' ? (
              <Welcome room={room} />
            ) : (
              <Waiting title="강의가 끝났어요" sub={`핑 ${idx.pings.length}개 · 퐁 ${nodes.filter((n) => n.type === 'pong').length}개가 오갔어요. 함께해 주셔서 감사합니다.`} />
            )
          ) : (
            <Board ping={active} idx={idx} members={members} now={now} />
          )}
        </section>
        {showQr && <QrRail room={room} onExpand={() => setBigQr(true)} pongs={nodes.filter((n) => n.type !== 'ping' && n.type !== 'poll').length} members={members.length} />}
      </main>

      {share && sharedSurvey && <SurveyOverlay survey={sharedSurvey} questionId={share.questionId} onClose={() => void setPresent({ surveyShare: null })} />}

      {bigQr && phase === 'live' && (
        <div className="fixed inset-0 z-40 flex animate-fade-in items-center justify-center bg-[#07080c]/92 backdrop-blur-md" onClick={() => setBigQr(false)}>
          <div className="flex items-center gap-20">
            <div className="rounded-[40px] bg-white p-8 shadow-pop">
              <QRCodeSVG value={joinUrl(room.code)} size={Math.min(window.innerHeight * 0.55, 520)} level="M" marginSize={0} />
            </div>
            <div>
              <p className="text-2xl font-semibold text-white/60">휴대폰 카메라로 QR을 비추거나</p>
              <p className="mt-6 text-xl font-semibold text-white/50">입장 코드</p>
              <p className="font-mono text-[120px] font-bold leading-none tracking-[0.08em]">{room.code}</p>
              <p className="mt-6 text-2xl text-white/60">{joinUrl(null).replace(/^https?:\/\//, '').replace(/\/j\/$/, '')} 에서 입력</p>
            </div>
          </div>
        </div>
      )}

      {/* 도구 막대 */}
      <div className={cn('fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl bg-white/[0.08] p-1.5 ring-1 ring-white/12 backdrop-blur transition-all duration-300', chrome ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0')}>
        <ToolButton active={room.present.view === 'board'} onClick={() => void setPresent({ view: 'board' })} label="보드 뷰 (1)">
          <Layers /> 보드
        </ToolButton>
        <ToolButton active={room.present.view === 'network'} onClick={() => void setPresent({ view: 'network' })} label="네트워크 뷰 (2)">
          <Network /> 네트워크
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <ToolButton active={room.present.showQr} onClick={() => void setPresent({ showQr: !room.present.showQr })} label="QR 표시">
          <QrCode />
        </ToolButton>
        <ToolButton onClick={() => setBigQr(true)} label="QR 크게 (Q)">
          QR 크게
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <ToolButton onClick={() => setScale((s) => Math.max(0.7, +(s - 0.1).toFixed(2)))} label="글자 작게 (-)">
          <AArrowDown />
        </ToolButton>
        <span className="tabular w-10 text-center text-xs font-semibold text-white/60">{Math.round(scale * 100)}%</span>
        <ToolButton onClick={() => setScale((s) => Math.min(1.6, +(s + 0.1).toFixed(2)))} label="글자 크게 (+)">
          <AArrowUp />
        </ToolButton>
        <span className="mx-1 h-6 w-px bg-white/15" />
        <ToolButton onClick={() => void toggleFull()} label="전체 화면 (F)">
          {full ? <Shrink /> : <Expand />}
        </ToolButton>
      </div>
    </div>
  )
}

async function toggleFull() {
  if (document.fullscreenElement) await document.exitFullscreen()
  else await document.documentElement.requestFullscreen().catch(() => {})
}

function Atmosphere({ poll }: { poll?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-clip">
      <div className={cn('absolute inset-x-0 top-0 h-px transition-colors duration-1000', poll ? 'bg-poll-500/50' : 'bg-ping-500/50')} />
    </div>
  )
}

function Pill({ children, icon, tone }: { children: React.ReactNode; icon?: React.ReactNode; tone?: 'warn' }) {
  return (
    <span className={cn('tabular flex h-10 items-center gap-2 rounded-full px-4 text-[15px] font-semibold ring-1 [&_svg]:size-4', tone === 'warn' ? 'bg-warning/15 text-warning ring-warning/30' : 'bg-white/[0.06] text-white/80 ring-white/10')}>
      {icon}
      {children}
    </span>
  )
}

function ToolButton({ children, onClick, active, label }: { children: React.ReactNode; onClick: () => void; active?: boolean; label: string }) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn('flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-semibold transition [&_svg]:size-[18px]', active ? 'bg-white text-ink-900' : 'text-white/75 hover:bg-white/10 hover:text-white')}
    >
      {children}
    </button>
  )
}

function QrRail({ room, onExpand, pongs, members }: { room: Room; onExpand: () => void; pongs: number; members: number }) {
  return (
    <aside className="flex min-h-0 flex-col gap-4">
      <button onClick={onExpand} className="rounded-2xl bg-white p-5 text-left text-ink-900 shadow-pop transition hover:scale-[1.01]">
        <QRCodeSVG value={joinUrl(room.code)} size={260} level="M" marginSize={0} className="h-auto w-full" />
        <p className="mt-4 text-center text-sm font-semibold text-ink-500">입장 코드</p>
        <p className="text-center font-mono text-[44px] font-bold leading-none tracking-[0.1em]">{room.code}</p>
      </button>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-3xl bg-white/[0.05] p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold text-white/50">퐁·리플</p>
          <p className="tabular mt-1 text-[34px] font-extrabold leading-none">{pongs}</p>
        </div>
        <div className="rounded-3xl bg-white/[0.05] p-4 ring-1 ring-white/10">
          <p className="text-sm font-semibold text-white/50">참여</p>
          <p className="tabular mt-1 text-[34px] font-extrabold leading-none">
            {members}
          </p>
        </div>
      </div>
      <p className="mt-auto text-center text-sm leading-relaxed text-white/40">설치·가입 없이 휴대폰으로 참여하세요.</p>
    </aside>
  )
}

function Welcome({ room }: { room: Room }) {
  return (
    <div className="flex h-full flex-col items-start justify-center">
      <p className="text-[calc(24px*var(--ps))] font-semibold text-ping-400">곧 첫 번째 핑이 시작돼요</p>
      <h1 className="mt-4 max-w-5xl text-[calc(64px*var(--ps))] font-extrabold leading-[1.15] tracking-[-0.04em]">{room.title}</h1>
      <p className="mt-6 text-[calc(26px*var(--ps))] text-white/55">휴대폰 카메라로 QR을 비추거나, 입장 코드 <b className="font-mono text-white">{room.code}</b> 를 입력하세요.</p>
    </div>
  )
}

function Waiting({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <LogoMark className="size-20" mono />
      <h1 className="mt-8 text-[calc(52px*var(--ps))] font-extrabold tracking-[-0.03em]">{title}</h1>
      <p className="mt-4 max-w-3xl text-[calc(24px*var(--ps))] leading-relaxed text-white/55">{sub}</p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 보드 뷰
// ---------------------------------------------------------------------------
function Board({ ping, idx, members, now }: { ping: RallyNode; idx: RallyIndex; members: RoomMember[]; now: number }) {
  const poll = ping.type === 'poll'
  const counts = rallyCount(idx, ping.id)
  const colors = useMemo(() => new Map(members.map((m) => [m.user_id, m.color])), [members])
  const pongs = useMemo(() => (idx.pongsByPing.get(ping.id) ?? []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)), [idx, ping.id])
  const seen = useRef<Set<string> | null>(null)
  if (!seen.current) seen.current = new Set(pongs.map((p) => p.id))
  const shown = pongs.slice(0, 30)
  const img = ping.attachments.find((a) => a.kind === 'image')

  return (
    <div key={ping.id} className="flex h-full min-h-0 flex-col">
      <div className="flex animate-fade-up gap-8">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <span className={cn('flex h-9 items-center gap-2 rounded-full px-4 text-[calc(16px*var(--ps))] font-bold', poll ? 'bg-poll-500' : 'bg-ping-500')}>
              {poll ? <BarChart3 className="size-[18px]" /> : <span className="size-2 animate-pulse rounded-full bg-white" />}
              {pingLabel(idx, ping)}
            </span>
            {!poll && (
              <span className="text-[calc(18px*var(--ps))] font-semibold text-white/50">
                퐁 {counts.pongs} · 리플 {counts.replies}
              </span>
            )}
            {!poll && ping.is_closed && <span className="rounded-full bg-white/10 px-3 py-1 text-[calc(15px*var(--ps))] font-semibold text-white/60">퐁 마감</span>}
          </div>
          <RichText text={ping.content} className="mt-5 line-clamp-4 text-[calc(46px*var(--ps))] font-extrabold leading-[1.28] tracking-[-0.03em]" />
        </div>
        {img && <img src={img.url} alt="" className="max-h-[220px] max-w-[30%] shrink-0 rounded-3xl object-cover ring-1 ring-white/10" />}
      </div>

      {poll ? (
        <PresentPoll ping={ping} />
      ) : shown.length === 0 ? (
        <div className="mt-10 flex flex-1 items-center justify-center rounded-2xl border-2 border-dashed border-white/10">
          <p className="flex items-center gap-3 text-[calc(28px*var(--ps))] font-semibold text-white/40">
            <MessageCircle className="size-8" /> 휴대폰에서 [퐁 보내기]를 눌러 답해 주세요
          </p>
        </div>
      ) : (
        <div className="scrollbar-none mt-8 min-h-0 flex-1 overflow-y-auto pb-24 [mask-image:linear-gradient(to_bottom,black_85%,transparent)]">
          <div className="columns-1 gap-5 md:columns-2 2xl:columns-3">
            {shown.map((p) => {
              const replies = idx.repliesByPong.get(p.id) ?? []
              const fresh = !seen.current!.has(p.id)
              const pimg = p.attachments.find((a) => a.kind === 'image')
              return (
                <article
                  key={p.id}
                  className={cn('mb-5 break-inside-avoid rounded-2xl bg-white/[0.055] p-6 ring-1 ring-white/10 backdrop-blur', fresh && 'animate-pop-in')}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 items-center justify-center rounded-full text-[15px] font-bold" style={{ background: p.is_host ? '#14171F' : (colors.get(p.author_id) ?? '#5A68F8'), boxShadow: p.is_host ? '0 0 0 2px #FF6A3D' : undefined }}>
                      {p.is_host ? '강' : p.author_nickname[0]}
                    </span>
                    <span className="text-[calc(17px*var(--ps))] font-bold text-white/85">{p.author_nickname}</span>
                    <span className="ml-auto text-[calc(14px*var(--ps))] text-white/35">{timeAgo(p.created_at, now)}</span>
                  </div>
                  {p.content && <RichText text={p.content} className="mt-3 text-[calc(22px*var(--ps))] font-medium leading-[1.55] text-white" mentionClass="text-reply-300" />}
                  {pimg && <img src={pimg.thumb_url || pimg.url} alt="" loading="lazy" className="mt-4 max-h-64 w-full rounded-2xl object-cover" />}
                  <ReactionSummary node={p} />
                  {p.attachments.filter((a) => a.kind !== 'image').length > 0 && (
                    <p className="mt-3 text-[calc(15px*var(--ps))] font-semibold text-white/50">📎 첨부 {p.attachments.filter((a) => a.kind !== 'image').length}개</p>
                  )}
                  {replies.length > 0 && (
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4">
                      {replies.slice(-2).map((r) => (
                        <p key={r.id} className="text-[calc(16px*var(--ps))] leading-snug text-white/70">
                          <b className="font-bold text-reply-300">{r.author_nickname}</b> {r.content.replace(/^@\S+\s?/, '')}
                        </p>
                      ))}
                      {replies.length > 2 && <p className="text-[calc(14px*var(--ps))] font-semibold text-white/40">리플 {replies.length - 2}개 더</p>}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
          {pongs.length > shown.length && <p className="text-center text-lg text-white/40">최근 {shown.length}개만 보여요 · 전체 {pongs.length}개</p>}
        </div>
      )}
    </div>
  )
}

function PresentPoll({ ping }: { ping: RallyNode }) {
  const { results } = usePollResults(ping, 2000)
  const m = pollMeta(ping)
  return (
    <div className="mt-10 flex min-h-0 flex-1 flex-col justify-center">
      <div className="mx-auto w-full max-w-5xl" style={{ zoom: 'var(--ps)' } as React.CSSProperties}>
        {m.status === 'ready' ? (
          m.options.every((o) => o.label.trim().length <= 4) ? (
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${m.options.length}, minmax(0, 1fr))` }}>
              {m.options.map((o) => (
                <div key={o.id} className="flex h-32 items-center justify-center rounded-2xl bg-white/[0.06] text-[48px] font-light ring-1 ring-white/10">
                  {o.label}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {m.options.map((o, i) => (
                <div key={o.id} className="flex items-center gap-5 rounded-2xl bg-white/[0.06] px-7 py-6 text-[28px] font-bold ring-1 ring-white/10">
                  <span className="flex size-12 items-center justify-center rounded-2xl bg-poll-500 font-mono text-xl">{String.fromCharCode(65 + i)}</span>
                  {o.label}
                </div>
              ))}
            </div>
          )
        ) : (
          <PollBars meta={m} results={results} tone="dark" size="xl" />
        )}
        <p className="mt-6 text-center text-xl font-semibold text-white/45">
          {m.status === 'ready' ? '곧 투표가 시작돼요' : m.status === 'open' ? '휴대폰에서 투표해 주세요 · 2초마다 갱신' : '투표가 마감되었어요'}
        </p>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 설문 결과 공유
// ---------------------------------------------------------------------------
function SurveyOverlay({ survey, questionId, onClose }: { survey: RoomSurvey; questionId: string; onClose: () => void }) {
  const [rows, setRows] = useState<SurveyResultRow[]>([])
  const q = survey.questions.find((x) => x.id === questionId) ?? survey.questions[0]
  useEffect(() => {
    let alive = true
    const load = () =>
      backend
        .surveyResults(survey.id)
        .then((r) => alive && setRows(r))
        .catch(() => {})
    void load()
    const t = window.setInterval(load, 5000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [survey.id])
  if (!q) return null
  const i = survey.questions.indexOf(q)
  return (
    <div className="fixed inset-0 z-30 flex animate-fade-in flex-col bg-[#07080c]/94 px-16 py-14 backdrop-blur">
      <div className="flex items-start gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-2xl font-semibold text-pong-300">
            {survey.title} · Q{i + 1} · {rows.length}명 응답
          </p>
          <h2 className="mt-3 text-[calc(48px*var(--ps))] font-extrabold leading-tight tracking-[-0.03em]">{q.title}</h2>
        </div>
        <button onClick={onClose} className="rounded-2xl p-3 text-white/50 hover:bg-white/10 hover:text-white" aria-label="닫기">
          <X className="size-7" />
        </button>
      </div>
      <div className="scrollbar-none mt-12 min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl">
          <QuestionSummary q={q} rows={rows} tone="dark" size="xl" />
        </div>
      </div>
    </div>
  )
}

/** 발표 화면 보드: 퐁에 모인 이모지를 작게 */
function ReactionSummary({ node }: { node: RallyNode }) {
  const counts = reactionCounts(node)
  const shown = REACTIONS.filter((r) => (counts[r.kind] ?? 0) > 0)
  if (!shown.length) return null
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {shown.map((r) => (
        <span key={r.kind} className="flex items-center gap-1.5 rounded-full bg-white/[0.07] px-3 py-1 text-[calc(18px*var(--ps))] leading-none">
          {r.emoji}
          {(counts[r.kind] ?? 0) > 1 && <span className="tabular text-[calc(14px*var(--ps))] text-white/60">{counts[r.kind]}</span>}
        </span>
      ))}
    </div>
  )
}
