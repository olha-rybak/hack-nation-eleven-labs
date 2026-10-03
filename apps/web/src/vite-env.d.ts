/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK?: string
  readonly VITE_API_TARGET?: string
  readonly VITE_FRAME_FPS: string
  readonly VITE_FRAME_CHANGE_MIN_CELLS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
