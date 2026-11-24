// 엑셀 내보내기(출석부·설문 결과). ExcelJS 는 무거우므로 필요할 때만 불러온다.
import type { Room, RoomSurvey, SurveyResultRow } from '../types'
import type { AttendanceRow } from '../attendance'
import { STATUS_LABEL } from '../attendance'
import { answerText } from '@/components/survey/SurveyForm'
import { downloadBlob, formatDateTime, maskPhone, safeFileName, todayStamp } from '../utils'

type Workbook = import('exceljs').Workbook
type Worksheet = import('exceljs').Worksheet

async function newBook(): Promise<Workbook> {
  const { default: ExcelJS } = await import('exceljs')
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PingPongRally'
  wb.created = new Date()
  return wb
}

function styleHeader(ws: Worksheet) {
  const row = ws.getRow(1)
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF14171F' } }
  row.alignment = { vertical: 'middle' }
  row.height = 22
  ws.views = [{ state: 'frozen', ySplit: 1 }]
}

async function save(wb: Workbook, name: string) {
  const buf = await wb.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), name)
}

export async function downloadAttendance(room: Room, rows: AttendanceRow[], showPhone: boolean) {
  const wb = await newBook()
  const ws = wb.addWorksheet('출석부')
  ws.columns = [
    { header: '상태', key: 'status', width: 10 },
    { header: '소속 기관', key: 'org', width: 22 },
    { header: '부서', key: 'dept', width: 20 },
    { header: '성명', key: 'name', width: 12 },
    { header: '휴대폰', key: 'phone', width: 16 },
    { header: '닉네임', key: 'nick', width: 14 },
    { header: '등록 시각', key: 'at', width: 22 },
    { header: '동의 문안 버전', key: 'ver', width: 14 },
    { header: '선택 동의(휴대폰)', key: 'opt', width: 18 },
  ]
  styleHeader(ws)
  for (const r of rows) {
    const p = r.participant
    ws.addRow({
      status: STATUS_LABEL[r.status],
      org: p?.org ?? r.roster?.org ?? '',
      dept: p?.dept ?? r.roster?.dept ?? '',
      name: p?.name ?? r.roster?.name ?? '',
      phone: p?.phone ? (showPhone ? p.phone : maskPhone(p.phone)) : r.roster?.phone_last4 ? `****-${r.roster.phone_last4}` : '',
      nick: r.nickname ?? '',
      at: p ? formatDateTime(p.created_at, { withYear: true }) : '',
      ver: p ? `v${p.consent_version}` : '',
      opt: p ? (p.consent_optional_at ? '동의' : '-') : '',
    })
  }
  const info = wb.addWorksheet('안내')
  info.columns = [{ width: 90 }]
  ;[
    `강의: ${room.title}`,
    `내보낸 시각: ${formatDateTime(new Date().toISOString(), { withYear: true })}`,
    '',
    '이 파일에는 개인정보가 들어 있습니다.',
    '· 출석 확인 목적 외에는 쓰지 말고, 필요한 기간이 지나면 지워 주세요.',
    '· 메일·메신저로 보낼 때는 암호를 걸고, 공용 폴더에 두지 마세요.',
    `· 서버의 원본은 ${formatDateTime(room.purge_pii_at, { withYear: true })}에 자동 파기됩니다.`,
  ].forEach((t, i) => {
    info.addRow([t])
    if (i === 3) info.getRow(i + 1).font = { bold: true, color: { argb: 'FFE5484D' } }
  })
  await save(wb, `출석부_${safeFileName(room.title)}_${todayStamp()}_개인정보 포함.xlsx`)
}

export async function downloadRosterTemplate() {
  const wb = await newBook()
  const ws = wb.addWorksheet('명단')
  ws.columns = [
    { header: '소속 기관', key: 'org', width: 22 },
    { header: '부서', key: 'dept', width: 20 },
    { header: '성명', key: 'name', width: 12 },
    { header: '휴대폰 뒤 4자리', key: 'p4', width: 16 },
  ]
  styleHeader(ws)
  ws.addRow({ org: '예시기관', dept: '예시부서', name: '홍길동', p4: '1234' })
  await save(wb, '사전명단_양식.xlsx')
}

export async function downloadSurveyResults(room: Room, survey: RoomSurvey, rows: SurveyResultRow[]) {
  const wb = await newBook()
  const ws = wb.addWorksheet('응답')
  const qs = survey.questions
  const fixed = survey.anonymous
    ? [{ header: '순번', key: 'no', width: 8 }]
    : [
        { header: '닉네임', key: 'nick', width: 14 },
        { header: '소속 기관', key: 'org', width: 20 },
        { header: '부서', key: 'dept', width: 18 },
        { header: '성명', key: 'name', width: 12 },
      ]
  ws.columns = [
    ...fixed,
    { header: '제출 시각', key: 'at', width: 22 },
    ...qs.map((q, i) => ({ header: `Q${i + 1}. ${q.title}`, key: q.id, width: q.type === 'long' ? 50 : 24 })),
  ]
  styleHeader(ws)
  rows.forEach((r, i) => {
    const base: Record<string, unknown> = survey.anonymous
      ? { no: i + 1 }
      : { nick: r.respondent?.nickname ?? '', org: r.respondent?.org ?? '', dept: r.respondent?.dept ?? '', name: r.respondent?.name ?? '' }
    base.at = survey.anonymous ? '' : formatDateTime(r.submitted_at, { withYear: true })
    for (const q of qs) {
      const a = r.answers[q.id]
      base[q.id] = q.type === 'scale' && typeof a === 'number' ? a : answerText(q, a)
    }
    ws.addRow(base)
  })
  ws.getColumn(fixed.length + 1).hidden = survey.anonymous

  const sum = wb.addWorksheet('요약')
  sum.columns = [
    { header: '문항', key: 'q', width: 50 },
    { header: '항목', key: 'k', width: 30 },
    { header: '응답 수', key: 'n', width: 10 },
    { header: '비율', key: 'p', width: 10 },
  ]
  styleHeader(sum)
  qs.forEach((q, i) => {
    const title = `Q${i + 1}. ${q.title}`
    const answered = rows.filter((r) => answerText(q, r.answers[q.id]) !== '')
    if (q.type === 'single' || q.type === 'multiple') {
      const counts = new Map<string, number>()
      for (const o of q.options ?? []) counts.set(o, 0)
      for (const r of answered) {
        const t = answerText(q, r.answers[q.id])
        const parts = q.type === 'multiple' ? t.split(', ') : [t]
        for (const p of parts) {
          const key = p.startsWith('기타') ? '기타' : p
          counts.set(key, (counts.get(key) ?? 0) + 1)
        }
      }
      for (const [k, n] of counts) sum.addRow({ q: title, k, n, p: answered.length ? `${Math.round((n / answered.length) * 100)}%` : '0%' })
    } else if (q.type === 'scale') {
      const nums = answered.map((r) => Number(r.answers[q.id])).filter((n) => !Number.isNaN(n))
      const avg = nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0
      sum.addRow({ q: title, k: `평균 ${avg.toFixed(2)} (${q.scale?.min ?? 1}~${q.scale?.max ?? 5})`, n: nums.length, p: '' })
      for (let v = q.scale?.min ?? 1; v <= (q.scale?.max ?? 5); v++) {
        const n = nums.filter((x) => x === v).length
        sum.addRow({ q: '', k: String(v), n, p: nums.length ? `${Math.round((n / nums.length) * 100)}%` : '0%' })
      }
    } else {
      sum.addRow({ q: title, k: '텍스트 응답', n: answered.length, p: '' })
    }
  })
  const pii = !survey.anonymous
  await save(wb, `설문결과_${safeFileName(survey.title)}_${safeFileName(room.title)}_${todayStamp()}${pii ? '_개인정보 포함' : ''}.xlsx`)
}
