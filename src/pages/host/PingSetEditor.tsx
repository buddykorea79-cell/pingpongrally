import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { ArrowDown, ArrowLeft, ArrowUp, BarChart3, FileJson, Link2, MessageSquareText, Plus, Trash2, X } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { PingSetItem } from '@/lib/types'
import { useDocumentTitle } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, hostnameOf, normalizeUrl, safeFileName, uuid } from '@/lib/utils'
import { downloadText } from '@/lib/export/rally'
import { HostShell } from '@/components/layout/HostShell'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { Textarea } from '@/components/ui/Field'
import { Switch } from '@/components/ui/Controls'

interface Item extends PingSetItem {
  key: string
}

const blank = (type: 'ping' | 'poll'): Item => ({
  key: uuid(),
  type,
  content: '',
  attachments: [],
  meta:
    type === 'poll'
      ? {
          options: [
            { id: 'o1', label: '' },
            { id: 'o2', label: '' },
          ],
          multiple: false,
          show_results: 'after_close',
        }
      : undefined,
})

/** ?from= 으로 받은 돌아갈 경로(같은 사이트 안만 허용) */
function backPath(from: string | null) {
  return from && from.startsWith('/') && !from.startsWith('//') ? from : '/host'
}

export default function PingSetEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const back = backPath(params.get('from'))
  const nav = useNavigate()
  const toast = useToast()
  const isNew = id === 'new'
  const [title, setTitle] = useState('')
  const [items, setItems] = useState<Item[]>(() => [blank('ping')])
  const [loading, setLoading] = useState(!isNew)
  const [missing, setMissing] = useState(false)
  const [saving, setSaving] = useState(false)
  useDocumentTitle(title || '핑 템플릿')

  useEffect(() => {
    if (isNew || !id) return
    backend
      .getPingSet(id)
      .then((s) => {
        if (!s) return setMissing(true)
        setTitle(s.title)
        setItems(s.pings.map((p) => ({ ...p, key: uuid() })))
      })
      .finally(() => setLoading(false))
  }, [id, isNew])

  const patch = (i: number, p: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)))
  const move = (i: number, d: -1 | 1) =>
    setItems((xs) => {
      const next = xs.slice()
      const [it] = next.splice(i, 1)
      next.splice(i + d, 0, it)
      return next
    })

  const clean = (): PingSetItem[] =>
    items
      .filter((x) => x.content.trim())
      .map(({ key: _k, ...x }) => {
        void _k
        return x.type === 'poll' ? { ...x, meta: { ...x.meta, options: (x.meta?.options ?? []).filter((o) => o.label.trim()) } } : { ...x, meta: undefined }
      })

  async function save() {
    const pings = clean()
    if (!title.trim()) return toast.show('묶음 이름을 입력해 주세요.', 'danger')
    if (!pings.length) return toast.show('내용이 있는 핑을 하나 이상 넣어 주세요.', 'danger')
    const badPoll = pings.findIndex((p) => p.type === 'poll' && (p.meta?.options?.length ?? 0) < 2)
    if (badPoll >= 0) return toast.show(`${badPoll + 1}번 퀵폴의 선택지를 2개 이상 채워 주세요.`, 'danger')
    setSaving(true)
    try {
      const s = await backend.savePingSet({ id: isNew ? undefined : id, title, pings })
      toast.show('저장했어요.')
      if (isNew) nav(`/host/ping-sets/${s.id}?from=${encodeURIComponent(back)}`, { replace: true })
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <HostShell><BallLoader /></HostShell>
  if (missing) return <HostShell><EmptyState title="템플릿 묶음을 찾을 수 없어요" action={<Button onClick={() => nav(back)}>돌아가기</Button>} /></HostShell>

  return (
    <HostShell>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <Link to={back} className="inline-flex items-center gap-1.5 text-sm text-fg-2 hover:text-fg">
            <ArrowLeft className="size-4 stroke-[1.5]" /> 돌아가기
          </Link>
          <div className="ml-auto flex gap-2">
            <Button
              variant="secondary"
              icon={<FileJson className="size-4" />}
              onClick={() => downloadText(JSON.stringify({ title, pings: clean() }, null, 2), `핑템플릿_${safeFileName(title || '제목없음')}.json`, 'application/json')}
            >
              .json 내보내기
            </Button>
            <Button loading={saving} onClick={() => void save()}>
              저장
            </Button>
          </div>
        </div>

        <input
          value={title}
          maxLength={100}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="묶음 이름 (예: AI 활용 워크숍 기본 핑)"
          className="w-full bg-transparent text-[28px] font-extralight tracking-[-0.03em] outline-none placeholder:text-fg-3"
        />
        <p className="mt-2 text-sm text-fg-2">핑 템플릿 묶음이에요. 진행 화면의 [추가] → [템플릿]에서 골라 넣어요. 파일 첨부는 강의에서 붙여 주세요(링크만 저장돼요).</p>

        <ol className="mt-8 space-y-3">
          {items.map((it, i) => (
            <li key={it.key} className="rounded-3xl bg-surface p-5 ring-1 ring-line focus-within:ring-2 focus-within:ring-ping-400">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs font-bold text-fg-3">{String(i + 1).padStart(2, '0')}</span>
                <button
                  onClick={() => patch(i, it.type === 'ping' ? { type: 'poll', meta: blank('poll').meta } : { type: 'ping', meta: undefined })}
                  title="핑·퀵폴 바꾸기"
                >
                  {it.type === 'poll' ? (
                    <Badge tone="poll" icon={<BarChart3 />}>
                      퀵폴
                    </Badge>
                  ) : (
                    <Badge tone="ping" icon={<MessageSquareText />}>
                      핑
                    </Badge>
                  )}
                </button>
                <div className="ml-auto flex">
                  <IconButton label="위로" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp />
                  </IconButton>
                  <IconButton label="아래로" size="sm" disabled={i === items.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown />
                  </IconButton>
                  <IconButton label="삭제" size="sm" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </IconButton>
                </div>
              </div>
              <Textarea value={it.content} maxLength={2000} onChange={(e) => patch(i, { content: e.target.value })} placeholder={it.type === 'poll' ? '투표 질문' : '교육생에게 던질 질문'} className="mt-3 min-h-[72px]" />
              {it.type === 'poll' && (
                <div className="mt-3 space-y-2 rounded-2xl bg-poll-50/50 p-3 ring-1 ring-inset ring-poll-200/60 dark:bg-poll-950/30 dark:ring-poll-900">
                  {(it.meta?.options ?? []).map((o, k) => (
                    <div key={o.id} className="flex items-center gap-2">
                      <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-surface font-mono text-[11px] font-bold text-poll-600 ring-1 ring-line">{String.fromCharCode(65 + k)}</span>
                      <input
                        value={o.label}
                        maxLength={60}
                        onChange={(e) => patch(i, { meta: { ...it.meta, options: it.meta!.options!.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)) } })}
                        placeholder={`선택지 ${k + 1}`}
                        className="h-9 min-w-0 flex-1 rounded-lg bg-surface px-3 text-sm ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-poll-500"
                      />
                      <button
                        disabled={(it.meta?.options?.length ?? 0) <= 2}
                        onClick={() => patch(i, { meta: { ...it.meta, options: it.meta!.options!.filter((x) => x.id !== o.id) } })}
                        className="rounded-lg p-1.5 text-fg-3 hover:text-fg disabled:opacity-30"
                        aria-label="선택지 삭제"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {(it.meta?.options?.length ?? 0) < 6 ? (
                      <button
                        onClick={() => patch(i, { meta: { ...it.meta, options: [...(it.meta?.options ?? []), { id: `o${uuid().slice(0, 5)}`, label: '' }] } })}
                        className="flex items-center gap-1 text-xs font-semibold text-poll-600 dark:text-poll-300"
                      >
                        <Plus className="size-3.5" /> 선택지 추가
                      </button>
                    ) : (
                      <span />
                    )}
                    <Switch size="sm" checked={!!it.meta?.multiple} onChange={(multiple) => patch(i, { meta: { ...it.meta, multiple } })} label={<span className="text-xs font-semibold text-fg-2">복수 선택</span>} />
                  </div>
                </div>
              )}
              <LinkEditor links={it.attachments.filter((a) => a.kind === 'link')} onChange={(links) => patch(i, { attachments: links })} />
            </li>
          ))}
        </ol>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" icon={<MessageSquareText className="size-4 text-ping-500" />} onClick={() => setItems((xs) => [...xs, blank('ping')])}>
            핑 추가
          </Button>
          <Button variant="secondary" size="lg" icon={<BarChart3 className="size-4 text-poll-500" />} onClick={() => setItems((xs) => [...xs, blank('poll')])}>
            퀵폴 추가
          </Button>
        </div>
      </div>
    </HostShell>
  )
}

function LinkEditor({ links, onChange }: { links: PingSetItem['attachments']; onChange: (l: PingSetItem['attachments']) => void }) {
  const [value, setValue] = useState('')
  const [open, setOpen] = useState(false)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {links.map((l, i) => (
        <span key={i} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-2.5 pr-1 text-xs font-semibold text-fg-2 ring-1 ring-inset ring-line">
          <Link2 className="size-3.5 text-pong-500" />
          {hostnameOf(l.url)}
          <button onClick={() => onChange(links.filter((_, j) => j !== i))} className="rounded-full p-0.5 hover:bg-surface-3" aria-label="링크 빼기">
            <X className="size-3" />
          </button>
        </span>
      ))}
      {open ? (
        <span className="flex items-center gap-1">
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                const url = normalizeUrl(value)
                if (url) onChange([...links, { kind: 'link', url, name: hostnameOf(url) }])
                setValue('')
                setOpen(false)
              }
              if (e.key === 'Escape') setOpen(false)
            }}
            placeholder="https:// 입력 후 Enter"
            className="h-7 w-56 rounded-full bg-surface-2 px-3 text-xs ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-pong-500"
          />
        </span>
      ) : (
        <button onClick={() => setOpen(true)} className={cn('flex h-7 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-fg-3 hover:bg-surface-3 hover:text-fg-2')}>
          <Plus className="size-3.5" /> 링크
        </button>
      )}
    </div>
  )
}
