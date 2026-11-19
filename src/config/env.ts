/** Variáveis públicas (EXPO_PUBLIC_*) definidas em .env — veja .env.example. */
const req = (name: string, v: string | undefined) => {
  if (!v) console.warn(`[env] ${name} não definido`);
  return v ?? '';
};

export const ENV = {
  tenantId: req('EXPO_PUBLIC_AZURE_TENANT_ID', process.env.EXPO_PUBLIC_AZURE_TENANT_ID),
  clientId: req('EXPO_PUBLIC_AZURE_CLIENT_ID', process.env.EXPO_PUBLIC_AZURE_CLIENT_ID),
  /** ex.: arauco.sharepoint.com */
  spHost: req('EXPO_PUBLIC_SP_HOSTNAME', process.env.EXPO_PUBLIC_SP_HOSTNAME),
  /** ex.: /sites/ProjetoSucuriu */
  spSitePath: req('EXPO_PUBLIC_SP_SITE_PATH', process.env.EXPO_PUBLIC_SP_SITE_PATH),
  spListName: process.env.EXPO_PUBLIC_SP_LIST_NAME || 'PunchList',
  spLibraryName: process.env.EXPO_PUBLIC_SP_LIBRARY_NAME || 'Documentos',
  spPhotoFolder: process.env.EXPO_PUBLIC_SP_PHOTO_FOLDER || 'PunchList/Fotos',
  spMasterPath: process.env.EXPO_PUBLIC_SP_MASTER_PATH || 'PunchList/Modelo - Punch list.xlsx',
};

export const SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Sites.ReadWrite.All'];
