/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface PaizuoDesktopBridge {
  getEnv: () => Promise<{ apiOrigin: string; backendPort: number }>;
}

interface Window {
  paizuoDesktop?: PaizuoDesktopBridge;
}
