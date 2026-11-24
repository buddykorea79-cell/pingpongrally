import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router'
import { BookmarkPlus, ChevronDown, ClipboardList, Copy, FileJson, FileUp, LibraryBig, Lock, MoreHorizontal, Pencil, Plus, Trash2, Type, X } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { PingSet, RallyNode, Room, SurveyTemplate } from '@/lib/types'
import { roomPhase, useDocumentTitle, useNow, useRoomState, useSession } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, safeFileName } from '@/lib/utils'
import { downloadText, pingSetFromNodes } from '@/lib/export/rally'
import { parsePingSetFile } from '@/lib/export/pingset'
import { listTemplateGroups, MY_TEMPLATES } from '@/lib/templates'
import { HostShell } from '@/components/layout/HostShell'
import { RoomHeader } from '@/components/host/RoomHeader'
import { ExportCard, PanelCard, RegistrationCard, SurveysCard } from '@/components/host/RoomPanel'
import { Button, IconButton } from '@/components/ui/Button'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { Input } from '@/components/ui/Field'
import { Menu, useConfirm } from '@/components/ui/Overlay'

/**
 * [관리] 탭: 강의 준비와 정리를 한곳에서.
 * 강의 정보 · 참석자 등록 · 설문(붙이기와 템플릿) · 핑 템플릿 · 내보내기.
 * 진행 화면은 핑을 띄우고 답을 보는 일에만 집중하도록 이쪽으로 옮겼다.
 */
export default function Manage() {
  const { id } = useParams()
  const { session } = useSession()
  const loc = useLocation()
  const state = useRoomState(id)
  const { room, nodes, surveys } = state
  const now = useNow(30_000)
  useDocumentTitle(room ? `관리 · ${room.title}` : '관리')

  // #registration, #templates 처럼 주소에 붙은 칸으로 바로 이동
  useEffect(() => {
    if (state.status !== 'ready' || !loc.hash) return
    const t = window.setTimeout(() => document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120)
    return () => clearTimeout(t)
  }, [state.status, loc.hash])

  if (state.status === 'loading') return <HostShell wide bare><BallLoader className="min-h-[70dvh]" /></HostShell>
  if (!room || state.status !== 'ready') return <HostShell><EmptyState title="강의를 찾을 수 없어요" /></HostShell>
  if (session && room.host_id !== session.userId) return <HostShell><EmptyState icon={<Lock />} title="다른 강사의 강의예요" /></HostShell>

  const here = `/host/rooms/${room.id}/manage`
  return (
    <HostShell wide bare>
      <RoomHeader room={room} now={now} />
      <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
        <div className="grid items-start gap-5 lg:grid-cols-2">
          <div className="space-y-5">
            <RoomInfoCard room={room} onChange={state.setRoom} />
            <div id="registration" className="scroll-mt-24">
              <RegistrationCard room={room} onChange={state.setRoom} />
            </div>
            <div id="surveys" className="scroll-mt-24">
              <SurveysCard room={room} surveys={surveys} />
            </div>
            <SurveyTemplatesCard from={here} />
          </div>
          <div className="space-y-5">
            <div id="templates" className="scroll-mt-24">
              <PingTemplatesCard room={room} nodes={nodes} from={here} />
            </div>
            <div id="export" className="scroll-mt-24">
              <ExportCard room={room} nodes={nodes} />
            </div>
          </div>
        </div>
      </div>
    </HostShell>
  )
}

// ---------------------------------------------------------------------------
function RoomInfoCard({ room, onChange }: { room: Room; onChange: (r: Room) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const nav = useNavigate()
  const [title, setTitle] = useState(room.title)
  const [saving, setSaving] = useState(false)
  useEffect(() => setTitle(room.title), [room.title])
  const phase = roomPhase(room)
  const changed = title.trim() !== room.title && !!title.trim()

  async function save() {
    setSaving(true)
    try {
      onChange(await backend.updateRoom(room.id, { title: title.trim() }))
      toast.show('제목을 바꿨어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <PanelCard title="강의 정보" icon={<Type />}>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (changed) void save()
        }}
      >
        <div className="min-w-0 flex-1">
          <Input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} aria-label="강의 제목" />
        </div>
        <Button type="submit" variant={changed ? 'primary' : 'secondary'} disabled={!changed} loading={saving}>
          저장
        </Button>
      </form>
      <p className="mt-2 text-xs text-fg-3">교육생 화면, 등록 폼, 동의 문안에 그대로 보여요.</p>
      {phase === 'draft' && (
        <button
          onClick={async () => {
            const ok = await confirm({
              title: `‘${room.title}’ 강의를 삭제할까요?`,
              description: '준비한 핑, 붙인 설문, 미리 받은 참석자 등록이 함께 지워지고 되돌릴 수 없어요. 템플릿은 남아요.',
              confirmText: '삭제',
              tone: 'danger',
            })
            if (!ok) return
            try {
              await backend.deleteRoom(room.id)
              toast.show('강의를 삭제했어요.')
              nav('/host', { replace: true })
            } catch (e) {
              toast.show(errorMessage(e), 'danger')
            }
          }}
          className="mt-4 flex items-center gap-1.5 text-[13px] text-fg-3 hover:text-danger"
        >
          <Trash2 className="size-3.5 stroke-[1.5]" /> 이 강의 삭제
        </button>
      )}
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
function SurveyTemplatesCard({ from }: { from: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [list, setList] = useState<SurveyTemplate[] | null>(null)
  const load = () =>
    backend
      .listSurveyTemplates()
      .then(setList)
      .catch(() => setList([]))
  useEffect(() => {
    void load()
  }, [])
  const q = `?from=${encodeURIComponent(from)}`
  return (
    <PanelCard
      title="설문 템플릿"
      icon={<ClipboardList />}
      aside={
        <Link to={`/host/templates/new${q}`} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg">
          <Plus className="size-3.5 stroke-[1.6]" /> 새 설문지
        </Link>
      }
    >
      <p className="-mt-2 mb-3 text-[12.5px] text-fg-3">모든 강의에서 함께 써요. 강의 기록이 파기돼도 템플릿은 남아요.</p>
      {list === null ? (
        <BallLoader className="py-4" />
      ) : list.length === 0 ? (
        <p className="text-[13px] text-fg-3">만족도 조사, 사전 수준 진단처럼 자주 쓰는 설문을 만들어 두세요.</p>
      ) : (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-1 pl-4 pr-1.5">
              <Link to={`/host/templates/${t.id}${q}`} className="min-w-0 flex-1 py-2">
                <span className="block truncate text-[14px] hover:underline hover:decoration-line-strong hover:underline-offset-4">{t.title}</span>
                <span className="text-xs text-fg-3">문항 {t.questions.length}개</span>
              </Link>
              <Menu
                items={[
                  { label: '고치기', icon: <Pencil />, onSelect: () => nav(`/host/templates/${t.id}${q}`) },
                  {
                    label: '복제',
                    icon: <Copy />,
                    onSelect: async () => {
                      await backend.saveSurveyTemplate({ title: `${t.title} (사본)`, description: t.description, questions: t.questions })
                      toast.show('복제했어요.')
                      void load()
                    },
                  },
                  {
                    label: '삭제',
                    icon: <Trash2 />,
                    danger: true,
                    onSelect: async () => {
                      if (!(await confirm({ title: '설문 템플릿을 삭제할까요?', description: '이미 강의에 붙인 설문은 영향을 받지 않아요.', confirmText: '삭제', tone: 'danger' }))) return
                      await backend.deleteSurveyTemplate(t.id)
                      void load()
                    },
                  },
                ]}
                trigger={(p) => (
                  <IconButton label="더 보기" size="sm" {...p}>
                    <MoreHorizontal />
                  </IconButton>
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
function PingTemplatesCard({ room, nodes, from }: { room: Room; nodes: RallyNode[]; from: string }) {
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const file = useRef<HTMLInputElement>(null)
  const [groups, setGroups] = useState<PingSet[] | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () =>
    listTemplateGroups()
      .then(setGroups)
      .catch(() => setGroups([]))
  useEffect(() => {
    void load()
  }, [])
  const q = `?from=${encodeURIComponent(from)}`
  const total = groups?.reduce((n, g) => n + g.pings.length, 0) ?? 0

  async function saveAll() {
    const pings = pingSetFromNodes(nodes)
    if (!pings.length) return toast.show('저장할 핑이 없어요.', 'info')
    setBusy(true)
    try {
      const same = groups?.find((g) => g.title === room.title)
      if (same && !(await confirm({ title: `‘${room.title}’ 묶음을 새로 저장할까요?`, description: '같은 이름의 묶음이 있어요. 지금 강의의 핑으로 바꿔 저장해요.', confirmText: '바꿔 저장' }))) return
      await backend.savePingSet({ id: same?.id, title: room.title, pings })
      toast.show(`핑 ${pings.length}개를 ‘${room.title}’ 묶음으로 저장했어요.`)
      void load()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setBusy(false)
    }
  }

  async function importFile(f: File | undefined) {
    if (!f) return
    try {
      const parsed = parsePingSetFile(await f.text())
      const s = await backend.savePingSet(parsed)
      toast.show(`‘${s.title}’ 묶음으로 ${s.pings.length}개를 가져왔어요.`)
      void load()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  async function removeItem(g: PingSet, i: number) {
    try {
      const pings = g.pings.filter((_, j) => j !== i)
      if (pings.length === 0 && g.title !== MY_TEMPLATES) await backend.deletePingSet(g.id)
      else await backend.savePingSet({ id: g.id, title: g.title, pings })
      void load()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  return (
    <PanelCard title="핑 템플릿" icon={<LibraryBig />} aside={<span className="text-xs text-fg-3">{total}개</span>}>
      <p className="-mt-2 mb-3 text-[12.5px] leading-relaxed text-fg-3">
        다시 쓰고 싶은 핑·퀵폴을 모아 둬요. 진행 화면의 [추가] → [템플릿]에서 골라 넣어요. 강의가 끝나면 올린 파일은 지워지므로 링크 첨부만 남아요.
      </p>
      {groups === null ? (
        <BallLoader className="py-4" />
      ) : groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong px-4 py-5 text-[13px] leading-relaxed text-fg-3">
          아직 없어요. 핑을 만들 때 [내 템플릿에도 저장]을 켜거나, 진행 화면에서 핑의 ⋯ → [템플릿으로 저장]을 누르세요.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-xl ring-1 ring-line">
          {groups.map((g) => {
            const open = openId === g.id
            return (
              <li key={g.id}>
                <div className="flex items-center gap-2 py-1 pl-4 pr-1.5">
                  <button onClick={() => setOpenId(open ? null : g.id)} className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left" aria-expanded={open}>
                    <ChevronDown className={cn('size-4 shrink-0 stroke-[1.5] text-fg-3 transition-transform', !open && '-rotate-90')} />
                    <span className="min-w-0 flex-1 truncate text-[14px]">{g.title}</span>
                    <span className="shrink-0 text-xs text-fg-3">{g.pings.length}</span>
                  </button>
                  <Menu
                    items={[
                      { label: '고치기·순서 바꾸기', icon: <Pencil />, onSelect: () => nav(`/host/ping-sets/${g.id}${q}`) },
                      {
                        label: '파일로 내보내기 (.json)',
                        icon: <FileJson />,
                        onSelect: () => downloadText(JSON.stringify({ title: g.title, pings: g.pings }, null, 2), `핑템플릿_${safeFileName(g.title)}.json`, 'application/json'),
                      },
                      {
                        label: '묶음 삭제',
                        icon: <Trash2 />,
                        danger: true,
                        onSelect: async () => {
                          if (!(await confirm({ title: `‘${g.title}’ 묶음을 삭제할까요?`, description: `템플릿 ${g.pings.length}개가 지워져요. 이미 강의에 넣은 핑은 그대로예요.`, confirmText: '삭제', tone: 'danger' }))) return
                          await backend.deletePingSet(g.id)
                          void load()
                        },
                      },
                    ]}
                    trigger={(p) => (
                      <IconButton label="더 보기" size="sm" {...p}>
                        <MoreHorizontal />
                      </IconButton>
                    )}
                  />
                </div>
                {open && (
                  <ul className="animate-fade-in border-t border-line bg-surface-2/50">
                    {g.pings.length === 0 && <li className="px-4 py-3 text-[13px] text-fg-3">비어 있어요.</li>}
                    {g.pings.map((p, i) => (
                      <li key={i} className="flex items-start gap-3 py-2.5 pl-10 pr-2">
                        <span className={cn('mt-[7px] size-1.5 shrink-0 rounded-full', p.type === 'poll' ? 'bg-poll-500' : 'bg-ping-500')} />
                        <span className="min-w-0 flex-1">
                          <span className="line-clamp-2 text-[13.5px] leading-snug">{p.content}</span>
                          {p.type === 'poll' && <span className="mt-0.5 block truncate text-xs text-fg-3">{(p.meta?.options ?? []).map((o) => o.label).join(' · ')}</span>}
                        </span>
                        <button onClick={() => void removeItem(g, i)} className="rounded-md p-1.5 text-fg-3 hover:bg-surface-3 hover:text-danger" aria-label="템플릿에서 빼기">
                          <X className="size-3.5 stroke-[1.5]" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" loading={busy} icon={<BookmarkPlus className="size-4 stroke-[1.5]" />} onClick={() => void saveAll()}>
          이 강의 핑 모두 저장
        </Button>
        <input ref={file} type="file" accept=".json,application/json" hidden onChange={(e) => (void importFile(e.target.files?.[0]), (e.target.value = ''))} />
        <Button size="sm" variant="secondary" icon={<FileUp className="size-4 stroke-[1.5]" />} onClick={() => file.current?.click()}>
          파일 가져오기
        </Button>
      </div>
    </PanelCard>
  )
}
