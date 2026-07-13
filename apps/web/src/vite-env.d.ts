/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SLEEPER_AI_API_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
