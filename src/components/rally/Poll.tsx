import { useCallback, useEffect, useState } from 'react'
import { BarChart3, Check, Clock, Lock } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { PollMeta, PollResults, RallyNode } from '@/lib/types'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/errors'
import { Button } from '../ui/Button'
import { Badge } from '../ui/Display'
import { useToast } from '../ui/Feedback'

export function pollMeta(node: RallyNode): PollMeta {
  return {
    options: node.meta.options ?? [],
    multiple: Boolean(node.meta.multiple),
    show_results: node.meta.show_results === 'live' ? 'live' : 'after_close',
    status: (node.meta.status as PollMeta['status']) ?? 'ready',
  }
}

export function PollStatusBadge({ node, dark }: { node: RallyNode; dark?: boolean }) {
  const m = pollMeta(node)
  if (m.status === 'open')
    return (
      <Badge tone="success" className={dark ? 'bg-success/20 text-[#5fe39a]' : undefined}>
        <span className="mr-0.5 size-1.5 animate-pulse rounded-full bg-current" /> 투표 중
      </Badge>
    )
  if (m.status === 'closed')
    return (
      <Badge tone="neutral" className={dark ? 'bg-white/10 text-white/70' : undefined} icon={<Lock />}>
        마감
      </Badge>
    )
  return (
    <Badge tone="neutral" className={dark ? 'bg-white/10 text-white/70' : undefined} icon={<Clock />}>
      시작 전
    </Badge>
  )
}

/** 결과 막대그래프. tone=dark 는 발표 화면용 */
export function PollBars({
  meta,
  results,
  mine = [],
  tone = 'light',
  size = 'md',
}: {
  meta: PollMeta
  results: PollResults | null
  mine?: string[]
  tone?: 'light' | 'dark'
  size?: 'md' | 'xl'
}) {
  const total = results?.total_voters ?? 0
  const counts = results?.counts ?? {}
  const max = Math.max(1, ...meta.options.map((o) => counts[o.id] ?? 0))
  return (
    <div className={cn(size === 'xl' ? 'space-y-5' : 'space-y-2.5')}>
      {meta.options.map((o) => {
        const c = counts[o.id] ?? 0
        const pct = total ? Math.round((c / total) * 100) : 0
        const leader = c > 0 && c === max
        const picked = mine.includes(o.id)
        return (
          <div key={o.id}>
            <div
              className={cn(
                'relative overflow-hidden',
                size === 'xl' ? 'h-[72px] rounded-2xl' : 'h-12 rounded-2xl',
                tone === 'light' ? 'bg-surface-2 ring-1 ring-inset ring-line' : 'bg-white/[0.06]',
              )}
            >
              <div
                className={cn(
                  'absolute inset-y-0 left-0 transition-[width] duration-700 ease-[var(--ease-out-expo)]',
                  size === 'xl' ? 'rounded-2xl' : 'rounded-2xl',
                  tone === 'dark'
                    ? leader
                      ? 'bg-gradient-to-r from-poll-600 to-poll-400'
                      : 'bg-white/14'
                    : leader
                      ? 'bg-poll-300/80 dark:bg-poll-700/70'
                      : 'bg-poll-100 dark:bg-poll-900/60',
                )}
                style={{ width: `${total ? Math.max(pct, 2) : 0}%` }}
              />
              <div className={cn('relative flex h-full items-center justify-between gap-3', size === 'xl' ? 'px-7' : 'px-4')}>
                <span
                  className={cn(
                    'flex min-w-0 items-center gap-2',
                    size === 'xl' ? 'text-[28px]' : 'text-[15px]',
                    leader ? 'font-bold' : 'font-semibold',
                    tone === 'light' ? 'text-fg' : 'text-white',
                  )}
                >
                  {picked && (
                    <span className={cn('flex shrink-0 items-center justify-center rounded-full bg-poll-500 text-white', size === 'xl' ? 'size-8' : 'size-5')}>
                      <Check className={cn('stroke-[3]', size === 'xl' ? 'size-5' : 'size-3')} />
                    </span>
                  )}
                  <span className="truncate">{o.label}</span>
                  {picked && size !== 'xl' && <span className="shrink-0 text-xs font-semibold text-poll-600 dark:text-poll-300">내 선택</span>}
                </span>
                <span
                  className={cn(
                    'tabular shrink-0 font-bold',
                    size === 'xl' ? 'text-[30px]' : 'text-[15px]',
                    tone === 'light' ? (leader ? 'text-poll-700 dark:text-poll-200' : 'text-fg-2') : leader ? 'text-white' : 'text-white/75',
                  )}
                >
                  {pct}%
                  <span className={cn('ml-1.5 font-medium opacity-70', size === 'xl' ? 'text-xl' : 'text-xs')}>{c}표</span>
                </span>
              </div>
            </div>
          </div>
        )
      })}
      <p className={cn('flex items-center gap-1.5 pt-1 font-medium', size === 'xl' ? 'text-xl text-white/60' : 'text-[13px] text-fg-3')}>
        <BarChart3 className={size === 'xl' ? 'size-5' : 'size-4'} /> {total.toLocaleString()}명 참여
      </p>
    </div>
  )
}

/** 결과를 주기적으로 불러온다(강사·발표 화면 2초, 실시간 공개 퀵폴의 교육생 4초) */
export function usePollResults(node: RallyNode | null, intervalMs: number | null) {
  const [results, setResults] = useState<PollResults | null>(null)
  const [hidden, setHidden] = useState(false)
  const id = node?.id
  const status = node?.meta.status
  const load = useCallback(async () => {
    if (!id) return
    try {
      setResults(await backend.pollResults(id))
      setHidden(false)
    } catch (e) {
      if (errorMessage(e).includes('마감')) setHidden(true)
    }
  }, [id])
  useEffect(() => {
    setResults(null)
    void load()
  }, [load, status])
  useEffect(() => {
    if (!intervalMs || status !== 'open') return
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs, load, status])
  return { results, hidden, reload: load }
}

/** 교육생 투표 화면 */
export function StudentPoll({ node, canVote }: { node: RallyNode; canVote: boolean }) {
  const toast = useToast()
  const meta = pollMeta(node)
  const [selected, setSelected] = useState<string[]>([])
  const [submitted, setSubmitted] = useState<string[] | null>(null)
  const [saving, setSaving] = useState(false)
  const showResults = meta.status === 'closed' || meta.show_results === 'live'
  const { results, reload } = usePollResults(showResults ? node : null, meta.status === 'open' ? 4000 : null)

  useEffect(() => {
    let alive = true
    backend
      .getMyVote(node.id)
      .then((v) => {
        if (!alive || !v) return
        setSubmitted(v.option_ids)
        setSelected(v.option_ids)
      })
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [node.id])

  const toggle = (id: string) => {
    if (meta.status !== 'open' || !canVote) return
    setSelected((prev) => (meta.multiple ? (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]) : [id]))
  }

  const changed = submitted === null || submitted.slice().sort().join() !== selected.slice().sort().join()
  const compact = meta.options.length <= 5 && meta.options.every((o) => o.label.trim().length <= 4)

  async function vote() {
    setSaving(true)
    try {
      await backend.castVote(node.id, selected)
      setSubmitted(selected)
      toast.show(submitted ? '투표를 바꿨어요.' : '투표했어요!')
      if (showResults) void reload()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (meta.status === 'closed' || (showResults && submitted && !changed)) {
    return (
      <div className="space-y-4">
        <PollBars meta={meta} results={results} mine={submitted ?? []} />
        {meta.status === 'open' && (
          <button className="text-[13px] font-semibold text-poll-600 hover:underline dark:text-poll-300" onClick={() => setSubmitted(null)}>
            투표 바꾸기
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {meta.status === 'ready' && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-fg-2 ring-1 ring-inset ring-line">
          강사가 투표를 시작하면 선택할 수 있어요.
        </p>
      )}
      <p className="text-[13px] font-medium text-fg-3">{meta.multiple ? '여러 개를 고를 수 있어요' : '하나만 골라 주세요'}</p>
      {compact ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${meta.options.length}, minmax(0, 1fr))` }}>
          {meta.options.map((o) => {
            const active = selected.includes(o.id)
            return (
              <button
                key={o.id}
                type="button"
                aria-pressed={active}
                disabled={meta.status !== 'open' || !canVote}
                onClick={() => toggle(o.id)}
                className={cn(
                  'flex h-16 items-center justify-center rounded-xl text-[20px] font-light ring-inset transition disabled:cursor-default',
                  active ? 'bg-poll-500 text-white ring-1 ring-poll-500' : 'bg-surface text-fg ring-1 ring-line-strong enabled:hover:ring-poll-400',
                )}
              >
                {o.label}
              </button>
            )
          })}
        </div>
      ) : meta.options.map((o) => {
        const active = selected.includes(o.id)
        return (
          <button
            key={o.id}
            type="button"
            disabled={meta.status !== 'open' || !canVote}
            onClick={() => toggle(o.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left text-[15px] font-semibold ring-inset transition-all duration-150 disabled:cursor-default',
              active ? 'bg-poll-50 text-poll-800 ring-2 ring-poll-500 dark:bg-poll-950 dark:text-poll-100' : 'bg-surface text-fg ring-1 ring-line-strong enabled:hover:ring-poll-300',
            )}
          >
            <span
              className={cn(
                'flex size-[22px] shrink-0 items-center justify-center ring-1 ring-inset transition',
                meta.multiple ? 'rounded-[7px]' : 'rounded-full',
                active ? 'bg-poll-500 ring-poll-500 text-white' : 'ring-line-strong',
              )}
            >
              {active && <Check className="size-3.5 stroke-[3.5]" />}
            </span>
            {o.label}
          </button>
        )
      })}
      {meta.status === 'open' && canVote && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="text-[13px] text-fg-3">
            {submitted ? '마감 전까지 바꿀 수 있어요.' : meta.show_results === 'live' ? '투표하면 결과를 볼 수 있어요.' : '결과는 마감 후에 공개돼요.'}
          </p>
          <Button className="bg-poll-500 text-white shadow-none hover:bg-poll-600" disabled={selected.length === 0 || !changed} loading={saving} onClick={vote}>
            {submitted ? '투표 바꾸기' : '투표하기'}
          </Button>
        </div>
      )}
      {submitted && !changed && meta.status === 'open' && (
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-success">
          <Check className="size-4" /> 투표했어요
        </p>
      )}
    </div>
  )
}
