// =====================================================================
// 파기 Edge Function (설계서 8장·12.2)
//   pg_cron 이 매시간 호출한다. Storage API 로 폴더를 지운 뒤 DB 행을 지운다.
//   SQL 로 storage.objects 를 직접 지우지 않는다(파일이 고아로 남음).
//
//   배포:   supabase functions deploy purge --no-verify-jwt
//   비밀값: supabase secrets set PURGE_SECRET=<임의의 긴 문자열>
//   (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Edge Function 에 기본으로 들어 있다)
// =====================================================================
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const BUCKET = 'rooms'
const BATCH = 25

async function listAll(admin: SupabaseClient, prefix: string): Promise<string[]> {
  const out: string[] = []
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, offset })
    if (error) throw error
    if (!data?.length) break
    for (const item of data) {
      // 폴더는 id 가 null 로 온다(예: thumb/)
      if (item.id === null) out.push(...(await listAll(admin, `${prefix}/${item.name}`)))
      else out.push(`${prefix}/${item.name}`)
    }
    if (data.length < 1000) break
  }
  return out
}

async function removeRoomFiles(admin: SupabaseClient, roomId: string): Promise<number> {
  const paths = await listAll(admin, roomId)
  for (let i = 0; i < paths.length; i += 1000) {
    const { error } = await admin.storage.from(BUCKET).remove(paths.slice(i, i + 1000))
    if (error) throw error
  }
  return paths.length
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('PURGE_SECRET')
  if (!secret || req.headers.get('x-purge-secret') !== secret) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })
  }

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const now = new Date().toISOString()
  const report = { closed: 0, contentPurged: [] as string[], piiPurged: [] as string[], files: 0, anonymousUsers: 0, errors: [] as string[] }

  // 0) 만료된 강의실 종료
  const closed = await admin.rpc('close_expired_rooms')
  if (closed.error) report.errors.push(`close_expired_rooms: ${closed.error.message}`)
  else report.closed = closed.data as number

  // 1) 글·파일 파기: 시작 72시간 뒤
  const { data: contentRooms, error: e1 } = await admin
    .from('rooms')
    .select('id')
    .lte('purge_content_at', now)
    .is('content_purged_at', null)
    .limit(BATCH)
  if (e1) report.errors.push(e1.message)
  for (const r of contentRooms ?? []) {
    try {
      report.files += await removeRoomFiles(admin, r.id)
      await admin.from('rooms').update({ active_ping_id: null }).eq('id', r.id)
      const del = await admin.from('nodes').delete().eq('room_id', r.id) // poll_votes 는 cascade
      if (del.error) throw del.error
      await admin.from('room_members').delete().eq('room_id', r.id)
      await admin.from('rooms').update({ content_purged_at: now }).eq('id', r.id)
      report.contentPurged.push(r.id)
    } catch (e) {
      report.errors.push(`content ${r.id}: ${(e as Error).message}`)
    }
  }

  // 2) 개인정보 파기: 종료 7일 뒤 — 강의실 행을 지우면 등록·명단·설문이 함께 지워진다
  const { data: piiRooms, error: e2 } = await admin.from('rooms').select('id').lte('purge_pii_at', now).limit(BATCH)
  if (e2) report.errors.push(e2.message)
  for (const r of piiRooms ?? []) {
    try {
      report.files += await removeRoomFiles(admin, r.id)
      await admin.from('rooms').update({ active_ping_id: null }).eq('id', r.id)
      const del = await admin.from('rooms').delete().eq('id', r.id)
      if (del.error) throw del.error
      report.piiPurged.push(r.id)
    } catch (e) {
      report.errors.push(`pii ${r.id}: ${(e as Error).message}`)
    }
  }

  // 3) 오래된 익명 계정 정리(10일 지났고 어디에도 속하지 않음)
  const { data: stale, error: e3 } = await admin.rpc('stale_anonymous_users', { p_limit: 200 })
  if (e3) report.errors.push(e3.message)
  for (const id of (stale as string[] | null) ?? []) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (error) report.errors.push(`user ${id}: ${error.message}`)
    else report.anonymousUsers++
  }

  console.log(JSON.stringify(report))
  return new Response(JSON.stringify(report), { headers: { 'content-type': 'application/json' }, status: report.errors.length ? 207 : 200 })
})
