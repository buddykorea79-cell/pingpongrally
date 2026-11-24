// 데모 모드 첫 실행 때 넣는 예시 데이터. 사람·기관 이름은 모두 가상이다.
import type {
  Participant,
  PingSet,
  RallyNode,
  Room,
  RoomMember,
  RoomSurvey,
  RosterEntry,
  SurveyQuestion,
  SurveyResponse,
  SurveyTemplate,
} from '../../types'
import { idb } from './idb'
import { DEMO_HOST } from './constants'

const SEED_VERSION = 5
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

let seq = 0
const id = (prefix: string) => `${prefix}-${(++seq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const PRE_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'q1',
    type: 'single',
    title: '생성형 AI를 업무에 써 본 적이 있나요?',
    required: true,
    options: ['자주 쓴다', '몇 번 써 봤다', '써 본 적 없다'],
  },
  {
    id: 'q2',
    type: 'scale',
    title: '생성형 AI 활용에 얼마나 자신 있나요?',
    required: true,
    scale: { min: 1, max: 5, minLabel: '전혀 없음', maxLabel: '매우 자신 있음' },
  },
  {
    id: 'q3',
    type: 'multiple',
    title: '오늘 가장 기대하는 내용은?',
    description: '최대 2개까지 고를 수 있어요.',
    required: false,
    options: ['문서 초안 작성', '자료 요약', '데이터 분석', '보안·윤리 기준'],
    maxSelect: 2,
  },
  { id: 'q4', type: 'short', title: '오늘의 목표를 한 줄로 적어 주세요.', required: false, maxLength: 100 },
]

const POST_QUESTIONS: SurveyQuestion[] = [
  {
    id: 'q1',
    type: 'scale',
    title: '오늘 강의에 얼마나 만족하셨나요?',
    required: true,
    scale: { min: 1, max: 5, minLabel: '매우 불만족', maxLabel: '매우 만족' },
  },
  {
    id: 'q2',
    type: 'single',
    title: '가장 도움이 된 부분은 무엇인가요?',
    required: true,
    options: ['프롬프트 작성법', '실습', '사례 공유', '보안 가이드'],
    allowOther: true,
  },
  {
    id: 'q3',
    type: 'scale',
    title: '동료에게 이 강의를 추천할 의향은?',
    required: false,
    scale: { min: 1, max: 10, minLabel: '전혀 없음', maxLabel: '꼭 추천' },
  },
  { id: 'q4', type: 'long', title: '더 배우고 싶은 내용이나 하고 싶은 말을 적어 주세요.', required: false, maxLength: 1000 },
]

const SHEET_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400">
<rect width="640" height="400" fill="#F7F8FA"/>
<rect x="32" y="32" width="576" height="336" rx="18" fill="#fff" stroke="#E6E9EF" stroke-width="2"/>
<rect x="32" y="32" width="576" height="56" rx="18" fill="#1E8E54"/><rect x="32" y="70" width="576" height="18" fill="#1E8E54"/>
<text x="60" y="68" font-family="sans-serif" font-size="22" font-weight="700" fill="#fff">주간 업무 취합.xlsx</text>
${[0, 1, 2, 3, 4, 5]
  .map(
    (r) =>
      `<rect x="56" y="${108 + r * 40}" width="528" height="30" rx="6" fill="${r === 0 ? '#EEF0F4' : r % 2 ? '#fff' : '#FAFBFC'}" stroke="#EEF0F4"/>` +
      [0, 1, 2, 3]
        .map(
          (c) =>
            `<rect x="${70 + c * 130}" y="${118 + r * 40}" width="${r === 0 ? 70 : 40 + ((r * 37 + c * 23) % 60)}" height="10" rx="5" fill="${r === 0 ? '#959DAD' : c === 3 ? (r % 3 === 0 ? '#E5484D' : '#15B596') : '#C1C7D2'}"/>`,
        )
        .join(''),
  )
  .join('')}
</svg>`
const SHEET_IMAGE = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(SHEET_SVG)}`

const MEMBERS: { nick: string; color: string; reg?: [string, string, string, string | null] }[] = [
  { nick: '초록펭귄', color: '#15B596', reg: ['행정안전부', '디지털정부국', '김민준', '010-2345-1024'] },
  { nick: '파란고래', color: '#5A68F8', reg: ['서울특별시', '정보화담당관', '이서연', null] },
  { nick: '노란해바라기', color: '#F2A516', reg: ['경기도청', '민원봉사과', '박지훈', '010-7788-3141'] },
  { nick: '빨간여우', color: '#E5484D', reg: ['핑퐁교육원', '교육운영팀', '최유진', null] },
  { nick: '보라문어', color: '#9157FB', reg: ['국민건강보험공단', '빅데이터실', '정하늘', '010-5521-9087'] },
  { nick: '하얀북극곰', color: '#0EA5E9', reg: ['행정안전부', '공공데이터정책과', '강도윤', null] },
  { nick: '주황고양이', color: '#F97316', reg: ['서울특별시', '예산담당관', '윤서아', null] },
  { nick: '분홍돌고래', color: '#D946EF', reg: ['경기도청', '법무담당관', '임지호', '010-3030-4545'] },
  { nick: '회색늑대', color: '#6366F1' },
  { nick: '연두개구리', color: '#22A06B', reg: ['핑퐁교육원', '연구개발팀', '한예린', null] },
  { nick: '하늘다람쥐', color: '#14B8A6', reg: ['국민건강보험공단', '정보보호부', '오승우', null] },
  { nick: '은빛수달', color: '#5A68F8', reg: ['세종특별자치시', '스마트도시과', '서지안', null] },
  { nick: '검은표범', color: '#FF6A3D' },
  { nick: '민트토끼', color: '#15B596', reg: ['행정안전부', '정보보호정책과', '신가은', null] },
]

const ROSTER: [string, string, string, string | null][] = [
  ['행정안전부', '디지털정부국', '김민준', '1024'],
  ['서울특별시', '정보화담당관', '이서연', null],
  ['경기도청', '민원봉사과', '박지훈', '3141'],
  ['핑퐁교육원', '교육운영팀', '최유진', null],
  ['국민건강보험공단', '빅데이터실', '정하늘', '9087'],
  ['행정안전부', '공공데이터정책과', '강도윤', null],
  ['서울특별시', '예산담당관', '윤서아', null],
  ['경기도청', '법무담당관', '임지호', '4545'],
  ['핑퐁교육원', '연구개발팀', '한예린', null],
  ['국민건강보험공단', '정보보호부', '오승우', null],
  ['세종특별자치시', '자치행정과', '문태호', null],
  ['행정안전부', '정보보호정책과', '배수빈', null],
]

export async function ensureSeed() {
  const meta = await idb.get<{ id: string; version: number }>('meta', 'seed')
  if (meta && meta.version >= SEED_VERSION) return
  await idb.clearAll()
  await seed()
  await idb.put('meta', { id: 'seed', version: SEED_VERSION })
}

async function seed() {
  const T = Date.now()
  const iso = (t: number) => new Date(t).toISOString()
  const host = DEMO_HOST.id

  // ---------------- 템플릿 ----------------
  const preTpl: SurveyTemplate = {
    id: id('tpl'),
    owner_id: host,
    title: '사전 수준 진단',
    description: '강의 전 생성형 AI 활용 경험과 기대를 알아봅니다. 익명으로 집계돼요.',
    questions: PRE_QUESTIONS,
    updated_at: iso(T - 5 * DAY),
  }
  const postTpl: SurveyTemplate = {
    id: id('tpl'),
    owner_id: host,
    title: '강의 만족도 조사',
    description: '오늘 강의는 어떠셨나요? 다음 강의를 더 좋게 만드는 데 쓰입니다.',
    questions: POST_QUESTIONS,
    updated_at: iso(T - 3 * DAY),
  }
  await idb.putMany('survey_templates', [preTpl, postTpl])

  const sets: PingSet[] = [
    {
      id: id('set'),
      owner_id: host,
      title: 'AI 활용 워크숍 기본 핑',
      updated_at: iso(T - 2 * DAY),
      pings: [
        { type: 'ping', content: '우리 업무에서 가장 먼저 자동화하고 싶은 일은 무엇인가요?\n한 가지만 구체적으로 적어 주세요.', attachments: [] },
        {
          type: 'poll',
          content: '생성형 AI를 업무에 얼마나 자주 쓰시나요?',
          attachments: [],
          meta: {
            options: [
              { id: 'o1', label: '매일 쓴다' },
              { id: 'o2', label: '주 2~3회' },
              { id: 'o3', label: '한 달에 몇 번' },
              { id: 'o4', label: '거의 안 쓴다' },
            ],
            multiple: false,
            show_results: 'after_close',
          },
        },
        { type: 'ping', content: 'AI가 만든 초안을 그대로 쓰면 안 되는 이유, 직접 겪은 사례를 나눠 주세요.', attachments: [] },
        { type: 'ping', content: '오늘 배운 프롬프트 중 내일 바로 써 볼 것 하나를 적어 주세요.', attachments: [] },
      ],
    },
    {
      id: id('set'),
      owner_id: host,
      title: '보안·윤리 토론 핑',
      updated_at: iso(T - 9 * DAY),
      pings: [
        { type: 'ping', content: '업무 자료를 AI에 넣기 전에 반드시 확인할 것은?', attachments: [] },
        { type: 'ping', content: 'AI가 쓴 글이라는 사실을 밝혀야 하는 경우는 언제일까요?', attachments: [] },
        {
          type: 'poll',
          content: '민원 답변에 AI 초안을 써도 될까요?',
          attachments: [],
          meta: {
            options: [
              { id: 'o1', label: '써도 된다' },
              { id: 'o2', label: '검토 후 써도 된다' },
              { id: 'o3', label: '쓰면 안 된다' },
            ],
            multiple: false,
            show_results: 'after_close',
          },
        },
      ],
    },
  ]
  await idb.putMany('ping_sets', sets)

  // ---------------- 진행 중인 강의실 ----------------
  const started = T - 52 * MIN
  const live: Room = {
    id: id('room'),
    code: '777777',
    title: '생성형 AI로 일하는 법 — 공공 실무 워크숍',
    host_id: host,
    status: 'live',
    registration: 'open',
    reg_token: 'c0ffee7a11e7',
    collect_phone: true,
    consent_version: 1,
    controller_name: '핑퐁교육원',
    contact: '교육운영팀 02-000-0000',
    phone_purpose: '수료 안내 문자 발송',
    active_ping_id: null,
    present: { view: 'board', showQr: true, surveyShare: null },
    moderation_rev: 0,
    started_at: iso(started),
    expires_at: iso(started + DAY),
    closed_at: null,
    purge_content_at: iso(started + 3 * DAY),
    purge_pii_at: iso(started + DAY + 7 * DAY),
    created_at: iso(T - 2 * DAY),
    updated_at: iso(T - 6 * MIN),
  }

  const members: (RoomMember & { id: string })[] = MEMBERS.map((m, i) => ({
    id: `${live.id}:sim-${i}`,
    room_id: live.id,
    user_id: `sim-${i}`,
    nickname: m.nick,
    color: m.color,
    is_host: false,
    joined_at: iso(started + (i + 1) * 47_000),
  }))
  const userOf = (nick: string) => members.find((m) => m.nickname === nick)!.user_id

  const roster: RosterEntry[] = ROSTER.map(([org, dept, name, last4]) => ({ id: id('ros'), room_id: live.id, org, dept, name, phone_last4: last4 }))
  const participants: Participant[] = MEMBERS.flatMap((m, i) => {
    if (!m.reg) return []
    const [org, dept, name, phone] = m.reg
    const match = roster.find((r) => r.name === name && (r.org === org || (r.phone_last4 && phone?.endsWith(r.phone_last4))))
    const at = iso(started + (i + 1) * 47_000 - 20_000)
    return [
      {
        id: id('par'),
        room_id: live.id,
        user_id: `sim-${i}`,
        org,
        dept,
        name,
        phone,
        consent_version: 1,
        consent_required_at: at,
        consent_optional_at: phone ? at : null,
        roster_id: match?.id ?? null,
        created_at: at,
      },
    ]
  })

  const nodes: RallyNode[] = []
  const mk = (n: Partial<RallyNode> & Pick<RallyNode, 'type' | 'content'>, at: number): RallyNode => {
    const nodeId = id('n')
    const node: RallyNode = {
      id: nodeId,
      room_id: live.id,
      ping_id: n.ping_id ?? nodeId,
      parent_id: n.parent_id ?? null,
      type: n.type,
      author_id: n.author_id ?? host,
      author_nickname: n.author_nickname ?? '강사',
      is_host: n.is_host ?? true,
      content: n.content,
      attachments: n.attachments ?? [],
      meta: n.meta ?? {},
      is_hidden: n.is_hidden ?? false,
      is_closed: n.is_closed ?? false,
      sort_order: n.sort_order ?? 0,
      opened_at: n.opened_at ?? null,
      created_at: iso(at),
      updated_at: iso(at),
    }
    nodes.push(node)
    return node
  }
  const pong = (ping: RallyNode, nick: string, content: string, at: number, extra: Partial<RallyNode> = {}) =>
    mk({ type: 'pong', content, ping_id: ping.id, parent_id: ping.id, author_id: userOf(nick), author_nickname: nick, is_host: false, ...extra }, at)
  const reply = (p: RallyNode, nick: string | null, content: string, at: number) =>
    mk(
      {
        type: 'reply',
        content,
        ping_id: p.ping_id,
        parent_id: p.id,
        author_id: nick ? userOf(nick) : host,
        author_nickname: nick ?? '강사',
        is_host: !nick,
      },
      at,
    )

  const p1 = mk(
    {
      type: 'ping',
      content: '우리 업무에서 가장 먼저 자동화하고 싶은 일은 무엇인가요?\n한 가지만 구체적으로 적어 주세요.',
      sort_order: 1,
      opened_at: iso(started + 6 * MIN),
      attachments: [{ kind: 'link', url: 'https://ko.wikipedia.org/wiki/생성형_인공지능', name: '생성형 인공지능 — 위키백과' }],
    },
    started - 2 * DAY,
  )
  const p2 = mk(
    {
      type: 'poll',
      content: '생성형 AI를 업무에 얼마나 자주 쓰시나요?',
      sort_order: 2,
      opened_at: iso(started + 19 * MIN),
      is_closed: true,
      meta: {
        options: [
          { id: 'o1', label: '매일 쓴다' },
          { id: 'o2', label: '주 2~3회' },
          { id: 'o3', label: '한 달에 몇 번' },
          { id: 'o4', label: '거의 안 쓴다' },
        ],
        multiple: false,
        show_results: 'after_close',
        status: 'closed',
      },
    },
    started - 2 * DAY + 1000,
  )
  const p3 = mk(
    {
      type: 'ping',
      content: 'AI가 만든 초안을 그대로 쓰면 안 되는 이유, 직접 겪은 사례를 나눠 주세요.',
      sort_order: 3,
      opened_at: iso(started + 31 * MIN),
    },
    started - 2 * DAY + 2000,
  )
  mk({ type: 'ping', content: '오늘 배운 프롬프트 중 내일 바로 써 볼 것 하나를 적어 주세요.', sort_order: 4 }, started - 2 * DAY + 3000)
  mk({ type: 'ping', content: '우리 기관 AI 활용 가이드라인에 꼭 들어가야 할 내용은 무엇일까요?', sort_order: 5 }, started - 2 * DAY + 4000)
  mk(
    {
      type: 'poll',
      content: '오늘 실습 난이도는 어땠나요?',
      sort_order: 6,
      meta: {
        options: [
          { id: 'o1', label: '쉬웠다' },
          { id: 'o2', label: '적당했다' },
          { id: 'o3', label: '어려웠다' },
        ],
        multiple: false,
        show_results: 'live',
        status: 'ready',
      },
    },
    started - 2 * DAY + 5000,
  )

  const s1 = started + 7 * MIN
  const g1 = pong(p1, '초록펭귄', '매주 취합하는 엑셀 보고서 정리요! 부서마다 양식이 달라서 매번 손으로 맞추고 있어요.', s1, {
    attachments: [{ kind: 'image', url: SHEET_IMAGE, thumb_url: SHEET_IMAGE, name: '주간 업무 취합.png', mime: 'image/svg+xml', width: 640, height: 400 }],
  })
  reply(g1, '파란고래', '@초록펭귄 저도요. 서식 통일이 제일 힘들어요.', s1 + 2 * MIN)
  reply(g1, null, '@초록펭귄 3교시 실습에서 표 정리 프롬프트를 같이 만들어 봐요.', s1 + 4 * MIN)
  const g2 = pong(p1, '노란해바라기', '민원 답변 초안이요. 비슷한 질문이 계속 반복돼서 유형별 틀을 만들어 두고 싶어요.', s1 + 40_000)
  reply(g2, '빨간여우', '@노란해바라기 개인정보는 꼭 지우고 넣어야겠죠?', s1 + 3 * MIN)
  reply(g2, '노란해바라기', '@빨간여우 네, 그래서 가명 처리 규칙부터 정하려고요.', s1 + 5 * MIN)
  pong(p1, '보라문어', '회의록 요약! 녹취 듣고 정리하는 데 매번 두 시간씩 걸립니다.', s1 + 70_000)
  const g4 = pong(p1, '하얀북극곰', '보도자료를 쉬운 우리말로 바꾸는 일이요. 어려운 행정 용어가 너무 많아요.', s1 + 100_000, {
    attachments: [{ kind: 'link', url: 'https://www.korean.go.kr', name: '국립국어원' }],
  })
  reply(g4, '분홍돌고래', '@하얀북극곰 쉬운 말 사전을 같이 넣어 주면 결과가 훨씬 좋아요.', s1 + 6 * MIN)
  pong(p1, '주황고양이', '예산 집행 내역을 항목별로 분류하는 일. 매달 말이면 야근이에요.', s1 + 130_000)
  pong(p1, '분홍돌고래', '법령 개정 전후 비교표 만들기', s1 + 150_000)
  pong(p1, '회색늑대', '출장 결과 보고서 쓰기 ㅎㅎ', s1 + 170_000)
  pong(p1, '은빛수달', '공문 수신 목록 정리와 담당자 배정 자동화', s1 + 200_000)

  const s3 = started + 32 * MIN
  const h1 = pong(p3, '연두개구리', '통계 수치를 그럴듯하게 지어내더라고요. 출처를 물어보니 존재하지 않는 보고서였어요.', s3)
  reply(h1, '하늘다람쥐', '@연두개구리 출처 링크를 같이 달라고 하고, 꼭 직접 열어 봐야겠네요.', s3 + 2 * MIN)
  reply(h1, '은빛수달', '@연두개구리 저도 법 조항 번호가 틀린 적이 있어요.', s3 + 3 * MIN)
  reply(h1, null, '@연두개구리 좋은 사례예요. 다음 시간에 ‘근거 확인 프롬프트’로 다뤄 볼게요.', s3 + 5 * MIN)
  pong(p3, '검은표범', '우리 기관 말투랑 달라서 결국 처음부터 다시 고쳐 썼어요.', s3 + 50_000)
  const h3 = pong(p3, '민트토끼', '내부 자료를 무심코 붙여 넣을 뻔했어요. 보안 교육이 같이 필요합니다.', s3 + 90_000)
  reply(h3, '초록펭귄', '@민트토끼 공감해요. 붙여 넣기 전에 체크리스트가 있으면 좋겠어요.', s3 + 4 * MIN)
  pong(p3, '초록펭귄', '결재하는 사람이 결국 책임지니까, 검토 없이 쓰면 안 된다고 생각해요.', s3 + 2 * MIN)
  pong(p3, '파란고래', '없는 외부 링크를 만들어 내서 눌러 보니 404였어요.', s3 + 3 * MIN)
  pong(p3, '빨간여우', '맞춤법은 완벽한데 내용이 미묘하게 틀려서 더 위험했어요.', s3 + 5 * MIN)
  live.active_ping_id = p3.id

  const votes = [
    ...Array(3).fill('o1'),
    ...Array(5).fill('o2'),
    ...Array(4).fill('o3'),
    ...Array(2).fill('o4'),
  ].map((opt, i) => ({ id: `${p2.id}:sim-${i}`, node_id: p2.id, user_id: `sim-${i}`, option_ids: [opt], created_at: iso(started + 20 * MIN + i * 9000) }))

  const preSurvey: RoomSurvey = {
    id: id('rs'),
    room_id: live.id,
    template_id: preTpl.id,
    title: preTpl.title,
    description: preTpl.description,
    questions: PRE_QUESTIONS,
    timing: 'pre',
    anonymous: true,
    status: 'open',
    opens_at: iso(started),
    closes_at: null,
    created_at: iso(T - 2 * DAY),
  }
  const postSurvey: RoomSurvey = {
    ...preSurvey,
    id: id('rs'),
    template_id: postTpl.id,
    title: postTpl.title,
    description: postTpl.description,
    questions: POST_QUESTIONS,
    timing: 'post',
    status: 'ready',
    opens_at: null,
    created_at: iso(T - 2 * DAY + 1000),
  }
  const goals = ['보고서 정리 시간을 절반으로', '민원 답변 틀 만들기', '회의록 요약 자동화', '보안 기준 제대로 알기', '', '엑셀 함수 대신 AI로', '', '팀에 공유할 사례 찾기']
  const preAnswers: (SurveyResponse & { room_id: string })[] = members.slice(0, 12).map((m, i) => ({
    id: id('resp'),
    room_survey_id: preSurvey.id,
    room_id: live.id,
    user_id: m.user_id,
    answers: {
      q1: ['자주 쓴다', '몇 번 써 봤다', '몇 번 써 봤다', '써 본 적 없다'][i % 4],
      q2: [2, 3, 3, 4, 2, 1, 3, 5, 2, 3, 4, 3][i],
      q3: [['문서 초안 작성', '자료 요약'], ['보안·윤리 기준'], ['자료 요약', '데이터 분석'], ['문서 초안 작성']][i % 4],
      q4: goals[i % goals.length] || null,
    },
    submitted_at: iso(started + (i + 1) * 47_000 + 30_000),
  }))

  // ---------------- 종료된 강의실 ----------------
  const pastStart = T - 2 * DAY - 3 * HOUR
  const past: Room = {
    ...live,
    id: id('room'),
    code: '314159',
    title: '공공 AI 윤리 세미나',
    status: 'closed',
    registration: 'closed',
    reg_token: 'e7a4c5b0d1f2',
    collect_phone: false,
    phone_purpose: '',
    active_ping_id: null,
    started_at: iso(pastStart),
    expires_at: iso(pastStart + 3 * HOUR),
    closed_at: iso(pastStart + 3 * HOUR),
    purge_content_at: iso(pastStart + 3 * DAY),
    purge_pii_at: iso(pastStart + 3 * HOUR + 7 * DAY),
    created_at: iso(pastStart - DAY),
    updated_at: iso(pastStart + 3 * HOUR),
  }
  const pastMembers = members.slice(0, 9).map((m) => ({ ...m, id: `${past.id}:${m.user_id}`, room_id: past.id, joined_at: iso(pastStart + 5 * MIN) }))
  const pastParts = participants.slice(0, 8).map((p) => ({ ...p, id: id('par'), room_id: past.id, roster_id: null, created_at: iso(pastStart + 4 * MIN) }))
  const pastNodes: RallyNode[] = []
  const q1: RallyNode = {
    ...p1,
    id: id('n'),
    room_id: past.id,
    content: 'AI가 내린 결정에 대해 누가 설명할 책임을 져야 할까요?',
    attachments: [],
    opened_at: iso(pastStart + 10 * MIN),
    created_at: iso(pastStart - DAY),
    updated_at: iso(pastStart - DAY),
  }
  q1.ping_id = q1.id
  pastNodes.push(q1)
  ;[
    ['초록펭귄', '결재권자요. 도구가 바뀌어도 책임은 사람이 집니다.'],
    ['파란고래', '시스템을 도입한 기관이 설명 의무를 져야 한다고 봐요.'],
    ['보라문어', '설명할 수 없는 모델은 공공 영역에 쓰면 안 된다고 생각해요.'],
    ['하얀북극곰', '데이터를 제공한 부서와 운영 부서가 함께 책임져야 합니다.'],
  ].forEach(([nick, content], i) => {
    const n: RallyNode = {
      ...q1,
      id: id('n'),
      type: 'pong',
      parent_id: q1.id,
      ping_id: q1.id,
      author_id: userOf(nick),
      author_nickname: nick,
      is_host: false,
      content,
      opened_at: null,
      created_at: iso(pastStart + (12 + i * 2) * MIN),
      updated_at: iso(pastStart + (12 + i * 2) * MIN),
    }
    pastNodes.push(n)
  })

  // 강사 1명은 열린 강의실을 1개만 가질 수 있으므로(서버 규칙) 준비 중인 강의실은 두지 않는다.
  await idb.putMany('rooms', [live, past])
  await idb.putMany('room_members', [...members, ...pastMembers])
  await idb.putMany('participants', [...participants, ...pastParts])
  await idb.putMany('rosters', roster)
  await idb.putMany('nodes', [...nodes, ...pastNodes])
  await idb.putMany('poll_votes', votes)
  await idb.putMany('room_surveys', [preSurvey, postSurvey])
  await idb.putMany('survey_responses', preAnswers)
}
