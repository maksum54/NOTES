/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_VIKEY_BASE_URL?: string
  readonly VITE_VIKEY_MODEL?: string
  readonly VITE_VIKEY_API_KEY?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
