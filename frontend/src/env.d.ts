/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `mock` (default) runs against the in-browser API; `http` calls the backend. */
  readonly VITE_API_MODE?: 'mock' | 'http';
  /** Backend origin for `http` mode, e.g. https://api.example.com. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
