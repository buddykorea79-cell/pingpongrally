import type { Participant, RoomMember, RosterEntry } from './types'

export type AttendanceStatus = 'present' | 'absent' | 'extra' | 'registered'

export interface AttendanceRow {
  key: string
  status: AttendanceStatus
  participant: Participant | null
  roster: RosterEntry | null
  nickname: string | null
}

/**
 * 사전 명단 대조(6.5): 성명 + 휴대폰 뒤 4자리, 없으면 기관 + 성명.
 * 명단이 없으면 등록자는 모두 'registered'.
 */
export function matchAttendance(participants: Participant[], roster: RosterEntry[], members: RoomMember[]) {
  const nickOf = new Map(members.map((m) => [m.user_id, m.nickname]))
  const used = new Set<string>()
  const byId = new Map(roster.map((r) => [r.id, r]))
  const rows: AttendanceRow[] = []

  const find = (p: Participant): RosterEntry | null => {
    if (p.roster_id && byId.has(p.roster_id) && !used.has(p.roster_id)) return byId.get(p.roster_id)!
    const last4 = p.phone ? p.phone.replace(/\D/g, '').slice(-4) : null
    const candidates = roster.filter((r) => !used.has(r.id) && r.name.trim() === p.name.trim())
    return candidates.find((r) => r.phone_last4 && last4 && r.phone_last4 === last4) ?? candidates.find((r) => r.org.trim() === p.org.trim()) ?? null
  }

  for (const p of participants) {
    const r = roster.length ? find(p) : null
    if (r) used.add(r.id)
    rows.push({
      key: p.id,
      status: roster.length === 0 ? 'registered' : r ? 'present' : 'extra',
      participant: p,
      roster: r,
      nickname: nickOf.get(p.user_id) ?? null,
    })
  }
  for (const r of roster) {
    if (!used.has(r.id)) rows.push({ key: r.id, status: 'absent', participant: null, roster: r, nickname: null })
  }
  const stats = {
    present: rows.filter((r) => r.status === 'present').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    extra: rows.filter((r) => r.status === 'extra').length,
    registered: participants.length,
    roster: roster.length,
    members: members.length,
  }
  return { rows, stats }
}

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: '출석',
  absent: '미출석',
  extra: '명단 외',
  registered: '등록',
}

const HEADER_ALIASES: Record<'org' | 'dept' | 'name' | 'phone', RegExp> = {
  org: /기관|소속|org/i,
  dept: /부서|dept|팀/i,
  name: /성명|이름|name/i,
  phone: /휴대|전화|phone|뒤\s*4|끝\s*4/i,
}

function rowsToRoster(rows: string[][]): Omit<RosterEntry, 'id' | 'room_id'>[] {
  if (rows.length === 0) return []
  const header = rows[0].map((h) => String(h ?? '').trim())
  const col = (k: keyof typeof HEADER_ALIASES) => header.findIndex((h) => HEADER_ALIASES[k].test(h))
  let ci = { org: col('org'), dept: col('dept'), name: col('name'), phone: col('phone') }
  let body = rows.slice(1)
  if (ci.name < 0) {
    // 머리글이 없으면 기관·부서·성명·휴대폰 순서로 본다
    ci = { org: 0, dept: 1, name: 2, phone: 3 }
    body = rows
  }
  const out: Omit<RosterEntry, 'id' | 'room_id'>[] = []
  for (const r of body) {
    const name = String(r[ci.name] ?? '').trim()
    if (!name) continue
    const digits = String(ci.phone >= 0 ? (r[ci.phone] ?? '') : '').replace(/\D/g, '')
    out.push({
      org: String(ci.org >= 0 ? (r[ci.org] ?? '') : '').trim().slice(0, 60),
      dept: String(ci.dept >= 0 ? (r[ci.dept] ?? '') : '').trim().slice(0, 60),
      name: name.slice(0, 40),
      phone_last4: digits.length >= 4 ? digits.slice(-4) : null,
    })
  }
  return out
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (c === '"') q = false
      else field += c
    } else if (c === '"') q = true
    else if (c === ',') {
      cur.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      cur.push(field)
      rows.push(cur)
      cur = []
      field = ''
    } else field += c
  }
  if (field || cur.length) {
    cur.push(field)
    rows.push(cur)
  }
  return rows.filter((r) => r.some((x) => x.trim()))
}

/** 명단 파일(.xlsx 또는 .csv)을 읽는다 */
export async function parseRosterFile(file: File) {
  if (/\.csv$/i.test(file.name)) {
    return rowsToRoster(parseCsv((await file.text()).replace(/^﻿/, '')))
  }
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await file.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []
  const rows: string[][] = []
  ws.eachRow((row) => {
    const vals = (row.values as unknown[]).slice(1).map((v) => {
      if (v && typeof v === 'object' && 'text' in (v as object)) return String((v as { text: unknown }).text)
      if (v && typeof v === 'object' && 'result' in (v as object)) return String((v as { result: unknown }).result)
      return v === null || v === undefined ? '' : String(v)
    })
    rows.push(vals)
  })
  return rowsToRoster(rows)
}
