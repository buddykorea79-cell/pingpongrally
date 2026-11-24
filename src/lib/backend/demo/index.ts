// 데모 모드: Supabase 없이 브라우저(IndexedDB) 안에서 같은 규칙으로 동작한다.
// 같은 브라우저의 다른 탭과는 BroadcastChannel 로 실시간 이벤트를 주고받는다.
// 탭마다 교육생 신원이 따로 생기므로(sessionStorage) 탭 여러 개로 교육생 여러 명을 흉내 낼 수 있다.

import type { Backend, NewNodeInput, NodePatch, RoomPatch, Session, SubscribeOptions } from '../types'
import type {
  CreateRoomInput,
  Participant,
  PingSet,
  PingSetItem,
  PollResults,
  PollVote,
  RallyNode,
  RegistrationInput,
  RegistrationLookup,
  Room,
  RoomEvent,
  RoomLookup,
  RoomMember,
  RoomSummary,
  RoomSurvey,
  RosterEntry,
  SurveyAnswer,
  SurveyResponse,
  SurveyResultRow,
  SurveyTemplate,
  SurveyTiming,
  ReactionCounts,
  ReactionKind,
} from '../../types'
import { AppError } from '../../errors'
import { normalizeCode, randomCode, uuid } from '../../utils'
import { MEMBER_COLORS } from '../../nickname'
import { idb } from './idb'
import { ensureSeed } from './seed'
import { DEMO_HOST } from './constants'

export { DEMO_HOST }

const HOST_KEY = 'ppr-demo-host-session'
const GUEST_KEY = 'ppr-demo-guest-session'
const ROOM_LOG_KEY = 'ppr-demo-room-log'
const HOUR = 3600_000
/** 서버(rooms_before_insert)와 같은 규칙: 열린 강의실 1개, 24시간에 3개까지 */
const DAILY_ROOM_LIMIT = 3

type Member = RoomMember & { id: string }
type Vote = PollVote & { id: string }
export interface Actor {
  userId: string
  isAnonymous: boolean
}

const now = () => new Date().toISOString()
const plus = (iso: string | Date, ms: number) => new Date(new Date(iso).getTime() + ms).toISOString()

// ---------------------------------------------------------------------------
// 세션: /j/·/r/·/reg/ 경로는 탭별 교육생, 나머지는 강사 세션을 쓴다.
// ---------------------------------------------------------------------------
function isGuestContext() {
  return /^\/(j|r|reg)(\/|$)/.test(location.pathname)
}

/** 데모 강사 계정: 같은 이메일이면 같은 계정(가입 겸용 로그인 흉내) */
function demoUserIdFor(email: string): string {
  const e = email.trim().toLowerCase()
  if (e === DEMO_HOST.email) return DEMO_HOST.id
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < e.length; i++) {
    h1 = Math.imul(h1 ^ e.charCodeAt(i), 16777619) >>> 0
    h2 = Math.imul(h2 ^ e.charCodeAt(i), 2246822519) >>> 0
  }
  const hex = (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + (h1 ^ h2).toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'))
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

function signInAs(email: string) {
  const s: Session = { userId: demoUserIdFor(email), email: email.trim().toLowerCase(), isAnonymous: false }
  localStorage.setItem(HOST_KEY, JSON.stringify(s))
  notifyAuth()
  return { id: s.userId, email: s.email!, isAnonymous: false }
}

function roomLog(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(ROOM_LOG_KEY) || '{}') as Record<string, number[]>
  } catch {
    return {}
  }
}

function readSession(): Session | null {
  try {
    const raw = isGuestContext() ? sessionStorage.getItem(GUEST_KEY) : localStorage.getItem(HOST_KEY)
    return raw ? (JSON.parse(raw) as Session) : null
  } catch {
    return null
  }
}

const authListeners = new Set<(s: Session | null) => void>()
function notifyAuth() {
  const s = readSession()
  authListeners.forEach((cb) => cb(s))
}
window.addEventListener('storage', (e) => {
  if (e.key === HOST_KEY) notifyAuth()
})

async function actor(): Promise<Actor> {
  const s = readSession()
  if (!s) throw new AppError('not_authenticated')
  return { userId: s.userId, isAnonymous: s.isAnonymous }
}

// ---------------------------------------------------------------------------
// 실시간 이벤트
// ---------------------------------------------------------------------------
type Envelope = RoomEvent & { room_id: string }
const rt = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ppr-demo-rt') : null
const rtListeners = new Set<(e: Envelope) => void>()
rt?.addEventListener('message', (m) => rtListeners.forEach((cb) => cb(m.data as Envelope)))

function emit(e: Envelope) {
  // 다른 구독자와 같은 순서로 받도록 비동기로 흘린다.
  queueMicrotask(() => rtListeners.forEach((cb) => cb(e)))
  rt?.postMessage(e)
}

// ---------------------------------------------------------------------------
// 공용 헬퍼(서버의 is_room_host / room_is_open 등에 해당)
// ---------------------------------------------------------------------------
async function getRoomRaw(id: string): Promise<Room | undefined> {
  const r = await idb.get<Room & { id: string }>('rooms', id)
  return r ? refreshExpiry(r) : undefined
}

/** 만료 시각이 지난 강의실을 종료 상태로(서버의 close_expired_rooms) */
async function refreshExpiry(r: Room): Promise<Room> {
  if (r.status === 'live' && r.expires_at && new Date(r.expires_at).getTime() <= Date.now()) {
    const next: Room = { ...r, status: 'closed', closed_at: r.expires_at, registration: r.registration === 'open' ? 'closed' : r.registration, updated_at: now() }
    await idb.put('rooms', next)
    const surveys = (await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === r.id && s.status === 'open')
    await idb.putMany('room_surveys', surveys.map((s) => ({ ...s, status: 'closed' as const, closes_at: now() })))
    return next
  }
  return r
}

function roomOpen(r: Room | undefined): boolean {
  return !!r && r.status === 'live' && !!r.expires_at && new Date(r.expires_at).getTime() > Date.now()
}

async function membership(roomId: string, userId: string) {
  return idb.get<Member>('room_members', `${roomId}:${userId}`)
}

async function isHost(roomId: string, userId: string) {
  const r = await idb.get<Room>('rooms', roomId)
  return !!r && r.host_id === userId
}

async function canSeeRoom(roomId: string, userId: string) {
  return (await isHost(roomId, userId)) || !!(await membership(roomId, userId))
}

function nodeVisibleTo(n: RallyNode, viewerIsHost: boolean): boolean {
  if (viewerIsHost) return true
  if (n.is_hidden) return false
  if ((n.type === 'ping' || n.type === 'poll') && !n.opened_at) return false
  return true
}

function stripId<T extends { id?: string }>(row: T, keepId: boolean): T {
  if (keepId) return row
  const { id: _omit, ...rest } = row
  void _omit
  return rest as T
}

export function newRegToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function generateCode(): Promise<string> {
  const live = new Set((await idb.all<Room>('rooms')).filter((r) => r.status === 'live').map((r) => r.code))
  for (let i = 0; i < 50; i++) {
    const c = randomCode()
    if (!live.has(c)) return c
  }
  throw new AppError('code_generation_failed')
}

// ---------------------------------------------------------------------------
// 실제 동작(시뮬레이터도 같은 함수를 쓴다)
// ---------------------------------------------------------------------------
export async function registerAs(room: Room, userId: string, input: RegistrationInput): Promise<Participant> {
  if (room.registration === 'off') throw new AppError('registration_not_found')
  if (room.registration !== 'open' || room.status === 'closed' || (room.status === 'live' && !roomOpen(room))) throw new AppError('registration_closed')
  if (!input.consent_required) throw new AppError('consent_required')
  const org = input.org.trim()
  const dept = input.dept.trim()
  const name = input.name.trim()
  if (!org || !dept || !name) throw new AppError('missing_fields')
  const optional = room.collect_phone && input.consent_optional
  const phone = optional ? input.phone?.trim() || null : null
  if (phone && !/^010-\d{4}-\d{4}$/.test(phone)) throw new AppError('invalid_phone', '휴대폰 번호 형식을 확인해 주세요(010-0000-0000).')

  const roster = (await idb.all<RosterEntry>('rosters')).filter((r) => r.room_id === room.id && r.name === name)
  const last4 = phone ? phone.replace(/\D/g, '').slice(-4) : null
  const match =
    roster.find((r) => r.phone_last4 && last4 && r.phone_last4 === last4) ?? roster.find((r) => r.org === org) ?? null

  const existing = (await idb.all<Participant>('participants')).find((p) => p.room_id === room.id && p.user_id === userId)
  const row: Participant = {
    id: existing?.id ?? uuid(),
    room_id: room.id,
    user_id: userId,
    org,
    dept,
    name,
    phone,
    consent_version: room.consent_version,
    consent_required_at: now(),
    consent_optional_at: optional ? now() : null,
    roster_id: match?.id ?? null,
    created_at: existing?.created_at ?? now(),
  }
  await idb.put('participants', row)
  return row
}

export async function joinAs(userId: string, code: string, nickname: string) {
  const rooms = await idb.all<Room>('rooms')
  const target = rooms.find((r) => r.code === normalizeCode(code) && r.status === 'live')
  const room = target ? await refreshExpiry(target) : undefined
  if (!room || !roomOpen(room)) throw new AppError('room_not_found')
  if (await membership(room.id, userId)) return room.id

  const nick = nickname.trim()
  if (nick.length < 2 || nick.length > 12) throw new AppError('invalid_nickname')
  const members = (await idb.all<Member>('room_members')).filter((m) => m.room_id === room.id)
  if (nick === '강사' || members.some((m) => m.nickname.toLowerCase() === nick.toLowerCase())) throw new AppError('nickname_taken')

  const member: Member = {
    id: `${room.id}:${userId}`,
    room_id: room.id,
    user_id: userId,
    nickname: nick,
    color: MEMBER_COLORS[Math.floor(Math.random() * MEMBER_COLORS.length)],
    is_host: room.host_id === userId,
    joined_at: now(),
  }
  await idb.put('room_members', member)
  emit({ room_id: room.id, table: 'room_members', type: 'INSERT', record: stripId(member, false) })
  return room.id
}

export async function createNodeAs(a: Actor, input: NewNodeInput): Promise<RallyNode> {
  const room = await getRoomRaw(input.room_id)
  if (!room) throw new AppError('room_not_found')
  const host = room.host_id === a.userId
  const member = await membership(room.id, a.userId)
  const content = input.content ?? ''
  const attachments = input.attachments ?? []
  const id = uuid()
  let pingId: string | null = id
  let meta = { ...(input.meta ?? {}) }
  let sortOrder = 0

  if (input.type === 'ping' || input.type === 'poll') {
    if (!host) throw new AppError('not_allowed')
    if (input.type === 'poll') {
      const n = meta.options?.length ?? 0
      if (n < 2 || n > 6) throw new AppError('poll_needs_2_to_6_options')
      meta = { ...meta, status: 'ready' }
    }
    const pings = (await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === room.id && (n.type === 'ping' || n.type === 'poll'))
    sortOrder = pings.reduce((m, n) => Math.max(m, n.sort_order), 0) + 1
  } else {
    if (!host && !member) throw new AppError('not_member')
    if (!roomOpen(room)) throw new AppError('room_closed')
    meta = {} // 퐁·리플의 메타(반응 개수 등)는 서버만 쓴다
    const parent = input.parent_id ? await idb.get<RallyNode>('nodes', input.parent_id) : undefined
    if (input.type === 'pong') {
      if (!parent || parent.type !== 'ping' || parent.room_id !== room.id) throw new AppError('pong_parent_must_be_ping', '퐁은 핑에만 달 수 있어요.')
      if (parent.is_closed) throw new AppError('ping_closed')
      if (!parent.opened_at && !host) throw new AppError('ping_not_open')
      pingId = parent.id
    } else {
      if (!parent || parent.type !== 'pong' || parent.room_id !== room.id) throw new AppError('reply_parent_must_be_pong', '리플은 퐁에만 달 수 있어요.')
      const ping = parent.ping_id ? await idb.get<RallyNode>('nodes', parent.ping_id) : undefined
      if (ping?.is_closed) throw new AppError('ping_closed')
      pingId = parent.ping_id
    }
    if (content.length > 1000) throw new AppError('content_too_long')
  }
  if (!content.trim() && attachments.length === 0) throw new AppError('empty_content')

  const node: RallyNode = {
    id,
    room_id: room.id,
    ping_id: pingId,
    parent_id: input.type === 'ping' || input.type === 'poll' ? null : (input.parent_id ?? null),
    type: input.type,
    author_id: a.userId,
    author_nickname: host ? '강사' : (member?.nickname ?? ''),
    is_host: host,
    content,
    attachments,
    meta,
    is_hidden: false,
    is_closed: false,
    sort_order: sortOrder,
    opened_at: null,
    created_at: now(),
    updated_at: now(),
  }
  await idb.put('nodes', node)
  emit({ room_id: room.id, table: 'nodes', type: 'INSERT', record: node })
  return node
}

async function updateNodeAs(a: Actor, nodeId: string, patch: NodePatch): Promise<RallyNode | null> {
  const old = await idb.get<RallyNode>('nodes', nodeId)
  if (!old) throw new AppError('not_found', '글을 찾을 수 없어요.')
  const room = await getRoomRaw(old.room_id)
  const host = room?.host_id === a.userId
  if (!host && old.author_id !== a.userId) throw new AppError('not_allowed')
  if (!host) {
    const forbidden: (keyof NodePatch)[] = ['is_closed', 'meta', 'sort_order']
    if (forbidden.some((k) => k in patch)) throw new AppError('not_allowed')
    if (old.is_hidden && patch.is_hidden === false) throw new AppError('not_allowed')
    if (!roomOpen(room)) throw new AppError('room_closed')
  }
  if (patch.content !== undefined && (old.type === 'pong' || old.type === 'reply') && patch.content.length > 1000) {
    throw new AppError('content_too_long')
  }
  const next: RallyNode = { ...old, ...patch, updated_at: now() }
  if (next.type === 'poll') {
    next.is_closed = next.meta.status === 'closed'
    if (next.meta.status === 'open' && !next.opened_at) next.opened_at = now()
  }
  await idb.put('nodes', next)
  emit({ room_id: next.room_id, table: 'nodes', type: 'UPDATE', record: next })
  if (patch.is_hidden !== undefined && patch.is_hidden !== old.is_hidden && room) {
    const r2: Room = { ...room, moderation_rev: room.moderation_rev + 1, updated_at: now() }
    await idb.put('rooms', r2)
    emit({ room_id: r2.id, table: 'rooms', type: 'UPDATE', record: r2 })
  }
  return nodeVisibleTo(next, host) ? next : null
}

export async function voteAs(userId: string, nodeId: string, optionIds: string[]) {
  const node = await idb.get<RallyNode>('nodes', nodeId)
  if (!node || node.type !== 'poll') throw new AppError('not_found', '퀵폴을 찾을 수 없어요.')
  const room = await getRoomRaw(node.room_id)
  if (!roomOpen(room) || node.meta.status !== 'open') throw new AppError('poll_closed', '투표가 열려 있지 않아요.')
  if (!(await membership(node.room_id, userId))) throw new AppError('not_member')
  if (optionIds.length < 1 || (!node.meta.multiple && optionIds.length > 1)) throw new AppError('invalid_vote', '선택지를 확인해 주세요.')
  const id = `${nodeId}:${userId}`
  const prev = await idb.get<Vote>('poll_votes', id)
  await idb.put<Vote>('poll_votes', { id, node_id: nodeId, user_id: userId, option_ids: optionIds, created_at: prev?.created_at ?? now() })
}

const REACTION_KINDS: ReactionKind[] = ['like', 'dislike', 'heart', 'laugh', 'wow', 'think']
interface ReactionRow {
  id: string
  node_id: string
  user_id: string
  kinds: ReactionKind[]
  updated_at: string
}

/** 서버 toggle_reaction 과 같은 규칙: 보이는 퐁에만, 입장한 사람·강사만, 강의 중에만 */
export async function reactAs(userId: string, nodeId: string, kind: ReactionKind) {
  if (!REACTION_KINDS.includes(kind)) throw new AppError('invalid_reaction')
  const node = await idb.get<RallyNode>('nodes', nodeId)
  if (!node || node.type !== 'pong' || node.is_hidden) throw new AppError('reaction_target_not_found')
  const room = await getRoomRaw(node.room_id)
  if (!(room?.host_id === userId) && !(await membership(node.room_id, userId))) throw new AppError('not_member')
  if (!roomOpen(room)) throw new AppError('room_closed')
  const id = `${nodeId}:${userId}`
  const prev = await idb.get<ReactionRow>('node_reactions', id)
  const before = prev?.kinds ?? []
  const kinds = before.includes(kind) ? before.filter((k) => k !== kind) : [...before, kind]
  await idb.put<ReactionRow>('node_reactions', { id, node_id: nodeId, user_id: userId, kinds, updated_at: now() })
  const reactions: ReactionCounts = {}
  for (const r of await idb.all<ReactionRow>('node_reactions')) {
    if (r.node_id !== nodeId) continue
    for (const k of r.kinds) reactions[k] = (reactions[k] ?? 0) + 1
  }
  const next: RallyNode = { ...node, meta: { ...node.meta, reactions }, updated_at: now() }
  await idb.put('nodes', next)
  emit({ room_id: next.room_id, table: 'nodes', type: 'UPDATE', record: next })
  return { mine: kinds, reactions }
}

export async function respondAs(userId: string, roomSurveyId: string, answers: Record<string, SurveyAnswer>): Promise<SurveyResponse> {
  const s = await idb.get<RoomSurvey>('room_surveys', roomSurveyId)
  if (!s) throw new AppError('not_found', '설문을 찾을 수 없어요.')
  const room = await getRoomRaw(s.room_id)
  if (!roomOpen(room) || s.status !== 'open') throw new AppError('survey_closed', '설문이 닫혀 있어요.')
  if (!(await membership(s.room_id, userId))) throw new AppError('not_member')
  const prev = (await idb.all<SurveyResponse & { room_id: string }>('survey_responses')).find(
    (r) => r.room_survey_id === roomSurveyId && r.user_id === userId,
  )
  const row = { id: prev?.id ?? uuid(), room_survey_id: roomSurveyId, room_id: s.room_id, user_id: userId, answers, submitted_at: now() }
  await idb.put('survey_responses', row)
  return row
}

async function updateRoomAs(a: Actor, roomId: string, patch: Partial<Room>, viaFunction = false): Promise<Room> {
  const old = await getRoomRaw(roomId)
  if (!old || old.host_id !== a.userId) throw new AppError('not_allowed')
  const next: Room = { ...old, ...patch, updated_at: now() }
  const consentKeys: (keyof Room)[] = ['title', 'controller_name', 'contact', 'phone_purpose', 'collect_phone']
  if (!viaFunction && consentKeys.some((k) => k in patch && patch[k] !== old[k])) next.consent_version = old.consent_version + 1
  if (next.registration === 'open' && old.registration !== 'open') {
    if (!next.controller_name.trim()) throw new AppError('controller_required')
    if (next.status === 'closed') throw new AppError('room_closed')
    if (!next.purge_pii_at) next.purge_pii_at = plus(now(), 30 * 24 * HOUR)
  }
  if (patch.active_ping_id && patch.active_ping_id !== old.active_ping_id) {
    const n = await idb.get<RallyNode>('nodes', patch.active_ping_id)
    if (!n || n.room_id !== roomId || (n.type !== 'ping' && n.type !== 'poll')) throw new AppError('invalid_focus')
    const fresh = (await idb.get<RallyNode>('nodes', n.id)) ?? n
    if (!fresh.opened_at) {
      const opened = { ...fresh, opened_at: now(), updated_at: now() }
      await idb.put('nodes', opened)
      emit({ room_id: roomId, table: 'nodes', type: 'UPDATE', record: opened })
    }
  }
  await idb.put('rooms', next)
  emit({ room_id: roomId, table: 'rooms', type: 'UPDATE', record: next })
  return next
}

async function attachSurveyTo(roomId: string, tpl: SurveyTemplate, timing: SurveyTiming, anonymous: boolean, roomStatus: Room['status']) {
  const status = roomStatus === 'live' && timing === 'pre' ? 'open' : 'ready'
  const s: RoomSurvey = {
    id: uuid(),
    room_id: roomId,
    template_id: tpl.id,
    title: tpl.title,
    description: tpl.description,
    questions: structuredClone(tpl.questions),
    timing,
    anonymous,
    status,
    opens_at: status === 'open' ? now() : null,
    closes_at: null,
    created_at: now(),
  }
  await idb.put('room_surveys', s)
  emit({ room_id: roomId, table: 'room_surveys', type: 'INSERT', record: s })
  return s
}

/** 파기 일정(설계서 8장)을 데모에서도 지킨다: 열 때마다 지난 것을 지운다. */
async function runPurge() {
  const rooms = await idb.all<Room & { content_purged_at?: string | null }>('rooms')
  const t = Date.now()
  for (const r of rooms) {
    if (r.purge_pii_at && new Date(r.purge_pii_at).getTime() <= t) {
      await deleteRoomData(r.id, true)
    } else if (r.purge_content_at && new Date(r.purge_content_at).getTime() <= t && !r.content_purged_at) {
      const nodes = (await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === r.id).map((n) => n.id)
      const set = new Set(nodes)
      await idb.delWhere<RallyNode>('nodes', (n) => n.room_id === r.id)
      await idb.delWhere<Vote>('poll_votes', (v) => set.has(v.node_id))
      await idb.delWhere<Member>('room_members', (m) => m.room_id === r.id)
      await idb.put('rooms', { ...r, active_ping_id: null, content_purged_at: new Date().toISOString() })
    }
  }
}

async function deleteRoomData(roomId: string, includeRoom: boolean) {
  const nodeIds = new Set((await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === roomId).map((n) => n.id))
  const surveyIds = new Set((await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === roomId).map((s) => s.id))
  await idb.delWhere<RallyNode>('nodes', (n) => n.room_id === roomId)
  await idb.delWhere<Vote>('poll_votes', (v) => nodeIds.has(v.node_id))
  await idb.delWhere<Member>('room_members', (m) => m.room_id === roomId)
  await idb.delWhere<Participant>('participants', (p) => p.room_id === roomId)
  await idb.delWhere<RosterEntry>('rosters', (p) => p.room_id === roomId)
  await idb.delWhere<RoomSurvey>('room_surveys', (s) => s.room_id === roomId)
  await idb.delWhere<SurveyResponse & { id: string }>('survey_responses', (s) => surveyIds.has(s.room_survey_id))
  if (includeRoom) await idb.del('rooms', roomId)
}

async function fileToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(fr.error)
    fr.readAsDataURL(blob)
  })
}

// ---------------------------------------------------------------------------
// Backend 구현
// ---------------------------------------------------------------------------
let ready: Promise<void> | null = null
function init() {
  if (!ready) ready = ensureSeed().then(runPurge)
  return ready
}

/** 데모 전용: 예시 데이터가 있는 데모 강사 계정으로 들어간다. */
export async function signInDemoHost() {
  await init()
  signInAs(DEMO_HOST.email)
}

export async function resetDemoData() {
  localStorage.removeItem(ROOM_LOG_KEY)
  await idb.clearAll()
  ready = null
  await init()
}

export function createDemoBackend(): Backend {
  const b: Backend = {
    mode: 'demo',

    async getSession() {
      await init()
      return readSession()
    },
    onAuthChange(cb) {
      authListeners.add(cb)
      return () => authListeners.delete(cb)
    },
    async signInWithGoogle() {
      // 데모: 실제 Google 화면 대신 빈 새 계정으로 바로 들어간다.
      await init()
      await new Promise((r) => setTimeout(r, 400))
      signInAs('google.user@demo.rally')
    },
    async signInAnonymously() {
      await init()
      const s: Session = { userId: uuid(), email: null, isAnonymous: true }
      sessionStorage.setItem(GUEST_KEY, JSON.stringify(s))
      notifyAuth()
      return s
    },
    async signOut() {
      if (isGuestContext()) sessionStorage.removeItem(GUEST_KEY)
      else localStorage.removeItem(HOST_KEY)
      notifyAuth()
    },

    // ---------- 강의실 ----------
    async listMyRooms() {
      await init()
      const a = await actor()
      const rooms = (await idb.all<Room>('rooms')).filter((r) => r.host_id === a.userId)
      const members = await idb.all<Member>('room_members')
      const nodes = await idb.all<RallyNode>('nodes')
      const out: RoomSummary[] = []
      for (const raw of rooms) {
        const r = await refreshExpiry(raw)
        out.push({
          ...r,
          member_count: members.filter((m) => m.room_id === r.id).length,
          ping_count: nodes.filter((n) => n.room_id === r.id && (n.type === 'ping' || n.type === 'poll')).length,
          pong_count: nodes.filter((n) => n.room_id === r.id && (n.type === 'pong' || n.type === 'reply') && !n.is_hidden).length,
        })
      }
      return out.sort((x, y) => (y.started_at ?? y.created_at).localeCompare(x.started_at ?? x.created_at))
    },
    async createRoom(input: CreateRoomInput) {
      const a = await actor()
      if (a.isAnonymous) throw new AppError('not_allowed')
      if (!input.title.trim()) throw new AppError('missing_title', '강의 제목을 입력해 주세요.')
      const mine = await Promise.all((await idb.all<Room>('rooms')).filter((r) => r.host_id === a.userId).map(refreshExpiry))
      if (mine.some((r) => r.status !== 'closed')) throw new AppError('room_limit')
      const log = roomLog()
      const recent = (log[a.userId] ?? []).filter((t) => Date.now() - t < 24 * HOUR)
      if (recent.length >= DAILY_ROOM_LIMIT) throw new AppError('room_daily_limit')
      localStorage.setItem(ROOM_LOG_KEY, JSON.stringify({ ...log, [a.userId]: [...recent, Date.now()] }))
      const room: Room = {
        id: uuid(),
        code: null,
        title: input.title.trim(),
        host_id: a.userId,
        status: 'draft',
        registration: 'off',
        reg_token: newRegToken(),
        collect_phone: false,
        consent_version: 1,
        controller_name: '',
        contact: '',
        phone_purpose: '',
        active_ping_id: null,
        present: { view: 'board', showQr: true, surveyShare: null },
        moderation_rev: 0,
        started_at: null,
        expires_at: null,
        closed_at: null,
        purge_content_at: null,
        purge_pii_at: null,
        created_at: now(),
        updated_at: now(),
      }
      await idb.put('rooms', room)
      if (input.ping_set_id) {
        const set = await idb.get<PingSet>('ping_sets', input.ping_set_id)
        if (set) await b.applyPingSet(room.id, set.pings)
      }
      for (const s of input.survey_template_ids ?? []) {
        const tpl = await idb.get<SurveyTemplate>('survey_templates', s.templateId)
        if (tpl) await attachSurveyTo(room.id, tpl, s.timing, s.anonymous, 'draft')
      }
      return room
    },
    async getRoom(roomId) {
      await init()
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || !(await canSeeRoom(roomId, a.userId))) return null
      return r
    },
    async updateRoom(roomId, patch: RoomPatch) {
      return updateRoomAs(await actor(), roomId, patch)
    },
    async deleteRoom(roomId) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || r.host_id !== a.userId || r.status !== 'draft') throw new AppError('not_allowed')
      await deleteRoomData(roomId, true)
    },
    async startRoom(roomId) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || r.host_id !== a.userId) throw new AppError('not_allowed')
      if (r.status !== 'draft') throw new AppError('already_started')
      const t = now()
      const next = await updateRoomAs(
        a,
        roomId,
        {
          status: 'live',
          code: await generateCode(),
          started_at: t,
          expires_at: plus(t, 24 * HOUR),
          purge_content_at: plus(t, 72 * HOUR),
          purge_pii_at: plus(t, (24 + 24 * 7) * HOUR),
        },
        true,
      )
      const surveys = (await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === roomId && s.timing === 'pre' && s.status === 'ready')
      for (const s of surveys) {
        const open = { ...s, status: 'open' as const, opens_at: t }
        await idb.put('room_surveys', open)
        emit({ room_id: roomId, table: 'room_surveys', type: 'UPDATE', record: open })
      }
      return next
    },
    async extendRoom(roomId, hours) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || r.host_id !== a.userId) throw new AppError('not_allowed')
      if (r.status !== 'live') throw new AppError('not_live')
      if (hours < 1 || hours > 24) throw new AppError('invalid_hours')
      const base = Math.max(new Date(r.expires_at!).getTime(), Date.now())
      const cap = new Date(r.started_at!).getTime() + 48 * HOUR
      const nextExp = Math.min(base + hours * HOUR, cap)
      const delta = nextExp - new Date(r.expires_at!).getTime()
      if (delta <= 0) throw new AppError('extension_limit')
      return updateRoomAs(
        a,
        roomId,
        {
          expires_at: new Date(nextExp).toISOString(),
          purge_content_at: plus(r.purge_content_at!, delta),
          purge_pii_at: plus(r.purge_pii_at!, delta),
        },
        true,
      )
    },
    async closeRoom(roomId) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || r.host_id !== a.userId) throw new AppError('not_allowed')
      if (r.status === 'closed') return r
      if (r.status === 'draft') throw new AppError('not_live')
      const t = now()
      const next = await updateRoomAs(
        a,
        roomId,
        {
          status: 'closed',
          closed_at: t,
          expires_at: r.expires_at && r.expires_at < t ? r.expires_at : t,
          registration: r.registration === 'open' ? 'closed' : r.registration,
          purge_pii_at: plus(t, 7 * 24 * HOUR),
        },
        true,
      )
      const surveys = (await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === roomId && s.status === 'open')
      for (const s of surveys) {
        const closed = { ...s, status: 'closed' as const, closes_at: t }
        await idb.put('room_surveys', closed)
        emit({ room_id: roomId, table: 'room_surveys', type: 'UPDATE', record: closed })
      }
      return next
    },
    async lookupRoom(code) {
      await init()
      await actor()
      const target = (await idb.all<Room>('rooms')).find((r) => r.code === normalizeCode(code) && r.status === 'live')
      const r = target ? await refreshExpiry(target) : undefined
      if (!r || !roomOpen(r)) return null
      const pre = (await idb.all<RoomSurvey>('room_surveys'))
        .filter((s) => s.room_id === r.id && s.timing === 'pre' && s.status === 'open')
        .sort((x, y) => x.created_at.localeCompare(y.created_at))[0]
      const lookup: RoomLookup = { id: r.id, title: r.title, status: r.status, expires_at: r.expires_at, pre_survey: pre ?? null }
      return lookup
    },

    // ---------- 입장·참석자 ----------
    async joinRoom(code, nickname) {
      const a = await actor()
      return { roomId: await joinAs(a.userId, code, nickname) }
    },
    async getMyMembership(roomId) {
      await init()
      const a = await actor()
      const m = await membership(roomId, a.userId)
      return m ? stripId(m, false) : null
    },
    async listMembers(roomId) {
      const a = await actor()
      if (!(await canSeeRoom(roomId, a.userId))) return []
      return (await idb.all<Member>('room_members'))
        .filter((m) => m.room_id === roomId)
        .sort((x, y) => x.joined_at.localeCompare(y.joined_at))
        .map((m) => stripId(m, false))
    },
    async lookupRegistration(token) {
      await init()
      await actor()
      const t = token.trim().toLowerCase()
      const raw = (await idb.all<Room>('rooms')).find((r) => r.reg_token === t && r.registration !== 'off')
      if (!raw) return null
      const r = await refreshExpiry(raw)
      const roster = (await idb.all<RosterEntry>('rosters')).filter((x) => x.room_id === r.id)
      const out: RegistrationLookup = {
        room_id: r.id,
        title: r.title,
        room_status: r.status,
        registration: r.registration,
        code: roomOpen(r) ? r.code : null,
        collect_phone: r.collect_phone,
        consent_version: r.consent_version,
        controller_name: r.controller_name,
        contact: r.contact,
        phone_purpose: r.phone_purpose,
        purge_pii_at: r.purge_pii_at,
        roster_orgs: [...new Set(roster.map((x) => x.org).filter(Boolean))],
      }
      return out
    },
    async registerByToken(token, input) {
      const a = await actor()
      const t = token.trim().toLowerCase()
      const raw = (await idb.all<Room>('rooms')).find((r) => r.reg_token === t)
      if (!raw) throw new AppError('registration_not_found')
      return registerAs(await refreshExpiry(raw), a.userId, input)
    },
    async getMyParticipant(roomId) {
      const a = await actor()
      return (await idb.all<Participant>('participants')).find((p) => p.room_id === roomId && p.user_id === a.userId) ?? null
    },
    async deleteMyParticipant(roomId) {
      const a = await actor()
      await idb.delWhere<Participant>('participants', (p) => p.room_id === roomId && p.user_id === a.userId)
    },
    async listParticipants(roomId) {
      const a = await actor()
      if (!(await isHost(roomId, a.userId))) throw new AppError('not_allowed')
      return (await idb.all<Participant>('participants'))
        .filter((p) => p.room_id === roomId)
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
    },
    async replaceRoster(roomId, rows) {
      const a = await actor()
      if (!(await isHost(roomId, a.userId))) throw new AppError('not_allowed')
      await idb.delWhere<RosterEntry>('rosters', (r) => r.room_id === roomId)
      const out = rows.map<RosterEntry>((r) => ({ ...r, id: uuid(), room_id: roomId }))
      await idb.putMany('rosters', out)
      return out
    },
    async listRoster(roomId) {
      const a = await actor()
      if (!(await isHost(roomId, a.userId))) throw new AppError('not_allowed')
      return (await idb.all<RosterEntry>('rosters')).filter((r) => r.room_id === roomId)
    },
    async purgePiiNow(roomId) {
      const a = await actor()
      if (!(await isHost(roomId, a.userId))) throw new AppError('not_allowed')
      const surveyIds = new Set((await idb.all<RoomSurvey>('room_surveys')).filter((s) => s.room_id === roomId).map((s) => s.id))
      await idb.delWhere<SurveyResponse & { id: string }>('survey_responses', (s) => surveyIds.has(s.room_survey_id))
      await idb.delWhere<Participant>('participants', (p) => p.room_id === roomId)
      await idb.delWhere<RosterEntry>('rosters', (p) => p.room_id === roomId)
    },

    // ---------- 핑·퐁·리플 ----------
    async listNodes(roomId, since) {
      await init()
      const a = await actor()
      const host = await isHost(roomId, a.userId)
      if (!host && !(await membership(roomId, a.userId))) return []
      return (await idb.all<RallyNode>('nodes'))
        .filter((n) => n.room_id === roomId && nodeVisibleTo(n, host) && (!since || n.updated_at > since))
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
    },
    async createNode(input) {
      return createNodeAs(await actor(), input)
    },
    async updateNode(nodeId, patch) {
      return updateNodeAs(await actor(), nodeId, patch)
    },
    async uploadFile(roomId, file, opts) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!(await isHost(roomId, a.userId)) && !(roomOpen(r) && (await membership(roomId, a.userId)))) throw new AppError('not_allowed')
      void opts.name
      return { url: await fileToDataUrl(file), thumb_url: opts.thumb ? await fileToDataUrl(opts.thumb) : null }
    },

    // ---------- 퀵폴 ----------
    async castVote(nodeId, optionIds) {
      const a = await actor()
      await voteAs(a.userId, nodeId, optionIds)
    },
    async toggleReaction(nodeId, kind) {
      const a = await actor()
      return reactAs(a.userId, nodeId, kind)
    },
    async myReactions(roomId) {
      const a = await actor()
      const ids = new Set((await idb.all<RallyNode>('nodes')).filter((n) => n.room_id === roomId).map((n) => n.id))
      const out: Record<string, ReactionKind[]> = {}
      for (const r of await idb.all<ReactionRow>('node_reactions')) {
        if (r.user_id === a.userId && ids.has(r.node_id) && r.kinds.length) out[r.node_id] = r.kinds
      }
      return out
    },
    async getMyVote(nodeId) {
      const a = await actor()
      const v = await idb.get<Vote>('poll_votes', `${nodeId}:${a.userId}`)
      return v ? stripId(v, false) : null
    },
    async pollResults(nodeId) {
      const a = await actor()
      const node = await idb.get<RallyNode>('nodes', nodeId)
      if (!node) throw new AppError('not_found', '퀵폴을 찾을 수 없어요.')
      const host = await isHost(node.room_id, a.userId)
      if (!host) {
        if (!(await membership(node.room_id, a.userId))) throw new AppError('not_allowed')
        if (node.meta.show_results !== 'live' && node.meta.status !== 'closed') throw new AppError('results_hidden')
      }
      const votes = (await idb.all<Vote>('poll_votes')).filter((v) => v.node_id === nodeId)
      const counts: Record<string, number> = {}
      for (const v of votes) for (const o of v.option_ids) counts[o] = (counts[o] ?? 0) + 1
      const res: PollResults = { total_voters: votes.length, counts }
      return res
    },

    // ---------- 설문 ----------
    async listSurveyTemplates() {
      await init()
      const a = await actor()
      return (await idb.all<SurveyTemplate>('survey_templates'))
        .filter((t) => t.owner_id === a.userId)
        .sort((x, y) => y.updated_at.localeCompare(x.updated_at))
    },
    async getSurveyTemplate(id) {
      const a = await actor()
      const t = await idb.get<SurveyTemplate>('survey_templates', id)
      return t && t.owner_id === a.userId ? t : null
    },
    async saveSurveyTemplate(tpl) {
      const a = await actor()
      if (a.isAnonymous) throw new AppError('not_allowed')
      const prev = tpl.id ? await idb.get<SurveyTemplate>('survey_templates', tpl.id) : undefined
      if (prev && prev.owner_id !== a.userId) throw new AppError('not_allowed')
      const row: SurveyTemplate = {
        id: prev?.id ?? uuid(),
        owner_id: a.userId,
        title: tpl.title.trim() || '제목 없는 설문',
        description: tpl.description,
        questions: tpl.questions,
        updated_at: now(),
      }
      await idb.put('survey_templates', row)
      return row
    },
    async deleteSurveyTemplate(id) {
      const a = await actor()
      const t = await idb.get<SurveyTemplate>('survey_templates', id)
      if (!t || t.owner_id !== a.userId) throw new AppError('not_allowed')
      await idb.del('survey_templates', id)
    },
    async listRoomSurveys(roomId) {
      const a = await actor()
      if (!(await canSeeRoom(roomId, a.userId))) return []
      await getRoomRaw(roomId)
      return (await idb.all<RoomSurvey>('room_surveys'))
        .filter((s) => s.room_id === roomId)
        .sort((x, y) => x.created_at.localeCompare(y.created_at))
    },
    async attachSurvey(roomId, templateId, timing, anonymous) {
      const a = await actor()
      const r = await getRoomRaw(roomId)
      if (!r || r.host_id !== a.userId) throw new AppError('not_allowed')
      const tpl = await idb.get<SurveyTemplate>('survey_templates', templateId)
      if (!tpl) throw new AppError('not_found', '설문 템플릿을 찾을 수 없어요.')
      return attachSurveyTo(roomId, tpl, timing, anonymous, r.status)
    },
    async updateRoomSurvey(id, patch) {
      const a = await actor()
      const s = await idb.get<RoomSurvey>('room_surveys', id)
      if (!s || !(await isHost(s.room_id, a.userId))) throw new AppError('not_allowed')
      const next: RoomSurvey = {
        ...s,
        ...patch,
        opens_at: patch.status === 'open' ? now() : s.opens_at,
        closes_at: patch.status === 'closed' ? now() : s.closes_at,
      }
      await idb.put('room_surveys', next)
      emit({ room_id: s.room_id, table: 'room_surveys', type: 'UPDATE', record: next })
      return next
    },
    async deleteRoomSurvey(id) {
      const a = await actor()
      const s = await idb.get<RoomSurvey>('room_surveys', id)
      if (!s || !(await isHost(s.room_id, a.userId))) throw new AppError('not_allowed')
      await idb.del('room_surveys', id)
      await idb.delWhere<SurveyResponse & { id: string }>('survey_responses', (r) => r.room_survey_id === id)
    },
    async getMySurveyResponse(roomSurveyId) {
      const a = await actor()
      return (
        (await idb.all<SurveyResponse>('survey_responses')).find((r) => r.room_survey_id === roomSurveyId && r.user_id === a.userId) ?? null
      )
    },
    async submitSurveyResponse(roomSurveyId, answers) {
      const a = await actor()
      return respondAs(a.userId, roomSurveyId, answers)
    },
    async surveyResults(roomSurveyId) {
      const a = await actor()
      const s = await idb.get<RoomSurvey>('room_surveys', roomSurveyId)
      if (!s || !(await isHost(s.room_id, a.userId))) throw new AppError('not_allowed')
      const rows = (await idb.all<SurveyResponse>('survey_responses')).filter((r) => r.room_survey_id === roomSurveyId)
      if (s.anonymous) {
        return rows
          .map<SurveyResultRow>((r) => ({ id: r.id, answers: r.answers, submitted_at: r.submitted_at.slice(0, 13) + ':00:00.000Z', respondent: null }))
          .sort((x, y) => x.id.localeCompare(y.id))
      }
      const members = await idb.all<Member>('room_members')
      const parts = await idb.all<Participant>('participants')
      return rows
        .sort((x, y) => x.submitted_at.localeCompare(y.submitted_at))
        .map<SurveyResultRow>((r) => {
          const m = members.find((x) => x.room_id === s.room_id && x.user_id === r.user_id)
          const p = parts.find((x) => x.room_id === s.room_id && x.user_id === r.user_id)
          return {
            id: r.id,
            answers: r.answers,
            submitted_at: r.submitted_at,
            respondent: { nickname: m?.nickname ?? null, org: p?.org ?? null, dept: p?.dept ?? null, name: p?.name ?? null },
          }
        })
    },

    // ---------- 핑 세트 ----------
    async listPingSets() {
      await init()
      const a = await actor()
      return (await idb.all<PingSet>('ping_sets')).filter((p) => p.owner_id === a.userId).sort((x, y) => y.updated_at.localeCompare(x.updated_at))
    },
    async getPingSet(id) {
      const a = await actor()
      const p = await idb.get<PingSet>('ping_sets', id)
      return p && p.owner_id === a.userId ? p : null
    },
    async savePingSet(set) {
      const a = await actor()
      if (a.isAnonymous) throw new AppError('not_allowed')
      const prev = set.id ? await idb.get<PingSet>('ping_sets', set.id) : undefined
      const row: PingSet = { id: prev?.id ?? uuid(), owner_id: a.userId, title: set.title.trim() || '제목 없는 템플릿 묶음', pings: set.pings, updated_at: now() }
      await idb.put('ping_sets', row)
      return row
    },
    async deletePingSet(id) {
      const a = await actor()
      const p = await idb.get<PingSet>('ping_sets', id)
      if (!p || p.owner_id !== a.userId) throw new AppError('not_allowed')
      await idb.del('ping_sets', id)
    },
    async applyPingSet(roomId, items: PingSetItem[]) {
      const a = await actor()
      for (const item of items) {
        await createNodeAs(a, {
          room_id: roomId,
          type: item.type === 'poll' ? 'poll' : 'ping',
          content: item.content,
          attachments: item.attachments ?? [],
          meta: item.meta ?? {},
        })
      }
    },

    // ---------- 실시간 ----------
    subscribeRoom(roomId, { onEvent, onStatus }: SubscribeOptions) {
      onStatus?.('connecting')
      let viewerHost = false
      let viewerId = readSession()?.userId ?? ''
      let active = true
      void (async () => {
        viewerHost = await isHost(roomId, viewerId)
        await new Promise((r) => setTimeout(r, 250))
        if (active) onStatus?.('live')
      })()
      const listener = (e: Envelope) => {
        if (!active || e.room_id !== roomId) return
        viewerId = readSession()?.userId ?? viewerId
        if (e.table === 'nodes' && !nodeVisibleTo(e.record, viewerHost)) return
        const { room_id: _r, ...event } = e
        void _r
        onEvent(event as RoomEvent)
      }
      rtListeners.add(listener)
      return {
        unsubscribe() {
          active = false
          rtListeners.delete(listener)
        },
      }
    },
  }
  return b
}
