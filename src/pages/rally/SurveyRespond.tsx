import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ArrowLeft, CheckCircle2, Lock } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RoomSurvey, SurveyAnswer } from '@/lib/types'
import { useDocumentTitle, useRoomEvents } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { SurveyForm, isAnswered, validateSurvey } from '@/components/survey/SurveyForm'

export default function SurveyRespond() {
  const { roomId, surveyId } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const [survey, setSurvey] = useState<RoomSurvey | null | undefined>(undefined)
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({})
  const [submittedAt, setSubmittedAt] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(true)
  useDocumentTitle(survey?.title)

  useEffect(() => {
    if (!roomId || !surveyId) return
    let alive = true
    ;(async () => {
      try {
        const list = await backend.listRoomSurveys(roomId)
        const s = list.find((x) => x.id === surveyId) ?? null
        if (!alive) return
        setSurvey(s)
        if (s) {
          const mine = await backend.getMySurveyResponse(s.id)
          if (mine && alive) {
            setAnswers(mine.answers)
            setSubmittedAt(mine.submitted_at)
            setEditing(false)
          }
        }
      } catch {
        if (alive) setSurvey(null)
      }
    })()
    return () => {
      alive = false
    }
  }, [roomId, surveyId])

  // 설문이 닫히면 바로 반영
  useRoomEvents(roomId, (e) => {
    if (e.table === 'room_surveys' && e.record.id === surveyId) setSurvey(e.record)
  })

  const progress = useMemo(() => {
    if (!survey) return 0
    const n = survey.questions.filter((q) => isAnswered(q, answers[q.id])).length
    return survey.questions.length ? n / survey.questions.length : 0
  }, [survey, answers])

  if (survey === undefined) return <BallLoader className="min-h-dvh" />
  if (!survey)
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState icon={<Lock />} title="설문을 찾을 수 없어요" action={<Button onClick={() => nav(`/r/${roomId}`)}>랠리로 돌아가기</Button>} />
      </div>
    )

  const open = survey.status === 'open'

  async function submit() {
    if (!survey) return
    const e = validateSurvey(survey.questions, answers)
    setErrors(e)
    const first = Object.keys(e)[0]
    if (first) {
      document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setSaving(true)
    try {
      const r = await backend.submitSurveyResponse(survey.id, answers)
      setSubmittedAt(r.submitted_at)
      setEditing(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      toast.show(submittedAt ? '답변을 고쳤어요.' : '제출했어요. 감사합니다!')
    } catch (err) {
      toast.show(errorMessage(err), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh bg-bg pb-28">
      <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/80 backdrop-blur">
        <div className="mx-auto flex max-w-[640px] items-center gap-2 px-3 py-2.5">
          <IconButton label="랠리로 돌아가기" onClick={() => nav(`/r/${roomId}`)}>
            <ArrowLeft />
          </IconButton>
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold">{survey.title}</p>
          <span className="tabular pr-2 text-xs font-semibold text-fg-3">{Math.round(progress * 100)}%</span>
        </div>
        <div className="h-[3px] bg-surface-3">
          <div className="h-full bg-gradient-to-r from-pong-500 to-reply-500 transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
        </div>
      </header>

      <main className="mx-auto max-w-[640px] space-y-4 px-4 pt-5">
        <div className="px-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge tone="pong">{survey.timing === 'pre' ? '사전 설문' : survey.timing === 'live' ? '중간 설문' : '사후 설문'}</Badge>
            <Badge tone="neutral">{survey.anonymous ? '익명' : '실명 연결'}</Badge>
            {!open && <Badge tone="danger" icon={<Lock />}>닫힘</Badge>}
          </div>
          <h1 className="mt-3 text-[22px] font-bold leading-snug tracking-tight">{survey.title}</h1>
          {survey.description && <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">{survey.description}</p>}
          <p className="mt-2 text-[13px] text-fg-3">
            {survey.anonymous ? '응답은 누가 썼는지 알 수 없게 집계돼요.' : '응답이 참석자 등록 정보와 함께 저장돼요.'} 설문이 닫히기 전까지 답을 고칠 수 있어요.
          </p>
        </div>

        {submittedAt && !editing && (
          <div className="flex animate-pop-in items-center gap-3 rounded-2xl bg-success-soft px-4 py-3.5 ring-1 ring-inset ring-success/25">
            <CheckCircle2 className="size-5 shrink-0 text-success" />
            <div className="flex-1 text-sm">
              <p className="font-bold">제출했어요</p>
              <p className="text-[13px] text-fg-2">{formatDateTime(submittedAt)}</p>
            </div>
            {open && (
              <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
                답 고치기
              </Button>
            )}
          </div>
        )}

        <SurveyForm questions={survey.questions} answers={answers} onChange={setAnswers} errors={errors} disabled={!open || !editing} />
      </main>

      {open && editing && (
        <div className="fixed inset-x-0 bottom-0 z-30 bg-gradient-to-t from-bg via-bg to-transparent pt-6">
          <div className="mx-auto max-w-[640px] px-4 pb-[max(env(safe-area-inset-bottom),14px)]">
            <Button size="xl" block variant="pong" loading={saving} onClick={() => void submit()}>
              {submittedAt ? '고친 답 제출하기' : '제출하기'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
