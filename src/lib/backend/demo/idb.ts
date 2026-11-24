// 데모 모드용 아주 작은 IndexedDB 래퍼. 테이블마다 object store 하나, keyPath 는 id.

const DB_NAME = 'pingpongrally-demo'
const VERSION = 2

export const STORES = [
  'rooms',
  'room_members',
  'participants',
  'rosters',
  'nodes',
  'poll_votes',
  'node_reactions',
  'room_surveys',
  'survey_responses',
  'ping_sets',
  'survey_templates',
  'meta',
] as const

export type StoreName = (typeof STORES)[number]

let dbPromise: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION)
      req.onupgradeneeded = () => {
        const db = req.result
        for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' })
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbPromise
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function store(name: StoreName, mode: IDBTransactionMode) {
  const db = await open()
  return db.transaction(name, mode).objectStore(name)
}

export const idb = {
  async all<T>(name: StoreName): Promise<T[]> {
    return wrap((await store(name, 'readonly')).getAll()) as Promise<T[]>
  },
  async get<T>(name: StoreName, id: string): Promise<T | undefined> {
    return wrap((await store(name, 'readonly')).get(id)) as Promise<T | undefined>
  },
  async put<T extends { id: string }>(name: StoreName, value: T): Promise<T> {
    await wrap((await store(name, 'readwrite')).put(value))
    return value
  },
  async putMany<T extends { id: string }>(name: StoreName, values: T[]): Promise<void> {
    if (values.length === 0) return
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite')
      const s = tx.objectStore(name)
      for (const v of values) s.put(v)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
  async del(name: StoreName, id: string): Promise<void> {
    await wrap((await store(name, 'readwrite')).delete(id))
  },
  async delWhere<T extends { id: string }>(name: StoreName, pred: (v: T) => boolean): Promise<number> {
    const rows = (await idb.all<T>(name)).filter(pred)
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite')
      const s = tx.objectStore(name)
      for (const r of rows) s.delete(r.id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return rows.length
  },
  async clearAll(): Promise<void> {
    const db = await open()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...STORES], 'readwrite')
      for (const s of STORES) tx.objectStore(s).clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
  },
}
