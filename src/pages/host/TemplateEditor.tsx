import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  CircleDot,
  Copy,
  Gauge,
  MoreHorizontal,
  Plus,
  Smartphone,
  TextCursorInput,
  Trash2,
  X,
} from 'lucide-react'
import { backend } from '@/lib/backend'
import type { QuestionType, SurveyAnswer, SurveyQuestion } from '@/lib/types'
import { useDocumentTitle } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, uuid } from '@/lib/utils'
import { HostShell } from '@/components/layout/HostShell'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { Input, Select, Textarea } from '@/components/ui/Field'
import { Segmented, Switch } from '@/components/ui/Controls'
import { Menu, Modal } from '@/components/ui/Overlay'
import { QUESTION_TYPE_LABEL, SurveyForm } from '@/components/survey/SurveyForm'

const TYPE_ICON: Record<QuestionType, React.ReactNode> = {
  single: <CircleDot />,
  multiple: <CheckSquare />,
  scale: <Gauge />,
  short: <TextCursorInput />,
  long: <AlignLeft />,
}

function newQuestion(type: QuestionType): SurveyQuestion {
  const base = { id: `q${uuid().slice(0, 6)}`, type, title: '', required: false }
  if (type === 'single') return { ...base, options: ['', ''], allowOther: false }
  if (type === 'multiple') return { ...base, options: ['', '', ''], maxSelect: null }
  if (type === 'scale') return { ...base, scale: { min: 1, max: 5, minLabel: '전혀 아니다', maxLabel: '매우 그렇다' } }
  if (type === 'short') return { ...base, maxLength: 100 }
  return { ...base, maxLength: 1000 }
}

/** 문항 유형을 바꿀 때 공통 값은 남긴다 */
function changeType(q: SurveyQuestion, type: QuestionType): SurveyQuestion {
  const fresh = newQuestion(type)
  return { ...fresh, id: q.id, title: q.title, description: q.description, required: q.required, options: q.options?.length && fresh.options ? q.options : fresh.options }
}

/** ?from= 으로 받은 돌아갈 경로(같은 사이트 안만 허용) */
function backPath(from: string | null) {
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/host'
}

export default function TemplateEditor() {
  const [params] = useSearchParams()
  const back = backPath(params.get('from'))
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const isNew = id === 'new'
  const [loading, setLoading] = useState(!isNew)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [questions, setQuestions] = useState<SurveyQuestion[]>(() => [{ ...newQuestion('scale'), title: '오늘 강의에 얼마나 만족하셨나요?', required: true }])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [missing, setMissing] = useState(false)
  const [preview, setPreview] = useState<Record<string, SurveyAnswer>>({})
  const [mobilePreview, setMobilePreview] = useState(false)
  useDocumentTitle(title || '설문 편집기')

  useEffect(() => {
    if (isNew || !id) return
    backend
      .getSurveyTemplate(id)
      .then((t) => {
        if (!t) return setMissing(true)
        setTitle(t.title)
        setDescription(t.description)
        setQuestions(t.questions)
      })
      .finally(() => setLoading(false))
  }, [id, isNew])

  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const update = (i: number, patch: Partial<SurveyQuestion>) => {
    setDirty(true)
    setQuestions((qs) => qs.map((q, j) => (j === i ? { ...q, ...patch } : q)))
  }
  const move = (i: number, d: -1 | 1) => {
    setDirty(true)
    setQuestions((qs) => {
      const next = qs.slice()
      const [it] = next.splice(i, 1)
      next.splice(i + d, 0, it)
      return next
    })
  }
  const add = (type: QuestionType) => {
    setDirty(true)
    setQuestions((qs) => [...qs, newQuestion(type)])
    setTimeout(() => document.getElementById('q-editor-end')?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
  }

  async function save() {
    const cleaned = questions.map((q) => ({
      ...q,
      title: q.title.trim(),
      description: q.description?.trim() || undefined,
      options: q.options?.map((o) => o.trim()).filter(Boolean),
    }))
    const bad = cleaned.findIndex((q) => !q.title || ((q.type === 'single' || q.type === 'multiple') && (q.options?.length ?? 0) < 2))
    if (!title.trim()) return toast.show('설문 제목을 입력해 주세요.', 'danger')
    if (cleaned.length === 0) return toast.show('문항을 하나 이상 넣어 주세요.', 'danger')
    if (bad >= 0) return toast.show(`Q${bad + 1}: 제목과 선택지(2개 이상)를 채워 주세요.`, 'danger')
    setSaving(true)
    try {
      const t = await backend.saveSurveyTemplate({ id: isNew ? undefined : id, title, description, questions: cleaned })
      setDirty(false)
      toast.show('저장했어요.')
      if (isNew) nav(`/host/templates/${t.id}?from=${encodeURIComponent(back)}`, { replace: true })
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <HostShell><BallLoader /></HostShell>
  if (missing) return <HostShell><EmptyState title="설문 템플릿을 찾을 수 없어요" action={<Button onClick={() => nav(back)}>돌아가기</Button>} /></HostShell>

  const previewPane = (
    <div className="mx-auto w-[340px] rounded-[44px] bg-ink-900 p-3 shadow-pop ring-1 ring-white/10 dark:bg-ink-800">
      <div className="relative h-[640px] overflow-hidden rounded-2xl bg-bg">
        <div className="absolute left-1/2 top-2 z-10 h-5 w-24 -translate-x-1/2 rounded-full bg-ink-900" />
        <div className="scrollbar-none h-full overflow-y-auto px-4 pb-8 pt-10">
          <div className="flex gap-1.5">
            <Badge tone="pong" size="sm">
              미리보기
            </Badge>
          </div>
          <h2 className="mt-3 text-lg font-bold leading-snug">{title || '제목 없는 설문'}</h2>
          {description && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{description}</p>}
          <div className="mt-4">
            <SurveyForm questions={questions} answers={preview} onChange={setPreview} compact />
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <HostShell wide>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link to={back} className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
          <ArrowLeft className="size-4 stroke-[1.5]" /> 돌아가기
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {dirty && <span className="text-xs font-semibold text-warning">저장하지 않은 변경</span>}
          <Button variant="secondary" className="xl:hidden" icon={<Smartphone className="size-4" />} onClick={() => setMobilePreview(true)}>
            미리보기
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            저장
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          <section className="rounded-3xl bg-surface p-6 ring-1 ring-line">
            <input
              value={title}
              maxLength={100}
              onChange={(e) => {
                setTitle(e.target.value)
                setDirty(true)
              }}
              placeholder="설문 제목"
              className="w-full bg-transparent text-[26px] font-extrabold tracking-[-0.03em] outline-none placeholder:text-fg-3"
            />
            <Textarea
              value={description}
              onChange={(e) => {
                setDescription(e.target.value)
                setDirty(true)
              }}
              maxLength={1000}
              placeholder="설문 안내(선택) — 교육생이 처음 보는 설명이에요."
              className="mt-3 min-h-[64px] bg-surface-2"
            />
          </section>

          {questions.map((q, i) => (
            <QuestionEditor
              key={q.id}
              q={q}
              index={i}
              total={questions.length}
              onChange={(patch) => update(i, patch)}
              onType={(t) => {
                setDirty(true)
                setQuestions((qs) => qs.map((x, j) => (j === i ? changeType(x, t) : x)))
              }}
              onMove={(d) => move(i, d)}
              onDuplicate={() => {
                setDirty(true)
                setQuestions((qs) => [...qs.slice(0, i + 1), { ...structuredClone(q), id: `q${uuid().slice(0, 6)}` }, ...qs.slice(i + 1)])
              }}
              onDelete={() => {
                setDirty(true)
                setQuestions((qs) => qs.filter((_, j) => j !== i))
              }}
            />
          ))}

          <div id="q-editor-end" className="rounded-3xl border border-dashed border-line-strong p-4">
            <p className="mb-3 text-[13px] font-semibold text-fg-2">문항 추가</p>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
                <Button key={t} variant="secondary" size="sm" icon={<span className="[&_svg]:size-4">{TYPE_ICON[t]}</span>} onClick={() => add(t)}>
                  {QUESTION_TYPE_LABEL[t]}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <aside className="hidden xl:sticky xl:top-24 xl:block">
          <p className="mb-3 text-center text-xs font-semibold tracking-wide text-fg-3">교육생 화면 미리보기</p>
          {previewPane}
        </aside>
      </div>

      <Modal open={mobilePreview} onClose={() => setMobilePreview(false)} title="미리보기" size="md">
        {previewPane}
      </Modal>
    </HostShell>
  )
}

function QuestionEditor({
  q,
  index,
  total,
  onChange,
  onType,
  onMove,
  onDuplicate,
  onDelete,
}: {
  q: SurveyQuestion
  index: number
  total: number
  onChange: (p: Partial<SurveyQuestion>) => void
  onType: (t: QuestionType) => void
  onMove: (d: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [showDesc, setShowDesc] = useState(!!q.description)
  const choice = q.type === 'single' || q.type === 'multiple'
  return (
    <section className="group rounded-3xl bg-surface p-6 ring-1 ring-line transition focus-within:ring-2 focus-within:ring-pong-400">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex h-7 items-center rounded-lg bg-inverse px-2.5 font-mono text-xs font-bold text-on-inverse">Q{index + 1}</span>
        <div className="w-40">
          <Select value={q.type} onChange={(e) => onType(e.target.value as QuestionType)} className="h-9 text-sm">
            {(Object.keys(QUESTION_TYPE_LABEL) as QuestionType[]).map((t) => (
              <option key={t} value={t}>
                {QUESTION_TYPE_LABEL[t]}
              </option>
            ))}
          </Select>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Switch size="sm" checked={q.required} onChange={(required) => onChange({ required })} label={<span className="text-[13px] font-semibold text-fg-2">필수</span>} />
          <div className="flex items-center">
            <IconButton label="위로" size="sm" disabled={index === 0} onClick={() => onMove(-1)}>
              <ArrowUp />
            </IconButton>
            <IconButton label="아래로" size="sm" disabled={index === total - 1} onClick={() => onMove(1)}>
              <ArrowDown />
            </IconButton>
            <Menu
              items={[
                { label: '복제', icon: <Copy />, onSelect: onDuplicate },
                { label: '삭제', icon: <Trash2 />, danger: true, onSelect: onDelete },
              ]}
              trigger={(p) => (
                <IconButton label="더 보기" size="sm" {...p}>
                  <MoreHorizontal />
                </IconButton>
              )}
            />
          </div>
        </div>
      </div>

      <input
        value={q.title}
        maxLength={200}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="질문을 입력하세요"
        className="mt-4 w-full border-b-2 border-line bg-transparent pb-2 text-[18px] font-bold outline-none transition placeholder:text-fg-3 focus:border-pong-500"
      />
      {showDesc ? (
        <input
          value={q.description ?? ''}
          maxLength={300}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="문항 설명(선택)"
          className="mt-3 w-full bg-transparent text-[14px] text-fg-2 outline-none placeholder:text-fg-3"
        />
      ) : (
        <button onClick={() => setShowDesc(true)} className="mt-2 text-xs font-semibold text-fg-3 hover:text-fg-2">
          + 설명 추가
        </button>
      )}

      <div className="mt-5">
        {choice && (
          <div className="space-y-2">
            {(q.options ?? []).map((o, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className={cn('size-4 shrink-0 ring-1 ring-inset ring-line-strong', q.type === 'single' ? 'rounded-full' : 'rounded')} />
                <input
                  value={o}
                  maxLength={100}
                  onChange={(e) => onChange({ options: q.options!.map((x, j) => (j === i ? e.target.value : x)) })}
                  placeholder={`선택지 ${i + 1}`}
                  className="h-10 min-w-0 flex-1 rounded-xl bg-surface-2 px-3 text-[15px] ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-pong-500"
                />
                <button
                  disabled={(q.options?.length ?? 0) <= 2}
                  onClick={() => onChange({ options: q.options!.filter((_, j) => j !== i) })}
                  className="rounded-lg p-2 text-fg-3 hover:bg-surface-3 hover:text-fg disabled:opacity-30"
                  aria-label="선택지 삭제"
                >
                  <X className="size-4" />
                </button>
              </div>
            ))}
            {(q.options?.length ?? 0) < 10 && (
              <button onClick={() => onChange({ options: [...(q.options ?? []), ''] })} className="ml-6 flex h-9 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-pong-600 hover:bg-pong-50 dark:text-pong-300 dark:hover:bg-pong-950">
                <Plus className="size-4" /> 선택지 추가
              </button>
            )}
            <div className="flex flex-wrap items-center gap-4 border-t border-line pt-4">
              {q.type === 'single' ? (
                <Switch size="sm" checked={!!q.allowOther} onChange={(allowOther) => onChange({ allowOther })} label={<span className="text-[13px] font-semibold text-fg-2">‘기타’ 직접 입력</span>} />
              ) : (
                <label className="flex items-center gap-2 text-[13px] font-semibold text-fg-2">
                  최대 선택 수
                  <Select value={q.maxSelect ?? ''} onChange={(e) => onChange({ maxSelect: e.target.value ? Number(e.target.value) : null })} className="h-9 w-28 text-sm">
                    <option value="">제한 없음</option>
                    {Array.from({ length: Math.max(1, (q.options?.length ?? 2) - 1) }, (_, k) => k + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}개
                      </option>
                    ))}
                  </Select>
                </label>
              )}
            </div>
          </div>
        )}
        {q.type === 'scale' && (
          <div className="space-y-4">
            <Segmented
              size="sm"
              value={String(q.scale?.max ?? 5) as '5' | '10'}
              onChange={(v) => onChange({ scale: { ...(q.scale ?? { min: 1, max: 5 }), min: 1, max: Number(v) } })}
              options={[
                { value: '5', label: '1 ~ 5' },
                { value: '10', label: '1 ~ 10' },
              ]}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input value={q.scale?.minLabel ?? ''} maxLength={20} onChange={(e) => onChange({ scale: { ...q.scale!, minLabel: e.target.value } })} placeholder="1점 라벨 (예: 매우 불만족)" />
              <Input value={q.scale?.maxLabel ?? ''} maxLength={20} onChange={(e) => onChange({ scale: { ...q.scale!, maxLabel: e.target.value } })} placeholder={`${q.scale?.max ?? 5}점 라벨 (예: 매우 만족)`} />
            </div>
          </div>
        )}
        {(q.type === 'short' || q.type === 'long') && (
          <div className="rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-fg-3 ring-1 ring-inset ring-line">
            {q.type === 'short' ? '한 줄 답변 · 최대 100자' : '여러 줄 답변 · 최대 1,000자 · 발표 화면에는 기본 비공개'}
          </div>
        )}
      </div>
    </section>
  )
}
