// =====================================================================
// 마이그레이션 + RLS 검증(Postgres 를 WASM 으로 띄우는 PGlite 사용)
//   npm run test:db
// Supabase 전용 스키마(auth, storage)와 역할(anon, authenticated, service_role)은
// 아래 prelude 에서 최소한으로 흉내 낸다. 실제 운영 DB 에서는 Supabase 가 제공한다.
// =====================================================================
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = fileURLToPath(new URL('../migrations/', import.meta.url))
const files = process.argv[2]
  ? [process.argv[2]]
  : readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => join(dir, f))
const migration = files
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n')
  .replace(/create extension if not exists pgcrypto[^;]*;/i, '-- pgcrypto: gen_random_uuid() 는 Postgres 13+ 기본 함수')
const db = new PGlite()

const prelude = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage; create schema extensions;
grant usage on schema public, auth, storage to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text, is_anonymous boolean not null default false, created_at timestamptz not null default now());
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
grant execute on function auth.uid(), auth.jwt() to anon, authenticated, service_role;
grant select on auth.users to service_role;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'),1)-1] $$;
grant execute on function storage.foldername(text) to authenticated;
create publication supabase_realtime;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`
await db.exec(prelude)
try {
  await db.exec(migration)
  console.log('✔ migration applied')
} catch (e) {
  console.error('✖ migration failed:', e.message, e.position ? `@${e.position}` : '', e.where ?? '')
  const pos = Number(e.position)
  if (pos) console.error(migration.slice(Math.max(0, pos - 300), pos + 200))
  process.exit(1)
}

const U = {
  host: '11111111-1111-4111-8111-111111111111',
  s1: '22222222-2222-4222-8222-222222222222',
  s2: '33333333-3333-4333-8333-333333333333',
  other: '44444444-4444-4444-8444-444444444444',
}
await db.exec(`insert into auth.users (id, email, is_anonymous) values
 ('${U.host}', 'host@x.kr', false), ('${U.s1}', null, true), ('${U.s2}', null, true), ('${U.other}', 'o@x.kr', false)`)

let pass = 0
let fail = 0
async function as(user, sql, params = []) {
  const claims = JSON.stringify({ sub: U[user], role: 'authenticated', is_anonymous: user.startsWith('s') })
  await db.exec(`reset role; select set_config('request.jwt.claims', '${claims}', false); set role authenticated;`)
  try {
    return await db.query(sql, params)
  } finally {
    await db.exec('reset role')
  }
}
async function ok(name, fn) {
  try {
    const r = await fn()
    console.log('  ✔', name, r === undefined ? '' : JSON.stringify(r))
    pass++
  } catch (e) {
    console.log('  ✖', name, '→', e.message)
    fail++
  }
}
async function rejects(name, fn, expect) {
  try {
    const r = await fn()
    console.log('  ✖', name, '→ 성공해 버림', JSON.stringify(r?.rows ?? r))
    fail++
  } catch (e) {
    if (expect && !e.message.includes(expect)) {
      console.log('  ✖', name, '→ 다른 오류:', e.message)
      fail++
    } else {
      console.log('  ✔', name, '→', e.message)
      pass++
    }
  }
}
const one = (r) => r.rows[0]

let room, ping, pong, poll, code, tpl, rs
console.log('\n[강의실]')
await ok('강사가 강의실 생성(상태·코드는 서버가 정함)', async () => {
  room = one(await as('host', `insert into rooms (title, status, code, collect_phone, controller_name) values ('테스트 강의', 'live', 'ABCDEF', true, '핑퐁교육원') returning *`))
  if (room.status !== 'draft' || room.code !== null || room.registration !== 'off') throw new Error(JSON.stringify([room.status, room.code, room.registration]))
  if (!/^[0-9a-f]{12}$/.test(room.reg_token)) throw new Error(room.reg_token)
  return [room.status, room.reg_token.length]
})
await rejects('익명 사용자는 강의실 생성 불가', () => as('s1', `insert into rooms (title) values ('x') returning id`), 'row-level security')
await rejects('강사 1명은 열린 강의실 1개만(2번째 거부)', () => as('host', `insert into rooms (title) values ('두 번째') returning id`), 'room_limit')
await ok('다른 강사는 따로 1개 생성 가능', async () => {
  const r = one(await as('other', `insert into rooms (title) values ('다른 강사 강의') returning id`))
  await as('other', `delete from rooms where id = $1`, [r.id])
  return true
})
await ok('준비 중 강의실을 지우면 다시 만들 수 있음(하루 3개까지)', async () => {
  const r2 = one(await as('other', `insert into rooms (title) values ('2') returning id`))
  await as('other', `delete from rooms where id = $1`, [r2.id])
  const r3 = one(await as('other', `insert into rooms (title) values ('3') returning id`))
  await as('other', `delete from rooms where id = $1`, [r3.id])
  return 3
})
await rejects('24시간 안에 4번째 생성 거부(만들고 지우기 반복 방지)', () => as('other', `insert into rooms (title) values ('4') returning id`), 'room_daily_limit')
await ok('생성 기록은 클라이언트가 못 봄·못 지움', async () => {
  const a = (await as('other', `select * from room_creations`)).rows.length
  const b = (await as('other', `delete from room_creations`)).affectedRows ?? 0
  if (a || b) throw new Error(`${a}/${b}`)
  return 0
})
await ok('강사가 핑 생성(sort_order 자동, ping_id=id)', async () => {
  ping = one(await as('host', `insert into nodes (room_id, type, content) values ($1, 'ping', '첫 질문') returning *`, [room.id]))
  if (ping.ping_id !== ping.id) throw new Error('ping_id')
  return ping.sort_order
})
await rejects('강사가 상태 컬럼 직접 수정 불가', () => as('host', `update rooms set status = 'live' where id = $1`, [room.id]), 'permission denied')

console.log('\n[참석자 등록 링크]')
await rejects('개인정보처리자 없이 등록 폼 열기 거부', async () => {
  await as('host', `update rooms set controller_name = '' where id = $1`, [room.id])
  return as('host', `update rooms set registration = 'open' where id = $1`, [room.id])
}, 'controller_required')
await ok('등록 폼 열기(준비 중에도) → 30일 파기 기한', async () => {
  const r = one(await as('host', `update rooms set controller_name = '핑퐁교육원', registration = 'open' where id = $1 returning registration, purge_pii_at`, [room.id]))
  return [r.registration, Math.round((new Date(r.purge_pii_at) - Date.now()) / 86400000)]
})
await ok('registration_lookup(토큰) → 공개 정보만', async () => {
  const r = one(await as('s1', `select registration_lookup($1) r`, [room.reg_token])).r
  if (r.code !== null || 'host_id' in r) throw new Error('leak')
  return [r.title, r.registration, r.room_status]
})
await ok('틀린 토큰은 null', async () => one(await as('s1', `select registration_lookup('000000000000') r`)).r)
await ok('s1 강의 전 등록(링크)', async () =>
  one(
    await as('s1', `select (register_by_token($1, $2::jsonb)).name as n`, [
      room.reg_token,
      JSON.stringify({ org: '행안부', dept: '디지털', name: '김민준', phone: '010-1234-5678', consent_required: true, consent_optional: true }),
    ]),
  ).n,
)
await rejects('필수 동의 없으면 거부', () => as('s2', `select register_by_token($1, $2::jsonb)`, [room.reg_token, JSON.stringify({ org: 'a', dept: 'b', name: 'c', consent_required: false })]), 'consent_required')
await ok('s1 은 본인 등록 정보만 보임', async () => (await as('s1', `select name, phone from participants`)).rows)
await ok('s2 는 남의 등록 정보를 못 봄', async () => {
  const r = (await as('s2', `select * from participants`)).rows
  if (r.length) throw new Error('leak')
  return 0
})
await ok('강사는 등록 정보를 봄', async () => (await as('host', `select count(*)::int n from participants`)).rows[0].n)
await ok('등록 마감 → 링크 등록 거부', async () => {
  await as('host', `update rooms set registration = 'closed' where id = $1`, [room.id])
  try {
    await as('s2', `select register_by_token($1, $2::jsonb)`, [room.reg_token, JSON.stringify({ org: 'a', dept: 'b', name: 'c', consent_required: true })])
    throw new Error('등록됨')
  } catch (e) {
    if (!e.message.includes('registration_closed')) throw e
  }
  await as('host', `update rooms set registration = 'open' where id = $1`, [room.id])
  return 'registration_closed'
})

console.log('\n[입장]')
await ok('start_room → 코드 발급', async () => {
  const r = one(await as('host', `select * from start_room($1)`, [room.id]))
  code = r.code
  if (!/^[1-9][0-9]{5}$/.test(code)) throw new Error(code)
  return code
})
await rejects('다른 강사는 start/extend 불가', () => as('other', `select extend_room($1, 2)`, [room.id]), 'not_allowed')
await ok('room_lookup(띄어 쓴 코드도 숫자만 비교)', async () => one(await as('s1', `select room_lookup($1) as r`, [`${code.slice(0, 3)} ${code.slice(3)}`])).r.title)
await ok('틀린 코드 → null(기록됨)', async () => {
  const wrong = code === '100000' ? '100001' : '100000'
  const r = one(await as('other', `select room_lookup($1) as r`, [wrong])).r
  if (r !== null) throw new Error(JSON.stringify(r))
  return null
})
await rejects(
  '틀린 코드 20번 → 10분 동안 막힘(맞는 코드도)',
  async () => {
    for (let i = 0; i < 19; i++) await as('other', `select room_lookup($1)`, [String(100000 + ((Number(code) + 1 + i) % 900000))])
    return as('other', `select room_lookup($1)`, [code])
  },
  'too_many_attempts',
)
await rejects('막힌 사람은 join_room 도 불가', () => as('other', `select join_room($1, '봇')`, [code]), 'too_many_attempts')
await ok('틀린 기록은 클라이언트가 못 읽음', async () => {
  try {
    const r = await as('other', `select * from code_attempts`)
    return r.rows.length
  } catch (e) {
    return e.message.includes('permission') ? 'permission denied' : Promise.reject(e)
  }
})
await ok('진행 중이면 등록 링크가 입장 코드를 알려 줌', async () => one(await as('s2', `select registration_lookup($1) r`, [room.reg_token])).r.code === code)
await ok('s1 입장(join_room) — 미리 한 등록과 이어짐', async () => {
  const id = one(await as('s1', `select join_room($1, '초록펭귄') as id`, [code])).id
  const n = one(await as('host', `select count(*)::int n from participants p join room_members m using (room_id, user_id) where p.room_id = $1`, [room.id])).n
  return [id === room.id, n]
})
await rejects('같은 닉네임 거부', () => as('s2', `select join_room($1, '초록펭귄')`, [code]), 'nickname_taken')
await ok('s2 등록 없이 입장', async () => one(await as('s2', `select join_room($1, '파란고래') as id`, [code])).id === room.id)
await ok('익명 anon 역할은 테이블 접근 불가', async () => {
  await db.exec(`set role anon`)
  try {
    await db.query(`select * from rooms`)
    throw new Error('anon 이 읽음')
  } catch (e) {
    if (!e.message.includes('permission denied')) throw e
    return 'permission denied'
  } finally {
    await db.exec('reset role')
  }
})

console.log('\n[핑·퐁·리플]')
await ok('포커스 전에는 교육생에게 핑이 안 보임', async () => {
  const n = (await as('s1', `select * from nodes`)).rows.length
  if (n) throw new Error(n)
  return 0
})
await rejects('공개 전 핑에 퐁 불가', () => as('s1', `insert into nodes (room_id, type, parent_id, content) values ($1, 'pong', $2, 'x') returning id`, [room.id, ping.id]), 'ping_not_open')
await ok('포커스 → opened_at 설정', async () => {
  await as('host', `update rooms set active_ping_id = $1 where id = $2`, [ping.id, room.id])
  return !!one(await as('s1', `select opened_at from nodes where id = $1`, [ping.id])).opened_at
})
await ok('s1 퐁 작성(닉네임 자동)', async () => {
  pong = one(await as('s1', `insert into nodes (room_id, type, parent_id, content) values ($1, 'pong', $2, '매주 보고서 정리요') returning *`, [room.id, ping.id]))
  return [pong.author_nickname, pong.ping_id === ping.id]
})
await rejects('교육생은 핑 작성 불가', () => as('s1', `insert into nodes (room_id, type, content) values ($1, 'ping', 'x') returning id`, [room.id]), 'row-level security')
await rejects(
  '리플에 리플 불가',
  async () => {
    const r = one(await as('s2', `insert into nodes (room_id, type, parent_id, content) values ($1, 'reply', $2, '@초록펭귄 저도요') returning *`, [room.id, pong.id]))
    return as('s1', `insert into nodes (room_id, type, parent_id, content) values ($1, 'reply', $2, 'x') returning id`, [room.id, r.id])
  },
  'reply_parent_must_be_pong',
)
await rejects('1,000자 초과 거부', () => as('s1', `insert into nodes (room_id, type, parent_id, content) values ($1, 'pong', $2, repeat('가', 1001)) returning id`, [room.id, ping.id]), 'content_too_long')
await rejects(
  'javascript: 링크 거부',
  () => as('s1', `insert into nodes (room_id, type, parent_id, content, attachments) values ($1, 'pong', $2, 'x', '[{"kind":"link","url":"javascript:alert(1)","name":"x"}]') returning id`, [room.id, ping.id]),
  'invalid_attachment',
)
await ok('남의 글 수정은 0행', async () => {
  const r = await as('s2', `update nodes set content = '해킹' where id = $1`, [pong.id])
  if (r.affectedRows) throw new Error('updated')
  return 0
})
await rejects('작성자가 마감·메타 변경 불가', () => as('s1', `update nodes set is_closed = true where id = $1`, [pong.id]), 'not_allowed')
await ok('작성자 삭제(숨김) → moderation_rev 증가', async () => {
  const before = one(await as('host', `select moderation_rev from rooms where id = $1`, [room.id])).moderation_rev
  await as('s1', `update nodes set is_hidden = true where id = $1`, [pong.id])
  const after = one(await as('host', `select moderation_rev from rooms where id = $1`, [room.id])).moderation_rev
  if (after !== before + 1) throw new Error(`${before}->${after}`)
  return after
})
await ok('숨긴 글: 교육생 0 / 강사 1', async () => [(await as('s2', `select id from nodes where id = $1`, [pong.id])).rows.length, (await as('host', `select id from nodes where id = $1`, [pong.id])).rows.length])
await rejects('작성자는 숨김을 되돌릴 수 없음', () => as('s1', `update nodes set is_hidden = false where id = $1`, [pong.id]), 'not_allowed')
await ok('작성자는 자기 숨긴 글만 보고, 다른 교육생은 못 봄', async () => [(await as('s1', `select id from nodes where id = $1`, [pong.id])).rows.length, (await as('s2', `select id from nodes where id = $1`, [pong.id])).rows.length])
await ok('강사가 퐁 마감', async () => {
  await as('host', `update nodes set is_closed = true where id = $1`, [ping.id])
  return true
})
await rejects('마감된 핑에 퐁 불가', () => as('s2', `insert into nodes (room_id, type, parent_id, content) values ($1, 'pong', $2, 'x') returning id`, [room.id, ping.id]), 'ping_closed')

console.log('\n[퀵폴]')
await rejects('선택지 1개 퀵폴 거부', () => as('host', `insert into nodes (room_id, type, content, meta) values ($1, 'poll', 'q', '{"options":[{"id":"a","label":"A"}]}') returning id`, [room.id]), 'poll_needs_2_to_6_options')
await ok('퀵폴 생성(ready)', async () => {
  poll = one(
    await as(
      'host',
      `insert into nodes (room_id, type, content, meta) values ($1, 'poll', '자주 쓰나요?', '{"options":[{"id":"a","label":"매일"},{"id":"b","label":"가끔"}],"multiple":false,"show_results":"after_close"}') returning *`,
      [room.id],
    ),
  )
  return poll.meta.status
})
await rejects('시작 전 투표 불가', () => as('s1', `insert into poll_votes (node_id, user_id, option_ids) values ($1, $2, '{a}')`, [poll.id, U.s1]), 'row-level security')
await ok('투표 시작 → opened_at 자동', async () => {
  const r = one(await as('host', `update nodes set meta = jsonb_set(meta, '{status}', '"open"') where id = $1 returning opened_at, is_closed`, [poll.id]))
  return [!!r.opened_at, r.is_closed]
})
await ok('s1·s2 투표, 변경(upsert)', async () => {
  await as('s1', `insert into poll_votes (node_id, user_id, option_ids) values ($1, $2, '{a}')`, [poll.id, U.s1])
  await as('s2', `insert into poll_votes (node_id, user_id, option_ids) values ($1, $2, '{a}')`, [poll.id, U.s2])
  await as('s2', `insert into poll_votes (node_id, user_id, option_ids) values ($1, $2, '{b}') on conflict (node_id, user_id) do update set option_ids = excluded.option_ids`, [poll.id, U.s2])
  return true
})
await ok('남의 표는 안 보임', async () => (await as('s1', `select * from poll_votes`)).rows.length)
await rejects('마감 전 교육생 결과 조회 불가', () => as('s1', `select poll_results($1)`, [poll.id]), 'results_hidden')
await ok('강사 결과', async () => one(await as('host', `select poll_results($1) r`, [poll.id])).r)
await ok('마감 → 교육생 결과 조회', async () => {
  await as('host', `update nodes set meta = jsonb_set(meta, '{status}', '"closed"') where id = $1`, [poll.id])
  return one(await as('s1', `select poll_results($1) r`, [poll.id])).r
})
await rejects('마감 후 투표 불가', () => as('s1', `update poll_votes set option_ids = '{b}' where node_id = $1 returning *`, [poll.id]).then((r) => (r.affectedRows ? r : Promise.reject(new Error('0행')))), '')

console.log('\n[퐁 반응]')
let ping2, pong2
await ok('새 핑 포커스 후 s2 퐁(메타를 꾸며 넣어도 비워짐)', async () => {
  ping2 = one(await as('host', `insert into nodes (room_id, type, content) values ($1, 'ping', '반응 시험') returning *`, [room.id]))
  await as('host', `update rooms set active_ping_id = $1 where id = $2`, [ping2.id, room.id])
  pong2 = one(await as('s2', `insert into nodes (room_id, type, parent_id, content, meta) values ($1, 'pong', $2, '반응 받을 퐁', '{"reactions":{"like":999}}') returning *`, [room.id, ping2.id]))
  if (Object.keys(pong2.meta).length) throw new Error(JSON.stringify(pong2.meta))
  return pong2.meta
})
await ok('s1 좋아요 → like 1, 내 반응 [like]', async () => one(await as('s1', `select toggle_reaction($1, 'like') r`, [pong2.id])).r)
await ok('s2·강사 좋아요, s2 웃겨요 → like 3 · laugh 1', async () => {
  await as('s2', `select toggle_reaction($1, 'like')`, [pong2.id])
  await as('host', `select toggle_reaction($1, 'like')`, [pong2.id])
  const r = one(await as('s2', `select toggle_reaction($1, 'laugh') r`, [pong2.id])).r
  if (r.reactions.like !== 3 || r.reactions.laugh !== 1 || r.mine.length !== 2) throw new Error(JSON.stringify(r))
  return r
})
await ok('다른 교육생 화면에도 개수가 보임(nodes.meta.reactions)', async () => one(await as('s1', `select meta -> 'reactions' r from nodes where id = $1`, [pong2.id])).r)
await ok('한 번 더 누르면 취소 → like 2', async () => {
  const r = one(await as('s1', `select toggle_reaction($1, 'like') r`, [pong2.id])).r
  if (r.reactions.like !== 2 || r.mine.length !== 0) throw new Error(JSON.stringify(r))
  return r.reactions
})
await ok('my_reactions 는 내 것만', async () => {
  const mine = one(await as('s2', `select my_reactions($1) r`, [room.id])).r
  const none = one(await as('s1', `select my_reactions($1) r`, [room.id])).r
  if (mine[pong2.id]?.length !== 2 || Object.keys(none).length) throw new Error(JSON.stringify([mine, none]))
  return mine
})
await ok('남의 반응 행은 안 보임', async () => (await as('s1', `select * from node_reactions`)).rows.length)
await rejects('없는 반응 거부', () => as('s1', `select toggle_reaction($1, 'angry')`, [pong2.id]), 'invalid_reaction')
await rejects('핑에는 반응 불가', () => as('s1', `select toggle_reaction($1, 'like')`, [ping2.id]), 'reaction_target_not_found')
await rejects('입장 안 한 사람 반응 불가', () => as('other', `select toggle_reaction($1, 'like')`, [pong2.id]), 'not_member')
await rejects('반응 표에 직접 쓰기 불가', () => as('s1', `insert into node_reactions (node_id, user_id, kinds) values ($1, $2, '{like}')`, [pong2.id, U.s1]), 'row-level security')
await rejects('작성자가 반응 개수 직접 수정 불가', () => as('s2', `update nodes set meta = '{"reactions":{"like":50}}' where id = $1`, [pong2.id]), 'not_allowed')

console.log('\n[설문]')
await ok('템플릿 생성', async () => {
  tpl = one(await as('host', `insert into survey_templates (title, questions) values ('만족도', '[{"id":"q1","type":"scale","title":"만족?","required":true}]') returning *`))
  return !!tpl.id
})
await rejects('익명 사용자는 템플릿 생성 불가', () => as('s1', `insert into survey_templates (title) values ('x') returning id`), 'row-level security')
await ok('강의실에 붙이기(열림)', async () => {
  rs = one(await as('host', `insert into room_surveys (room_id, template_id, title, questions, timing, anonymous, status) values ($1, $2, '만족도', $3, 'post', true, 'open') returning *`, [room.id, tpl.id, JSON.stringify(tpl.questions)]))
  return rs.status
})
await ok('s1 응답(room_id 자동) 후 수정', async () => {
  await as('s1', `insert into survey_responses (room_survey_id, user_id, answers) values ($1, $2, '{"q1":4}')`, [rs.id, U.s1])
  await as('s1', `insert into survey_responses (room_survey_id, user_id, answers) values ($1, $2, '{"q1":5}') on conflict (room_survey_id, user_id) do update set answers = excluded.answers`, [rs.id, U.s1])
  return one(await as('s1', `select answers, room_id = $1 as ok from survey_responses`, [room.id]))
})
await rejects('교육생은 결과 함수 불가', () => as('s1', `select survey_results($1)`, [rs.id]), 'not_allowed')
await ok('강사 결과(익명 → 응답자 없음)', async () => one(await as('host', `select survey_results($1) r`, [rs.id])).r)

console.log('\n[스토리지]')
await ok('참여자 업로드 허용(자기 강의실 폴더)', async () => {
  await as('s1', `insert into storage.objects (bucket_id, name) values ('rooms', $1)`, [`${room.id}/abc.jpg`])
  return true
})
await rejects('다른 폴더 업로드 거부', () => as('s1', `insert into storage.objects (bucket_id, name) values ('rooms', 'not-a-room/abc.jpg')`), 'row-level security')

console.log('\n[연장·종료]')
await ok('my_rooms', async () => (await as('host', `select member_count, ping_count, pong_count from my_rooms()`)).rows[0])
await ok('extend 3시간 → 27시간', async () => {
  const r = one(await as('host', `select * from extend_room($1, 3)`, [room.id]))
  return Math.round((new Date(r.expires_at) - new Date(r.started_at)) / 3600000)
})
await ok('48시간 상한', async () => {
  await as('host', `select * from extend_room($1, 24)`, [room.id])
  const r = one(await as('host', `select * from rooms where id = $1`, [room.id]))
  return Math.round((new Date(r.expires_at) - new Date(r.started_at)) / 3600000)
})
await rejects('상한을 넘는 연장 거부', () => as('host', `select * from extend_room($1, 1)`, [room.id]), 'extension_limit')
await ok('close_room → 종료, 7일 뒤 파기', async () => {
  const r = one(await as('host', `select * from close_room($1)`, [room.id]))
  return [r.status, Math.round((new Date(r.purge_pii_at) - new Date(r.closed_at)) / 86400000)]
})
await rejects('종료 후 퐁 불가', () => as('s2', `insert into nodes (room_id, type, parent_id, content) values ($1, 'pong', $2, 'x') returning id`, [room.id, ping.id]), '')
await ok('종료 후 입장 불가(null)', async () => {
  const id = one(await as('s2', `select join_room($1, '새사람') as id`, [code])).id
  if (id !== null) throw new Error(id)
  return null
})
await ok('종료하면 등록 폼도 마감', async () => one(await as('host', `select registration from rooms where id = $1`, [room.id])).registration)
await rejects('종료 후 링크 등록 불가', () => as('s2', `select register_by_token($1, $2::jsonb)`, [room.reg_token, JSON.stringify({ org: 'a', dept: 'b', name: 'c', consent_required: true })]), 'registration_closed')
await ok('종료 후에는 새 강의실을 만들 수 있음', async () => {
  const r = one(await as('host', `insert into rooms (title) values ('다음 강의') returning id, status`))
  await as('host', `delete from rooms where id = $1`, [r.id])
  return r.status
})
await ok('설문 자동 닫힘', async () => one(await as('host', `select status from room_surveys where id = $1`, [rs.id])).status)
await ok('purge_pii_now', async () => {
  await as('host', `select purge_pii_now($1)`, [room.id])
  return (await as('host', `select count(*)::int n from participants`)).rows[0].n
})
await ok('종료된 강의실은 강사도 삭제 불가(파기로만)', async () => {
  const r = await as('host', `delete from rooms where id = $1`, [room.id])
  if (r.affectedRows) throw new Error('deleted')
  return 0
})
await ok('서비스 역할: 만료 종료·익명 계정 목록', async () => {
  await db.exec('set role service_role')
  try {
    const a = await db.query(`select close_expired_rooms() n`)
    const b = await db.query(`select count(*)::int n from stale_anonymous_users(10)`)
    return [a.rows[0].n, b.rows[0].n]
  } finally {
    await db.exec('reset role')
  }
})

console.log(`\n결과: ${pass} 통과, ${fail} 실패`)
process.exit(fail ? 1 : 0)
