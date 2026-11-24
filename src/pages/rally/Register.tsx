import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Turnstile } from '@marsidev/react-turnstile'
import { ArrowRight, Check, ChevronDown } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { Participant, RegistrationLookup } from '@/lib/types'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime, formatPhoneInput, maskPhone, PHONE_RE } from '@/lib/utils'
import { useDocumentTitle } from '@/lib/hooks'
import { Button } from '@/components/ui/Button'
import { Logo } from '@/components/ui/Display'
import { BallLoader, useToast } from '@/components/ui/Feedback'
import { Field, Input } from '@/components/ui/Field'
import { Checkbox } from '@/components/ui/Controls'
import { useConfirm } from '@/components/ui/Overlay'
import { ConsentNotices, OptionalConsentText, RequiredConsentText } from '@/components/rally/Consent'

const TURNSTILE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined

type Phase = 'auth' | 'lookup' | 'form' | 'done' | 'notfound' | 'error'

/**
 * 참석자 등록(/reg/:token) — 강사가 보낸 링크로 여는 설문형 폼.
 * 강의 전에 미리 할 수 있고, 같은 휴대폰으로 강의에 입장하면 등록과 닉네임이 자동으로 이어진다.
 */
export default function Register() {
  const { token = '' } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [phase, setPhase] = useState<Phase>('auth')
  const [info, setInfo] = useState<RegistrationLookup | null>(null)
  const [mine, setMine] = useState<Participant | null>(null)
  const [preview, setPreview] = useState(false)
  const [fatal, setFatal] = useState<string | null>(null)
  useDocumentTitle(info ? `참석자 등록 · ${info.title}` : '참석자 등록')

  const load = useCallback(async () => {
    setPhase('lookup')
    try {
      const r = await backend.lookupRegistration(token)
      if (!r) return setPhase('notfound')
      setInfo(r)
      const p = await backend.getMyParticipant(r.room_id).catch(() => null)
      setMine(p)
      setPhase(p ? 'done' : 'form')
    } catch (e) {
      setFatal(errorMessage(e))
      setPhase('error')
    }
  }, [token])

  const signIn = useCallback(
    async (captcha?: string) => {
      try {
        await backend.signInAnonymously(captcha)
        await load()
      } catch (e) {
        setFatal(errorMessage(e))
        setPhase('error')
      }
    },
    [load],
  )

  useEffect(() => {
    let alive = true
    backend.getSession().then((s) => {
      if (!alive) return
      if (s) {
        // 강사 계정으로 열면(미리 보기) 실제로 등록하지 않는다.
        setPreview(!s.isAnonymous)
        void load()
      } else if (!TURNSTILE_KEY) void signIn()
    })
    return () => {
      alive = false
    }
  }, [load, signIn])

  async function withdraw() {
    if (!info) return
    const ok = await confirm({
      title: '등록을 삭제할까요?',
      description: '소속·성명·휴대폰 번호가 바로 지워지고 동의도 철회돼요. 출석이 확인되지 않을 수 있어요.',
      confirmText: '삭제',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend.deleteMyParticipant(info.room_id)
      setMine(null)
      setPhase('form')
      toast.show('등록 정보를 삭제했어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  const open = info?.registration === 'open' && info.room_status !== 'closed'

  return (
    <div className="min-h-dvh bg-bg">
      <div className="mx-auto max-w-[520px] px-5 pb-16 pt-5">
        <Link to="/" aria-label="처음으로" className="inline-flex">
          <Logo size="sm" />
        </Link>

        {(phase === 'auth' || phase === 'lookup') && (
          <>
            <BallLoader label="등록 폼을 여는 중" className="min-h-[60dvh]" />
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
          </>
        )}

        {(phase === 'notfound' || phase === 'error') && (
          <div className="flex min-h-[70dvh] flex-col justify-center">
            <p className="eyebrow">참석자 등록</p>
            <h1 className="mt-3 text-[26px] font-extralight tracking-[-0.03em]">{phase === 'notfound' ? '등록 폼을 찾을 수 없어요' : '폼을 열지 못했어요'}</h1>
            <p className="mt-3 text-[15px] leading-relaxed text-fg-2">{phase === 'notfound' ? '받은 링크를 다시 확인하거나 강사에게 문의해 주세요.' : fatal}</p>
          </div>
        )}

        {info && (phase === 'form' || phase === 'done') && (
          <>
            <header className="mt-8 border-b border-line pb-6">
              <p className="eyebrow">참석자 등록</p>
              <h1 className="mt-2 text-[24px] font-light leading-snug tracking-[-0.03em]">{info.title}</h1>
              <p className="mt-2 text-[13.5px] text-fg-3">출석 확인에만 쓰이고, 다른 참석자에게는 보이지 않아요.</p>
            </header>

            {preview && (
              <p className="mt-6 rounded-lg bg-surface-2 px-3.5 py-2.5 text-[13px] text-fg-2 ring-1 ring-inset ring-line">
                강사 계정으로 연 미리 보기예요. 참석자에게는 이 화면이 그대로 보이고, 여기서는 제출되지 않아요.
              </p>
            )}

            {phase === 'done' && mine ? (
              <Done
                info={info}
                mine={mine}
                onEdit={open ? () => setPhase('form') : undefined}
                onWithdraw={() => void withdraw()}
                onJoin={info.code ? () => nav(`/j/${info.code}`) : undefined}
              />
            ) : open ? (
              <RegisterForm
                info={info}
                initial={mine}
                disabled={preview}
                onCancel={mine ? () => setPhase('done') : undefined}
                onDone={(p) => {
                  setMine(p)
                  setPhase('done')
                  window.scrollTo({ top: 0 })
                }}
                token={token}
              />
            ) : (
              <div className="mt-10">
                <h2 className="text-[19px] font-light">{info.room_status === 'closed' ? '강의가 끝나 등록을 받지 않아요' : '등록이 마감되었어요'}</h2>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-2">궁금한 점은 강사에게 문의해 주세요.{info.contact && ` (${info.contact})`}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Done({
  info,
  mine,
  onEdit,
  onWithdraw,
  onJoin,
}: {
  info: RegistrationLookup
  mine: Participant
  onEdit?: () => void
  onWithdraw: () => void
  onJoin?: () => void
}) {
  return (
    <div className="mt-10 animate-fade-up">
      <span className="flex size-11 items-center justify-center rounded-full ring-1 ring-success/40 text-success">
        <Check className="size-5 stroke-[1.5]" />
      </span>
      <h2 className="mt-5 text-[24px] font-extralight tracking-[-0.03em]">등록했어요</h2>
      <p className="mt-2 text-[14.5px] leading-relaxed text-fg-2">
        강의 당일 <span className="text-fg">이 휴대폰</span>으로 입장 QR을 찍으면 출석이 자동으로 확인돼요.
      </p>

      <dl className="mt-7 divide-y divide-line rounded-xl ring-1 ring-line">
        <Row label="성명" value={mine.name} />
        <Row label="소속" value={`${mine.org} · ${mine.dept}`} />
        {info.collect_phone && <Row label="휴대폰" value={mine.phone ? maskPhone(mine.phone) : '받지 않음'} />}
        <Row label="자동 파기" value={info.purge_pii_at ? formatDateTime(info.purge_pii_at) : '강의 종료 7일 뒤'} />
      </dl>

      {onJoin && (
        <Button size="xl" block className="mt-6" iconRight={<ArrowRight className="size-4 stroke-[1.6]" />} onClick={onJoin}>
          지금 강의 입장하기
        </Button>
      )}
      <div className="mt-4 flex gap-1 text-[13px]">
        {onEdit && (
          <button onClick={onEdit} className="rounded-md px-2 py-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg">
            정보 고치기
          </button>
        )}
        <button onClick={onWithdraw} className="rounded-md px-2 py-1.5 text-fg-3 hover:bg-surface-3 hover:text-danger">
          등록 삭제(동의 철회)
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-3 text-[14px]">
      <dt className="w-16 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 truncate">{value}</dd>
    </div>
  )
}

function RegisterForm({
  info,
  initial,
  token,
  disabled,
  onDone,
  onCancel,
}: {
  info: RegistrationLookup
  initial: Participant | null
  token: string
  disabled?: boolean
  onDone: (p: Participant) => void
  onCancel?: () => void
}) {
  const toast = useToast()
  const [org, setOrg] = useState(initial?.org ?? '')
  const [dept, setDept] = useState(initial?.dept ?? '')
  const [name, setName] = useState(initial?.name ?? '')
  const [phone, setPhone] = useState(initial?.phone ?? '')
  const [agree, setAgree] = useState(false)
  const [agreePhone, setAgreePhone] = useState(!!initial?.consent_optional_at)
  const [showTerms, setShowTerms] = useState(false)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)

  const errors = {
    org: !org.trim() ? '소속 기관을 입력해 주세요.' : null,
    dept: !dept.trim() ? '부서를 입력해 주세요.' : null,
    name: !name.trim() ? '성명을 입력해 주세요.' : null,
    phone: info.collect_phone && agreePhone && phone && !PHONE_RE.test(phone) ? '010-0000-0000 형식으로 입력해 주세요.' : null,
  }
  const valid = !errors.org && !errors.dept && !errors.name && !errors.phone && agree

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || disabled) return
    setBusy(true)
    try {
      const p = await backend.registerByToken(token, {
        org,
        dept,
        name,
        phone: agreePhone ? phone || null : null,
        consent_required: true,
        consent_optional: agreePhone && !!phone,
      })
      onDone(p)
    } catch (err) {
      toast.show(errorMessage(err), 'danger')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 animate-fade-up space-y-6">
      <Field label="소속 기관" htmlFor="org" error={touched ? errors.org : null}>
        <Input id="org" value={org} onChange={(e) => setOrg(e.target.value)} list="org-list" maxLength={60} placeholder="예: 행정안전부" autoComplete="organization" inputSize="lg" />
        {info.roster_orgs.length > 0 && (
          <datalist id="org-list">
            {info.roster_orgs.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
      </Field>
      <Field label="부서" htmlFor="dept" error={touched ? errors.dept : null}>
        <Input id="dept" value={dept} onChange={(e) => setDept(e.target.value)} maxLength={60} placeholder="예: 디지털정부국" inputSize="lg" />
      </Field>
      <Field label="성명" htmlFor="name" error={touched ? errors.name : null}>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="홍길동" autoComplete="name" inputSize="lg" />
      </Field>

      {info.collect_phone && (
        <div className="space-y-3 border-t border-line pt-6">
          <Checkbox checked={agreePhone} onChange={setAgreePhone}>
            <span className="text-[14.5px]">휴대폰 번호도 남길게요</span> <span className="text-fg-3">(선택)</span>
            <span className="mt-1 block text-[12.5px] text-fg-3">{info.phone_purpose || '교육 관련 연락'}에만 써요. 남기지 않아도 참여에 제한이 없어요.</span>
          </Checkbox>
          {agreePhone && (
            <Field error={errors.phone} className="animate-fade-in pl-8">
              <Input inputMode="numeric" value={phone} onChange={(e) => setPhone(formatPhoneInput(e.target.value))} placeholder="010-0000-0000" autoComplete="tel" aria-label="휴대폰 번호" />
            </Field>
          )}
        </div>
      )}

      <div className={cn('rounded-xl ring-1 transition-colors', touched && !agree ? 'ring-danger/60' : 'ring-line')}>
        <div className="p-4">
          <Checkbox checked={agree} onChange={setAgree}>
            <span className="text-[14.5px]">개인정보 수집·이용에 동의합니다</span> <span className="text-ping-500">(필수)</span>
            <span className="mt-1 block text-[12.5px] leading-relaxed text-fg-3">
              {info.controller_name || '강사'} · 참석 확인 목적 · 소속·부서·성명 · 강의 종료 7일 뒤 자동 파기
            </span>
          </Checkbox>
        </div>
        <button type="button" onClick={() => setShowTerms((v) => !v)} className="flex w-full items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-fg-3 hover:text-fg">
          동의 내용 전체 보기
          <ChevronDown className={cn('size-3.5 stroke-[1.5] transition-transform', showTerms && 'rotate-180')} />
        </button>
        {showTerms && (
          <div className="animate-fade-in space-y-5 border-t border-line p-4">
            <RequiredConsentText info={info} />
            {info.collect_phone && <OptionalConsentText info={info} />}
            <ConsentNotices info={info} />
          </div>
        )}
      </div>
      {touched && !agree && <p className="-mt-3 text-[13px] text-danger">필수 항목에 동의해야 등록할 수 있어요.</p>}

      <div className="flex gap-2 pt-2">
        {onCancel && (
          <Button type="button" variant="ghost" size="xl" onClick={onCancel}>
            취소
          </Button>
        )}
        <Button type="submit" size="xl" className="flex-1" loading={busy} disabled={disabled}>
          {initial ? '저장하기' : '등록하기'}
        </Button>
      </div>
    </form>
  )
}
