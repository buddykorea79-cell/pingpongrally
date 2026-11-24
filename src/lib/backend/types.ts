import type {
  Attachment,
  ConnectionState,
  CreateRoomInput,
  Participant,
  PingSet,
  PingSetItem,
  PollResults,
  PollVote,
  RallyNode,
  ReactionCounts,
  ReactionKind,
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
} from '../types'

export interface Session {
  userId: string
  email: string | null
  isAnonymous: boolean
}

export interface NewNodeInput {
  room_id: string
  type: RallyNode['type']
  parent_id?: string | null
  content: string
  attachments?: Attachment[]
  meta?: RallyNode['meta']
}

export type NodePatch = Partial<Pick<RallyNode, 'content' | 'attachments' | 'meta' | 'is_hidden' | 'is_closed' | 'sort_order'>>

export type RoomPatch = Partial<
  Pick<
    Room,
    'title' | 'registration' | 'collect_phone' | 'controller_name' | 'contact' | 'phone_purpose' | 'active_ping_id' | 'present'
  >
>

export interface RoomSubscription {
  unsubscribe(): void
}

export interface SubscribeOptions {
  onEvent: (event: RoomEvent) => void
  onStatus?: (state: ConnectionState) => void
}

/**
 * 화면은 이 인터페이스만 알고, 실제 구현은 Supabase(운영) 또는 데모(브라우저 안) 중 하나다.
 * 권한은 Supabase 쪽 RLS가 최종적으로 막는다. 데모 구현은 같은 규칙을 흉내만 낸다.
 */
export interface Backend {
  readonly mode: 'supabase' | 'demo'

  // ---------- 인증 ----------
  getSession(): Promise<Session | null>
  onAuthChange(cb: (session: Session | null) => void): () => void
  /** 강사: Google 로그인(가입 겸용). 운영에서는 Google 화면으로 이동했다가 redirectPath로 돌아온다. */
  signInWithGoogle(redirectPath: string): Promise<void>
  signInAnonymously(captchaToken?: string): Promise<Session>
  signOut(): Promise<void>

  // ---------- 강의실 ----------
  listMyRooms(): Promise<RoomSummary[]>
  createRoom(input: CreateRoomInput): Promise<Room>
  getRoom(roomId: string): Promise<Room | null>
  updateRoom(roomId: string, patch: RoomPatch): Promise<Room>
  deleteRoom(roomId: string): Promise<void>
  startRoom(roomId: string): Promise<Room>
  extendRoom(roomId: string, hours: number): Promise<Room>
  closeRoom(roomId: string): Promise<Room>
  lookupRoom(code: string): Promise<RoomLookup | null>

  // ---------- 입장·참석자 ----------
  joinRoom(code: string, nickname: string): Promise<{ roomId: string }>
  getMyMembership(roomId: string): Promise<RoomMember | null>
  listMembers(roomId: string): Promise<RoomMember[]>
  /** 참석자 등록 링크(/reg/:token) */
  lookupRegistration(token: string): Promise<RegistrationLookup | null>
  registerByToken(token: string, input: RegistrationInput): Promise<Participant>
  getMyParticipant(roomId: string): Promise<Participant | null>
  deleteMyParticipant(roomId: string): Promise<void>
  listParticipants(roomId: string): Promise<Participant[]>
  replaceRoster(roomId: string, rows: Omit<RosterEntry, 'id' | 'room_id'>[]): Promise<RosterEntry[]>
  listRoster(roomId: string): Promise<RosterEntry[]>
  purgePiiNow(roomId: string): Promise<void>

  // ---------- 핑·퐁·리플 ----------
  listNodes(roomId: string, since?: string | null): Promise<RallyNode[]>
  createNode(input: NewNodeInput): Promise<RallyNode>
  /** 숨김 처리처럼 결과를 더 볼 수 없게 되면 null */
  updateNode(nodeId: string, patch: NodePatch): Promise<RallyNode | null>
  uploadFile(roomId: string, file: Blob, opts: { name: string; thumb?: Blob | null }): Promise<{ url: string; thumb_url: string | null }>

  // ---------- 퀵폴 ----------
  castVote(nodeId: string, optionIds: string[]): Promise<void>
  getMyVote(nodeId: string): Promise<PollVote | null>
  pollResults(nodeId: string): Promise<PollResults>

  // ---------- 퐁 반응 ----------
  /** 이모지 하나를 켜거나 끈다. 개수는 nodes.meta.reactions 로도 실시간 반영된다. */
  toggleReaction(nodeId: string, kind: ReactionKind): Promise<{ mine: ReactionKind[]; reactions: ReactionCounts }>
  /** 이 강의에서 내가 고른 반응 { nodeId: [kind] } */
  myReactions(roomId: string): Promise<Record<string, ReactionKind[]>>

  // ---------- 설문 ----------
  listSurveyTemplates(): Promise<SurveyTemplate[]>
  getSurveyTemplate(id: string): Promise<SurveyTemplate | null>
  saveSurveyTemplate(tpl: Pick<SurveyTemplate, 'title' | 'description' | 'questions'> & { id?: string }): Promise<SurveyTemplate>
  deleteSurveyTemplate(id: string): Promise<void>
  listRoomSurveys(roomId: string): Promise<RoomSurvey[]>
  attachSurvey(roomId: string, templateId: string, timing: SurveyTiming, anonymous: boolean): Promise<RoomSurvey>
  updateRoomSurvey(id: string, patch: Partial<Pick<RoomSurvey, 'status' | 'timing' | 'anonymous'>>): Promise<RoomSurvey>
  deleteRoomSurvey(id: string): Promise<void>
  getMySurveyResponse(roomSurveyId: string): Promise<SurveyResponse | null>
  submitSurveyResponse(roomSurveyId: string, answers: Record<string, SurveyAnswer>): Promise<SurveyResponse>
  surveyResults(roomSurveyId: string): Promise<SurveyResultRow[]>

  // ---------- 핑 세트 ----------
  listPingSets(): Promise<PingSet[]>
  getPingSet(id: string): Promise<PingSet | null>
  savePingSet(set: { id?: string; title: string; pings: PingSetItem[] }): Promise<PingSet>
  deletePingSet(id: string): Promise<void>
  applyPingSet(roomId: string, items: PingSetItem[]): Promise<void>

  // ---------- 실시간 ----------
  subscribeRoom(roomId: string, opts: SubscribeOptions): RoomSubscription
}
