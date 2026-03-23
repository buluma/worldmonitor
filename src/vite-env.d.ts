/// <reference types="vite/client" />

interface Window {
  umami?: {
    track: (event: string, data?: Record<string, unknown>) => void;
    identify: (data: Record<string, unknown>) => void;
  };
}

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_SENTRY_DSN?: string;
  readonly VITE_SENTRY_TRACES_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_REPLAY_SESSION_SAMPLE_RATE?: string;
  readonly VITE_SENTRY_REPLAY_ON_ERROR_SAMPLE_RATE?: string;
  readonly VITE_WS_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
