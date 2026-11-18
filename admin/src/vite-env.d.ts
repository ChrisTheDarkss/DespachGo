/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Clave de OpenRouteService (opcional) */
  readonly key_rutas?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
