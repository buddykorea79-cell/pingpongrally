import type { RallyNode } from './types'

export interface RallyIndex {
  pings: RallyNode[]
  pongsByPing: Map<string, RallyNode[]>
  repliesByPong: Map<string, RallyNode[]>
  byId: Map<string, RallyNode>
}

/** 핑 → 퐁 → 리플 3단 트리를 한 번에 정리한다. 숨긴 퐁 아래 리플도 함께 감춘다. */
export function indexRally(nodes: RallyNode[], opts: { includeHidden?: boolean } = {}): RallyIndex {
  const byId = new Map<string, RallyNode>()
  for (const n of nodes) byId.set(n.id, n)
  const visible = (n: RallyNode) => opts.includeHidden || !n.is_hidden
  const pings: RallyNode[] = []
  const pongsByPing = new Map<string, RallyNode[]>()
  const repliesByPong = new Map<string, RallyNode[]>()
  for (const n of nodes) {
    if (!visible(n)) continue
    if (n.type === 'ping' || n.type === 'poll') pings.push(n)
    else if (n.type === 'pong' && n.parent_id) {
      const arr = pongsByPing.get(n.parent_id) ?? []
      arr.push(n)
      pongsByPing.set(n.parent_id, arr)
    } else if (n.type === 'reply' && n.parent_id) {
      const parent = byId.get(n.parent_id)
      if (parent && !visible(parent)) continue
      const arr = repliesByPong.get(n.parent_id) ?? []
      arr.push(n)
      repliesByPong.set(n.parent_id, arr)
    }
  }
  pings.sort((a, b) => a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at))
  for (const arr of pongsByPing.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const arr of repliesByPong.values()) arr.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return { pings, pongsByPing, repliesByPong, byId }
}

export function rallyCount(idx: RallyIndex, pingId: string) {
  const pongs = idx.pongsByPing.get(pingId) ?? []
  const replies = pongs.reduce((s, p) => s + (idx.repliesByPong.get(p.id)?.length ?? 0), 0)
  return { pongs: pongs.length, replies }
}

export function pingLabel(idx: RallyIndex, ping: RallyNode): string {
  const n = idx.pings.filter((p) => p.type === ping.type).findIndex((p) => p.id === ping.id) + 1
  return ping.type === 'poll' ? `퀵폴 ${n}` : `핑 ${n}`
}

/** @닉네임 멘션을 강조해 그리기 위해 조각낸다 */
export function splitMentions(text: string): { text: string; mention: boolean }[] {
  const out: { text: string; mention: boolean }[] = []
  const re = /@([0-9A-Za-z가-힣_]{2,12})/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), mention: false })
    out.push({ text: m[0], mention: true })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), mention: false })
  return out
}

/** 본문 속 http(s) 주소를 링크로 그리기 위해 조각낸다(HTML 로 렌더링하지 않는다) */
export function splitLinks(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = []
  const re = /https?:\/\/[^\s<>"']+[^\s<>"'.,!?)\]]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) })
    out.push({ text: m[0], href: m[0] })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last) })
  return out
}
