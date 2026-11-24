import type { Backend } from './types'
import { createSupabaseBackend } from './supabase'
import { createDemoBackend } from './demo'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** 환경 변수가 있으면 Supabase, 없으면 브라우저 안에서 도는 데모 모드 */
export const backend: Backend = url && key ? createSupabaseBackend(url, key) : createDemoBackend()

export const isDemo = backend.mode === 'demo'

export type { Backend, Session } from './types'
