import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { ClipboardList, Download, MonitorPlay, MonitorX, RefreshCw } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { Room, RoomSurvey, SurveyResultRow } from '@/lib/types'
import { useDocumentTitle, useNow } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { HostShell } from '@/components/layout/HostShell'
import { RoomHeader } from '@/components/host/RoomHeader'
import { TIMING_LABEL } from '@/components/host/CreateRoomModal'
import { Button } from '@/components/ui/Button'
import { Badge, Stat } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { QuestionSummary } from '@/components/survey/QuestionSummary'
import { QUESTION_TYPE_LABEL } from '@/components/survey/SurveyForm'

export default function SurveyResults() {
  const { id } = useParams()
  const [params, setParams] = useSearchParams()
  const toast = useToast()
  const now = useNow(60_000)
  const [room, setRoom] = useState<Room | null | undefined>(undefined)
  const [surveys, setSurveys] = useState<RoomSurvey[]>([])
  const [rows, setRows] = useState<SurveyResultRow[] | null>(null)
  const [memberCount, setMemberCount] = useState(0)
  useDocumentTitle(room ? `설문 결과 · ${room.title}` : '설문 결과')

  useEffect(() => {
    if (!id) return
    Promise.all([backend.getRoom(id), backend.listRoomSurveys(id), backend.listMembers(id)])
      .then(([r, s, m]) => {
        setRoom(r)
        setSurveys(s)
        setMemberCount(m.length)
      })
      .catch(() => setRoom(null))
  }, [id])

  const selected = surveys.find((s) => s.id === params.get('s')) ?? surveys[0]

  const loadRows = useCallback(async () => {
    if (!selected) return
    try {
      setRows(await backend.surveyResults(selected.id))
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }, [selected, toast])

  useEffect(() => {
    setRows(null)
    void loadRows()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void loadRows(), 10_000)
    return () => clearInterval(t)
  }, [loadRows])

  const rate = useMemo(() => (memberCount ? Math.round(((rows?.length ?? 0) / memberCount) * 100) : 0), [rows, memberCount])

  if (room === undefined) return <HostShell wide bare><BallLoader className="min-h-[60dvh]" /></HostShell>
  if (!room) return <HostShell><EmptyState title="강의를 찾을 수 없어요" /></HostShell>

  const share = room.present.surveyShare
  const toggleShare = async (questionId: string) => {
    if (!selected) return
    const on = share?.roomSurveyId === selected.id && share.questionId === questionId
    try {
      setRoom(await backend.updateRoom(room.id, { present: { ...room.present, surveyShare: on ? null : { roomSurveyId: selected.id, questionId } } }))
      toast.show(on ? '발표 화면에서 내렸어요.' : '발표 화면에 띄웠어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  return (
    <HostShell wide bare>
      <RoomHeader
        room={room}
        now={now}
        actions={
          selected && (
            <>
              <Button variant="secondary" size="sm" icon={<RefreshCw className="size-4" />} onClick={() => void loadRows()}>
                새로고침
              </Button>
              <Button
                size="sm"
                icon={<Download className="size-4" />}
                disabled={!rows?.length}
                onClick={async () => {
                  const { downloadSurveyResults } = await import('@/lib/export/excel')
                  await downloadSurveyResults(room, selected, rows ?? [])
                }}
              >
                엑셀 내려받기
              </Button>
            </>
          )
        }
      />
      <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6">
        {surveys.length === 0 ? (
          <div className="rounded-2xl bg-surface py-10 ring-1 ring-line">
            <EmptyState icon={<ClipboardList />} title="붙인 설문이 없어요" description="[관리] 탭의 [설문]에서 템플릿을 붙일 수 있어요." />
          </div>
        ) : (
          <div className="grid items-start gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="space-y-2 lg:sticky lg:top-24">
              {surveys.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setParams({ s: s.id })}
                  className={cn('w-full rounded-2xl bg-surface p-4 text-left ring-inset transition', selected?.id === s.id ? 'ring-1 ring-fg' : 'ring-1 ring-line hover:ring-fg-3/50')}
                >
                  <div className="flex items-center gap-1.5">
                    <Badge tone="pong" size="sm">
                      {TIMING_LABEL[s.timing]}
                    </Badge>
                    <Badge size="sm">{s.anonymous ? '익명' : '실명 연결'}</Badge>
                    <span className={cn('ml-auto text-[11px] font-bold', s.status === 'open' ? 'text-success' : 'text-fg-3')}>{s.status === 'open' ? '열림' : s.status === 'closed' ? '닫힘' : '대기'}</span>
                  </div>
                  <p className="mt-2 text-[15px] font-bold">{s.title}</p>
                  <p className="mt-0.5 text-xs text-fg-3">문항 {s.questions.length}개</p>
                </button>
              ))}
            </aside>

            {selected && (
              <section className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Stat label="응답" value={rows?.length ?? '–'} tone="pong" sub="1인 1응답" />
                  <Stat label="응답률" value={`${rate}%`} sub={`입장한 ${memberCount}명 기준`} />
                  <Stat label="공개 방식" value={selected.anonymous ? '익명' : '실명'} sub={selected.anonymous ? '누가 답했는지 알 수 없어요' : '등록 정보와 연결돼요'} />
                </div>
                {rows === null ? (
                  <BallLoader />
                ) : (
                  selected.questions.map((q, i) => {
                    const shared = share?.roomSurveyId === selected.id && share.questionId === q.id
                    return (
                      <article key={q.id} className="rounded-3xl bg-surface p-6 ring-1 ring-line">
                        <div className="mb-5 flex flex-wrap items-start gap-3">
                          <span className="mt-0.5 flex h-6 items-center rounded-lg bg-surface-3 px-2 font-mono text-[11px] font-bold text-fg-2">Q{i + 1}</span>
                          <div className="min-w-0 flex-1">
                            <h3 className="text-[16px] font-bold leading-snug">{q.title}</h3>
                            <p className="mt-0.5 text-xs text-fg-3">
                              {QUESTION_TYPE_LABEL[q.type]}
                              {q.required ? ' · 필수' : ''}
                            </p>
                          </div>
                          <Button
                            size="xs"
                            variant={shared ? 'pong' : 'secondary'}
                            className={cn(shared && 'shadow-none')}
                            icon={shared ? <MonitorX className="size-3.5" /> : <MonitorPlay className="size-3.5" />}
                            onClick={() => void toggleShare(q.id)}
                            title={q.type === 'long' ? '서술형은 기본 비공개예요. 내용을 확인한 뒤 띄워 주세요.' : undefined}
                          >
                            {shared ? '발표 화면에서 내리기' : '발표 화면에 띄우기'}
                          </Button>
                        </div>
                        <QuestionSummary q={q} rows={rows} />
                      </article>
                    )
                  })
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </HostShell>
  )
}
