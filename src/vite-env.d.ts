/// <reference types="vite/client" />

// Environment variables type definitions
interface ImportMetaEnv {
  readonly VITE_BACKEND: string
  readonly VITE_API_URL: string
  readonly VITE_ASSISTANT_API_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
