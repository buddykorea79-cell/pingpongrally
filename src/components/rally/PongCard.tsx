import { memo, useEffect, useRef, useState } from 'react'
import { CornerDownRight, Eye, EyeOff, MessageCircle, MoreHorizontal, Pencil, SmilePlus, Trash2 } from 'lucide-react'
import type { RallyNode, ReactionKind } from '@/lib/types'
import { REACTIONS, reactionCounts } from '@/lib/reactions'
import { cn, timeAgo } from '@/lib/utils'
import { Avatar, Badge } from '../ui/Display'
import { Menu, type MenuItem } from '../ui/Overlay'
import { RichText } from './RichText'
import { AttachmentList } from './Attachments'
import { InlineComposer } from './Composer'

export interface Viewer {
  userId: string
  isHost: boolean
}

export interface PongCardProps {
  pong: RallyNode
  replies: RallyNode[]
  colorOf: (userId: string) => string | undefined
  viewer: Viewer
  canWrite: boolean
  onReply: (pong: RallyNode, text: string) => Promise<void>
  onEdit: (node: RallyNode, content: string) => Promise<void>
  onDelete: (node: RallyNode) => void
  onToggleHidden?: (node: RallyNode) => void
  fresh?: boolean
  now: number
  /** 내가 이 퐁에 남긴 반응 */
  myReactions?: ReactionKind[]
  /** 없으면 반응 개수만 보여 주고 누를 수 없다 */
  onReact?: (pong: RallyNode, kind: ReactionKind) => void
}

const PREVIEW = 2

export const PongCard = memo(function PongCard({
  pong,
  replies,
  colorOf,
  viewer,
  canWrite,
  onReply,
  onEdit,
  onDelete,
  onToggleHidden,
  fresh,
  now,
  myReactions,
  onReact,
}: PongCardProps) {
  const [open, setOpen] = useState(false)
  const [replyTo, setReplyTo] = useState('')
  const [editing, setEditing] = useState(false)
  const visibleReplies = open ? replies : replies.slice(-PREVIEW)
  const hiddenCount = replies.length - visibleReplies.length

  const startReply = (nick?: string) => {
    setOpen(true)
    setReplyTo(nick ? `@${nick} ` : `@${pong.author_nickname} `)
  }

  return (
    <article
      className={cn(
        'group/card rounded-3xl bg-surface p-4 ring-1 ring-line transition-shadow sm:p-5',
        fresh && 'animate-pop-in',
        pong.is_hidden && 'opacity-60',
      )}
      onClick={() => !open && canWrite && startReply()}
    >
      <NodeHeader node={pong} color={colorOf(pong.author_id)} viewer={viewer} canWrite={canWrite} onEdit={() => setEditing(true)} onDelete={onDelete} onToggleHidden={onToggleHidden} now={now} />

      <div className="mt-2.5 pl-[46px]">
        {editing ? (
          <EditBox
            initial={pong.content}
            onCancel={() => setEditing(false)}
            onSave={async (t) => {
              await onEdit(pong, t)
              setEditing(false)
            }}
          />
        ) : (
          pong.content && <RichText text={pong.content} className="text-[15px] leading-[1.65] text-fg" />
        )}
        {pong.attachments.length > 0 && <AttachmentList items={pong.attachments} className="mt-3" />}

        <div className="mt-3 flex flex-wrap items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Reactions pong={pong} mine={myReactions ?? []} onReact={pong.is_hidden ? undefined : onReact} />
          <button
            type="button"
            onClick={() => (replies.length > 0 ? setOpen((v) => !v) : startReply())}
            className={cn(
              '-ml-2 inline-flex h-8 items-center gap-1.5 rounded-xl px-2 text-[13px] font-semibold transition',
              replies.length > 0 ? 'text-reply-600 hover:bg-reply-50 dark:text-reply-400 dark:hover:bg-reply-950' : 'text-fg-3 hover:bg-surface-3 hover:text-fg-2',
            )}
          >
            <MessageCircle className="size-4" />
            {replies.length > 0 ? `리플 ${replies.length}` : '리플'}
          </button>
          {canWrite && replies.length > 0 && (
            <button type="button" onClick={() => startReply()} className="inline-flex h-8 items-center rounded-xl px-2 text-[13px] font-semibold text-fg-3 transition hover:bg-surface-3 hover:text-fg-2">
              리플 달기
            </button>
          )}
        </div>

        {replies.length > 0 && (
          <div className="relative mt-1.5 space-y-3 pl-3.5 before:absolute before:inset-y-1 before:left-0 before:w-[2px] before:rounded-full before:bg-reply-200 dark:before:bg-reply-900" onClick={(e) => e.stopPropagation()}>
            {hiddenCount > 0 && (
              <button type="button" onClick={() => setOpen(true)} className="text-[13px] font-semibold text-fg-3 hover:text-fg-2">
                이전 리플 {hiddenCount}개 더 보기
              </button>
            )}
            {visibleReplies.map((r) => (
              <ReplyRow
                key={r.id}
                reply={r}
                color={colorOf(r.author_id)}
                viewer={viewer}
                canWrite={canWrite}
                onReply={() => startReply(r.author_nickname)}
                onEdit={onEdit}
                onDelete={onDelete}
                onToggleHidden={onToggleHidden}
                now={now}
              />
            ))}
          </div>
        )}

        {open && canWrite && (
          <div className="mt-3 animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <InlineComposer key={replyTo} initial={replyTo} autoFocus onSubmit={(t) => onReply(pong, t)} placeholder={`${pong.author_nickname}님에게 리플`} />
          </div>
        )}
      </div>
    </article>
  )
})

function NodeHeader({
  node,
  color,
  viewer,
  canWrite,
  onEdit,
  onDelete,
  onToggleHidden,
  now,
  small,
}: {
  node: RallyNode
  color?: string
  viewer: Viewer
  canWrite: boolean
  onEdit: () => void
  onDelete: (n: RallyNode) => void
  onToggleHidden?: (n: RallyNode) => void
  now: number
  small?: boolean
}) {
  const mine = node.author_id === viewer.userId
  const items: MenuItem[] = []
  if (mine && canWrite) {
    items.push({ label: '수정', icon: <Pencil />, onSelect: onEdit })
    items.push({ label: '삭제', icon: <Trash2 />, onSelect: () => onDelete(node), danger: true })
  }
  if (viewer.isHost && onToggleHidden && !mine) {
    items.push(
      node.is_hidden
        ? { label: '숨김 해제', icon: <Eye />, onSelect: () => onToggleHidden(node) }
        : { label: '숨기기', icon: <EyeOff />, onSelect: () => onToggleHidden(node), danger: true },
    )
  }
  const edited = new Date(node.updated_at).getTime() - new Date(node.created_at).getTime() > 2000 && !node.is_hidden
  return (
    <div className="flex items-center gap-2.5">
      <Avatar name={node.author_nickname} color={color} host={node.is_host} size={small ? 'sm' : 'md'} />
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className={cn('truncate font-bold text-fg', small ? 'text-[13px]' : 'text-[14px]')}>{node.author_nickname}</span>
        {node.is_host && (
          <Badge tone="ping" size="sm">
            강사
          </Badge>
        )}
        {mine && !node.is_host && (
          <Badge tone="outline" size="sm">
            나
          </Badge>
        )}
        {node.is_hidden && (
          <Badge tone="danger" size="sm" icon={<EyeOff />}>
            숨김
          </Badge>
        )}
        <span className="text-xs text-fg-3">
          {timeAgo(node.created_at, now)}
          {edited && ' · 수정됨'}
        </span>
      </div>
      {items.length > 0 && (
        <div onClick={(e) => e.stopPropagation()}>
          <Menu
            items={items}
            trigger={(p) => (
              <button {...p} className="-mr-1.5 rounded-xl p-1.5 text-fg-3 opacity-70 transition hover:bg-surface-3 hover:text-fg group-hover/card:opacity-100" aria-label="더 보기">
                <MoreHorizontal className="size-[18px]" />
              </button>
            )}
          />
        </div>
      )}
    </div>
  )
}

function ReplyRow({
  reply,
  color,
  viewer,
  canWrite,
  onReply,
  onEdit,
  onDelete,
  onToggleHidden,
  now,
}: {
  reply: RallyNode
  color?: string
  viewer: Viewer
  canWrite: boolean
  onReply: () => void
  onEdit: (n: RallyNode, c: string) => Promise<void>
  onDelete: (n: RallyNode) => void
  onToggleHidden?: (n: RallyNode) => void
  now: number
}) {
  const [editing, setEditing] = useState(false)
  return (
    <div className={cn('group/card animate-fade-in', reply.is_hidden && 'opacity-60')}>
      <NodeHeader node={reply} color={color} viewer={viewer} canWrite={canWrite} onEdit={() => setEditing(true)} onDelete={onDelete} onToggleHidden={onToggleHidden} now={now} small />
      <div className="mt-1 pl-[38px]">
        {editing ? (
          <EditBox
            initial={reply.content}
            onCancel={() => setEditing(false)}
            onSave={async (t) => {
              await onEdit(reply, t)
              setEditing(false)
            }}
          />
        ) : (
          <RichText text={reply.content} className="text-[14px] leading-[1.6] text-fg" />
        )}
        {canWrite && !editing && (
          <button type="button" onClick={onReply} className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-fg-3 hover:text-reply-600">
            <CornerDownRight className="size-3.5" /> 답하기
          </button>
        )}
      </div>
    </div>
  )
}

function EditBox({ initial, onSave, onCancel }: { initial: string; onSave: (t: string) => Promise<void>; onCancel: () => void }) {
  const [text, setText] = useState(initial)
  const [saving, setSaving] = useState(false)
  return (
    <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="w-full resize-none rounded-xl bg-surface-2 px-3 py-2.5 text-[15px] leading-relaxed ring-1 ring-inset ring-line focus:outline-none focus:ring-2 focus:ring-pong-500"
      />
      <div className="flex justify-end gap-1.5">
        <button className="h-8 rounded-lg px-3 text-[13px] font-semibold text-fg-2 hover:bg-surface-3" onClick={onCancel}>
          취소
        </button>
        <button
          className="h-8 rounded-lg bg-inverse px-3 text-[13px] font-semibold text-on-inverse disabled:opacity-40"
          disabled={!text.trim() || saving || text.length > 1000}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(text.trim())
            } finally {
              setSaving(false)
            }
          }}
        >
          저장
        </button>
      </div>
    </div>
  )
}

/**
 * 퐁 이모지 반응: 누군가 남긴 이모지는 칩으로 보이고, 두 명 이상이면 작은 숫자가 붙는다.
 * 내가 누른 칩은 진하게. 웃는 얼굴 버튼으로 고르기 창을 연다.
 */
function Reactions({ pong, mine, onReact }: { pong: RallyNode; mine: ReactionKind[]; onReact?: (pong: RallyNode, kind: ReactionKind) => void }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const counts = reactionCounts(pong)
  const shown = REACTIONS.filter((r) => (counts[r.kind] ?? 0) > 0)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])

  if (!onReact && shown.length === 0) return null
  return (
    <div className="-ml-1 mr-1 flex flex-wrap items-center gap-1">
      {shown.map((r) => {
        const n = counts[r.kind] ?? 0
        const on = mine.includes(r.kind)
        return (
          <button
            key={r.kind}
            type="button"
            disabled={!onReact}
            onClick={() => onReact?.(pong, r.kind)}
            title={`${r.label} ${n}`}
            aria-label={`${r.label} ${n}명${on ? ', 내가 누름' : ''}`}
            aria-pressed={on}
            className={cn(
              'inline-flex h-7 items-center gap-1 rounded-full px-2 text-[14px] leading-none ring-1 ring-inset transition disabled:cursor-default',
              on ? 'bg-surface-3 ring-fg/40' : 'ring-line enabled:hover:ring-line-strong',
            )}
          >
            <span aria-hidden>{r.emoji}</span>
            {n > 1 && <span className={cn('tabular text-[11px]', on ? 'text-fg' : 'text-fg-3')}>{n}</span>}
          </button>
        )
      })}
      {onReact && (
        <div ref={box} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label="이모지로 반응하기"
            aria-expanded={open}
            title="이모지로 반응하기"
            className={cn('inline-flex size-7 items-center justify-center rounded-full text-fg-3 transition hover:bg-surface-3 hover:text-fg-2', open && 'bg-surface-3 text-fg-2')}
          >
            <SmilePlus className="size-4 stroke-[1.5]" />
          </button>
          {open && (
            <div role="menu" className="absolute bottom-full left-0 z-20 mb-1.5 flex animate-pop-in gap-0.5 rounded-full bg-surface p-1 shadow-pop ring-1 ring-line">
              {REACTIONS.map((r) => (
                <button
                  key={r.kind}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={mine.includes(r.kind)}
                  title={r.label}
                  aria-label={r.label}
                  onClick={() => {
                    onReact(pong, r.kind)
                    setOpen(false)
                  }}
                  className={cn('flex size-9 items-center justify-center rounded-full text-[19px] transition hover:scale-110 hover:bg-surface-3', mine.includes(r.kind) && 'bg-surface-3')}
                >
                  {r.emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
