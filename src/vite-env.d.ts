/// <reference types="vite/client" />

declare global {
  interface ImportMetaEnv {
    VITE_SUPABASE_URL: string;
    VITE_SUPABASE_ANON_KEY: string;
    VITE_PUBLIC_URL?: string;
    [key: string]: string | undefined;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }

  interface Window {
    Capacitor?: {
      isNativePlatform?: boolean | (() => boolean);
      [key: string]: unknown;
    };
    AndroidBilling?: any;
  }
}

export {};
