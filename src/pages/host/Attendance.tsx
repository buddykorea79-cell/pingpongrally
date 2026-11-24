import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router'
import { Download, Eye, EyeOff, FileSpreadsheet, RefreshCw, Search, ShieldAlert, Trash2, Upload, UserCheck } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { Participant, Room, RoomMember, RosterEntry } from '@/lib/types'
import { useDocumentTitle, useNow } from '@/lib/hooks'
import { matchAttendance, parseRosterFile, STATUS_LABEL, type AttendanceStatus } from '@/lib/attendance'
import { errorMessage } from '@/lib/errors'
import { cn, formatClock, formatDateTime, formatRemaining, maskPhone } from '@/lib/utils'
import { HostShell } from '@/components/layout/HostShell'
import { RoomHeader } from '@/components/host/RoomHeader'
import { Button } from '@/components/ui/Button'
import { Badge, Stat } from '@/components/ui/Display'
import { BallLoader, Callout, EmptyState, useToast } from '@/components/ui/Feedback'
import { Segmented } from '@/components/ui/Controls'
import { useConfirm } from '@/components/ui/Overlay'

type Filter = 'all' | AttendanceStatus

export default function Attendance() {
  const { id } = useParams()
  const toast = useToast()
  const confirm = useConfirm()
  const now = useNow(60_000)
  const [room, setRoom] = useState<Room | null | undefined>(undefined)
  const [parts, setParts] = useState<Participant[]>([])
  const [roster, setRoster] = useState<RosterEntry[]>([])
  const [members, setMembers] = useState<RoomMember[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [q, setQ] = useState('')
  const [showPhone, setShowPhone] = useState(false)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  useDocumentTitle(room ? `출석 · ${room.title}` : '출석')

  const load = useCallback(async () => {
    if (!id) return
    try {
      const r = await backend.getRoom(id)
      setRoom(r)
      if (!r) return
      const [p, ro, m] = await Promise.all([backend.listParticipants(id), backend.listRoster(id), backend.listMembers(id)])
      setParts(p)
      setRoster(ro)
      setMembers(m)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
      setRoom(null)
    }
  }, [id, toast])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 15_000)
    return () => clearInterval(t)
  }, [load])

  const { rows, stats } = useMemo(() => matchAttendance(parts, roster, members), [parts, roster, members])
  const joinedRegistered = useMemo(() => {
    const ids = new Set(members.map((m) => m.user_id))
    return parts.filter((p) => ids.has(p.user_id)).length
  }, [parts, members])
  const visible = useMemo(() => {
    const t = q.trim()
    return rows.filter((r) => {
      if (filter !== 'all' && r.status !== filter) return false
      if (!t) return true
      const p = r.participant
      return [p?.org, p?.dept, p?.name, r.roster?.org, r.roster?.name, r.nickname].some((x) => x?.includes(t))
    })
  }, [rows, filter, q])

  if (room === undefined) return <HostShell wide bare><BallLoader className="min-h-[60dvh]" /></HostShell>
  if (!room) return <HostShell><EmptyState title="강의를 찾을 수 없어요" /></HostShell>

  async function upload(f: File | undefined) {
    if (!f || !room) return
    setBusy(true)
    try {
      const parsed = await parseRosterFile(f)
      if (!parsed.length) throw new Error('명단에서 성명을 찾지 못했어요. 첫 줄에 ‘소속 기관, 부서, 성명, 휴대폰 뒤 4자리’ 머리글이 있는지 확인해 주세요.')
      if (roster.length && !(await confirm({ title: '명단을 바꿀까요?', description: `지금 명단 ${roster.length}명을 새 명단 ${parsed.length}명으로 바꿔요.`, confirmText: '바꾸기' }))) return
      setRoster(await backend.replaceRoster(room.id, parsed))
      toast.show(`명단 ${parsed.length}명을 올렸어요.`)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function exportXlsx() {
    if (!room) return
    const ok = await confirm({
      title: '개인정보가 담긴 파일을 내려받아요',
      description: '출석부에는 성명·소속(·휴대폰 번호)이 들어 있어요.',
      body: (
        <ul className="space-y-1.5 rounded-2xl bg-warning-soft p-4 text-[13px] leading-relaxed text-fg-2 ring-1 ring-inset ring-warning/30">
          <li>· 출석 확인 목적 외에는 쓰지 말고, 필요한 기간이 지나면 지워 주세요.</li>
          <li>· 메일·메신저로 보낼 때는 암호를 걸고, 공용 폴더에 두지 마세요.</li>
          <li>· 휴대폰 번호는 {showPhone ? <b>전체가 표시돼요</b> : '가려진 채로 저장돼요'}.</li>
        </ul>
      ),
      confirmText: '확인하고 내려받기',
    })
    if (!ok) return
    const { downloadAttendance } = await import('@/lib/export/excel')
    await downloadAttendance(room, rows, showPhone)
  }

  async function purgeNow() {
    if (!room) return
    const ok = await confirm({
      title: '등록 정보를 지금 파기할까요?',
      description: '참석자 등록 정보, 사전 명단, 설문 응답이 모두 지워지고 되돌릴 수 없어요. 필요한 엑셀은 먼저 내려받아 주세요.',
      confirmText: '지금 파기',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend.purgePiiNow(room.id)
      toast.show('등록 정보를 파기했어요.')
      void load()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  const hasRoster = roster.length > 0
  const piiLeft = room.purge_pii_at ? new Date(room.purge_pii_at).getTime() - now : null

  return (
    <HostShell wide bare>
      <RoomHeader
        room={room}
        now={now}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void load()}>
              새로고침
            </Button>
            <Button size="sm" icon={<Download className="size-4" />} onClick={() => void exportXlsx()} disabled={!rows.length}>
              출석부 엑셀
            </Button>
          </>
        }
      />
      <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6">
        {room.registration === 'off' && (
          <Callout tone="neutral" title="참석자 등록 폼을 아직 만들지 않았어요">
            [관리] 탭의 [참석자 등록]에서 폼을 만들고 링크를 보내면 여기에 명단이 쌓여요.
          </Callout>
        )}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {hasRoster ? (
            <>
              <Stat label="출석" value={stats.present} tone="reply" sub={`명단 ${stats.roster}명 중 ${stats.roster ? Math.round((stats.present / stats.roster) * 100) : 0}%`} />
              <Stat label="미출석" value={stats.absent} tone="danger" sub="명단에 있지만 등록 안 함" />
              <Stat label="명단 외 참석자" value={stats.extra} tone="poll" sub="등록했지만 명단에 없음" />
            </>
          ) : (
            <>
              <Stat label="등록" value={stats.registered} sub="등록 링크로 동의·등록한 사람" />
              <Stat label="등록하고 입장" value={joinedRegistered} sub="같은 휴대폰으로 입장해 이어진 사람" />
              <Stat label="닉네임만 입장" value={Math.max(0, stats.members - joinedRegistered)} sub="등록 없이 입장" />
            </>
          )}
          <Stat label="입장" value={stats.members} sub="랠리에 들어온 사람" />
        </div>

        <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <section className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                options={
                  hasRoster
                    ? [
                        { value: 'all', label: `전체 ${rows.length}` },
                        { value: 'present', label: `출석 ${stats.present}` },
                        { value: 'absent', label: `미출석 ${stats.absent}` },
                        { value: 'extra', label: `명단 외 ${stats.extra}` },
                      ]
                    : [{ value: 'all', label: `등록 ${rows.length}` }]
                }
              />
              <label className="ml-auto flex h-8 items-center gap-2 rounded-lg px-3 ring-1 ring-inset ring-line focus-within:ring-fg/60">
                <Search className="size-3.5 stroke-[1.5] text-fg-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="이름·소속 검색" className="w-36 bg-transparent text-sm outline-none" />
              </label>
              {room.collect_phone && (
                <Button variant="ghost" size="sm" icon={showPhone ? <EyeOff className="size-4" /> : <Eye className="size-4" />} onClick={() => setShowPhone((v) => !v)}>
                  {showPhone ? '번호 가리기' : '전체 보기'}
                </Button>
              )}
            </div>
            {visible.length === 0 ? (
              <EmptyState icon={<UserCheck />} title={rows.length ? '조건에 맞는 사람이 없어요' : '아직 등록한 참석자가 없어요'} description={rows.length ? undefined : '참석자가 등록 링크에서 등록하면 여기에 나타나요.'} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="border-b border-line text-xs text-fg-3">
                    <tr>
                      <th className="px-5 py-3">상태</th>
                      <th className="px-3 py-3">소속 기관</th>
                      <th className="px-3 py-3">부서</th>
                      <th className="px-3 py-3">성명</th>
                      {room.collect_phone && <th className="px-3 py-3">휴대폰</th>}
                      <th className="px-3 py-3">입장(닉네임)</th>
                      <th className="px-5 py-3 text-right">등록</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {visible.map((r) => {
                      const p = r.participant
                      return (
                        <tr key={r.key} className={cn('transition hover:bg-surface-2', r.status === 'absent' && 'text-fg-3')}>
                          <td className="px-5 py-3">
                            <Badge size="sm" tone={r.status === 'present' ? 'reply' : r.status === 'absent' ? 'danger' : r.status === 'extra' ? 'poll' : 'pong'}>
                              {STATUS_LABEL[r.status]}
                            </Badge>
                          </td>
                          <td className="px-3 py-3">{p?.org ?? r.roster?.org}</td>
                          <td className="px-3 py-3">{p?.dept ?? r.roster?.dept}</td>
                          <td className="px-3 py-3 text-fg">{p?.name ?? r.roster?.name}</td>
                          {room.collect_phone && (
                            <td className="tabular px-3 py-3 text-fg-2">{p?.phone ? (showPhone ? p.phone : maskPhone(p.phone)) : r.roster?.phone_last4 ? <span className="text-fg-3">명단 ···{r.roster.phone_last4}</span> : '—'}</td>
                          )}
                          <td className="px-3 py-3 text-fg-2">{r.nickname ?? <span className="text-fg-3">아직</span>}</td>
                          <td className="tabular px-5 py-3 text-right text-xs text-fg-3">{p ? formatClock(p.created_at) : '—'}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
              <h3 className="flex items-center gap-2 text-[14px] font-medium">
                <FileSpreadsheet className="size-4 stroke-[1.5] text-fg-3" /> 사전 명단 대조
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">기관·부서·성명·휴대폰 뒤 4자리가 담긴 엑셀(.xlsx)이나 CSV를 올리면, 성명과 뒤 4자리(없으면 기관+성명)로 자동 매칭해요.</p>
              <input ref={file} type="file" accept=".xlsx,.csv" hidden onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ''))} />
              <button
                onClick={() => file.current?.click()}
                disabled={busy}
                className="mt-4 flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong px-4 py-6 text-center transition hover:border-fg-3 disabled:opacity-60"
              >
                <Upload className="size-5 stroke-[1.5] text-fg-3" />
                <span className="text-sm">{hasRoster ? `명단 ${roster.length}명 · 다시 올리기` : '명단 파일 올리기'}</span>
                <span className="text-xs text-fg-3">.xlsx · .csv</span>
              </button>
              <div className="mt-3 flex items-center justify-between">
                <button
                  onClick={async () => {
                    const { downloadRosterTemplate } = await import('@/lib/export/excel')
                    await downloadRosterTemplate()
                  }}
                  className="text-xs text-fg-2 underline-offset-4 hover:underline"
                >
                  양식 내려받기
                </button>
                {hasRoster && (
                  <button
                    onClick={async () => {
                      if (!(await confirm({ title: '명단을 지울까요?', confirmText: '지우기', tone: 'danger' }))) return
                      setRoster(await backend.replaceRoster(room.id, []))
                    }}
                    className="text-xs text-fg-3 hover:text-danger"
                  >
                    명단 지우기
                  </button>
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-fg-3">명단도 개인정보라 등록 정보와 같은 일정으로 파기돼요.</p>
            </section>

            <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
              <h3 className="flex items-center gap-2 text-[14px] font-medium">
                <ShieldAlert className="size-4 stroke-[1.5] text-fg-3" /> 개인정보 파기
              </h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">
                {room.purge_pii_at ? (
                  <>
                    <span className="text-fg">{formatDateTime(room.purge_pii_at)}</span>
                    {piiLeft !== null && piiLeft > 0 && <> ({formatRemaining(piiLeft)} 뒤)</>}에 등록 정보·명단·설문 응답이 자동 파기돼요.
                  </>
                ) : (
                  '등록 폼을 열거나 강의를 시작하면 파기 일정이 정해져요(종료 7일 뒤).'
                )}
              </p>
              <Button variant="secondary" size="sm" className="mt-4 text-danger" icon={<Trash2 className="size-4" />} onClick={() => void purgeNow()}>
                지금 파기
              </Button>
            </section>
          </aside>
        </div>
      </div>
    </HostShell>
  )
}
