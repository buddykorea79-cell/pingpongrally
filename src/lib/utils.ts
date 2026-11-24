import clsx, { type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// 디자인 토큰(text-fg-2, shadow-card 등)도 올바르게 덮어쓰도록 알려 준다.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [{ shadow: ['card', 'raised', 'pop', 'glow-ping', 'glow-pong'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/** 입장 코드는 숫자 6자리(100000~999999). 입력에서 숫자만 남긴다('123 456', '123-456' 도 받아 준다). */
export function normalizeCode(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, 6)
}

/** 새 입장 코드(데모용). 운영에서는 서버 generate_room_code 가 만든다. */
export function randomCode(): string {
  const buf = new Uint32Array(1)
  crypto.getRandomValues(buf)
  return String(100000 + (buf[0] % 900000))
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

const rtf = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' })

export function timeAgo(iso: string, now = Date.now()): string {
  const diff = (new Date(iso).getTime() - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45) return '방금'
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour')
  return rtf.format(Math.round(diff / 86400), 'day')
}

export function formatDateTime(iso: string | null | undefined, opts: { withYear?: boolean } = {}): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return new Intl.DateTimeFormat('ko-KR', {
    year: opts.withYear ? 'numeric' : undefined,
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
}

export function formatShortDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ko-KR', { month: 'numeric', day: 'numeric', weekday: 'short' }).format(new Date(iso))
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso))
}

/** 남은 시간을 'n시간 m분' 형식으로 */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return '종료됨'
  const totalMin = Math.floor(ms / 60000)
  const d = Math.floor(totalMin / 1440)
  if (d >= 2) {
    const h = Math.floor((totalMin % 1440) / 60)
    return h ? `${d}일 ${h}시간` : `${d}일`
  }
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h > 0) return m ? `${h}시간 ${m}분` : `${h}시간`
  if (m > 0) return `${m}분`
  return '1분 미만'
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return ''
  if (n < 1024) return `${n}B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`
  return `${(n / 1024 / 1024).toFixed(1)}MB`
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return ''
  const m = phone.match(/^(\d{3})-?(\d{3,4})-?(\d{4})$/)
  if (!m) return phone.replace(/\d(?=\d{4})/g, '*')
  return `${m[1]}-${'*'.repeat(m[2].length)}-${m[3]}`
}

export function formatPhoneInput(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length < 4) return d
  if (d.length < 8) return `${d.slice(0, 3)}-${d.slice(3)}`
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`
}

export const PHONE_RE = /^010-\d{4}-\d{4}$/

export function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function normalizeUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  const withProto = /^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`
  return isSafeUrl(withProto) ? withProto : null
}

export function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

export function summarize(text: string, max = 60): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function pluralCount(n: number): string {
  return n.toLocaleString('ko-KR')
}

export function safeFileName(s: string): string {
  return s.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim().slice(0, 80) || 'untitled'
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export function todayStamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

/** 한글 IME 조합 중 Enter 를 무시한다(설계서 5.2) */
export function isSubmitEnter(e: React.KeyboardEvent): boolean {
  if (e.key !== 'Enter') return false
  if (e.nativeEvent.isComposing || e.keyCode === 229) return false
  return !e.shiftKey
}
