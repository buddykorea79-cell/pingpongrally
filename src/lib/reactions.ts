import { useCallback, useEffect, useRef, useState } from 'react'
import { backend } from './backend'
import { errorMessage } from './errors'
import type { RallyNode, ReactionCounts, ReactionKind } from './types'

/** 퐁에 남길 수 있는 이모지. 순서대로 고르기 창에 보인다(서버 toggle_reaction 의 목록과 같아야 한다). */
export const REACTIONS: { kind: ReactionKind; emoji: string; label: string }[] = [
  { kind: 'like', emoji: '👍', label: '좋아요' },
  { kind: 'dislike', emoji: '👎', label: '별로예요' },
  { kind: 'heart', emoji: '❤️', label: '공감해요' },
  { kind: 'laugh', emoji: '😂', label: '웃겨요' },
  { kind: 'wow', emoji: '😮', label: '놀라워요' },
  { kind: 'think', emoji: '🤔', label: '생각해 볼게요' },
]

export const REACTION_EMOJI = Object.fromEntries(REACTIONS.map((r) => [r.kind, r.emoji])) as Record<ReactionKind, string>

export function reactionCounts(n: Pick<RallyNode, 'meta'>): ReactionCounts {
  const raw = n.meta.reactions
  if (!raw || typeof raw !== 'object') return {}
  const out: ReactionCounts = {}
  for (const r of REACTIONS) {
    const v = Number((raw as Record<string, unknown>)[r.kind])
    if (v > 0) out[r.kind] = v
  }
  return out
}

export function reactionTotal(n: Pick<RallyNode, 'meta'>) {
  return Object.values(reactionCounts(n)).reduce((a, b) => a + (b ?? 0), 0)
}

/**
 * 이 강의에서 내가 고른 반응과 켜고 끄기.
 * 누르는 즉시 화면에 반영하고(낙관적), 서버 응답과 실시간 이벤트로 바로잡는다.
 */
export function useReactions(
  roomId: string | undefined,
  enabled: boolean,
  patchMeta: (nodeId: string, patch: Record<string, unknown>) => void,
  onError?: (message: string) => void,
) {
  const [mine, setMine] = useState<Record<string, ReactionKind[]>>({})
  const pending = useRef(new Set<string>())
  // toggle 의 정체성을 고정해 퐁 카드(memo)가 반응 하나에 모두 다시 그려지지 않게 한다
  const mineRef = useRef(mine)
  mineRef.current = mine
  const errRef = useRef(onError)
  errRef.current = onError

  useEffect(() => {
    if (!roomId || !enabled) return
    let alive = true
    backend
      .myReactions(roomId)
      .then((m) => alive && setMine(m))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [roomId, enabled])

  const toggle = useCallback(
    async (node: RallyNode, kind: ReactionKind) => {
      const key = `${node.id}:${kind}`
      if (pending.current.has(key)) return
      pending.current.add(key)
      const before = mineRef.current[node.id] ?? []
      const had = before.includes(kind)
      const counts = reactionCounts(node)
      const nextCounts: ReactionCounts = { ...counts, [kind]: Math.max(0, (counts[kind] ?? 0) + (had ? -1 : 1)) }
      setMine((m) => ({ ...m, [node.id]: had ? before.filter((k) => k !== kind) : [...before, kind] }))
      patchMeta(node.id, { reactions: nextCounts })
      try {
        const r = await backend.toggleReaction(node.id, kind)
        setMine((m) => ({ ...m, [node.id]: r.mine }))
        patchMeta(node.id, { reactions: r.reactions })
      } catch (e) {
        setMine((m) => ({ ...m, [node.id]: before }))
        patchMeta(node.id, { reactions: counts })
        errRef.current?.(errorMessage(e))
      } finally {
        pending.current.delete(key)
      }
    },
    [patchMeta],
  )

  return { mine, toggle }
}
