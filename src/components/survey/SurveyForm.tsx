import { useRef, type ReactNode } from 'react'
import { Check } from 'lucide-react'
import type { SurveyAnswer, SurveyQuestion } from '@/lib/types'
import { cn } from '@/lib/utils'
import { CharCount, Input, Textarea } from '../ui/Field'

export const OTHER = '__other__'

export const QUESTION_TYPE_LABEL: Record<SurveyQuestion['type'], string> = {
  single: '단일 선택',
  multiple: '복수 선택',
  scale: '척도',
  short: '단답형',
  long: '서술형',
}

export function isAnswered(q: SurveyQuestion, a: SurveyAnswer | undefined): boolean {
  if (a === null || a === undefined) return false
  if (q.type === 'multiple') return Array.isArray(a) && a.length > 0
  if (q.type === 'single') {
    if (typeof a === 'object' && a && 'choice' in a) return a.choice !== OTHER || !!a.other?.trim()
    return typeof a === 'string' && a.length > 0
  }
  if (q.type === 'scale') return typeof a === 'number'
  return typeof a === 'string' && a.trim().length > 0
}

export function validateSurvey(questions: SurveyQuestion[], answers: Record<string, SurveyAnswer>): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const q of questions) {
    const a = answers[q.id]
    if (q.required && !isAnswered(q, a)) errors[q.id] = '필수 문항이에요.'
    if (q.type === 'multiple' && q.maxSelect && Array.isArray(a) && a.length > q.maxSelect) errors[q.id] = `최대 ${q.maxSelect}개까지 고를 수 있어요.`
    const max = q.type === 'short' ? (q.maxLength ?? 100) : q.type === 'long' ? (q.maxLength ?? 1000) : null
    if (max && typeof a === 'string' && a.length > max) errors[q.id] = `${max.toLocaleString()}자까지 쓸 수 있어요.`
  }
  return errors
}

/** 결과 집계·엑셀에서 쓰는 답변 텍스트 */
export function answerText(q: SurveyQuestion, a: SurveyAnswer | undefined): string {
  if (a === null || a === undefined) return ''
  if (q.type === 'scale' && typeof a === 'number') return String(a)
  if (typeof a === 'object' && !Array.isArray(a) && 'choice' in a) return a.choice === OTHER ? `기타: ${a.other ?? ''}` : a.choice
  if (Array.isArray(a)) return a.map((x) => (x.startsWith(`${OTHER}:`) ? `기타: ${x.slice(OTHER.length + 1)}` : x)).join(', ')
  return String(a)
}

export function SurveyForm({
  questions,
  answers,
  onChange,
  errors = {},
  disabled,
  compact,
}: {
  questions: SurveyQuestion[]
  answers: Record<string, SurveyAnswer>
  onChange: (next: Record<string, SurveyAnswer>) => void
  errors?: Record<string, string>
  disabled?: boolean
  compact?: boolean
}) {
  // 연달아 고를 때도 앞선 선택을 잃지 않도록 최신 값을 따로 들고 있는다.
  const latest = useRef(answers)
  latest.current = answers
  const set = (id: string, v: SurveyAnswer) => {
    latest.current = { ...latest.current, [id]: v }
    onChange(latest.current)
  }
  return (
    <div className={cn(compact ? 'space-y-3' : 'space-y-4')}>
      {questions.map((q, i) => (
        <QuestionCard key={q.id} index={i + 1} q={q} error={errors[q.id]} compact={compact}>
          <QuestionInput q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} disabled={disabled} />
        </QuestionCard>
      ))}
    </div>
  )
}

function QuestionCard({ index, q, error, children, compact }: { index: number; q: SurveyQuestion; error?: string; children: ReactNode; compact?: boolean }) {
  return (
    <section
      id={`q-${q.id}`}
      className={cn(
        'rounded-3xl bg-surface ring-1 transition-shadow',
        compact ? 'p-4' : 'p-5 sm:p-6',
        error ? 'ring-2 ring-danger/60' : 'ring-line',
      )}
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-6 shrink-0 items-center rounded-lg bg-surface-3 px-2 font-mono text-[11px] font-bold text-fg-2">Q{index}</span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold leading-snug tracking-tight text-fg">
            {q.title || <span className="text-fg-3">제목 없는 문항</span>}
            {q.required && <span className="ml-1 text-ping-500">*</span>}
          </h3>
          {q.description && <p className="mt-1 text-[13px] leading-relaxed text-fg-2">{q.description}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
      {error && <p className="mt-3 text-[13px] font-semibold text-danger">{error}</p>}
    </section>
  )
}

function QuestionInput({ q, value, onChange, disabled }: { q: SurveyQuestion; value: SurveyAnswer | undefined; onChange: (v: SurveyAnswer) => void; disabled?: boolean }) {
  if (q.type === 'single') {
    const isObj = typeof value === 'object' && value !== null && !Array.isArray(value) && 'choice' in value
    const choice = isObj ? (value as { choice: string }).choice : (value as string | undefined)
    const other = isObj ? ((value as { other?: string }).other ?? '') : ''
    return (
      <div className="space-y-2">
        {(q.options ?? []).map((o, i) => (
          <OptionRow key={i} label={o} active={choice === o} onClick={() => onChange(o)} disabled={disabled} round />
        ))}
        {q.allowOther && (
          <>
            <OptionRow label="기타" active={choice === OTHER} onClick={() => onChange({ choice: OTHER, other })} disabled={disabled} round />
            {choice === OTHER && (
              <Input autoFocus value={other} maxLength={100} disabled={disabled} placeholder="직접 입력" onChange={(e) => onChange({ choice: OTHER, other: e.target.value })} />
            )}
          </>
        )}
      </div>
    )
  }
  if (q.type === 'multiple') {
    const arr = Array.isArray(value) ? value : []
    const max = q.maxSelect ?? null
    return (
      <div className="space-y-2">
        {max && <p className="-mt-1 mb-2 text-xs font-medium text-fg-3">최대 {max}개 선택</p>}
        {(q.options ?? []).map((o, i) => {
          const active = arr.includes(o)
          const blocked = !active && !!max && arr.length >= max
          return (
            <OptionRow
              key={i}
              label={o}
              active={active}
              disabled={disabled || blocked}
              onClick={() => onChange(active ? arr.filter((x) => x !== o) : [...arr, o])}
            />
          )
        })}
      </div>
    )
  }
  if (q.type === 'scale') {
    const min = q.scale?.min ?? 1
    const max = q.scale?.max ?? 5
    const nums = Array.from({ length: max - min + 1 }, (_, i) => min + i)
    return (
      <div>
        <div className={cn('grid gap-1.5', nums.length > 6 && 'grid-cols-5 sm:grid-cols-10')} style={nums.length <= 6 ? { gridTemplateColumns: `repeat(${nums.length}, minmax(0, 1fr))` } : undefined}>
          {nums.map((n) => {
            const active = value === n
            return (
              <button
                key={n}
                type="button"
                disabled={disabled}
                onClick={() => onChange(n)}
                className={cn(
                  'tabular flex h-12 items-center justify-center rounded-2xl text-[15px] font-bold transition-all duration-150 ring-inset',
                  active ? 'scale-[1.04] bg-pong-500 text-white' : 'bg-surface-2 text-fg-2 ring-1 ring-line hover:bg-surface-3 hover:text-fg',
                )}
              >
                {n}
              </button>
            )
          })}
        </div>
        {(q.scale?.minLabel || q.scale?.maxLabel) && (
          <div className="mt-2 flex justify-between text-xs font-medium text-fg-3">
            <span>
              {min} · {q.scale?.minLabel}
            </span>
            <span>
              {q.scale?.maxLabel} · {max}
            </span>
          </div>
        )}
      </div>
    )
  }
  const max = q.type === 'short' ? (q.maxLength ?? 100) : (q.maxLength ?? 1000)
  const text = typeof value === 'string' ? value : ''
  return (
    <div>
      {q.type === 'short' ? (
        <Input value={text} disabled={disabled} maxLength={max} placeholder="답변을 입력하세요" onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Textarea value={text} disabled={disabled} placeholder="자유롭게 적어 주세요" onChange={(e) => onChange(e.target.value)} />
      )}
      <div className="mt-1.5 flex justify-end">
        <CharCount value={text} max={max} />
      </div>
    </div>
  )
}

function OptionRow({ label, active, onClick, disabled, round }: { label: string; active: boolean; onClick: () => void; disabled?: boolean; round?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-[15px] font-medium ring-inset transition-all duration-150 disabled:cursor-not-allowed',
        active ? 'bg-pong-50 font-semibold text-fg ring-2 ring-pong-500 dark:bg-pong-950/60' : 'bg-surface-2 text-fg ring-1 ring-line enabled:hover:bg-surface-3',
        disabled && !active && 'opacity-50',
      )}
    >
      <span
        className={cn(
          'flex size-5 shrink-0 items-center justify-center ring-1 ring-inset transition',
          round ? 'rounded-full' : 'rounded-md',
          active ? 'bg-pong-500 text-white ring-pong-500' : 'bg-surface ring-line-strong',
        )}
      >
        {active && (round ? <span className="size-2 rounded-full bg-white" /> : <Check className="size-3.5 stroke-[3.5]" />)}
      </span>
      {label}
    </button>
  )
}
