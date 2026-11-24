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

/** 서버에서 받은 값을 아는 이모지·양수만 남겨 정리한다 */
export function normalizeCounts(raw: unknown): ReactionCounts {
  if (!raw || typeof raw !== 'object') return {}
  const out: ReactionCounts = {}
  for (const r of REACTIONS) {
    const v = Number((raw as Record<string, unknown>)[r.kind])
    if (v > 0) out[r.kind] = v
  }
  return out
}

/** 반응 개수는 실시간 채널 대신 몇 초마다 '바뀐 것만' 가져온다(무료 플랜 실시간 메시지 한도 절약). */
const POLL_MS = 5000
/** 겹쳐서 다시 가져올 구간: 늦게 커밋된 변경도 놓치지 않게 */
const OVERLAP_MS = 3000
/** 내가 누른 직후에는 폴링 결과로 덮지 않는다(깜빡임 방지) */
const LOCAL_HOLD_MS = 4000

/**
 * 이 강의의 퐁 반응 개수와 내가 고른 반응, 켜고 끄기.
 * - 개수: reaction_counts(room, since) 를 5초(+흩뿌림)마다. 화면이 숨겨져 있으면 쉬고, 돌아오면 바로 가져온다.
 * - 내 반응: 누르는 즉시 화면에 반영(낙관적)하고 서버 응답으로 바로잡는다.
 */
export function useReactions(
  roomId: string | undefined,
  opts: { enabled: boolean; live: boolean; withMine?: boolean; onError?: (message: string) => void },
) {
  const { enabled, live, withMine = true } = opts
  const [counts, setCounts] = useState<Record<string, ReactionCounts>>({})
  const [mine, setMine] = useState<Record<string, ReactionKind[]>>({})
  const pending = useRef(new Set<string>())
  const localAt = useRef(new Map<string, number>())
  // toggle 의 정체성을 고정해 퐁 카드(memo)가 반응 하나에 모두 다시 그려지지 않게 한다
  const countsRef = useRef(counts)
  countsRef.current = counts
  const mineRef = useRef(mine)
  mineRef.current = mine
  const errRef = useRef(opts.onError)
  errRef.current = opts.onError

  useEffect(() => {
    if (!roomId || !enabled) return
    let alive = true
    let since: string | null = null
    const pull = async () => {
      if (since && document.visibilityState !== 'visible') return
      try {
        const r = await backend.reactionCounts(roomId, since)
        if (!alive) return
        since = new Date(new Date(r.at).getTime() - OVERLAP_MS).toISOString()
        const entries = Object.entries(r.counts)
        if (!entries.length) return
        const now = Date.now()
        setCounts((prev) => {
          const next = { ...prev }
          for (const [id, c] of entries) {
            if (now - (localAt.current.get(id) ?? 0) < LOCAL_HOLD_MS) continue
            next[id] = normalizeCounts(c)
          }
          return next
        })
      } catch {
        /* 다음 주기에 다시 */
      }
    }
    void pull()
    if (withMine) {
      backend
        .myReactions(roomId)
        .then((m) => alive && setMine(m))
        .catch(() => {})
    }
    const timer = live ? window.setInterval(() => void pull(), POLL_MS + Math.floor(Math.random() * 1500)) : undefined
    const onVis = () => document.visibilityState === 'visible' && void pull()
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      if (timer) clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [roomId, enabled, live, withMine])

  const toggle = useCallback(async (node: RallyNode, kind: ReactionKind) => {
    const key = `${node.id}:${kind}`
    if (pending.current.has(key)) return
    pending.current.add(key)
    const before = mineRef.current[node.id] ?? []
    const had = before.includes(kind)
    const prevCounts = countsRef.current[node.id] ?? {}
    const nextCounts: ReactionCounts = { ...prevCounts, [kind]: Math.max(0, (prevCounts[kind] ?? 0) + (had ? -1 : 1)) }
    localAt.current.set(node.id, Date.now())
    setMine((m) => ({ ...m, [node.id]: had ? before.filter((k) => k !== kind) : [...before, kind] }))
    setCounts((c) => ({ ...c, [node.id]: normalizeCounts(nextCounts) }))
    try {
      const r = await backend.toggleReaction(node.id, kind)
      localAt.current.set(node.id, Date.now())
      setMine((m) => ({ ...m, [node.id]: r.mine }))
      setCounts((c) => ({ ...c, [node.id]: normalizeCounts(r.reactions) }))
    } catch (e) {
      setMine((m) => ({ ...m, [node.id]: before }))
      setCounts((c) => ({ ...c, [node.id]: prevCounts }))
      errRef.current?.(errorMessage(e))
    } finally {
      pending.current.delete(key)
    }
  }, [])

  return { counts, mine, toggle }
}
