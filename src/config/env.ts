/** Variáveis públicas (EXPO_PUBLIC_*) definidas em .env — veja .env.example. */
const req = (_name: string, v: string | undefined) => v ?? '';

/** Pasta do Punch List na biblioteca "01 Documentação" do site AraucoProjetoSucuriu (Timenow). */
const PUNCH_FOLDER = 'GERENCIAMENTO DE EPC/05- Qualidade/QUALIDADE - SUCURIU/07 - GESTÃO E CONTROLE/10-PUNCH LIST';

export const ENV = {
  tenantId: req('EXPO_PUBLIC_AZURE_TENANT_ID', process.env.EXPO_PUBLIC_AZURE_TENANT_ID),
  clientId: req('EXPO_PUBLIC_AZURE_CLIENT_ID', process.env.EXPO_PUBLIC_AZURE_CLIENT_ID),
  spHost: process.env.EXPO_PUBLIC_SP_HOSTNAME || 'timenow.sharepoint.com',
  spSitePath: process.env.EXPO_PUBLIC_SP_SITE_PATH || '/sites/AraucoProjetoSucuriu',
  spListName: process.env.EXPO_PUBLIC_SP_LIST_NAME || 'PunchList',
  /** Nome da biblioteca ou o trecho da URL dela (aqui: .../sites/AraucoProjetoSucuriu/01 Documentao). */
  spLibraryName: process.env.EXPO_PUBLIC_SP_LIBRARY_NAME || '01 Documentao',
  spPhotoFolder: process.env.EXPO_PUBLIC_SP_PHOTO_FOLDER || `${PUNCH_FOLDER}/FOTOS`,
  spMasterPath: process.env.EXPO_PUBLIC_SP_MASTER_PATH || `${PUNCH_FOLDER}/BASE DE DADOS/Modelo - Punch list.xlsx`,
};

/** Sites.Manage.All: permite ao app criar a Lista "PunchList" na primeira sincronização, se ainda não existir. */
/** Sem Client ID => modo local (sem login Microsoft): exporta planilha + fotos pelo compartilhar do aparelho. */
export const CLOUD = !!process.env.EXPO_PUBLIC_AZURE_CLIENT_ID;

export const SCOPES = ['openid', 'profile', 'offline_access', 'User.Read', 'Sites.ReadWrite.All', 'Sites.Manage.All'];
