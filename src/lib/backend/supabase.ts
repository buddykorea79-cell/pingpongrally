import { createClient, type RealtimePostgresChangesPayload, type SupabaseClient } from '@supabase/supabase-js'
import type { Backend, NewNodeInput, NodePatch, RoomPatch, Session, SubscribeOptions } from './types'
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
} from '../types'
import { AppError } from '../errors'
import { uuid } from '../utils'
import { contentTypeFor, extensionOf } from '../files'

const BUCKET = 'rooms'

function fail(error: { message: string; code?: string } | null): never {
  const msg = error?.message ?? 'unknown_error'
  throw new AppError(msg.split(':')[0].trim(), undefined)
}

function check<T>(res: { data: T; error: { message: string } | null }): T {
  if (res.error) fail(res.error)
  return res.data
}

function toSession(s: { user: { id: string; email?: string | null; is_anonymous?: boolean } } | null): Session | null {
  if (!s) return null
  return { userId: s.user.id, email: s.user.email ?? null, isAnonymous: Boolean(s.user.is_anonymous) }
}

function regPayload(input: RegistrationInput) {
  return {
    org: input.org.trim(),
    dept: input.dept.trim(),
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    consent_required: input.consent_required,
    consent_optional: input.consent_optional,
  }
}

export function createSupabaseBackend(url: string, anonKey: string): Backend {
  const sb: SupabaseClient = createClient(url, anonKey, {
    // 소셜 로그인에서 돌아올 때 주소의 ?code= 를 세션으로 바꾼다(PKCE).
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'ppr-auth' },
    realtime: { params: { eventsPerSecond: 20 } },
  })

  async function uid(): Promise<string> {
    const { data } = await sb.auth.getSession()
    const id = data.session?.user.id
    if (!id) throw new AppError('not_authenticated')
    return id
  }

  const backend: Backend = {
    mode: 'supabase',

    // ---------- 인증 ----------
    async getSession() {
      const { data } = await sb.auth.getSession()
      return toSession(data.session)
    },
    onAuthChange(cb) {
      const { data } = sb.auth.onAuthStateChange((_e, session) => cb(toSession(session)))
      return () => data.subscription.unsubscribe()
    },
    async signInWithGoogle(redirectPath) {
      const { error } = await sb.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}${redirectPath}`, queryParams: { prompt: 'select_account' } },
      })
      if (error) fail(error)
    },
    async signInAnonymously(captchaToken) {
      const { data, error } = await sb.auth.signInAnonymously(captchaToken ? { options: { captchaToken } } : undefined)
      if (error) fail(error)
      return toSession(data.session)!
    },
    async signOut() {
      await sb.auth.signOut()
    },

    // ---------- 강의실 ----------
    async listMyRooms() {
      const rows = check(await sb.rpc('my_rooms')) as { room: Room; member_count: number; ping_count: number; pong_count: number }[]
      return rows.map<RoomSummary>((r) => ({
        ...r.room,
        member_count: Number(r.member_count),
        ping_count: Number(r.ping_count),
        pong_count: Number(r.pong_count),
      }))
    },
    async createRoom(input: CreateRoomInput) {
      const room = check(
        await sb
          .from('rooms')
          .insert({ title: input.title.trim() })
          .select()
          .single(),
      ) as Room
      if (input.ping_set_id) {
        const set = await backend.getPingSet(input.ping_set_id)
        if (set) await backend.applyPingSet(room.id, set.pings)
      }
      for (const s of input.survey_template_ids ?? []) {
        await backend.attachSurvey(room.id, s.templateId, s.timing, s.anonymous)
      }
      return room
    },
    async getRoom(roomId) {
      return check(await sb.from('rooms').select('*').eq('id', roomId).maybeSingle()) as Room | null
    },
    async updateRoom(roomId, patch: RoomPatch) {
      return check(await sb.from('rooms').update(patch).eq('id', roomId).select().single()) as Room
    },
    async deleteRoom(roomId) {
      check(await sb.from('rooms').delete().eq('id', roomId))
    },
    async startRoom(roomId) {
      return check(await sb.rpc('start_room', { p_room: roomId })) as Room
    },
    async extendRoom(roomId, hours) {
      return check(await sb.rpc('extend_room', { p_room: roomId, p_hours: hours })) as Room
    },
    async closeRoom(roomId) {
      return check(await sb.rpc('close_room', { p_room: roomId })) as Room
    },
    async lookupRoom(code) {
      return (check(await sb.rpc('room_lookup', { p_code: code })) as RoomLookup | null) ?? null
    },

    // ---------- 입장·참석자 ----------
    async joinRoom(code, nickname) {
      // 틀린 코드는 서버가 시도 기록을 남기고 null 을 돌려준다(예외로 던지면 기록이 되돌려지므로)
      const roomId = check(await sb.rpc('join_room', { p_code: code, p_nickname: nickname.trim() })) as string | null
      if (!roomId) throw new AppError('room_not_found')
      return { roomId }
    },
    async getMyMembership(roomId) {
      const me = await uid()
      return check(
        await sb.from('room_members').select('*').eq('room_id', roomId).eq('user_id', me).maybeSingle(),
      ) as RoomMember | null
    },
    async listMembers(roomId) {
      return check(await sb.from('room_members').select('*').eq('room_id', roomId).order('joined_at')) as RoomMember[]
    },
    async lookupRegistration(token) {
      return (check(await sb.rpc('registration_lookup', { p_token: token })) as RegistrationLookup | null) ?? null
    },
    async registerByToken(token, input) {
      return check(await sb.rpc('register_by_token', { p_token: token, p_registration: regPayload(input) })) as Participant
    },
    async getMyParticipant(roomId) {
      const me = await uid()
      return check(
        await sb.from('participants').select('*').eq('room_id', roomId).eq('user_id', me).maybeSingle(),
      ) as Participant | null
    },
    async deleteMyParticipant(roomId) {
      const me = await uid()
      check(await sb.from('participants').delete().eq('room_id', roomId).eq('user_id', me))
    },
    async listParticipants(roomId) {
      return check(await sb.from('participants').select('*').eq('room_id', roomId).order('created_at')) as Participant[]
    },
    async replaceRoster(roomId, rows) {
      check(await sb.from('rosters').delete().eq('room_id', roomId))
      if (rows.length === 0) return []
      return check(
        await sb
          .from('rosters')
          .insert(rows.map((r) => ({ ...r, room_id: roomId })))
          .select(),
      ) as RosterEntry[]
    },
    async listRoster(roomId) {
      return check(await sb.from('rosters').select('*').eq('room_id', roomId).order('created_at')) as RosterEntry[]
    },
    async purgePiiNow(roomId) {
      check(await sb.rpc('purge_pii_now', { p_room: roomId }))
    },

    // ---------- 핑·퐁·리플 ----------
    async listNodes(roomId, since) {
      let q = sb.from('nodes').select('*').eq('room_id', roomId)
      if (since) q = q.gt('updated_at', since)
      return check(await q.order('created_at').limit(5000)) as RallyNode[]
    },
    async createNode(input: NewNodeInput) {
      return check(
        await sb
          .from('nodes')
          .insert({
            room_id: input.room_id,
            type: input.type,
            parent_id: input.parent_id ?? null,
            content: input.content,
            attachments: input.attachments ?? [],
            meta: input.meta ?? {},
          })
          .select()
          .single(),
      ) as RallyNode
    },
    async updateNode(nodeId, patch: NodePatch) {
      const rows = check(await sb.from('nodes').update(patch).eq('id', nodeId).select()) as RallyNode[]
      return rows[0] ?? null
    },
    async uploadFile(roomId, file, opts) {
      const id = uuid()
      const ext = extensionOf(opts.name) || 'bin'
      const path = `${roomId}/${id}.${ext}`
      const up = await sb.storage.from(BUCKET).upload(path, file, {
        contentType: contentTypeFor(opts.name, file.type),
        cacheControl: '31536000',
        upsert: false,
      })
      if (up.error) fail(up.error)
      let thumbUrl: string | null = null
      if (opts.thumb) {
        const tpath = `${roomId}/thumb/${id}.jpg`
        const t = await sb.storage.from(BUCKET).upload(tpath, opts.thumb, { contentType: 'image/jpeg', cacheControl: '31536000' })
        if (!t.error) thumbUrl = sb.storage.from(BUCKET).getPublicUrl(tpath).data.publicUrl
      }
      return { url: sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl, thumb_url: thumbUrl }
    },

    // ---------- 퀵폴 ----------
    async castVote(nodeId, optionIds) {
      const me = await uid()
      check(
        await sb
          .from('poll_votes')
          .upsert({ node_id: nodeId, user_id: me, option_ids: optionIds }, { onConflict: 'node_id,user_id' }),
      )
    },
    async getMyVote(nodeId) {
      const me = await uid()
      return check(
        await sb.from('poll_votes').select('*').eq('node_id', nodeId).eq('user_id', me).maybeSingle(),
      ) as PollVote | null
    },
    async pollResults(nodeId) {
      return check(await sb.rpc('poll_results', { p_node: nodeId })) as PollResults
    },

    // ---------- 퐁 반응 ----------
    async toggleReaction(nodeId, kind) {
      return check(await sb.rpc('toggle_reaction', { p_node: nodeId, p_kind: kind })) as { mine: ReactionKind[]; reactions: ReactionCounts }
    },
    async myReactions(roomId) {
      return (check(await sb.rpc('my_reactions', { p_room: roomId })) ?? {}) as Record<string, ReactionKind[]>
    },

    // ---------- 설문 ----------
    async listSurveyTemplates() {
      return check(await sb.from('survey_templates').select('*').order('updated_at', { ascending: false })) as SurveyTemplate[]
    },
    async getSurveyTemplate(id) {
      return check(await sb.from('survey_templates').select('*').eq('id', id).maybeSingle()) as SurveyTemplate | null
    },
    async saveSurveyTemplate(tpl) {
      const row = { title: tpl.title.trim(), description: tpl.description, questions: tpl.questions }
      if (tpl.id) {
        return check(await sb.from('survey_templates').update(row).eq('id', tpl.id).select().single()) as SurveyTemplate
      }
      return check(await sb.from('survey_templates').insert(row).select().single()) as SurveyTemplate
    },
    async deleteSurveyTemplate(id) {
      check(await sb.from('survey_templates').delete().eq('id', id))
    },
    async listRoomSurveys(roomId) {
      return check(await sb.from('room_surveys').select('*').eq('room_id', roomId).order('created_at')) as RoomSurvey[]
    },
    async attachSurvey(roomId, templateId, timing: SurveyTiming, anonymous) {
      const tpl = await backend.getSurveyTemplate(templateId)
      if (!tpl) throw new AppError('not_found', '설문 템플릿을 찾을 수 없어요.')
      const room = await backend.getRoom(roomId)
      const status = room?.status === 'live' && timing === 'pre' ? 'open' : 'ready'
      return check(
        await sb
          .from('room_surveys')
          .insert({
            room_id: roomId,
            template_id: tpl.id,
            title: tpl.title,
            description: tpl.description,
            questions: tpl.questions,
            timing,
            anonymous,
            status,
            opens_at: status === 'open' ? new Date().toISOString() : null,
          })
          .select()
          .single(),
      ) as RoomSurvey
    },
    async updateRoomSurvey(id, patch) {
      const extra: Record<string, string> = {}
      if (patch.status === 'open') extra.opens_at = new Date().toISOString()
      if (patch.status === 'closed') extra.closes_at = new Date().toISOString()
      return check(await sb.from('room_surveys').update({ ...patch, ...extra }).eq('id', id).select().single()) as RoomSurvey
    },
    async deleteRoomSurvey(id) {
      check(await sb.from('room_surveys').delete().eq('id', id))
    },
    async getMySurveyResponse(roomSurveyId) {
      const me = await uid()
      return check(
        await sb.from('survey_responses').select('*').eq('room_survey_id', roomSurveyId).eq('user_id', me).maybeSingle(),
      ) as SurveyResponse | null
    },
    async submitSurveyResponse(roomSurveyId, answers: Record<string, SurveyAnswer>) {
      const me = await uid()
      return check(
        await sb
          .from('survey_responses')
          .upsert({ room_survey_id: roomSurveyId, user_id: me, answers }, { onConflict: 'room_survey_id,user_id' })
          .select()
          .single(),
      ) as SurveyResponse
    },
    async surveyResults(roomSurveyId) {
      return check(await sb.rpc('survey_results', { p_survey: roomSurveyId })) as SurveyResultRow[]
    },

    // ---------- 핑 세트 ----------
    async listPingSets() {
      return check(await sb.from('ping_sets').select('*').order('updated_at', { ascending: false })) as PingSet[]
    },
    async getPingSet(id) {
      return check(await sb.from('ping_sets').select('*').eq('id', id).maybeSingle()) as PingSet | null
    },
    async savePingSet(set) {
      const row = { title: set.title.trim(), pings: set.pings }
      if (set.id) return check(await sb.from('ping_sets').update(row).eq('id', set.id).select().single()) as PingSet
      return check(await sb.from('ping_sets').insert(row).select().single()) as PingSet
    },
    async deletePingSet(id) {
      check(await sb.from('ping_sets').delete().eq('id', id))
    },
    async applyPingSet(roomId, items: PingSetItem[]) {
      check(await sb.rpc('apply_ping_set', { p_room: roomId, p_items: items }))
    },

    // ---------- 실시간(12.1) ----------
    subscribeRoom(roomId, { onEvent, onStatus }: SubscribeOptions) {
      onStatus?.('connecting')
      const relay =
        (table: RoomEvent['table']) =>
        (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
          if (payload.eventType === 'DELETE') return
          onEvent({ table, type: payload.eventType, record: payload.new } as unknown as RoomEvent)
        }
      const channel = sb
        .channel(`room:${roomId}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, relay('rooms'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'nodes', filter: `room_id=eq.${roomId}` }, relay('nodes'))
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` },
          relay('room_members'),
        )
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'room_surveys', filter: `room_id=eq.${roomId}` },
          relay('room_surveys'),
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') onStatus?.('live')
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') onStatus?.('polling')
          else if (status === 'CLOSED') onStatus?.('offline')
        })
      return {
        unsubscribe() {
          void sb.removeChannel(channel)
        },
      }
    },
  }
  return backend
}
