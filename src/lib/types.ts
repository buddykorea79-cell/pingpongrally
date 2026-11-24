// 설계서 2장(용어)과 10장(데이터 모델)을 그대로 옮긴 도메인 타입입니다.

export type RoomStatus = 'draft' | 'live' | 'closed'
/** 참석자 등록 폼: off(안 받음) → open(링크로 받는 중) → closed(마감) */
export type RegistrationStatus = 'off' | 'open' | 'closed'
export type NodeType = 'ping' | 'pong' | 'reply' | 'poll'
export type AttachmentKind = 'image' | 'file' | 'link'
export type SurveyTiming = 'pre' | 'live' | 'post'
export type SurveyStatus = 'ready' | 'open' | 'closed'
export type QuestionType = 'single' | 'multiple' | 'scale' | 'short' | 'long'
/** 퐁 이모지 반응 */
export type ReactionKind = 'like' | 'dislike' | 'heart' | 'laugh' | 'wow' | 'think'
export type ReactionCounts = Partial<Record<ReactionKind, number>>

/** 발표 화면 상태. 강사 제어판에서 바꾸면 발표 화면이 따라간다. */
export interface PresentState {
  view: 'board' | 'network'
  showQr: boolean
  /** 발표 화면에 띄울 설문 문항 */
  surveyShare: { roomSurveyId: string; questionId: string } | null
}

export interface Room {
  id: string
  code: string | null
  title: string
  host_id: string
  status: RoomStatus
  registration: RegistrationStatus
  /** 참석자 등록 링크(/reg/:token)용 토큰 */
  reg_token: string
  collect_phone: boolean
  consent_version: number
  /** 동의 문안의 개인정보처리자(강사명 또는 주관 기관명) */
  controller_name: string
  /** 동의 문안의 문의처 */
  contact: string
  /** 휴대폰 번호 수집 목적 */
  phone_purpose: string
  active_ping_id: string | null
  present: PresentState
  /** 숨김 처리 등으로 교육생이 전체를 다시 불러와야 할 때 올라가는 번호 */
  moderation_rev: number
  started_at: string | null
  expires_at: string | null
  closed_at: string | null
  purge_content_at: string | null
  purge_pii_at: string | null
  created_at: string
  updated_at: string
}

/** 입장 전 코드로 조회하는 공개 정보 */
export interface RoomLookup {
  id: string
  title: string
  status: RoomStatus
  expires_at: string | null
  pre_survey: RoomSurvey | null
}

/** 참석자 등록 링크로 조회하는 공개 정보 */
export interface RegistrationLookup {
  room_id: string
  title: string
  room_status: RoomStatus
  registration: RegistrationStatus
  /** 강의가 진행 중일 때만 — 등록 후 바로 입장하도록 */
  code: string | null
  collect_phone: boolean
  consent_version: number
  controller_name: string
  contact: string
  phone_purpose: string
  purge_pii_at: string | null
  roster_orgs: string[]
}

export interface RoomMember {
  room_id: string
  user_id: string
  nickname: string
  color: string
  is_host: boolean
  joined_at: string
}

export interface Participant {
  id: string
  room_id: string
  user_id: string
  org: string
  dept: string
  name: string
  phone: string | null
  consent_version: number
  consent_required_at: string
  consent_optional_at: string | null
  roster_id: string | null
  created_at: string
}

export interface RosterEntry {
  id: string
  room_id: string
  org: string
  dept: string
  name: string
  phone_last4: string | null
}

export interface Attachment {
  kind: AttachmentKind
  url: string
  thumb_url?: string | null
  name: string
  mime?: string | null
  size?: number | null
  width?: number | null
  height?: number | null
}

export interface PollOption {
  id: string
  label: string
}

export interface PollMeta {
  options: PollOption[]
  multiple: boolean
  /** live: 투표 중에도 교육생에게 결과 공개 / after_close: 마감 후 공개(기본) */
  show_results: 'live' | 'after_close'
  status: 'ready' | 'open' | 'closed'
}

export interface RallyNode {
  id: string
  room_id: string
  ping_id: string | null
  parent_id: string | null
  type: NodeType
  author_id: string
  author_nickname: string
  is_host: boolean
  content: string
  attachments: Attachment[]
  meta: Partial<PollMeta> & Record<string, unknown>
  is_hidden: boolean
  is_closed: boolean
  sort_order: number
  /** 처음 포커스되어 교육생에게 공개된 시각 */
  opened_at: string | null
  created_at: string
  updated_at: string
}

export interface PollResults {
  total_voters: number
  counts: Record<string, number>
}

export interface PollVote {
  node_id: string
  user_id: string
  option_ids: string[]
  created_at: string
}

export interface SurveyQuestion {
  id: string
  type: QuestionType
  title: string
  description?: string
  required: boolean
  options?: string[]
  allowOther?: boolean
  maxSelect?: number | null
  scale?: { min: number; max: number; minLabel?: string; maxLabel?: string }
  maxLength?: number
}

export interface SurveyTemplate {
  id: string
  owner_id: string
  title: string
  description: string
  questions: SurveyQuestion[]
  updated_at: string
}

export interface RoomSurvey {
  id: string
  room_id: string
  template_id: string | null
  title: string
  description: string
  questions: SurveyQuestion[]
  timing: SurveyTiming
  anonymous: boolean
  status: SurveyStatus
  opens_at: string | null
  closes_at: string | null
  created_at: string
}

export type SurveyAnswer = string | string[] | number | { choice: string; other?: string } | null

export interface SurveyResponse {
  id: string
  room_survey_id: string
  user_id: string
  answers: Record<string, SurveyAnswer>
  submitted_at: string
}

/** 강사용 결과: 익명 설문이면 respondent는 null */
export interface SurveyResultRow {
  id: string
  answers: Record<string, SurveyAnswer>
  submitted_at: string
  respondent: { nickname: string | null; org: string | null; dept: string | null; name: string | null } | null
}

export interface PingSetItem {
  type: 'ping' | 'poll'
  content: string
  attachments: Attachment[]
  meta?: Partial<PollMeta>
}

export interface PingSet {
  id: string
  owner_id: string
  title: string
  pings: PingSetItem[]
  updated_at: string
}

export interface HostProfile {
  id: string
  email: string
  isAnonymous: boolean
}

export interface RoomSummary extends Room {
  member_count: number
  ping_count: number
  pong_count: number
}

export interface RegistrationInput {
  org: string
  dept: string
  name: string
  phone: string | null
  consent_required: boolean
  consent_optional: boolean
}

export interface CreateRoomInput {
  title: string
  ping_set_id?: string | null
  survey_template_ids?: { templateId: string; timing: SurveyTiming; anonymous: boolean }[]
}

export type RoomEvent =
  | { table: 'rooms'; type: 'UPDATE' | 'INSERT'; record: Room }
  | { table: 'nodes'; type: 'INSERT' | 'UPDATE'; record: RallyNode }
  | { table: 'room_members'; type: 'INSERT' | 'UPDATE'; record: RoomMember }
  | { table: 'room_surveys'; type: 'INSERT' | 'UPDATE'; record: RoomSurvey }

export type ConnectionState = 'connecting' | 'live' | 'polling' | 'offline'
