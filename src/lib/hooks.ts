import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backend, type Session } from './backend'
import type { ConnectionState, RallyNode, Room, RoomEvent, RoomMember, RoomSurvey } from './types'

/** 현재 세션. 데모 모드에서는 경로(교육생/강사)에 따라 세션이 다르므로 화면마다 새로 읽는다. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    backend.getSession().then((s) => {
      if (alive) {
        setSession(s)
        setLoading(false)
      }
    })
    const off = backend.onAuthChange((s) => alive && setSession(s))
    return () => {
      alive = false
      off()
    }
  }, [])
  return { session, loading, setSession }
}

/** n 밀리초마다 다시 그리기(남은 시간·상대 시간 표시용) */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export function useMediaQuery(q: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(q).matches)
  useEffect(() => {
    const m = window.matchMedia(q)
    const on = () => setMatch(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [q])
  return match
}

/** 시스템 다크 모드를 따라간다(사용자가 고르면 그 값을 저장) */
export function useThemeSync() {
  useEffect(() => {
    const m = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      let pref: string | null = null
      try {
        pref = localStorage.getItem('ppr-theme')
      } catch {
        /* 무시 */
      }
      const dark = pref ? pref === 'dark' : m.matches
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    m.addEventListener('change', apply)
    return () => m.removeEventListener('change', apply)
  }, [])
}

export function toggleTheme() {
  const dark = !document.documentElement.classList.contains('dark')
  document.documentElement.classList.toggle('dark', dark)
  try {
    localStorage.setItem('ppr-theme', dark ? 'dark' : 'light')
  } catch {
    /* 무시 */
  }
}

/** 실시간 구독 한 곳(설계서 12.1의 useRoomEvents). 끊기면 상태를 'polling' 으로 알린다. */
export function useRoomEvents(roomId: string | undefined, onEvent: (e: RoomEvent) => void, enabled = true) {
  const handler = useRef(onEvent)
  handler.current = onEvent
  const [state, setState] = useState<ConnectionState>('connecting')
  useEffect(() => {
    if (!roomId || !enabled) return
    let failTimer: number | undefined
    const sub = backend.subscribeRoom(roomId, {
      onEvent: (e) => handler.current(e),
      onStatus: (s) => {
        setState(s)
        clearTimeout(failTimer)
        // 10초 안에 연결되지 않으면 폴링으로 돌린다.
        if (s === 'connecting') failTimer = window.setTimeout(() => setState('polling'), 10_000)
      },
    })
    const onOffline = () => setState('offline')
    const onOnline = () => setState((s) => (s === 'offline' ? 'polling' : s))
    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      clearTimeout(failTimer)
      sub.unsubscribe()
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [roomId, enabled])
  return state
}

export interface RoomState {
  status: 'loading' | 'ready' | 'not_found' | 'error'
  error: unknown
  room: Room | null
  nodes: RallyNode[]
  nodeMap: Map<string, RallyNode>
  members: RoomMember[]
  surveys: RoomSurvey[]
  connection: ConnectionState
  refresh: () => Promise<void>
  resync: () => Promise<void>
  upsertNode: (n: RallyNode) => void
  /** updated_at 은 그대로 두고 meta 일부만 바꾼다(반응 개수의 낙관적 반영용) */
  patchNodeMeta: (id: string, patch: Record<string, unknown>) => void
  removeNode: (id: string) => void
  setRoom: (r: Room) => void
}

/**
 * 강의실 하나의 전체 상태: 처음 한 번 전부 불러오고, 이후 실시간 이벤트로 이어 붙인다.
 * 화면 복귀·재연결 때는 마지막 updated_at 이후만 다시 조회하고(12.1),
 * 숨김 처리(moderation_rev 증가)가 있으면 글 목록을 통째로 다시 받는다.
 */
export function useRoomState(roomId: string | undefined, opts: { members?: boolean } = {}): RoomState {
  const [status, setStatus] = useState<RoomState['status']>('loading')
  const [error, setError] = useState<unknown>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [nodeMap, setNodeMap] = useState<Map<string, RallyNode>>(() => new Map())
  const [members, setMembers] = useState<RoomMember[]>([])
  const [surveys, setSurveys] = useState<RoomSurvey[]>([])
  const last = useRef<string | null>(null)
  const rev = useRef<number | null>(null)
  const busy = useRef(false)

  const track = (list: RallyNode[]) => {
    for (const n of list) if (!last.current || n.updated_at > last.current) last.current = n.updated_at
  }

  const mergeNodes = useCallback((list: RallyNode[], replace = false) => {
    track(list)
    setNodeMap((prev) => {
      const next = replace ? new Map<string, RallyNode>() : new Map(prev)
      for (const n of list) {
        const cur = next.get(n.id)
        if (!cur || cur.updated_at <= n.updated_at) next.set(n.id, n)
      }
      return next
    })
  }, [])

  const patchNodeMeta = useCallback((id: string, patch: Record<string, unknown>) => {
    setNodeMap((prev) => {
      const cur = prev.get(id)
      if (!cur) return prev
      const next = new Map(prev)
      next.set(id, { ...cur, meta: { ...cur.meta, ...patch } })
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!roomId) return
    try {
      const r = await backend.getRoom(roomId)
      if (!r) {
        setStatus('not_found')
        return
      }
      const [ns, ss, ms] = await Promise.all([
        backend.listNodes(roomId),
        backend.listRoomSurveys(roomId),
        opts.members === false ? Promise.resolve([] as RoomMember[]) : backend.listMembers(roomId),
      ])
      last.current = null
      rev.current = r.moderation_rev
      setRoom(r)
      mergeNodes(ns, true)
      setSurveys(ss)
      setMembers(ms)
      setStatus('ready')
    } catch (e) {
      setError(e)
      setStatus('error')
    }
  }, [roomId, mergeNodes, opts.members])

  const resync = useCallback(async () => {
    if (!roomId || busy.current) return
    busy.current = true
    try {
      const r = await backend.getRoom(roomId)
      if (!r) return
      setRoom(r)
      if (rev.current !== null && r.moderation_rev !== rev.current) {
        rev.current = r.moderation_rev
        mergeNodes(await backend.listNodes(roomId), true)
      } else {
        mergeNodes(await backend.listNodes(roomId, last.current))
      }
      const [ss, ms] = await Promise.all([
        backend.listRoomSurveys(roomId),
        opts.members === false ? Promise.resolve(null) : backend.listMembers(roomId),
      ])
      setSurveys(ss)
      if (ms) setMembers(ms)
    } catch {
      /* 다음 주기에 다시 */
    } finally {
      busy.current = false
    }
  }, [roomId, mergeNodes, opts.members])

  useEffect(() => {
    setStatus('loading')
    void refresh()
  }, [refresh])

  const connection = useRoomEvents(
    roomId,
    (e) => {
      if (e.table === 'rooms') {
        setRoom(e.record)
        if (rev.current !== null && e.record.moderation_rev !== rev.current) {
          rev.current = e.record.moderation_rev
          void backend.listNodes(e.record.id).then((ns) => mergeNodes(ns, true))
        }
      } else if (e.table === 'nodes') {
        mergeNodes([e.record])
      } else if (e.table === 'room_members') {
        setMembers((prev) => (prev.some((m) => m.user_id === e.record.user_id) ? prev : [...prev, e.record]))
      } else if (e.table === 'room_surveys') {
        setSurveys((prev) => {
          const i = prev.findIndex((s) => s.id === e.record.id)
          if (i < 0) return [...prev, e.record]
          const next = prev.slice()
          next[i] = e.record
          return next
        })
      }
    },
    status === 'ready',
  )

  // 화면 복귀·재연결 시 다시 조회
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && void resync()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('online', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('online', onVis)
    }
  }, [resync])

  const prevConn = useRef(connection)
  useEffect(() => {
    if (prevConn.current !== 'live' && connection === 'live' && status === 'ready') void resync()
    prevConn.current = connection
  }, [connection, resync, status])

  // 실시간 연결이 실패하면 5초 간격 증분 폴링
  useEffect(() => {
    if (connection !== 'polling' || status !== 'ready') return
    const t = window.setInterval(() => void resync(), 5000)
    return () => clearInterval(t)
  }, [connection, resync, status])

  const nodes = useMemo(() => [...nodeMap.values()], [nodeMap])

  return {
    status,
    error,
    room,
    nodes,
    nodeMap,
    members,
    surveys,
    connection,
    refresh,
    resync,
    upsertNode: (n) => mergeNodes([n]),
    patchNodeMeta,
    removeNode: (id) =>
      setNodeMap((prev) => {
        const next = new Map(prev)
        next.delete(id)
        return next
      }),
    setRoom,
  }
}

export type RoomPhase = 'draft' | 'live' | 'ended'

export function roomPhase(room: Pick<Room, 'status' | 'expires_at'> | null | undefined, now = Date.now()): RoomPhase {
  if (!room) return 'ended'
  if (room.status === 'draft') return 'draft'
  if (room.status === 'live' && room.expires_at && new Date(room.expires_at).getTime() > now) return 'live'
  return 'ended'
}

export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · PingPongRally`
    return () => {
      document.title = 'PingPongRally'
    }
  }, [title])
}
