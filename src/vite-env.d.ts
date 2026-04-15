/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_MSAL_CLIENT_ID: string;
  readonly VITE_MSAL_TENANT_ID: string;
  readonly VITE_SHAREPOINT_SITE_NAME: string;
  readonly VITE_SHAREPOINT_DRIVE_NAME: string;
  readonly VITE_SHAREPOINT_FILE_PATH: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
