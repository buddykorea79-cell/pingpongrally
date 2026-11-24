import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowRight,
  Bot,
  Check,
  ClipboardList,
  Copy,
  Download,
  FileText,
  Hourglass,
  Layers,
  Mail,
  MonitorPlay,
  Network,
  Play,
  Plus,
  Power,
  QrCode,
  Send,
  Share2,
  Sparkles,
  Square,
  TimerReset,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { backend, isDemo } from '@/lib/backend'
import type { PollResults, RallyNode, Room, RoomMember, RoomSurvey, SurveyTemplate, SurveyTiming } from '@/lib/types'
import { roomPhase } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { cn, formatDateTime, formatRemaining, safeFileName, todayStamp } from '@/lib/utils'
import { buildAiMarkdown, downloadRallyZip, downloadText } from '@/lib/export/rally'
import { Button } from '../ui/Button'
import { Badge, LiveDot } from '../ui/Display'
import { Callout, useToast } from '../ui/Feedback'
import { Segmented, Switch } from '../ui/Controls'
import { Menu, Modal, useConfirm } from '../ui/Overlay'
import { Field, Input, Textarea } from '../ui/Field'
import { TIMING_LABEL } from './CreateRoomModal'

export function joinUrl(code: string | null) {
  return `${location.origin}/j/${code ?? ''}`
}

export function regUrl(token: string) {
  return `${location.origin}/reg/${token}`
}

export function PanelCard({ title, icon, children, aside, className }: { title: string; icon?: React.ReactNode; children: React.ReactNode; aside?: React.ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl bg-surface p-5 ring-1 ring-line', className)}>
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[14px] font-medium [&_svg]:size-4 [&_svg]:stroke-[1.5] [&_svg]:text-fg-3">
          {icon}
          {title}
        </h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
export function StatusCard({ room, now, pingCount, surveyCount, onChange }: { room: Room; now: number; pingCount: number; surveyCount: number; onChange: (r: Room) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  const phase = roomPhase(room, now)

  async function start() {
    const ok = await confirm({
      title: '강의를 시작할까요?',
      description: '입장 코드와 QR이 열리고, 지금부터 24시간 동안 교육생이 들어올 수 있어요. 글·파일은 72시간 뒤 자동으로 지워져요.',
      confirmText: '강의 시작',
      tone: 'primary',
    })
    if (!ok) return
    setBusy(true)
    try {
      onChange(await backend.startRoom(room.id))
      toast.show('강의를 시작했어요. 발표 화면에 QR을 띄워 보세요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setBusy(false)
    }
  }
  async function extend(h: number) {
    try {
      onChange(await backend.extendRoom(room.id, h))
      toast.show(`${h}시간 연장했어요.`)
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  async function close() {
    const ok = await confirm({
      title: '강의를 지금 종료할까요?',
      description: '교육생은 더 이상 글을 쓸 수 없고 읽기만 할 수 있어요. 열린 설문과 참석자 등록도 마감돼요. 종료하면 새 강의를 만들 수 있어요.',
      confirmText: '즉시 종료',
      tone: 'danger',
    })
    if (!ok) return
    try {
      onChange(await backend.closeRoom(room.id))
      toast.show('강의를 종료했어요. 48시간 안에 내보내기를 마쳐 주세요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  if (phase === 'draft') {
    const manage = `/host/rooms/${room.id}/manage`
    const checks = [
      { ok: pingCount > 0, label: pingCount > 0 ? `핑 ${pingCount}개 준비됨` : '핑을 하나 이상 준비해 두세요' },
      { ok: room.registration === 'open', optional: true, label: room.registration === 'open' ? '참석자 등록 받는 중' : '참석자 등록 안 받음 (선택)', href: `${manage}#registration` },
      { ok: surveyCount > 0, optional: true, label: surveyCount > 0 ? `설문 ${surveyCount}개 붙임` : '설문 없음 (선택)', href: `${manage}#surveys` },
    ]
    return (
      <section className="rounded-2xl bg-surface p-5 ring-1 ring-line">
        <p className="eyebrow">준비 중</p>
        <h3 className="mt-1 text-[18px] font-light">강의 시작 전 점검</h3>
        <ul className="mt-4 space-y-2.5">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2.5 text-[13.5px]">
              <span className={cn('flex size-4 items-center justify-center rounded-full ring-1', c.ok ? 'bg-inverse text-on-inverse ring-inverse' : c.optional ? 'ring-line-strong' : 'ring-warning')}>
                {c.ok && <Check className="size-2.5 stroke-[3]" />}
              </span>
              <span className={c.ok ? 'text-fg' : 'text-fg-3'}>{c.label}</span>
              {c.href && !c.ok && (
                <Link to={c.href} className="ml-auto text-xs text-fg-3 underline decoration-line-strong underline-offset-4 hover:text-fg">
                  관리에서 설정
                </Link>
              )}
            </li>
          ))}
        </ul>
        <Button size="lg" block className="mt-5" loading={busy} icon={<Play className="size-3.5 fill-current" />} onClick={() => void start()}>
          강의 시작
        </Button>
        <p className="mt-3 text-center text-xs text-fg-3">시작하면 입장 코드·QR이 열리고 24시간 뒤 자동 종료돼요.</p>
      </section>
    )
  }

  if (phase === 'ended') {
    const contentLeft = room.purge_content_at ? new Date(room.purge_content_at).getTime() - now : 0
    const piiLeft = room.purge_pii_at ? new Date(room.purge_pii_at).getTime() - now : 0
    return (
      <PanelCard title="강의 종료" icon={<Power />} aside={<Badge>종료됨</Badge>}>
        <p className="text-[13px] text-fg-2">{formatDateTime(room.closed_at ?? room.expires_at)}에 끝났어요. 교육생은 읽기만 할 수 있어요.</p>
        <div className="mt-4 divide-y divide-line rounded-xl ring-1 ring-line">
          <PurgeRow label="글·파일 자동 삭제" at={room.purge_content_at} left={contentLeft} />
          {room.registration !== 'off' && <PurgeRow label="등록·설문 정보 파기" at={room.purge_pii_at} left={piiLeft} />}
        </div>
        {contentLeft > 0 && (
          <Callout tone="warning" className="mt-4" icon={<Hourglass />}>
            삭제되기 전에 아래 [내보내기]로 ZIP·Markdown·엑셀을 받아 두세요.
          </Callout>
        )}
      </PanelCard>
    )
  }

  const total = new Date(room.expires_at!).getTime() - new Date(room.started_at!).getTime()
  const left = new Date(room.expires_at!).getTime() - now
  const canExtend = new Date(room.expires_at!).getTime() < new Date(room.started_at!).getTime() + 48 * 3600_000
  return (
    <section className="rounded-2xl bg-surface ring-1 ring-line">
      <div className="flex items-start gap-4 p-5">
        <button onClick={() => setQrOpen(true)} className="shrink-0 rounded-lg bg-white p-2 ring-1 ring-line transition hover:ring-line-strong" aria-label="QR 크게 보기">
          <QRCodeSVG value={joinUrl(room.code)} size={80} level="M" marginSize={0} />
        </button>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-xs text-fg-3">
            <LiveDot className="size-1.5" /> 입장 코드
          </p>
          <p className="mt-1 font-mono text-[30px] font-light leading-none tracking-[0.12em]">{room.code}</p>
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(joinUrl(room.code))
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            }}
            className="mt-3 flex max-w-full items-center gap-1.5 text-xs text-fg-3 hover:text-fg"
          >
            {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 stroke-[1.5]" />}
            <span className="truncate">{copied ? '링크를 복사했어요' : joinUrl(room.code).replace(/^https?:\/\//, '')}</span>
          </button>
        </div>
      </div>
      <div className="border-t border-line p-5">
        <div className="flex items-center justify-between text-[13px]">
          <span className="text-fg-3">남은 시간</span>
          <span className="tabular">{formatRemaining(left)}</span>
        </div>
        <div className="mt-2 h-px overflow-hidden bg-line">
          <div className={cn('h-full', left < 3600_000 ? 'bg-warning' : 'bg-fg')} style={{ width: `${Math.max(0, Math.min(100, (left / total) * 100))}%` }} />
        </div>
        <p className="mt-2 text-xs text-fg-3">{formatDateTime(room.expires_at)}에 자동 종료</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Menu
            align="start"
            className="w-full"
            items={[1, 3, 6, 12, 24].map((h) => ({ label: `${h}시간 연장`, onSelect: () => void extend(h), disabled: !canExtend }))}
            trigger={(p) => (
              <Button {...p} variant="secondary" size="sm" block icon={<TimerReset className="size-4 stroke-[1.5]" />} disabled={!canExtend} title={canExtend ? undefined : '시작 후 최대 48시간까지 열 수 있어요'}>
                연장
              </Button>
            )}
          />
          <Button variant="secondary" size="sm" className="text-danger" icon={<Square className="size-3 fill-current" />} onClick={() => void close()}>
            즉시 종료
          </Button>
        </div>
      </div>
      <Modal open={qrOpen} onClose={() => setQrOpen(false)} size="md" title="입장 QR">
        <div className="flex flex-col items-center pb-2">
          <div className="rounded-xl bg-white p-5 ring-1 ring-line">
            <QRCodeSVG value={joinUrl(room.code)} size={280} level="M" marginSize={0} />
          </div>
          <p className="mt-5 font-mono text-4xl font-light tracking-[0.14em]">{room.code}</p>
          <p className="mt-2 text-sm text-fg-3">{joinUrl(room.code)}</p>
        </div>
      </Modal>
    </section>
  )
}

function PurgeRow({ label, at, left }: { label: string; at: string | null; left: number }) {
  return (
    <div className="flex items-center justify-between px-3.5 py-2.5 text-[13px]">
      <span className="text-fg-2">{label}</span>
      <span className="tabular text-right">
        {left > 0 ? `${formatRemaining(left)} 뒤` : '완료'}
        <span className="block text-[11px] text-fg-3">{formatDateTime(at)}</span>
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// 참석자 등록: 설문처럼 링크를 만들어 참석자에게 보낸다.
// ---------------------------------------------------------------------------
export function RegistrationCard({ room, onChange }: { room: Room; onChange: (r: Room) => void }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [count, setCount] = useState<number | null>(null)
  const [setupOpen, setSetupOpen] = useState(false)
  const [sendOpen, setSendOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const phase = roomPhase(room)
  const url = regUrl(room.reg_token)

  useEffect(() => {
    if (room.registration === 'off') return
    let alive = true
    const load = () =>
      backend
        .listParticipants(room.id)
        .then((p) => alive && setCount(p.length))
        .catch(() => {})
    void load()
    const t = window.setInterval(() => document.visibilityState === 'visible' && void load(), 15_000)
    return () => {
      alive = false
      clearInterval(t)
    }
  }, [room.id, room.registration])

  async function setStatus(registration: Room['registration']) {
    if (registration === 'closed') {
      const ok = await confirm({ title: '참석자 등록을 마감할까요?', description: '링크를 열어도 더 이상 등록할 수 없어요. 이미 받은 등록은 그대로 남고, 언제든 다시 열 수 있어요.', confirmText: '마감' })
      if (!ok) return
    }
    try {
      onChange(await backend.updateRoom(room.id, { registration }))
      toast.show(registration === 'open' ? '등록을 다시 받아요.' : '등록을 마감했어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  const status =
    room.registration === 'open' ? (
      <Badge tone="success" size="sm">
        받는 중
      </Badge>
    ) : room.registration === 'closed' ? (
      <Badge size="sm">마감</Badge>
    ) : null

  return (
    <PanelCard title="참석자 등록" icon={<UserCheck />} aside={status}>
      {room.registration === 'off' ? (
        <>
          <p className="text-[13px] leading-relaxed text-fg-2">
            소속·부서·성명을 설문처럼 받아 출석을 확인해요. 등록 폼을 만들면 링크가 생기고, 카카오톡·문자·메일로 참석자에게 보내면 돼요.
          </p>
          {phase === 'ended' ? (
            <p className="mt-3 text-[13px] text-fg-3">종료된 강의예요.</p>
          ) : (
            <Button className="mt-4" size="sm" variant="secondary" block icon={<Plus className="size-4 stroke-[1.6]" />} onClick={() => setSetupOpen(true)}>
              등록 폼 만들기
            </Button>
          )}
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className="tabular text-[30px] font-extralight leading-none">{count ?? '–'}</span>
            <span className="text-[13px] text-fg-3">명 등록</span>
            <Link to={`/host/rooms/${room.id}/attendance`} className="ml-auto flex items-center gap-1 text-[13px] text-fg-2 hover:text-fg">
              명단 보기 <ArrowRight className="size-3.5 stroke-[1.5]" />
            </Link>
          </div>

          {room.registration === 'open' && (
            <>
              <div className="mt-4 flex items-center gap-2 rounded-lg bg-surface-2 py-1.5 pl-3 pr-1.5 ring-1 ring-inset ring-line">
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-fg-2">{url.replace(/^https?:\/\//, '')}</span>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(url)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                  className="flex h-7 items-center gap-1 rounded-md px-2 text-xs text-fg-2 hover:bg-surface hover:text-fg"
                >
                  {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5 stroke-[1.5]" />}
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
              <Button className="mt-2" size="sm" block icon={<Send className="size-3.5 stroke-[1.6]" />} onClick={() => setSendOpen(true)}>
                참석자에게 보내기
              </Button>
            </>
          )}

          <div className="mt-3 flex items-center gap-1 text-[12.5px]">
            {phase !== 'ended' && (
              <button onClick={() => setSetupOpen(true)} className="rounded-md px-2 py-1 text-fg-3 hover:bg-surface-3 hover:text-fg">
                설정
              </button>
            )}
            <a href={url} target="_blank" rel="noreferrer" className="rounded-md px-2 py-1 text-fg-3 hover:bg-surface-3 hover:text-fg">
              미리 보기
            </a>
            {phase !== 'ended' &&
              (room.registration === 'open' ? (
                <button onClick={() => void setStatus('closed')} className="ml-auto rounded-md px-2 py-1 text-fg-3 hover:bg-surface-3 hover:text-fg">
                  마감하기
                </button>
              ) : (
                <button onClick={() => void setStatus('open')} className="ml-auto rounded-md px-2 py-1 text-fg-3 hover:bg-surface-3 hover:text-fg">
                  다시 열기
                </button>
              ))}
          </div>
        </>
      )}
      <RegistrationSetupModal
        open={setupOpen}
        onClose={() => setSetupOpen(false)}
        room={room}
        onSaved={(r, created) => {
          onChange(r)
          if (created) setSendOpen(true)
        }}
      />
      <SendRegistrationModal open={sendOpen} onClose={() => setSendOpen(false)} room={room} />
    </PanelCard>
  )
}

function RegistrationSetupModal({ open, onClose, room, onSaved }: { open: boolean; onClose: () => void; room: Room; onSaved: (r: Room, created: boolean) => void }) {
  const toast = useToast()
  const [controller, setController] = useState(room.controller_name)
  const [contact, setContact] = useState(room.contact)
  const [collect, setCollect] = useState(room.collect_phone)
  const [purpose, setPurpose] = useState(room.phone_purpose || '수료 안내 문자 발송')
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState(false)
  const creating = room.registration === 'off'
  useEffect(() => {
    if (!open) return
    setController(room.controller_name)
    setContact(room.contact)
    setCollect(room.collect_phone)
    setPurpose(room.phone_purpose || '수료 안내 문자 발송')
    setTouched(false)
  }, [open, room])

  async function save() {
    setTouched(true)
    if (!controller.trim() || (collect && !purpose.trim())) return
    setSaving(true)
    try {
      const r = await backend.updateRoom(room.id, {
        controller_name: controller.trim(),
        contact: contact.trim(),
        collect_phone: collect,
        phone_purpose: collect ? purpose.trim() : '',
        ...(creating ? { registration: 'open' as const } : {}),
      })
      onSaved(r, creating)
      toast.show(creating ? '등록 폼을 만들었어요. 이제 링크를 보내세요.' : '설정을 저장했어요.')
      onClose()
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={creating ? '참석자 등록 폼 만들기' : '참석자 등록 설정'}
      description="참석자는 링크를 열어 소속 기관·부서·성명을 입력하고 개인정보 수집에 동의해요. 아래 값은 동의 문안에 그대로 들어가요."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button loading={saving} onClick={() => void save()}>
            {creating ? '만들고 링크 받기' : '저장'}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="개인정보처리자" required hint="강사명 또는 주관 기관명" error={touched && !controller.trim() ? '동의 문안에 들어갈 이름이 필요해요.' : null}>
          <Input data-autofocus value={controller} maxLength={80} onChange={(e) => setController(e.target.value)} placeholder="예: 핑퐁교육원" />
        </Field>
        <Field label="문의처" optional hint="담당자 이름·연락처">
          <Input value={contact} maxLength={120} onChange={(e) => setContact(e.target.value)} placeholder="예: 교육운영팀 02-000-0000" />
        </Field>
        <div className="border-t border-line pt-5">
          <Switch checked={collect} onChange={setCollect} label="휴대폰 번호도 받기" description="선택 동의한 사람만 입력해요. 화면·엑셀에서는 기본으로 가려져요." />
          {collect && (
            <Field label="수집 목적" required className="mt-4 animate-fade-in" error={touched && !purpose.trim() ? '수집 목적을 적어 주세요.' : null}>
              <Input value={purpose} maxLength={120} onChange={(e) => setPurpose(e.target.value)} />
            </Field>
          )}
        </div>
        <p className="text-xs leading-relaxed text-fg-3">
          등록 정보는 강의 종료 7일 뒤 자동 파기돼요(강의를 시작하지 않으면 폼을 연 지 30일 뒤). 동의 문안 v{room.consent_version}
        </p>
      </div>
    </Modal>
  )
}

export function registrationMessage(room: Pick<Room, 'title' | 'reg_token'>) {
  return `[${room.title}] 참석자 등록 안내\n\n출석 확인을 위해 아래 링크에서 소속과 성명을 등록해 주세요. 1분이면 끝나요.\n${regUrl(room.reg_token)}\n\n강의 당일에는 같은 휴대폰으로 입장 QR을 찍으면 출석이 자동으로 확인돼요.`
}

function SendRegistrationModal({ open, onClose, room }: { open: boolean; onClose: () => void; room: Room }) {
  const toast = useToast()
  const [text, setText] = useState(() => registrationMessage(room))
  useEffect(() => {
    if (open) setText(registrationMessage(room))
  }, [open, room])
  const url = regUrl(room.reg_token)
  const canShare = typeof navigator !== 'undefined' && 'share' in navigator
  return (
    <Modal open={open} onClose={onClose} title="참석자에게 보내기" description="안내 문구를 복사해 단체 대화방·문자·메일로 보내세요. 화면에 QR을 띄워도 돼요." size="md">
      <div className="space-y-4">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[150px] text-[14px]" maxRows={10} />
        <div className="grid grid-cols-2 gap-2">
          <Button
            icon={<Copy className="size-4 stroke-[1.6]" />}
            onClick={async () => {
              await navigator.clipboard.writeText(text)
              toast.show('안내 문구를 복사했어요.')
            }}
          >
            문구 복사
          </Button>
          {canShare ? (
            <Button
              variant="secondary"
              icon={<Share2 className="size-4 stroke-[1.5]" />}
              onClick={() => {
                navigator.share({ title: `${room.title} 참석자 등록`, text }).catch(() => {})
              }}
            >
              공유하기
            </Button>
          ) : (
            <a
              href={`mailto:?subject=${encodeURIComponent(`[${room.title}] 참석자 등록 안내`)}&body=${encodeURIComponent(text)}`}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-surface text-sm ring-1 ring-inset ring-line-strong hover:bg-surface-2"
            >
              <Mail className="size-4 stroke-[1.5]" /> 메일로 보내기
            </a>
          )}
        </div>
        <div className="flex items-center gap-4 rounded-xl p-4 ring-1 ring-line">
          <div className="shrink-0 rounded-md bg-white p-1.5 ring-1 ring-line">
            <QRCodeSVG value={url} size={84} level="M" marginSize={0} />
          </div>
          <div className="min-w-0 text-[13px] leading-relaxed text-fg-2">
            <p className="text-fg">등록 QR</p>
            <p className="mt-0.5">강의 화면에 띄우거나 인쇄해 나눠 주세요.</p>
            <p className="mt-1 truncate font-mono text-[11.5px] text-fg-3">{url.replace(/^https?:\/\//, '')}</p>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
export function PeopleCard({ members }: { members: RoomMember[] }) {
  return (
    <PanelCard title="참여자" icon={<Users />}>
      <div className="flex items-end gap-6">
        <div>
          <p className="tabular text-[30px] font-extralight leading-none tracking-tight">{members.length}</p>
          <p className="mt-1.5 text-xs text-fg-3">입장</p>
        </div>
        <div className="ml-auto flex -space-x-1.5 pb-1">
          {members.slice(-6).map((m) => (
            <span key={m.user_id} className="flex size-6 items-center justify-center rounded-full text-[10px] text-white ring-2 ring-surface" style={{ background: m.color }}>
              {m.nickname[0]}
            </span>
          ))}
        </div>
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
export function SurveysCard({ room, surveys, onPresent, compact }: { room: Room; surveys: RoomSurvey[]; onPresent?: (s: RoomSurvey) => void; compact?: boolean }) {
  const toast = useToast()
  const confirm = useConfirm()
  const [templates, setTemplates] = useState<SurveyTemplate[]>([])
  const [attachOpen, setAttachOpen] = useState(false)
  const phase = roomPhase(room)
  useEffect(() => {
    if (!attachOpen) return
    backend.listSurveyTemplates().then(setTemplates).catch(() => {})
  }, [attachOpen])
  const set = async (s: RoomSurvey, status: RoomSurvey['status']) => {
    try {
      await backend.updateRoomSurvey(s.id, { status })
      toast.show(status === 'open' ? '설문을 열었어요. 교육생 화면에 안내가 떠요.' : '설문을 닫았어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  return (
    <PanelCard
      title="설문"
      icon={<ClipboardList />}
      aside={
        compact ? (
          <Link to={`/host/rooms/${room.id}/manage#surveys`} className="rounded-md px-2 py-1 text-xs text-fg-3 hover:bg-surface-3 hover:text-fg">
            관리
          </Link>
        ) : phase !== 'ended' ? (
          <button onClick={() => setAttachOpen(true)} className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg">
            <Plus className="size-3.5 stroke-[1.6]" /> 붙이기
          </button>
        ) : undefined
      }
    >
      {surveys.length === 0 ? (
        <p className="text-[13px] leading-relaxed text-fg-3">붙인 설문이 없어요. 아래 설문 템플릿을 사전(입장할 때)·중간·사후 설문으로 붙일 수 있어요.</p>
      ) : (
        <ul className="space-y-2">
          {surveys.map((s) => (
            <li key={s.id} className="rounded-xl p-3 ring-1 ring-inset ring-line">
              <div className="flex items-center gap-2">
                <Badge tone="pong" size="sm">
                  {TIMING_LABEL[s.timing]}
                </Badge>
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.title}</span>
                {s.status === 'open' ? (
                  <Badge tone="success" size="sm">
                    열림
                  </Badge>
                ) : s.status === 'closed' ? (
                  <Badge size="sm">닫힘</Badge>
                ) : (
                  <Badge tone="outline" size="sm">
                    대기
                  </Badge>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-1">
                {phase === 'live' &&
                  (s.status === 'open' ? (
                    <Button size="xs" variant="secondary" onClick={() => void set(s, 'closed')}>
                      닫기
                    </Button>
                  ) : (
                    <Button size="xs" onClick={() => void set(s, 'open')}>
                      {s.status === 'closed' ? '다시 열기' : '열기'}
                    </Button>
                  ))}
                <Link to={`/host/rooms/${room.id}/surveys?s=${s.id}`} className="flex h-7 items-center rounded-md px-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg">
                  결과
                </Link>
                {onPresent && (
                  <button onClick={() => onPresent(s)} className="flex h-7 items-center rounded-md px-2 text-xs text-fg-2 hover:bg-surface-3 hover:text-fg">
                    발표 화면 공유
                  </button>
                )}
                {phase === 'draft' && !compact && (
                  <button
                    onClick={async () => {
                      if (!(await confirm({ title: '이 설문을 뗄까요?', confirmText: '떼기', tone: 'danger' }))) return
                      await backend.deleteRoomSurvey(s.id)
                      location.reload()
                    }}
                    className="ml-auto rounded-lg p-1.5 text-fg-3 hover:bg-surface-3 hover:text-danger"
                    aria-label="설문 떼기"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {!compact && <AttachSurveyModal open={attachOpen} onClose={() => setAttachOpen(false)} room={room} templates={templates} />}
    </PanelCard>
  )
}

function AttachSurveyModal({ open, onClose, room, templates }: { open: boolean; onClose: () => void; room: Room; templates: SurveyTemplate[] }) {
  const toast = useToast()
  const [tpl, setTpl] = useState('')
  const [timing, setTiming] = useState<SurveyTiming>('post')
  const [anonymous, setAnonymous] = useState(true)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="설문 붙이기"
      description="템플릿의 문항을 복사해 이 강의에 붙여요."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            취소
          </Button>
          <Button
            disabled={!tpl}
            onClick={async () => {
              try {
                await backend.attachSurvey(room.id, tpl, timing, anonymous)
                toast.show('설문을 붙였어요.')
                onClose()
              } catch (e) {
                toast.show(errorMessage(e), 'danger')
              }
            }}
          >
            붙이기
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {templates.length === 0 ? (
          <Callout tone="neutral">
            설문 템플릿이 없어요.{' '}
            <Link to={`/host/templates/new?from=${encodeURIComponent(`/host/rooms/${room.id}/manage`)}`} className="text-fg underline underline-offset-4">
              새로 만들기
            </Link>
          </Callout>
        ) : (
          <div className="space-y-2">
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => setTpl(t.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left ring-1 ring-inset transition',
                  tpl === t.id ? 'ring-fg' : 'ring-line hover:ring-line-strong',
                )}
              >
                <ClipboardList className="size-[18px] stroke-[1.5] text-fg-3" />
                <span className="flex-1">
                  <span className="block text-[15px]">{t.title}</span>
                  <span className="text-xs text-fg-3">문항 {t.questions.length}개</span>
                </span>
              </button>
            ))}
          </div>
        )}
        <Field label="응답 시점">
          <Segmented
            block
            value={timing}
            onChange={setTiming}
            options={[
              { value: 'pre', label: '사전 · 입장할 때' },
              { value: 'live', label: '중간 · 강사가 열기' },
              { value: 'post', label: '사후 · 마무리' },
            ]}
          />
        </Field>
        <Switch
          checked={!anonymous}
          onChange={(v) => setAnonymous(!v)}
          label="실명 연결"
          description="등록 정보와 응답을 연결해요(사전 수준 진단용). 동의 문안의 목적에 ‘교육 효과 분석’을 추가해야 해요. 끄면 익명(만족도 조사 권장)."
        />
      </div>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
export function PresentCard({ room, onChange }: { room: Room; onChange: (r: Room) => void }) {
  const toast = useToast()
  const update = async (patch: Partial<Room['present']>) => {
    try {
      onChange(await backend.updateRoom(room.id, { present: { ...room.present, ...patch } }))
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }
  return (
    <PanelCard title="발표 화면" icon={<MonitorPlay />}>
      <Button block variant="secondary" icon={<MonitorPlay className="size-4 stroke-[1.5]" />} onClick={() => window.open(`/present/${room.id}`, `present-${room.id}`)}>
        발표 화면 열기
      </Button>
      <div className="mt-4 space-y-3">
        <Segmented
          block
          size="sm"
          value={room.present.view}
          onChange={(view) => void update({ view })}
          options={[
            { value: 'board', label: '보드 뷰', icon: <Layers /> },
            { value: 'network', label: '네트워크 뷰', icon: <Network /> },
          ]}
        />
        <Switch size="sm" checked={room.present.showQr} onChange={(showQr) => void update({ showQr })} label={<span className="flex items-center gap-1.5 text-sm"><QrCode className="size-4 text-fg-3" />QR·입장 코드 상시 표시</span>} />
        {room.present.surveyShare && (
          <div className="flex items-center justify-between rounded-lg bg-surface-2 px-3 py-2 text-xs text-fg-2 ring-1 ring-inset ring-line">
            설문 결과를 띄우는 중
            <button className="underline" onClick={() => void update({ surveyShare: null })}>
              내리기
            </button>
          </div>
        )}
      </div>
    </PanelCard>
  )
}

// ---------------------------------------------------------------------------
export function ExportCard({ room, nodes }: { room: Room; nodes: RallyNode[] }) {
  const toast = useToast()
  const [zipBusy, setZipBusy] = useState<string | null>(null)
  const loadPolls = async () => {
    const polls: Record<string, PollResults> = {}
    for (const n of nodes.filter((x) => x.type === 'poll')) {
      try {
        polls[n.id] = await backend.pollResults(n.id)
      } catch {
        /* 무시 */
      }
    }
    return polls
  }
  return (
    <PanelCard title="내보내기" icon={<Download />}>
      <div className="space-y-1.5">
        <ExportButton
          icon={<Download />}
          title="랠리 묶음 (ZIP)"
          sub={zipBusy ?? 'rally.json · rally.md · 첨부 원본'}
          onClick={async () => {
            setZipBusy('준비 중…')
            try {
              const r = await downloadRallyZip(room, nodes, await loadPolls(), (d, t) => setZipBusy(`첨부 받는 중 ${d}/${t}`))
              toast.show(r.failed ? `ZIP을 만들었어요. 첨부 ${r.failed}개는 받지 못했어요.` : 'ZIP을 내려받았어요.')
            } catch (e) {
              toast.show(errorMessage(e), 'danger')
            } finally {
              setZipBusy(null)
            }
          }}
        />
        <ExportButton
          icon={<Bot />}
          title="AI 분석용 정리 (.md)"
          sub="생성형 AI에 붙여 넣어 요약·군집화"
          onClick={async () => {
            downloadText(buildAiMarkdown(room, nodes, await loadPolls()), `AI분석용_${safeFileName(room.title)}_${todayStamp()}.md`)
          }}
        />
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-fg-3">
        <FileText className="mt-0.5 size-3.5 shrink-0" />
        출석부·설문 결과 엑셀은 [참석자 명단]·[설문 결과] 탭에서 받아요. 글·파일은 강의 시작 72시간 뒤 지워지니 그 전에 받아 두세요.
      </p>
    </PanelCard>
  )
}

function ExportButton({ icon, title, sub, onClick }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void | Promise<void> }) {
  const [busy, setBusy] = useState(false)
  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        try {
          await onClick()
        } finally {
          setBusy(false)
        }
      }}
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-surface-2 disabled:opacity-60"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg text-fg-3 ring-1 ring-line [&_svg]:size-4 [&_svg]:stroke-[1.5]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px]">{title}</span>
        <span className="block truncate text-xs text-fg-3">{sub}</span>
      </span>
    </button>
  )
}

// ---------------------------------------------------------------------------
export function DemoCard({ room }: { room: Room }) {
  const toast = useToast()
  const [running, setRunning] = useState(false)
  const handle = useRef<{ stop(): void } | null>(null)
  useEffect(() => () => handle.current?.stop(), [])
  if (!isDemo || roomPhase(room) !== 'live') return null
  return (
    <section className="rounded-2xl border border-dashed border-line-strong p-5">
      <h3 className="flex items-center gap-2 text-[14px] font-medium">
        <Sparkles className="size-4 stroke-[1.5] text-ping-500" /> 데모: 가상 교육생
      </h3>
      <p className="mt-1.5 text-[13px] leading-relaxed text-fg-2">가상 교육생 8명이 입장해 지금 포커스한 핑에 퐁·리플을 남기고, 열린 퀵폴·설문에 응답해요.</p>
      <Button
        className="mt-3"
        size="sm"
        variant="secondary"
        loading={running}
        onClick={async () => {
          setRunning(true)
          try {
            const { simulateClassroom } = await import('@/lib/backend/demo/simulate')
            handle.current = await simulateClassroom(room.id)
            toast.show('가상 교육생이 입장했어요. 20초 동안 활동해요.')
            setTimeout(() => setRunning(false), 24_000)
          } catch (e) {
            toast.show(errorMessage(e), 'danger')
            setRunning(false)
          }
        }}
      >
        {running ? '활동 중…' : '가상 교육생 들이기'}
      </Button>
    </section>
  )
}
