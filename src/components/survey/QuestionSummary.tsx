import { lazy, Suspense, useMemo } from 'react'
import type { SurveyQuestion, SurveyResultRow } from '@/lib/types'
import { cn } from '@/lib/utils'
import { OTHER, answerText } from './SurveyForm'

const ScaleChart = lazy(() => import('./ScaleChart'))

export interface ChoiceStat {
  label: string
  count: number
}

export function summarize(q: SurveyQuestion, rows: SurveyResultRow[]) {
  const answered = rows.filter((r) => answerText(q, r.answers[q.id]) !== '')
  if (q.type === 'single' || q.type === 'multiple') {
    const map = new Map<string, number>()
    for (const o of q.options ?? []) map.set(o, 0)
    if (q.allowOther) map.set('기타', 0)
    const others: string[] = []
    for (const r of answered) {
      const a = r.answers[q.id]
      const list: string[] = []
      if (Array.isArray(a)) list.push(...a)
      else if (a && typeof a === 'object' && 'choice' in a) {
        if (a.choice === OTHER) {
          list.push('기타')
          if (a.other) others.push(a.other)
        } else list.push(a.choice)
      } else if (typeof a === 'string') list.push(a)
      for (const x of list) map.set(x, (map.get(x) ?? 0) + 1)
    }
    return { kind: 'choice' as const, total: answered.length, stats: [...map].map(([label, count]) => ({ label, count })), others }
  }
  if (q.type === 'scale') {
    const min = q.scale?.min ?? 1
    const max = q.scale?.max ?? 5
    const nums = answered.map((r) => Number(r.answers[q.id])).filter((n) => !Number.isNaN(n))
    const dist = Array.from({ length: max - min + 1 }, (_, i) => ({ label: String(min + i), count: nums.filter((n) => n === min + i).length }))
    const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
    return { kind: 'scale' as const, total: nums.length, stats: dist, avg, min, max }
  }
  return { kind: 'text' as const, total: answered.length, texts: answered.map((r) => answerText(q, r.answers[q.id])) }
}

export function QuestionSummary({ q, rows, tone = 'light', size = 'md' }: { q: SurveyQuestion; rows: SurveyResultRow[]; tone?: 'light' | 'dark'; size?: 'md' | 'xl' }) {
  const s = useMemo(() => summarize(q, rows), [q, rows])
  const dark = tone === 'dark'
  if (s.kind === 'choice') {
    const max = Math.max(1, ...s.stats.map((x) => x.count))
    return (
      <div className={cn(size === 'xl' ? 'space-y-4' : 'space-y-2')}>
        {s.stats.map((x) => {
          const pct = s.total ? Math.round((x.count / s.total) * 100) : 0
          const leader = x.count > 0 && x.count === max
          return (
            <div key={x.label} className={cn('relative overflow-hidden', size === 'xl' ? 'h-16 rounded-2xl' : 'h-10 rounded-xl', dark ? 'bg-white/[0.06]' : 'bg-surface-2 ring-1 ring-inset ring-line')}>
              <div
                className={cn(
                  'absolute inset-y-0 left-0 transition-[width] duration-700 ease-[var(--ease-out-expo)]',
                  dark ? (leader ? 'bg-gradient-to-r from-pong-600 to-pong-400' : 'bg-white/14') : leader ? 'bg-pong-300/80 dark:bg-pong-700/70' : 'bg-pong-100 dark:bg-pong-900/60',
                )}
                style={{ width: `${s.total ? Math.max(pct, 1.5) : 0}%` }}
              />
              <div className={cn('relative flex h-full items-center justify-between gap-3', size === 'xl' ? 'px-6 text-2xl' : 'px-3.5 text-[14px]')}>
                <span className={cn('truncate', leader ? 'font-bold' : 'font-semibold', dark ? 'text-white' : 'text-fg')}>{x.label}</span>
                <span className={cn('tabular shrink-0 font-bold', dark ? 'text-white/85' : leader ? 'text-pong-700 dark:text-pong-200' : 'text-fg-2')}>
                  {pct}%<span className="ml-1.5 text-[0.75em] font-medium opacity-60">{x.count}</span>
                </span>
              </div>
            </div>
          )
        })}
        {s.others.length > 0 && size !== 'xl' && (
          <div className="pt-2">
            <p className="mb-1.5 text-xs font-semibold text-fg-3">기타 응답</p>
            <div className="flex flex-wrap gap-1.5">
              {s.others.map((o, i) => (
                <span key={i} className="rounded-lg bg-surface-3 px-2 py-1 text-xs text-fg-2">
                  {o}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }
  if (s.kind === 'scale') {
    return (
      <div className={cn('grid items-center gap-6', size === 'xl' ? 'grid-cols-[220px_1fr]' : 'sm:grid-cols-[150px_1fr]')}>
        <div className={cn('rounded-3xl text-center', size === 'xl' ? 'py-8' : 'py-5', dark ? 'bg-white/[0.06]' : 'bg-surface-2 ring-1 ring-inset ring-line')}>
          <p className={cn('font-semibold', size === 'xl' ? 'text-lg text-white/60' : 'text-xs text-fg-3')}>평균</p>
          <p className={cn('tabular font-extrabold tracking-tight', size === 'xl' ? 'text-[72px] leading-none text-white' : 'text-[40px] leading-tight text-pong-500')}>{s.avg.toFixed(1)}</p>
          <p className={cn(size === 'xl' ? 'text-lg text-white/50' : 'text-xs text-fg-3')}>
            {s.min}~{s.max}점 · {s.total}명
          </p>
        </div>
        <Suspense fallback={<div className="h-40" />}>
          <ScaleChart data={s.stats} dark={dark} height={size === 'xl' ? 300 : 170} labels={[q.scale?.minLabel, q.scale?.maxLabel]} />
        </Suspense>
      </div>
    )
  }
  return (
    <div className={cn('grid gap-2', size === 'xl' ? 'grid-cols-2 gap-4' : '')}>
      {s.texts.length === 0 && <p className={cn('text-sm', dark ? 'text-white/50' : 'text-fg-3')}>아직 응답이 없어요.</p>}
      {s.texts.map((t, i) => (
        <p key={i} className={cn('user-text rounded-2xl leading-relaxed', size === 'xl' ? 'bg-white/[0.07] px-6 py-5 text-xl text-white' : 'bg-surface-2 px-4 py-3 text-[14px] ring-1 ring-inset ring-line')}>
          {t}
        </p>
      ))}
    </div>
  )
}
