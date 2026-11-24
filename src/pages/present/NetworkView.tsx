// 네트워크 뷰(설계서 5.4): 핑 → 퐁 → 리플 3단을 d3-hierarchy 로 방사형 배치한다.
// React Flow 와 배치 코드는 발표 화면에서만 불러온다(lazy import).
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Background,
  BackgroundVariant,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Edge,
  type Node,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { hierarchy, tree, type HierarchyPointNode } from 'd3-hierarchy'
import { BarChart3, FileText, ImageIcon, Link2, Maximize2, Minus, Plus, Search, X } from 'lucide-react'
import type { AttachmentKind, RallyNode, RoomMember } from '@/lib/types'
import { indexRally, pingLabel } from '@/lib/rally'
import { cn, summarize, timeAgo } from '@/lib/utils'
import { RichText } from '@/components/rally/RichText'
import { AttachmentList } from '@/components/rally/Attachments'

interface TreeDatum {
  id: string
  kind: 'room' | 'ping' | 'pong' | 'reply'
  node?: RallyNode
  children?: TreeDatum[]
}

type NodeData = {
  kind: TreeDatum['kind']
  node?: RallyNode
  label?: string
  title?: string
  color?: string
  dim: boolean
  active: boolean
  replies?: number
  pongs?: number
}


// ---------------------------------------------------------------------------
// 노드 모양
// ---------------------------------------------------------------------------
const BOX = { room: [120, 120], ping: [230, 110], pong: [190, 74], reply: [132, 28] } as const

const hidden = { opacity: 0, width: 1, height: 1, minWidth: 0, minHeight: 0, border: 0, left: '50%', top: '50%' }
const Handles = () => (
  <>
    <Handle type="target" position={Position.Top} style={hidden} isConnectable={false} />
    <Handle type="source" position={Position.Top} style={hidden} isConnectable={false} />
  </>
)

const RoomNode = memo(function RoomNode({ data }: NodeProps<Node<NodeData>>) {
  return (
    <div className="relative flex size-[120px] items-center justify-center rounded-full bg-white/[0.04] ring-1 ring-white/15">
      <Handles />
      <div className="absolute inset-3 rounded-full bg-gradient-to-br from-white/10 to-transparent" />
      <p className="relative line-clamp-3 px-5 text-center text-[12px] font-bold leading-tight text-white/80">{data.title}</p>
    </div>
  )
})

const PingNodeView = memo(function PingNodeView({ data }: NodeProps<Node<NodeData>>) {
  const poll = data.node?.type === 'poll'
  return (
    <div
      className={cn(
        'relative w-[230px] rounded-2xl p-4 text-left transition-[opacity,transform,box-shadow] duration-300',
        poll ? 'bg-gradient-to-br from-poll-500 to-poll-700' : 'bg-gradient-to-br from-ping-500 to-ping-700',
        data.active && (poll ? 'shadow-[0_0_0_4px_rgba(145,87,251,.35),0_0_60px_rgba(145,87,251,.45)]' : 'shadow-[0_0_0_4px_rgba(255,106,61,.35),0_0_60px_rgba(255,106,61,.5)]'),
        data.dim ? 'opacity-25' : 'opacity-100',
      )}
    >
      <Handles />
      <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/80">
        {poll && <BarChart3 className="size-3.5" />}
        {data.label}
        {data.active && <span className="ml-auto flex items-center gap-1 rounded-full bg-white/20 px-1.5 py-0.5 text-[10px]">● 지금</span>}
      </div>
      <p className="mt-1.5 line-clamp-2 text-[14px] font-bold leading-snug text-white">{data.node?.content}</p>
      {!poll && (
        <p className="mt-2 text-[11px] font-semibold text-white/70">
          퐁 {data.pongs ?? 0} · 리플 {data.replies ?? 0}
        </p>
      )}
    </div>
  )
})

const PongNodeView = memo(function PongNodeView({ data }: NodeProps<Node<NodeData>>) {
  const n = data.node!
  const img = n.attachments.find((a) => a.kind === 'image')
  return (
    <div
      className={cn(
        'relative w-[190px] cursor-pointer rounded-2xl bg-[#171b27] p-3 text-left ring-1 ring-pong-400/35 transition-[opacity] duration-300 hover:ring-pong-300',
        data.dim ? 'opacity-[0.12]' : 'opacity-100',
      )}
    >
      <Handles />
      <div className="flex gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="size-2 shrink-0 rounded-full" style={{ background: n.is_host ? '#FF6A3D' : (data.color ?? '#5A68F8') }} />
            <span className="truncate text-[11px] font-bold text-white/70">{n.author_nickname}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-[12.5px] font-medium leading-snug text-white">{summarize(n.content, 80) || '(첨부)'}</p>
        </div>
        {img && <img src={img.thumb_url || img.url} alt="" className="size-11 shrink-0 rounded-lg object-cover" loading="lazy" />}
      </div>
    </div>
  )
})

const ReplyNodeView = memo(function ReplyNodeView({ data }: NodeProps<Node<NodeData>>) {
  const n = data.node!
  return (
    <div className={cn('relative flex w-[132px] cursor-pointer items-center gap-1.5 rounded-full bg-reply-500/15 py-1 pl-1 pr-2.5 ring-1 ring-reply-400/40 transition-opacity duration-300', data.dim ? 'opacity-[0.1]' : 'opacity-100')}>
      <Handles />
      <span className="flex size-5 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ background: n.is_host ? '#14171F' : (data.color ?? '#15B596') }}>
        {n.is_host ? '강' : n.author_nickname[0]}
      </span>
      <span className="truncate text-[11px] font-medium text-reply-100">{summarize(n.content.replace(/@\S+\s?/, ''), 30)}</span>
    </div>
  )
})

const nodeTypes = { room: RoomNode, ping: PingNodeView, pong: PongNodeView, reply: ReplyNodeView }

// ---------------------------------------------------------------------------
// 배치
// ---------------------------------------------------------------------------
function layout(data: TreeDatum) {
  const root = hierarchy(data)
  const leaves = root.leaves().length
  const pongCount = root.descendants().filter((d) => d.data.kind === 'pong').length
  const pingCount = root.children?.length ?? 0
  const r1 = Math.max(260, (pingCount * 250) / (2 * Math.PI))
  const r2 = Math.max(r1 + 300, (pongCount * 205) / (2 * Math.PI))
  const r3 = Math.max(r2 + 230, (leaves * 60) / (2 * Math.PI))
  const radius = [0, r1, r2, r3]
  tree<TreeDatum>()
    .size([2 * Math.PI, 1])
    .separation((a, b) => (a.parent === b.parent ? 1 : 1.6) / Math.max(1, a.depth))(root)
  const pts = root.descendants() as HierarchyPointNode<TreeDatum>[]
  return pts.map((p) => {
    const r = radius[p.depth] ?? r3
    const a = p.x - Math.PI / 2
    return { d: p.data, depth: p.depth, parent: p.parent?.data.id ?? null, x: p.depth === 0 ? 0 : r * Math.cos(a), y: p.depth === 0 ? 0 : r * Math.sin(a) }
  })
}

export interface NetworkViewProps {
  title: string
  nodes: RallyNode[]
  members: RoomMember[]
  activePingId: string | null
  /** 발표 화면 바깥(교육생 피드 등)에 재사용할 때 쓰는 여백 */
  className?: string
}

export default function NetworkView(props: NetworkViewProps) {
  return (
    <ReactFlowProvider>
      <NetworkInner {...props} />
    </ReactFlowProvider>
  )
}

function NetworkInner({ title, nodes, members, activePingId, className }: NetworkViewProps) {
  const rf = useReactFlow()
  const [focusPing, setFocusPing] = useState<string | null>(null)
  const [kinds, setKinds] = useState<AttachmentKind[]>([])
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<RallyNode | null>(null)
  const colors = useMemo(() => new Map(members.map((m) => [m.user_id, m.color])), [members])
  const idx = useMemo(() => indexRally(nodes), [nodes])

  // 필터: 핑별 · 첨부 유형 · 키워드 (브라우저에서 걸러낸다, 5.4)
  const treeData = useMemo<TreeDatum>(() => {
    const q = query.trim().toLowerCase()
    const match = (n: RallyNode) => !q || n.content.toLowerCase().includes(q) || n.author_nickname.toLowerCase().includes(q)
    const hasKind = (n: RallyNode) => kinds.length === 0 || n.attachments.some((a) => kinds.includes(a.kind))
    const pings = idx.pings.filter((p) => p.opened_at || p.id === activePingId)
    return {
      id: 'room',
      kind: 'room',
      children: pings.map((p) => {
        const pongs = (idx.pongsByPing.get(p.id) ?? []).filter((g) => {
          const replies = idx.repliesByPong.get(g.id) ?? []
          return hasKind(g) && (match(g) || replies.some(match))
        })
        return {
          id: p.id,
          kind: 'ping' as const,
          node: p,
          children: pongs.map((g) => ({
            id: g.id,
            kind: 'pong' as const,
            node: g,
            children: (idx.repliesByPong.get(g.id) ?? []).map((r) => ({ id: r.id, kind: 'reply' as const, node: r })),
          })),
        }
      }),
    }
  }, [idx, kinds, query, activePingId])

  const { rfNodes, rfEdges, branch, placed } = useMemo(() => {
    const placed = layout(treeData)
    const branchIds = new Set<string>()
    if (focusPing) {
      branchIds.add('room')
      for (const p of placed) {
        const pingId = p.d.kind === 'ping' ? p.d.id : p.d.node?.ping_id
        if (pingId === focusPing) branchIds.add(p.d.id)
      }
    }
    const rfNodes: Node<NodeData>[] = placed.map((p) => {
      const n = p.d.node
      const counts = p.d.kind === 'ping' && n ? idx.pongsByPing.get(n.id) ?? [] : []
      return {
        id: p.d.id,
        type: p.d.kind,
        position: { x: p.x, y: p.y },
        draggable: false,
        selectable: false,
        zIndex: p.d.kind === 'ping' ? 3 : p.d.kind === 'room' ? 4 : 2,
        data: {
          kind: p.d.kind,
          node: n,
          title,
          label: n && p.d.kind === 'ping' ? pingLabel(idx, n) : undefined,
          color: n ? colors.get(n.author_id) : undefined,
          dim: !!focusPing && !branchIds.has(p.d.id),
          active: !!n && n.id === activePingId,
          pongs: counts.length,
          replies: counts.reduce((s, g) => s + (idx.repliesByPong.get(g.id)?.length ?? 0), 0),
        },
      }
    })
    const rfEdges: Edge[] = placed
      .filter((p) => p.parent)
      .map((p) => {
        const on = !focusPing || branchIds.has(p.d.id)
        const stroke = p.d.kind === 'ping' ? 'rgba(255,255,255,0.18)' : p.d.kind === 'pong' ? 'rgba(122,141,255,0.45)' : 'rgba(58,207,174,0.45)'
        return {
          id: `${p.parent}-${p.d.id}`,
          source: p.parent!,
          target: p.d.id,
          type: 'straight',
          style: { stroke, strokeWidth: p.d.kind === 'ping' ? 2 : 1.4, opacity: on ? 1 : 0.06, strokeDasharray: p.d.kind === 'ping' ? '3 6' : undefined },
        }
      })
    return { rfNodes, rfEdges, branch: branchIds, placed }
  }, [treeData, focusPing, idx, colors, activePingId, title])

  // 데이터가 바뀌면 화면에 맞춘다(핑 강조 중이면 그 가지에 맞춘다).
  // 배치 좌표를 이미 알고 있으므로 직접 경계를 계산해 측정 시점과 상관없이 맞춘다.
  const fitTimer = useRef<number | undefined>(undefined)
  const fit = useCallback(() => {
    window.clearTimeout(fitTimer.current)
    fitTimer.current = window.setTimeout(() => {
      const pick = focusPing ? placed.filter((p) => branch.has(p.d.id)) : placed
      if (!pick.length) return
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      for (const p of pick) {
        const [w, h] = BOX[p.d.kind]
        minX = Math.min(minX, p.x - w / 2)
        minY = Math.min(minY, p.y - h / 2)
        maxX = Math.max(maxX, p.x + w / 2)
        maxY = Math.max(maxY, p.y + h / 2)
      }
      void rf.fitBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, { duration: 700, padding: focusPing ? 0.12 : 0.06 })
    }, 80)
  }, [rf, focusPing, branch, placed])
  const signature = `${rfNodes.length}:${focusPing}:${kinds.join()}:${query}`
  useEffect(() => {
    fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature])
  useEffect(() => {
    const onResize = () => fit()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fit])

  const toggleKind = (k: AttachmentKind) => setKinds((prev) => (prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k]))
  const pings = idx.pings.filter((p) => p.opened_at || p.id === activePingId)

  return (
    <div className={cn('relative h-full w-full', className)}>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        nodeOrigin={[0.5, 0.5]}
        minZoom={0.08}
        maxZoom={2.2}
        fitView
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        colorMode="dark"
        className="ppr-flow"
        onNodeClick={(_, n) => {
          const d = n.data as NodeData
          if (d.kind === 'ping') setFocusPing((cur) => (cur === n.id ? null : n.id))
          else if (d.kind === 'room') setFocusPing(null)
          else if (d.node) setDetail(d.node.type === 'reply' ? (idx.byId.get(d.node.parent_id!) ?? d.node) : d.node)
        }}
        onPaneClick={() => setDetail(null)}
        style={{ background: 'transparent' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1.2} color="rgba(255,255,255,0.07)" bgColor="transparent" />
      </ReactFlow>

      {/* 필터 */}
      <div className="absolute left-0 top-0 z-10 flex max-w-[min(760px,100%)] flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10 backdrop-blur">
          <FilterChip active={!focusPing} onClick={() => setFocusPing(null)}>
            전체
          </FilterChip>
          {pings.map((p) => (
            <FilterChip key={p.id} active={focusPing === p.id} onClick={() => setFocusPing((c) => (c === p.id ? null : p.id))} dot={p.id === activePingId}>
              {pingLabel(idx, p)}
            </FilterChip>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-2xl bg-white/[0.06] p-1 ring-1 ring-white/10 backdrop-blur">
          <FilterChip active={kinds.includes('image')} onClick={() => toggleKind('image')}>
            <ImageIcon className="size-3.5" /> 이미지
          </FilterChip>
          <FilterChip active={kinds.includes('file')} onClick={() => toggleKind('file')}>
            <FileText className="size-3.5" /> 파일
          </FilterChip>
          <FilterChip active={kinds.includes('link')} onClick={() => toggleKind('link')}>
            <Link2 className="size-3.5" /> 링크
          </FilterChip>
        </div>
        <label className="flex h-[38px] items-center gap-2 rounded-2xl bg-white/[0.06] px-3 ring-1 ring-white/10 backdrop-blur focus-within:ring-white/30">
          <Search className="size-4 text-white/50" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="키워드 검색" className="w-36 bg-transparent text-sm text-white outline-none placeholder:text-white/40" />
          {query && (
            <button onClick={() => setQuery('')} aria-label="검색어 지우기">
              <X className="size-3.5 text-white/50" />
            </button>
          )}
        </label>
      </div>

      {/* 확대·축소 */}
      <div className="absolute bottom-0 left-0 z-10 flex flex-col overflow-hidden rounded-2xl bg-white/[0.06] ring-1 ring-white/10 backdrop-blur">
        <ZoomButton label="확대" onClick={() => void rf.zoomIn({ duration: 250 })}>
          <Plus />
        </ZoomButton>
        <ZoomButton label="축소" onClick={() => void rf.zoomOut({ duration: 250 })}>
          <Minus />
        </ZoomButton>
        <ZoomButton label="화면에 맞추기" onClick={fit}>
          <Maximize2 />
        </ZoomButton>
      </div>

      {/* 상세 패널 */}
      {detail && (
        <div className="absolute bottom-0 right-0 top-14 z-20 flex w-[min(440px,90%)] animate-fade-in flex-col overflow-hidden rounded-2xl bg-[#12151d]/95 shadow-pop ring-1 ring-white/10 backdrop-blur">
          <div className="flex items-center gap-3 border-b border-white/10 px-6 py-4">
            <span className="size-3 rounded-full" style={{ background: detail.is_host ? '#FF6A3D' : (colors.get(detail.author_id) ?? '#5A68F8') }} />
            <p className="flex-1 truncate text-lg font-bold text-white">{detail.author_nickname}</p>
            <span className="text-sm text-white/40">{timeAgo(detail.created_at)}</span>
            <button onClick={() => setDetail(null)} className="rounded-xl p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="닫기">
              <X className="size-5" />
            </button>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-5">
            <p className="text-xs font-semibold text-ping-300">{detail.ping_id && idx.byId.get(detail.ping_id) ? summarize(idx.byId.get(detail.ping_id)!.content, 60) : ''}</p>
            <RichText text={detail.content} className="mt-2 text-[20px] font-medium leading-relaxed text-white" mentionClass="text-reply-300" />
            {detail.attachments.length > 0 && <AttachmentList items={detail.attachments} tone="dark" className="mt-4" />}
            {(idx.repliesByPong.get(detail.id) ?? []).length > 0 && (
              <div className="mt-6 space-y-3 border-l-2 border-reply-500/40 pl-4">
                {(idx.repliesByPong.get(detail.id) ?? []).map((r) => (
                  <div key={r.id}>
                    <p className="text-sm font-bold text-reply-200">{r.author_nickname}</p>
                    <RichText text={r.content} className="mt-0.5 text-[16px] leading-relaxed text-white/85" mentionClass="text-reply-300" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterChip({ active, onClick, children, dot }: { active: boolean; onClick: () => void; children: React.ReactNode; dot?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex h-[30px] items-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[13px] font-semibold transition',
        active ? 'bg-white text-ink-900' : 'text-white/65 hover:bg-white/10 hover:text-white',
      )}
    >
      {dot && <span className="size-1.5 rounded-full bg-ping-500" />}
      {children}
    </button>
  )
}

function ZoomButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="flex size-10 items-center justify-center text-white/70 transition hover:bg-white/10 hover:text-white [&_svg]:size-4">
      {children}
    </button>
  )
}
