import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Turnstile } from '@marsidev/react-turnstile'
import { ArrowLeft, ArrowRight, Dices } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { RoomLookup, SurveyAnswer } from '@/lib/types'
import { errorMessage } from '@/lib/errors'
import { cn, formatRemaining, normalizeCode } from '@/lib/utils'
import { randomNickname, randomNicknames, validateNickname, colorFor } from '@/lib/nickname'
import { useDocumentTitle, useNow } from '@/lib/hooks'
import { Button } from '@/components/ui/Button'
import { Avatar, LiveDot, Logo } from '@/components/ui/Display'
import { BallLoader, useToast } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Field'
import { SurveyForm, validateSurvey } from '@/components/survey/SurveyForm'

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

type Step = 'survey' | 'nickname'
type Phase = 'auth' | 'lookup' | 'ready' | 'notfound' | 'error'

/**
 * 교육생 입장: 코드 → (사전 설문) → 닉네임 → 랠리.
 * 참석자 등록은 입장과 분리되어, 강사가 보낸 등록 링크로 따로 한다.
 */
export default function Join() {
  const params = useParams()
  const code = normalizeCode(params.code ?? '')
  const nav = useNavigate()
  const toast = useToast()
  const [phase, setPhase] = useState<Phase>('auth')
  const [room, setRoom] = useState<RoomLookup | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [step, setStep] = useState<Step>('nickname')
  const [answers, setAnswers] = useState<Record<string, SurveyAnswer>>({})
  const [answeredSurvey, setAnsweredSurvey] = useState(false)
  useDocumentTitle(room?.title ?? '입장')

  const lookup = useCallback(async () => {
    setPhase('lookup')
    try {
      const r = await backend.lookupRoom(code)
      if (!r) return setPhase('notfound')
      const member = await backend.getMyMembership(r.id)
      if (member) return nav(`/r/${r.id}`, { replace: true })
      setRoom(r)
      setStep(r.pre_survey ? 'survey' : 'nickname')
      setPhase('ready')
    } catch (e) {
      setFatal(errorMessage(e))
      setPhase('error')
    }
  }, [code, nav])

  const signIn = useCallback(
    async (token?: string) => {
      try {
        await backend.signInAnonymously(token)
        await lookup()
      } catch (e) {
        setFatal(errorMessage(e))
        setPhase('error')
      }
    },
    [lookup],
  )

  useEffect(() => {
    if (code.length !== 6) return setPhase('notfound')
    let alive = true
    backend.getSession().then((s) => {
      if (!alive) return
      if (s) void lookup()
      else if (!TURNSTILE_KEY) void signIn()
    })
    return () => {
      alive = false
    }
  }, [code, lookup, signIn])

  const steps = useMemo<Step[]>(() => (room?.pre_survey ? ['survey', 'nickname'] : ['nickname']), [room])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [step])

  async function finish(nickname: string) {
    if (!room) return
    const { roomId } = await backend.joinRoom(code, nickname)
    if (room.pre_survey && answeredSurvey) {
      try {
        await backend.submitSurveyResponse(room.pre_survey.id, answers)
      } catch (e) {
        toast.show(`사전 설문을 저장하지 못했어요: ${errorMessage(e)}`, 'danger')
      }
    }
    nav(`/r/${roomId}`, { replace: true })
  }

  if (phase === 'auth' || phase === 'lookup') {
    return (
      <Shell>
        <BallLoader label={phase === 'auth' ? '입장 준비 중' : '강의를 찾는 중'} className="min-h-[60dvh]" />
        {phase === 'auth' && TURNSTILE_KEY && (
          <div className="flex justify-center">
            <Turnstile
              siteKey={TURNSTILE_KEY}
              options={{ appearance: 'interaction-only', size: 'flexible', language: 'ko' }}
              onSuccess={(t) => void signIn(t)}
              onError={() => {
                setFatal('자동 입력 방지 확인에 실패했어요. 새로고침 후 다시 시도해 주세요.')
                setPhase('error')
              }}
            />
          </div>
        )}
      </Shell>
    )
  }

  if (phase === 'notfound' || phase === 'error') {
    return (
      <Shell>
        <div className="flex min-h-[70dvh] flex-col justify-center">
          <p className="eyebrow">입장 코드 {code || '——'}</p>
          <h1 className="mt-3 text-[26px] font-extralight tracking-[-0.03em]">{phase === 'notfound' ? '강의를 찾을 수 없어요' : '입장하지 못했어요'}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-fg-2">
            {phase === 'notfound' ? '코드를 다시 확인하거나, 강의가 끝났는지 강사에게 물어봐 주세요.' : fatal}
          </p>
          <div className="mt-8 flex gap-2">
            <Button onClick={() => nav('/')}>코드 다시 입력</Button>
            <Button variant="ghost" onClick={() => location.reload()}>
              다시 시도
            </Button>
          </div>
        </div>
      </Shell>
    )
  }

  if (!room) return null

  return (
    <Shell room={room}>
      {steps.length > 1 && (
        <p className="eyebrow mb-5">
          {steps.indexOf(step) + 1} / {steps.length}
        </p>
      )}
      <div key={step} className="animate-fade-up">
        {step === 'survey' && room.pre_survey && (
          <SurveyStep
            survey={room.pre_survey}
            answers={answers}
            setAnswers={setAnswers}
            onSubmit={() => {
              setAnsweredSurvey(true)
              setStep('nickname')
            }}
            onSkip={() => {
              setAnsweredSurvey(false)
              setStep('nickname')
            }}
          />
        )}
        {step === 'nickname' && <NicknameStep onBack={steps.length > 1 ? () => setStep('survey') : undefined} onSubmit={finish} />}
      </div>
    </Shell>
  )
}

function Shell({ room, children }: { room?: RoomLookup; children: React.ReactNode }) {
  const now = useNow(60_000)
  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-[520px] px-5 pb-16 pt-5">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="처음으로">
            <Logo size="sm" />
          </Link>
          {room?.expires_at && (
            <span className="flex items-center gap-1.5 text-xs text-fg-3">
              <LiveDot className="size-1.5" />
              {formatRemaining(new Date(room.expires_at).getTime() - now)} 남음
            </span>
          )}
        </div>
        {room && (
          <div className="mt-8 border-b border-line pb-6">
            <h1 className="text-[24px] font-light leading-snug tracking-[-0.03em]">{room.title}</h1>
          </div>
        )}
        <div className="mt-7">{children}</div>
      </div>
    </div>
  )
}

function SurveyStep({
  survey,
  answers,
  setAnswers,
  onSubmit,
  onSkip,
}: {
  survey: NonNullable<RoomLookup['pre_survey']>
  answers: Record<string, SurveyAnswer>
  setAnswers: (a: Record<string, SurveyAnswer>) => void
  onSubmit: () => void
  onSkip: () => void
}) {
  const [errors, setErrors] = useState<Record<string, string>>({})
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-[19px] font-normal tracking-tight">{survey.title}</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-fg-3">
          {survey.anonymous ? '익명으로 모아요.' : '등록 정보와 연결돼요.'} {survey.description}
        </p>
      </div>
      <SurveyForm questions={survey.questions} answers={answers} onChange={setAnswers} errors={errors} />
      <div className="sticky bottom-0 -mx-5 flex gap-2 bg-gradient-to-t from-bg via-bg to-bg/0 px-5 pb-[max(env(safe-area-inset-bottom),16px)] pt-6">
        <Button variant="ghost" size="xl" onClick={onSkip}>
          건너뛰기
        </Button>
        <Button
          size="xl"
          className="flex-1"
          iconRight={<ArrowRight className="size-4 stroke-[1.6]" />}
          onClick={() => {
            const e = validateSurvey(survey.questions, answers)
            setErrors(e)
            const first = Object.keys(e)[0]
            if (first) {
              document.getElementById(`q-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
              return
            }
            onSubmit()
          }}
        >
          다음
        </Button>
      </div>
    </div>
  )
}

function NicknameStep({ onSubmit, onBack }: { onSubmit: (n: string) => Promise<void>; onBack?: () => void }) {
  const [nick, setNick] = useState(() => randomNickname())
  const [suggest, setSuggest] = useState<string[]>(() => randomNicknames(4))
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const shuffle = () => {
    setNick(randomNickname([nick]))
    setSuggest(randomNicknames(4))
    setError(null)
  }
  async function submit() {
    const v = validateNickname(nick)
    if (v) return setError(v)
    setBusy(true)
    setError(null)
    try {
      await onSubmit(nick.trim())
    } catch (e) {
      setError(errorMessage(e))
      setBusy(false)
    }
  }
  return (
    <div>
      <h2 className="text-[19px] font-normal tracking-tight">랠리에서 쓸 닉네임</h2>
      <p className="mt-1 text-[13px] text-fg-3">다른 참석자에게는 닉네임만 보여요.</p>

      <div className="mt-6 flex items-center gap-3">
        <Avatar name={nick || '?'} color={colorFor(nick)} size="lg" />
        <div className="min-w-0 flex-1">
          <Input
            value={nick}
            onChange={(e) => {
              setNick(e.target.value)
              setError(null)
            }}
            maxLength={12}
            inputSize="lg"
            invalid={!!error}
            className="text-[17px]"
            trailing={
              <button onClick={shuffle} className="rounded-md p-2 text-fg-3 transition hover:text-fg" aria-label="닉네임 다시 뽑기">
                <Dices className="size-[18px] stroke-[1.5]" />
              </button>
            }
            onKeyDown={(e) => e.key === 'Enter' && !e.nativeEvent.isComposing && void submit()}
            aria-label="닉네임"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-[13px] text-danger">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-1.5">
        {suggest.map((s) => (
          <button
            key={s}
            onClick={() => {
              setNick(s)
              setError(null)
            }}
            className={cn('rounded-full px-3 py-1.5 text-[13px] ring-1 ring-inset transition', nick === s ? 'text-fg ring-fg' : 'text-fg-2 ring-line hover:ring-line-strong')}
          >
            {s}
          </button>
        ))}
      </div>

      <p className="mt-8 border-t border-line pt-4 text-[12.5px] leading-relaxed text-fg-3">
        실명·연락처 같은 개인정보나 기관 내부 자료는 올리지 마세요. 글과 파일은 강의 시작 72시간 뒤 자동으로 지워져요.
      </p>
      <div className="mt-5 flex gap-2">
        {onBack && (
          <Button variant="secondary" size="xl" onClick={onBack} aria-label="이전">
            <ArrowLeft className="size-4 stroke-[1.6]" />
          </Button>
        )}
        <Button size="xl" className="flex-1" loading={busy} onClick={() => void submit()} iconRight={!busy && <ArrowRight className="size-4 stroke-[1.6]" />}>
          랠리 시작하기
        </Button>
      </div>
    </div>
  )
}
