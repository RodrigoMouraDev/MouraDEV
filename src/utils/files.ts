import * as FS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

const PHOTO_DIR = `${FS.documentDirectory}photos/`;

/** Copia a foto para o armazenamento do app (o cache do seletor pode ser limpo). */
export async function persistPhoto(uri: string, id: string) {
  await FS.makeDirectoryAsync(PHOTO_DIR, { intermediates: true }).catch(() => {});
  const dest = `${PHOTO_DIR}${id}.jpg`;
  await FS.copyAsync({ from: uri, to: dest });
  return dest;
}

export const readBase64 = (uri: string) => FS.readAsStringAsync(uri, { encoding: FS.EncodingType.Base64 });
export const fileExists = async (uri: string) => (await FS.getInfoAsync(uri)).exists;

/** Abre o compartilhar do aparelho. Retorna true (no nativo não há como saber se foi cancelado). */
export async function shareFile(name: string, base64: string, mime: string) {
  const out = `${FS.cacheDirectory}${name}`;
  await FS.writeAsStringAsync(out, base64, { encoding: FS.EncodingType.Base64 });
  await Sharing.shareAsync(out, {
    mimeType: mime, UTI: mime.includes('zip') ? 'public.zip-archive' : 'org.openxmlformats.spreadsheetml.sheet', dialogTitle: 'Enviar Punch List',
  });
  return true;
}
