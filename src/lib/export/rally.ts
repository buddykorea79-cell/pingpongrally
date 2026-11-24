// 설계서 8.1 내보내기: 랠리 묶음(ZIP) · AI 분석용 정리(.md)
// 모든 파일은 브라우저에서 만든다(서버 비용 없음).
import type { Attachment, PingSetItem, PollResults, RallyNode, Room, ReactionCounts } from '../types'
import { REACTIONS, normalizeCounts } from '../reactions'
import { indexRally, type RallyIndex } from '../rally'
import { downloadBlob, formatDateTime, safeFileName, todayStamp } from '../utils'

interface ExportAttachment {
  kind: Attachment['kind']
  name: string
  url?: string
  path?: string
}

interface ExportReply {
  id: string
  author: string
  is_host: boolean
  content: string
  created_at: string
}
interface ExportPong extends ExportReply {
  attachments: ExportAttachment[]
  replies: ExportReply[]
  /** 이모지 반응 개수 { like: 3, ... } */
  reactions: ReactionCounts
}
interface ExportPing {
  id: string
  type: 'ping' | 'poll'
  content: string
  attachments: ExportAttachment[]
  poll?: { options: { id: string; label: string }[]; multiple: boolean; total_voters: number; counts: Record<string, number> }
  pongs: ExportPong[]
}
export interface RallyExport {
  schema_version: 1
  room_title: string
  exported_at: string
  started_at: string | null
  pings: ExportPing[]
}

const fileKey = (nodeId: string, a: Attachment, i: number) => `attachments/${nodeId.slice(0, 8)}-${i + 1}-${safeFileName(a.name).replace(/\s/g, '_')}`

function mapAttachments(node: RallyNode, withPaths: boolean): ExportAttachment[] {
  return node.attachments.map((a, i) =>
    a.kind === 'link' || !withPaths ? { kind: a.kind, name: a.name, url: a.url } : { kind: a.kind, name: a.name, path: fileKey(node.id, a, i) },
  )
}

export function buildRallyExport(
  room: Room,
  nodes: RallyNode[],
  polls: Record<string, PollResults>,
  withPaths = true,
  reactions: Record<string, ReactionCounts> = {},
): RallyExport {
  const idx = indexRally(nodes)
  const tz = (d: Date) => {
    const off = -d.getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const p = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(off / 60)}:${p(off % 60)}`
  }
  return {
    schema_version: 1,
    room_title: room.title,
    exported_at: tz(new Date()),
    started_at: room.started_at,
    pings: idx.pings.map<ExportPing>((p) => ({
      id: p.id,
      type: p.type === 'poll' ? 'poll' : 'ping',
      content: p.content,
      attachments: mapAttachments(p, withPaths),
      poll:
        p.type === 'poll'
          ? {
              options: p.meta.options ?? [],
              multiple: Boolean(p.meta.multiple),
              total_voters: polls[p.id]?.total_voters ?? 0,
              counts: polls[p.id]?.counts ?? {},
            }
          : undefined,
      pongs: (idx.pongsByPing.get(p.id) ?? []).map((g) => ({
        id: g.id,
        author: g.author_nickname,
        is_host: g.is_host,
        content: g.content,
        created_at: g.created_at,
        attachments: mapAttachments(g, withPaths),
        reactions: normalizeCounts(reactions[g.id]),
        replies: (idx.repliesByPong.get(g.id) ?? []).map((r) => ({ id: r.id, author: r.author_nickname, is_host: r.is_host, content: r.content, created_at: r.created_at })),
      })),
    })),
  }
}

/** 👍3 ❤️1 처럼 */
const reactionText = (c: ReactionCounts) =>
  REACTIONS.filter((r) => (c[r.kind] ?? 0) > 0)
    .map((r) => `${r.emoji}${c[r.kind]}`)
    .join(' ')

const quote = (t: string) => t.split('\n').map((l) => `> ${l}`).join('\n')
const clock = (iso: string) => new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })

function attachLine(a: ExportAttachment) {
  const target = a.path ?? a.url ?? ''
  const label = a.kind === 'image' ? '이미지' : a.kind === 'file' ? '파일' : '링크'
  return a.kind === 'image' && a.path ? `![${a.name}](${encodeURI(target)})` : `- ${label}: [${a.name}](${encodeURI(target)})`
}

function pollLines(p: ExportPing) {
  if (!p.poll) return []
  const total = p.poll.total_voters
  return [
    `**퀵폴 결과** · ${total}명 참여${p.poll.multiple ? ' · 복수 선택' : ''}`,
    '',
    '| 선택지 | 표 | 비율 |',
    '| --- | ---: | ---: |',
    ...p.poll.options.map((o) => {
      const c = p.poll!.counts[o.id] ?? 0
      return `| ${o.label} | ${c} | ${total ? Math.round((c / total) * 100) : 0}% |`
    }),
  ]
}

/** 사람이 읽는 랠리 기록(rally.md) */
export function buildRallyMarkdown(data: RallyExport): string {
  const out: string[] = [`# ${data.room_title}`, '', `- 내보낸 시각: ${formatDateTime(new Date().toISOString(), { withYear: true })}`]
  if (data.started_at) out.push(`- 강의 시작: ${formatDateTime(data.started_at, { withYear: true })}`)
  out.push(`- 핑 ${data.pings.length}개 · 퐁 ${data.pings.reduce((s, p) => s + p.pongs.length, 0)}개`, '')
  let ping = 0
  let poll = 0
  for (const p of data.pings) {
    const label = p.type === 'poll' ? `퀵폴 ${++poll}` : `핑 ${++ping}`
    out.push('---', '', `## ${label}`, '', quote(p.content), '')
    p.attachments.forEach((a) => out.push(attachLine(a)))
    if (p.attachments.length) out.push('')
    if (p.type === 'poll') {
      out.push(...pollLines(p), '')
      continue
    }
    if (!p.pongs.length) out.push('_퐁 없음_', '')
    for (const g of p.pongs) {
      out.push(`### ${g.author}${g.is_host ? ' (강사)' : ''} · ${clock(g.created_at)}`, '', g.content, '')
      if (reactionText(g.reactions)) out.push(`반응: ${reactionText(g.reactions)}`, '')
      g.attachments.forEach((a) => out.push(attachLine(a)))
      if (g.attachments.length) out.push('')
      for (const r of g.replies) out.push(`- ↳ **${r.author}${r.is_host ? ' (강사)' : ''}**: ${r.content.replace(/\n/g, ' ')}`)
      if (g.replies.length) out.push('')
    }
  }
  return out.join('\n')
}

/** 생성형 AI에 붙여 넣어 요약·군집화하기 좋은 정리(.md). 닉네임도 빼고 내용만 남긴다. */
export function buildAiMarkdown(room: Room, nodes: RallyNode[], polls: Record<string, PollResults>, reactions: Record<string, ReactionCounts> = {}): string {
  const data = buildRallyExport(room, nodes, polls, false, reactions)
  const out: string[] = [
    `# 강의 랠리 정리 — ${room.title}`,
    '',
    '아래는 강의 중 강사가 던진 질문(핑)과 교육생의 답(퐁), 답에 달린 댓글(리플)입니다. 개인을 알아볼 수 있는 정보는 넣지 않았습니다.',
    '',
    '## 이렇게 요청해 보세요',
    '',
    '1. 핑마다 답을 3~5개 주제로 묶고, 주제별 대표 의견과 개수를 표로 정리해 주세요.',
    '2. 교육생이 가장 어려워하거나 걱정하는 점을 뽑아 주세요.',
    '3. 다음 강의에서 보완할 내용을 제안해 주세요.',
    '',
  ]
  let ping = 0
  let poll = 0
  for (const p of data.pings) {
    out.push('---', '')
    if (p.type === 'poll') {
      out.push(`## 퀵폴 ${++poll}: ${p.content.replace(/\n/g, ' ')}`, '', ...pollLines(p), '')
      continue
    }
    const replies = p.pongs.reduce((s, g) => s + g.replies.length, 0)
    out.push(`## 핑 ${++ping}: ${p.content.replace(/\n/g, ' ')}`, '', `퐁 ${p.pongs.length}개 · 리플 ${replies}개`, '')
    p.pongs.forEach((g, i) => {
      const rx = reactionText(g.reactions)
      out.push(`${i + 1}. ${g.is_host ? '[강사] ' : ''}${g.content.replace(/\n+/g, ' ')}${rx ? ` (반응 ${rx})` : ''}`)
      for (const r of g.replies) out.push(`   - 리플${r.is_host ? '(강사)' : ''}: ${r.content.replace(/@\S+\s?/g, '').replace(/\n+/g, ' ')}`)
    })
    out.push('')
  }
  return out.join('\n')
}

export async function downloadRallyZip(
  room: Room,
  nodes: RallyNode[],
  polls: Record<string, PollResults>,
  onProgress?: (done: number, total: number) => void,
  reactions: Record<string, ReactionCounts> = {},
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  const data = buildRallyExport(room, nodes, polls, true, reactions)
  const idx: RallyIndex = indexRally(nodes)
  const files: { path: string; url: string }[] = []
  for (const n of idx.byId.values()) {
    if (n.is_hidden) continue
    n.attachments.forEach((a, i) => {
      if (a.kind !== 'link') files.push({ path: fileKey(n.id, a, i), url: a.url })
    })
  }
  const failed: string[] = []
  let done = 0
  for (const f of files) {
    try {
      const res = await fetch(f.url)
      if (!res.ok) throw new Error(String(res.status))
      zip.file(f.path, await res.blob())
    } catch {
      failed.push(f.path)
    }
    onProgress?.(++done, files.length)
  }
  let md = buildRallyMarkdown(data)
  if (failed.length) md += `\n\n---\n\n> 원본을 받지 못한 첨부 ${failed.length}개: ${failed.join(', ')}\n`
  zip.file('rally.json', JSON.stringify(data, null, 2))
  zip.file('rally.md', md)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
  downloadBlob(blob, `랠리_${safeFileName(room.title)}_${todayStamp()}.zip`)
  return { files: files.length, failed: failed.length }
}

export function downloadText(text: string, filename: string, type = 'text/markdown;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename)
}

export function pingSetFromNodes(nodes: RallyNode[]): PingSetItem[] {
  return indexRally(nodes).pings.map((p) => ({
    type: p.type === 'poll' ? 'poll' : 'ping',
    content: p.content,
    attachments: p.attachments.filter((a) => a.kind === 'link'),
    meta:
      p.type === 'poll'
        ? { options: p.meta.options ?? [], multiple: Boolean(p.meta.multiple), show_results: p.meta.show_results === 'live' ? 'live' : 'after_close' }
        : undefined,
  }))
}
