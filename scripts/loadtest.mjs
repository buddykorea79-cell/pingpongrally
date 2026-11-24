#!/usr/bin/env node
// =====================================================================
// 부하 테스트(설계서 15.1)
//   가짜 교육생 N명이 익명 로그인 → join_room → 채널 구독 후,
//   20초 안에 모두 퐁을 1개씩 보내고 각 클라이언트가 받은 글 수와 지연 시간을 잰다.
//
//   준비
//   1) Supabase Auth 에서 익명 로그인 IP 한도를 먼저 올린다(기본 30/시간 → 300 정도).
//      Turnstile 을 켰다면 테스트하는 동안만 잠시 끈다.
//   2) 강사 화면에서 강의를 시작하고, 핑 하나를 [포커스] 해 둔다.
//
//   실행
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/loadtest.mjs --code 777777 --clients 60
//   (npm run loadtest -- --code 777777 --clients 100)
//
//   통과 기준: 연결이 끊기지 않고, 새 글이 2초 안에 모든 화면에 나타남
// =====================================================================
import { createClient } from '@supabase/supabase-js'
import { parseArgs } from 'node:util'
import { readFileSync, existsSync } from 'node:fs'

// .env 에 있는 VITE_ 값도 읽어 준다
if (existsSync('.env')) {
  for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*(?:VITE_)?(SUPABASE_URL|SUPABASE_ANON_KEY)\s*=\s*(.+)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
}

const { values } = parseArgs({
  options: {
    code: { type: 'string' },
    clients: { type: 'string', default: '60' },
    window: { type: 'string', default: '20' },
    wait: { type: 'string', default: '10' },
  },
})

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY
if (!URL || !KEY || !values.code) {
  console.error('사용법: SUPABASE_URL=... SUPABASE_ANON_KEY=... node scripts/loadtest.mjs --code ABC123 [--clients 60] [--window 20]')
  process.exit(1)
}

const N = Number(values.clients)
const WINDOW = Number(values.window) * 1000
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const pct = (arr, p) => {
  if (!arr.length) return 0
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

const sent = new Map() // content -> sentAt
const clients = []
let disconnects = 0
let errors = 0

console.log(`▶ 가짜 교육생 ${N}명 준비 중 (코드 ${values.code})`)
const t0 = Date.now()

for (let i = 0; i < N; i++) {
  const sb = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const c = { i, sb, received: new Map(), roomId: null, status: 'init' }
  clients.push(c)
  ;(async () => {
    try {
      const { error: authErr } = await sb.auth.signInAnonymously()
      if (authErr) throw authErr
      const { data: roomId, error } = await sb.rpc('join_room', { p_code: values.code, p_nickname: `부하${String(i).padStart(3, '0')}` })
      if (error) throw error
      c.roomId = roomId
      await new Promise((resolve) => {
        sb.channel(`room:${roomId}`)
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nodes', filter: `room_id=eq.${roomId}` }, (payload) => {
            const at = Date.now()
            const content = payload.new.content
            if (sent.has(content) && !c.received.has(content)) c.received.set(content, at - sent.get(content))
          })
          .subscribe((status) => {
            c.status = status
            if (status === 'SUBSCRIBED') resolve()
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              disconnects++
              resolve()
            }
          })
      })
    } catch (e) {
      errors++
      c.status = `error: ${e.message}`
    }
  })()
  await sleep(40) // 동시 입장을 살짝 흩는다
}

// 모두 구독될 때까지 대기
for (let k = 0; k < 60; k++) {
  const ready = clients.filter((c) => c.status === 'SUBSCRIBED').length
  process.stdout.write(`\r  구독 ${ready}/${N}  오류 ${errors}`)
  if (ready + errors >= N) break
  await sleep(500)
}
console.log(`\n✔ 준비 ${((Date.now() - t0) / 1000).toFixed(1)}초`)

const live = clients.filter((c) => c.status === 'SUBSCRIBED')
if (!live.length) {
  console.error('구독에 성공한 클라이언트가 없어요. 익명 로그인 한도·코드를 확인해 주세요.')
  process.exit(1)
}

// 현재 포커스한 핑 찾기
const { data: room } = await live[0].sb.from('rooms').select('active_ping_id').eq('id', live[0].roomId).single()
if (!room?.active_ping_id) {
  console.error('포커스한 핑이 없어요. 강사 화면에서 핑을 [포커스] 해 주세요.')
  process.exit(1)
}

console.log(`▶ ${values.window}초 안에 ${live.length}명이 퐁을 보냅니다`)
await Promise.all(
  live.map(async (c) => {
    await sleep(Math.random() * WINDOW)
    const content = `부하 테스트 ${c.i} ${Math.random().toString(36).slice(2, 8)}`
    sent.set(content, Date.now())
    const { error } = await c.sb.from('nodes').insert({ room_id: c.roomId, type: 'pong', parent_id: room.active_ping_id, content })
    if (error) {
      errors++
      sent.delete(content)
      console.error(`\n  ✖ 클라이언트 ${c.i}: ${error.message}`)
    }
  }),
)

console.log(`▶ 수신 대기 ${values.wait}초`)
await sleep(Number(values.wait) * 1000)

const latencies = live.flatMap((c) => [...c.received.values()])
const expected = sent.size * live.length
const got = latencies.length
const within2s = latencies.filter((l) => l <= 2000).length

console.log('\n================ 결과 ================')
console.log(`클라이언트       ${live.length}/${N} 구독 (오류 ${errors}, 끊김 ${disconnects})`)
console.log(`보낸 퐁          ${sent.size}`)
console.log(`받은 이벤트      ${got}/${expected} (${expected ? ((got / expected) * 100).toFixed(1) : 0}%)`)
console.log(`지연 p50 / p95   ${pct(latencies, 50)}ms / ${pct(latencies, 95)}ms (최대 ${Math.max(0, ...latencies)}ms)`)
console.log(`2초 안 도착      ${expected ? ((within2s / expected) * 100).toFixed(1) : 0}%`)
const pass = disconnects === 0 && expected > 0 && within2s === expected
console.log(pass ? '✅ 통과: 끊김 없음, 모든 글이 2초 안에 도착' : '⚠️  기준 미달: Realtime 로그에서 tenant_events 한도 오류를 확인하고 12.1의 Broadcast 전환을 검토하세요.')
console.log('=====================================')

for (const c of clients) await c.sb.removeAllChannels().catch(() => {})
process.exit(pass ? 0 : 2)
