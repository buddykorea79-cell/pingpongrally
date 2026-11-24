// 데모 전용: 가상 교육생들이 입장해 퐁·리플·투표·설문을 남긴다.
// 발표 화면과 네트워크 뷰가 실제 강의처럼 움직이는지 혼자서도 확인할 수 있다.
import type { RallyNode, ReactionKind, Room, RoomMember, RoomSurvey, SurveyAnswer } from '../../types'
import { randomNickname } from '../../nickname'
import { idb } from './idb'
import { createNodeAs, joinAs, reactAs, registerAs, respondAs, voteAs } from './index'

const PONGS = [
  '회의록 초안을 만들 때 써 보고 싶어요.',
  '결국 사람이 검토해야 한다는 점이 제일 중요한 것 같아요.',
  '부서 공용 프롬프트 모음이 있으면 좋겠습니다.',
  '보안 기준이 먼저 정리되어야 마음 놓고 쓸 수 있을 것 같아요.',
  '반복되는 안내 문구는 AI가 훨씬 빠르네요.',
  '표로 정리해 달라고 하니 결과가 확 달라졌어요!',
  '출처를 꼭 같이 달라고 요청하는 습관을 들여야겠어요.',
  '어려운 용어를 쉬운 말로 바꾸는 데 특히 유용했어요.',
  '팀장님께 보고할 때 요약본 만드는 데 쓰고 싶어요.',
  '예시를 두세 개 주면 품질이 훨씬 좋아지네요.',
  '처음에는 막막했는데 역할을 정해 주니 답이 구체적이에요.',
  '숫자는 반드시 원자료와 대조해 봐야 할 것 같습니다.',
  '민원 유형별로 답변 틀을 먼저 만들어 두면 좋겠어요.',
  '개인정보를 지우는 단계부터 자동화하면 좋겠네요.',
  '내일 주간보고에 바로 적용해 볼게요.',
]
const REPLIES = ['저도 같은 생각이에요!', '좋은 아이디어네요 👍', '사례 공유 감사합니다.', '이거 정말 공감해요.', '저희 부서도 비슷해요.', '혹시 쓰신 프롬프트 공유 가능할까요?']

export interface SimulationHandle {
  stop(): void
}

export async function simulateClassroom(roomId: string, opts: { users?: number; durationMs?: number } = {}): Promise<SimulationHandle> {
  const users = opts.users ?? 8
  const duration = opts.durationMs ?? 24_000
  const room = await idb.get<Room>('rooms', roomId)
  if (!room || room.status !== 'live' || !room.code) throw new Error('진행 중인 강의에서만 가상 교육생을 들일 수 있어요.')

  const members = (await idb.all<RoomMember>('room_members')).filter((m) => m.room_id === roomId)
  const taken = new Set(members.map((m) => m.nickname))
  const ids: { id: string; nick: string }[] = []
  for (let i = 0; i < users; i++) {
    const nick = randomNickname(taken)
    taken.add(nick)
    const uid = `sim-${Math.random().toString(36).slice(2, 10)}`
    try {
      if (room.registration === 'open') {
        await registerAs(room, uid, { org: '핑퐁교육원', dept: '가상팀', name: `가상교육생${i + 1}`, phone: null, consent_required: true, consent_optional: false })
      }
      await joinAs(uid, room.code, nick)
      ids.push({ id: uid, nick })
    } catch {
      /* 닉네임 충돌 등은 건너뛴다 */
    }
    await new Promise((r) => setTimeout(r, 120))
  }

  const timers: number[] = []
  const pick = <T,>(a: T[]) => a[Math.floor(Math.random() * a.length)]
  const at = (fn: () => void) => timers.push(window.setTimeout(fn, 400 + Math.random() * duration))

  for (const u of ids) {
    const actor = { userId: u.id, isAnonymous: true }
    at(async () => {
      const r = await idb.get<Room>('rooms', roomId)
      if (!r?.active_ping_id) return
      const ping = await idb.get<RallyNode>('nodes', r.active_ping_id)
      if (!ping) return
      try {
        if (ping.type === 'poll' && ping.meta.status === 'open' && ping.meta.options?.length) {
          await voteAs(u.id, ping.id, [pick(ping.meta.options).id])
        } else if (ping.type === 'ping' && !ping.is_closed) {
          await createNodeAs(actor, { room_id: roomId, type: 'pong', parent_id: ping.id, content: pick(PONGS) })
        }
      } catch {
        /* 마감 등 */
      }
    })
    if (Math.random() < 0.6) {
      at(async () => {
        const r = await idb.get<Room>('rooms', roomId)
        const pongs = (await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === roomId && n.type === 'pong' && n.ping_id === r?.active_ping_id && !n.is_hidden)
        if (pongs.length === 0) return
        const target = pick(pongs)
        try {
          await createNodeAs(actor, { room_id: roomId, type: 'reply', parent_id: target.id, content: `@${target.author_nickname} ${pick(REPLIES)}` })
        } catch {
          /* 무시 */
        }
      })
    }
    // 지금 핑의 퐁에 이모지 반응(좋아요가 가장 흔하게)
    for (let k = 0; k < 2; k++) {
      at(async () => {
        const r = await idb.get<Room>('rooms', roomId)
        const pongs = (await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === roomId && n.type === 'pong' && n.ping_id === r?.active_ping_id && !n.is_hidden)
        if (pongs.length === 0) return
        try {
          await reactAs(u.id, pick(pongs).id, pick(['like', 'like', 'like', 'heart', 'laugh', 'wow', 'think', 'dislike'] as ReactionKind[]))
        } catch {
          /* 무시 */
        }
      })
    }
    at(async () => {
      const surveys = (await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === roomId && s.status === 'open')
      for (const s of surveys) {
        const answers: Record<string, SurveyAnswer> = {}
        for (const q of s.questions) {
          if (q.type === 'single') answers[q.id] = pick(q.options ?? [''])
          else if (q.type === 'multiple') answers[q.id] = [pick(q.options ?? [''])]
          else if (q.type === 'scale') {
            const min = q.scale?.min ?? 1
            const max = q.scale?.max ?? 5
            answers[q.id] = Math.max(min, Math.min(max, Math.round(max - Math.random() * (max - min) * 0.6)))
          } else if (q.type === 'short') answers[q.id] = Math.random() < 0.5 ? '실무에 바로 써 보기' : null
          else answers[q.id] = Math.random() < 0.4 ? pick(PONGS) : null
        }
        try {
          await respondAs(u.id, s.id, answers)
        } catch {
          /* 닫힘 */
        }
      }
    })
  }

  return {
    stop() {
      timers.forEach((t) => clearTimeout(t))
    },
  }
}
