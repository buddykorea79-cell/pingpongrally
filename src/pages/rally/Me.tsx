import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { backend } from '@/lib/backend'
import type { Participant, Room, RoomMember } from '@/lib/types'
import { useDocumentTitle } from '@/lib/hooks'
import { errorMessage } from '@/lib/errors'
import { formatDateTime, maskPhone } from '@/lib/utils'
import { Button, IconButton } from '@/components/ui/Button'
import { Avatar } from '@/components/ui/Display'
import { BallLoader, EmptyState, useToast } from '@/components/ui/Feedback'
import { useConfirm } from '@/components/ui/Overlay'
import { ConsentNotices } from '@/components/rally/Consent'

export default function Me() {
  const { roomId } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [room, setRoom] = useState<Room | null>(null)
  const [me, setMe] = useState<RoomMember | null>(null)
  const [part, setPart] = useState<Participant | null>(null)
  const [loading, setLoading] = useState(true)
  useDocumentTitle('내 정보')

  useEffect(() => {
    if (!roomId) return
    Promise.all([backend.getRoom(roomId), backend.getMyMembership(roomId), backend.getMyParticipant(roomId)])
      .then(([r, m, p]) => {
        setRoom(r)
        setMe(m)
        setPart(p)
      })
      .finally(() => setLoading(false))
  }, [roomId])

  if (loading) return <BallLoader className="min-h-dvh" />
  if (!room || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState title="입장한 강의가 아니에요" action={<Button onClick={() => nav('/')}>처음 화면으로</Button>} />
      </div>
    )
  }

  async function withdraw() {
    const ok = await confirm({
      title: '등록 정보를 삭제할까요?',
      description: '소속·성명·휴대폰 번호가 바로 지워지고 동의도 철회돼요. 출석이 확인되지 않을 수 있어요. 랠리에는 닉네임으로 계속 참여할 수 있어요.',
      confirmText: '삭제하고 동의 철회',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await backend.deleteMyParticipant(room!.id)
      setPart(null)
      toast.show('등록 정보를 삭제했어요.')
    } catch (e) {
      toast.show(errorMessage(e), 'danger')
    }
  }

  return (
    <div className="min-h-dvh bg-bg pb-16">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex max-w-[600px] items-center gap-2 px-3 py-2">
          <IconButton label="랠리로 돌아가기" onClick={() => nav(`/r/${roomId}`)}>
            <ArrowLeft />
          </IconButton>
          <p className="text-[15px]">내 정보</p>
        </div>
      </header>
      <main className="mx-auto max-w-[600px] space-y-10 px-5 pt-8">
        <section className="flex items-center gap-4">
          <Avatar name={me.nickname} color={me.color} size="lg" />
          <div className="min-w-0">
            <p className="text-xs text-fg-3">랠리 닉네임</p>
            <p className="truncate text-[20px] font-light">{me.nickname}</p>
            <p className="truncate text-[13px] text-fg-3">{room.title}</p>
          </div>
        </section>

        <section>
          <p className="eyebrow mb-3">참석자 등록</p>
          {part ? (
            <>
              <dl className="divide-y divide-line rounded-xl ring-1 ring-line">
                <Row label="성명" value={part.name} />
                <Row label="소속" value={`${part.org} · ${part.dept}`} />
                {room.collect_phone && <Row label="휴대폰" value={part.phone ? maskPhone(part.phone) : '받지 않음'} />}
                <Row label="동의" value={`필수 항목 · 문안 v${part.consent_version} · ${formatDateTime(part.consent_required_at)}`} />
                <Row label="자동 파기" value={formatDateTime(room.purge_pii_at)} />
              </dl>
              <div className="mt-3 flex gap-1 text-[13px]">
                {room.registration === 'open' && (
                  <Link to={`/reg/${room.reg_token}`} className="rounded-md px-2 py-1.5 text-fg-2 hover:bg-surface-3 hover:text-fg">
                    정보 고치기
                  </Link>
                )}
                <button onClick={() => void withdraw()} className="rounded-md px-2 py-1.5 text-fg-3 hover:bg-surface-3 hover:text-danger">
                  삭제(동의 철회)
                </button>
              </div>
            </>
          ) : room.registration === 'open' ? (
            <Link to={`/reg/${room.reg_token}`} className="flex items-center justify-between rounded-xl px-4 py-4 ring-1 ring-line transition hover:ring-line-strong">
              <span>
                <span className="block text-[15px]">아직 등록하지 않았어요</span>
                <span className="mt-0.5 block text-[13px] text-fg-3">출석 확인이 필요하면 1분이면 끝나요.</span>
              </span>
              <ArrowRight className="size-4 stroke-[1.5] text-fg-3" />
            </Link>
          ) : (
            <p className="text-[14px] text-fg-2">이 강의는 참석자 등록을 받지 않아요. 닉네임 외에 저장된 개인정보가 없어요.</p>
          )}
        </section>

        <section>
          <p className="eyebrow mb-3">개인정보 안내</p>
          <ConsentNotices info={room} />
        </section>
      </main>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-4 px-4 py-3 text-[14px]">
      <dt className="w-16 shrink-0 text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1">{value}</dd>
    </div>
  )
}
