/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_TURNSTILE_SITE_KEY?: string
  readonly VITE_STORAGE_LOCATION?: string
  readonly VITE_OPERATOR_NAME?: string
  readonly VITE_OPERATOR_EMAIL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
