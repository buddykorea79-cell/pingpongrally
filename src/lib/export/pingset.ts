import type { Attachment, PingSetItem, PollMeta } from '../types'
import { isSafeUrl } from '../utils'

/**
 * rally.json(8.1 내보내기) 또는 핑 세트 .json 을 읽어 핑 세트 항목으로 바꾼다.
 * 첨부는 링크만 다시 쓴다(파일은 원본 서버에서 지워지므로).
 */
export function parsePingSetFile(raw: string): { title: string; pings: PingSetItem[] } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('JSON 파일을 읽지 못했어요.')
  }
  if (!data || typeof data !== 'object') throw new Error('형식이 올바르지 않아요.')
  const d = data as { room_title?: string; title?: string; pings?: unknown[] }
  if (!Array.isArray(d.pings)) throw new Error('pings 목록이 없어요. PingPongRally에서 내보낸 rally.json 인지 확인해 주세요.')
  const pings: PingSetItem[] = []
  for (const p of d.pings) {
    if (!p || typeof p !== 'object') continue
    const item = p as { type?: string; content?: string; attachments?: Attachment[]; meta?: Partial<PollMeta>; poll?: { options?: { id: string; label: string }[]; multiple?: boolean } }
    const content = String(item.content ?? '').slice(0, 2000)
    const links = (item.attachments ?? []).filter((a) => a && a.kind === 'link' && isSafeUrl(a.url)).map((a) => ({ kind: 'link' as const, url: a.url, name: a.name || a.url }))
    const options = item.meta?.options ?? item.poll?.options
    if ((item.type === 'poll' || options) && options && options.length >= 2) {
      pings.push({
        type: 'poll',
        content,
        attachments: links,
        meta: { options: options.slice(0, 6).map((o, i) => ({ id: o.id || `o${i + 1}`, label: String(o.label) })), multiple: Boolean(item.meta?.multiple ?? item.poll?.multiple), show_results: item.meta?.show_results === 'live' ? 'live' : 'after_close' },
      })
    } else if (content.trim()) {
      pings.push({ type: 'ping', content, attachments: links })
    }
  }
  if (pings.length === 0) throw new Error('가져올 핑이 없어요.')
  return { title: String(d.title ?? d.room_title ?? '가져온 템플릿').slice(0, 100), pings }
}
