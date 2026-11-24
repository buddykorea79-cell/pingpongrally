import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { BarChart3, BookmarkPlus, Check, LibraryBig, MessageSquareText, Plus, X } from 'lucide-react'
import type { Attachment, PingSet, PingSetItem, PollMeta, PollOption, RallyNode } from '@/lib/types'
import { listTemplateGroups } from '@/lib/templates'
import { cn, uuid } from '@/lib/utils'
import { Button } from '../ui/Button'
import { Checkbox, Segmented, Switch } from '../ui/Controls'
import { BallLoader } from '../ui/Feedback'
import { Modal } from '../ui/Overlay'
import { Composer } from '../rally/Composer'

export interface PingDraft {
  type: 'ping' | 'poll'
  content: string
  attachments: Attachment[]
  meta?: Partial<PollMeta>
  /** 만들면서 '내 템플릿'에도 저장 */
  saveTemplate?: boolean
}

type Tab = 'ping' | 'poll' | 'template'

const newOption = (label = ''): PollOption => ({ id: uuid().slice(0, 8), label })
const YES_NO = ['예', '아니오']
const numbered = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

/** 핑·퀵폴 만들기와 고치기. 새로 만들 때는 [템플릿] 탭에서 저장해 둔 핑을 골라 넣을 수도 있다. */
export function PingEditorModal({
  open,
  onClose,
  roomId,
  initial,
  defaultType = 'ping',
  initialFiles,
  onSave,
  onAddTemplates,
  manageHref,
}: {
  open: boolean
  onClose: () => void
  roomId: string
  initial?: RallyNode | null
  defaultType?: Tab
  /** 화면 캡처를 붙여 넣어 창을 연 경우 */
  initialFiles?: File[]
  onSave: (d: PingDraft) => Promise<void>
  onAddTemplates?: (items: PingSetItem[]) => Promise<void>
  /** 템플릿 정리 화면 링크 */
  manageHref?: string
}) {
  const [tab, setTab] = useState<Tab>(defaultType)
  const [options, setOptions] = useState<PollOption[]>([])
  const [multiple, setMultiple] = useState(false)
  const [live, setLive] = useState(false)
  const [saveTemplate, setSaveTemplate] = useState(false)
  const pollLocked = !!initial && initial.type === 'poll' && initial.meta.status !== 'ready'
  const editing = !!initial

  useEffect(() => {
    if (!open) return
    setTab(initial ? (initial.type === 'poll' ? 'poll' : 'ping') : defaultType)
    setOptions(initial?.meta.options?.length ? initial.meta.options.map((o) => ({ ...o })) : [newOption(), newOption()])
    setMultiple(Boolean(initial?.meta.multiple))
    setLive(initial?.meta.show_results === 'live')
    setSaveTemplate(false)
  }, [open, initial, defaultType])

  const type: 'ping' | 'poll' = tab === 'poll' ? 'poll' : 'ping'
  const cleanOptions = () => options.map((o) => ({ ...o, label: o.label.trim() })).filter((o) => o.label)

  const pollExtra = (
    <PollOptionsEditor
      options={options}
      setOptions={setOptions}
      locked={pollLocked}
      multiple={multiple}
      setMultiple={setMultiple}
      live={live}
      setLive={setLive}
    />
  )
  const templateToggle = !editing && (
    <Checkbox checked={saveTemplate} onChange={setSaveTemplate}>
      <span className="flex items-center gap-1.5 text-[13px] text-fg-2">
        <BookmarkPlus className="size-3.5 stroke-[1.5] text-fg-3" /> 내 템플릿에도 저장
      </span>
    </Checkbox>
  )

  return (
    <Modal open={open} onClose={onClose} size="lg" title={editing ? (type === 'poll' ? '퀵폴 고치기' : '핑 고치기') : '새로 만들기'}>
      <div className="space-y-5">
        {!editing && (
          <Segmented
            block
            value={tab}
            onChange={setTab}
            options={[
              { value: 'ping', label: '핑', icon: <MessageSquareText /> },
              { value: 'poll', label: '퀵폴', icon: <BarChart3 /> },
              { value: 'template', label: '템플릿', icon: <LibraryBig /> },
            ]}
          />
        )}

        {/* 핑·퀵폴은 같은 작성기를 써서, 탭을 바꿔도 적던 질문이 남는다 */}
        <div className={cn(tab === 'template' && 'hidden')}>
          <Composer
            key={`${open}-${initial?.id ?? 'new'}`}
            roomId={roomId}
            tone="ping"
            maxLength={2000}
            initialText={initial?.content ?? ''}
            initialAttachments={initial?.attachments ?? []}
            initialFiles={initialFiles}
            autoFocus
            placeholder={type === 'poll' ? '투표 질문을 적어 주세요. 예: 오늘 실습 난이도는 어땠나요?' : '교육생에게 던질 질문이나 화두를 적어 주세요'}
            submitLabel={editing ? '저장' : type === 'poll' ? '퀵폴 만들기' : '핑 만들기'}
            minRows={3}
            validate={() => (type === 'poll' && cleanOptions().length < 2 ? '선택지를 2개 이상 채워 주세요.' : null)}
            extra={
              <div className="space-y-4">
                {type === 'poll' && pollExtra}
                {templateToggle}
              </div>
            }
            onSubmit={async (content, attachments) => {
              if (type === 'poll') {
                await onSave({
                  type,
                  content,
                  attachments,
                  saveTemplate,
                  meta: { ...(initial?.meta ?? {}), options: cleanOptions(), multiple, show_results: live ? 'live' : 'after_close' },
                })
              } else {
                await onSave({ type, content, attachments, saveTemplate })
              }
              onClose()
            }}
          />
          <p className="mt-3 text-xs leading-relaxed text-fg-3">
            화면을 캡처한 뒤 <kbd className="rounded px-1 font-mono ring-1 ring-line">Ctrl</kbd>+<kbd className="rounded px-1 font-mono ring-1 ring-line">V</kbd>로 바로 붙일 수 있어요. 교육생은 [포커스]한 뒤에 봐요.
          </p>
        </div>

        {tab === 'template' && onAddTemplates && (
          <TemplatePicker
            manageHref={manageHref}
            onAdd={async (items) => {
              await onAddTemplates(items)
              onClose()
            }}
          />
        )}
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
function PollOptionsEditor({
  options,
  setOptions,
  locked,
  multiple,
  setMultiple,
  live,
  setLive,
}: {
  options: PollOption[]
  setOptions: React.Dispatch<React.SetStateAction<PollOption[]>>
  locked: boolean
  multiple: boolean
  setMultiple: (v: boolean) => void
  live: boolean
  setLive: (v: boolean) => void
}) {
  const labels = options.map((o) => o.label.trim())
  const preset = labels.join('|') === YES_NO.join('|') ? 'yn' : labels.join('|') === numbered(labels.length).join('|') ? labels.length : null
  // 빠른 입력: 예/아니오, 또는 1부터 n까지 번호
  const apply = (next: string[]) => setOptions(next.map((l, i) => ({ id: options[i]?.id ?? newOption().id, label: l })))

  return (
    <div className="space-y-4 rounded-xl p-4 ring-1 ring-inset ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] text-fg-2">선택지</p>
        {!locked && (
          <div className="flex items-center gap-1" role="group" aria-label="선택지 빠르게 채우기">
            <PresetButton active={preset === 'yn'} onClick={() => apply(YES_NO)}>
              예 / 아니오
            </PresetButton>
            <span className="mx-1 h-4 w-px bg-line" />
            {[2, 3, 4, 5].map((n) => (
              <PresetButton key={n} active={preset === n} onClick={() => apply(numbered(n))} title={`1~${n} 번호로 채우기`} square>
                {n}
              </PresetButton>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={o.id} className="flex items-center gap-2">
            <input
              value={o.label}
              disabled={locked}
              maxLength={60}
              onChange={(e) => setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, label: e.target.value } : x)))}
              placeholder={`선택지 ${i + 1}`}
              aria-label={`선택지 ${i + 1}`}
              className="h-10 min-w-0 flex-1 rounded-lg bg-surface px-3 text-[15px] ring-1 ring-inset ring-line-strong focus:outline-none focus:ring-fg disabled:opacity-60"
            />
            <button
              type="button"
              disabled={locked || options.length <= 2}
              onClick={() => setOptions((prev) => prev.filter((x) => x.id !== o.id))}
              className="rounded-md p-2 text-fg-3 hover:bg-surface-3 hover:text-fg disabled:opacity-30"
              aria-label="선택지 삭제"
            >
              <X className="size-4 stroke-[1.5]" />
            </button>
          </div>
        ))}
        {!locked && options.length < 6 && (
          <button
            type="button"
            onClick={() => setOptions((prev) => [...prev, newOption(preset !== null && preset !== 'yn' ? String(prev.length + 1) : '')])}
            className="flex h-9 items-center gap-1.5 rounded-lg px-2 text-[13px] text-fg-2 hover:bg-surface-3 hover:text-fg"
          >
            <Plus className="size-4 stroke-[1.5]" /> 선택지 추가
          </button>
        )}
        {locked && <p className="text-xs text-fg-3">투표가 시작된 뒤에는 선택지를 바꿀 수 없어요.</p>}
      </div>

      <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
        <Switch size="sm" checked={multiple} onChange={setMultiple} disabled={locked} label="복수 선택" description="여러 개를 고를 수 있어요" />
        <Switch size="sm" checked={live} onChange={setLive} label="결과 실시간 공개" description={live ? '투표 중에도 교육생에게 보여요' : '마감 후에 공개(기본)'} />
      </div>
    </div>
  )
}

function PresetButton({ active, onClick, children, title, square }: { active: boolean; onClick: () => void; children: React.ReactNode; title?: string; square?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={cn(
        'h-8 rounded-md text-[13px] ring-1 ring-inset transition',
        square ? 'tabular w-8 font-mono' : 'px-2.5',
        active ? 'bg-inverse text-on-inverse ring-inverse' : 'text-fg-2 ring-line hover:text-fg hover:ring-line-strong',
      )}
    >
      {children}
    </button>
  )
}

// ---------------------------------------------------------------------------
function TemplatePicker({ onAdd, manageHref }: { onAdd: (items: PingSetItem[]) => Promise<void>; manageHref?: string }) {
  const [groups, setGroups] = useState<PingSet[] | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    listTemplateGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
  }, [])

  const byKey = useMemo(() => {
    const m = new Map<string, PingSetItem>()
    groups?.forEach((g) => g.pings.forEach((p, i) => m.set(`${g.id}:${i}`, p)))
    return m
  }, [groups])

  const toggle = (k: string) => setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))

  if (groups === null) return <BallLoader className="py-10" />
  if (groups.every((g) => g.pings.length === 0)) {
    return (
      <div className="rounded-xl border border-dashed border-line-strong px-5 py-8 text-center">
        <p className="text-[15px]">저장한 템플릿이 없어요</p>
        <p className="mx-auto mt-2 max-w-sm text-[13px] leading-relaxed text-fg-3">
          핑을 만들 때 [내 템플릿에도 저장]을 켜거나, 진행 화면에서 핑의 ⋯ 메뉴 → [템플릿으로 저장]을 누르면 여기에 모여요.
        </p>
      </div>
    )
  }

  return (
    <div>
      <div className="space-y-6">
        {groups
          .filter((g) => g.pings.length > 0)
          .map((g) => {
            const keys = g.pings.map((_, i) => `${g.id}:${i}`)
            const all = keys.every((k) => picked.includes(k))
            return (
              <section key={g.id}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[13px] text-fg-2">
                    {g.title} <span className="text-fg-3">{g.pings.length}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setPicked((p) => (all ? p.filter((k) => !keys.includes(k)) : [...new Set([...p, ...keys])]))}
                    className="shrink-0 rounded-md px-2 py-1 text-xs text-fg-3 hover:bg-surface-3 hover:text-fg"
                  >
                    {all ? '선택 해제' : '모두 선택'}
                  </button>
                </div>
                <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
                  {g.pings.map((p, i) => {
                    const k = `${g.id}:${i}`
                    const on = picked.includes(k)
                    return (
                      <li key={k}>
                        <button type="button" onClick={() => toggle(k)} aria-pressed={on} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-surface-2">
                          <span className={cn('mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-[5px] ring-1 ring-inset transition', on ? 'bg-inverse text-on-inverse ring-inverse' : 'ring-line-strong')}>
                            {on && <Check className="size-3 stroke-[2.5]" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-[11.5px] text-fg-3">
                              <span className={cn('size-1.5 rounded-full', p.type === 'poll' ? 'bg-poll-500' : 'bg-ping-500')} />
                              {p.type === 'poll' ? '퀵폴' : '핑'}
                            </span>
                            <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug">{p.content}</span>
                            {p.type === 'poll' && (p.meta?.options?.length ?? 0) > 0 && (
                              <span className="mt-1 block truncate text-xs text-fg-3">{p.meta!.options!.map((o) => o.label).join(' · ')}</span>
                            )}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
      </div>
      <div className="sticky -bottom-6 -mx-6 mt-5 flex items-center gap-3 border-t border-line bg-surface px-6 py-3.5">
        {manageHref && (
          <Link to={manageHref} className="text-[13px] text-fg-3 hover:text-fg">
            템플릿 정리
          </Link>
        )}
        <Button
          className="ml-auto"
          disabled={picked.length === 0}
          loading={busy}
          icon={<Plus className="size-4 stroke-[1.6]" />}
          onClick={async () => {
            setBusy(true)
            try {
              await onAdd(picked.map((k) => byKey.get(k)!).filter(Boolean))
            } finally {
              setBusy(false)
            }
          }}
        >
          {picked.length ? `${picked.length}개 추가` : '골라 주세요'}
        </Button>
      </div>
    </div>
  )
}
