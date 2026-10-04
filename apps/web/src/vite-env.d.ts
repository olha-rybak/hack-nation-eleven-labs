/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MOCK?: string
  readonly VITE_API_TARGET?: string
  readonly VITE_FRAME_FPS: string
  readonly VITE_FRAME_CHANGE_MIN_CELLS: string
  readonly VITE_OFF_THE_RECORD_WINDOW_SEC: string
  readonly VITE_MAX_LIVE_QUESTIONS: string
  readonly VITE_VAD_SPEECH_THRESHOLD: string
  readonly VITE_VAD_RELEASE_MS: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
