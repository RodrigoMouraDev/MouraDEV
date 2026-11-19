import * as FS from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { MODELO_BASE64 } from '../assets/modeloTemplate';
import { getDb, listItems } from '../db/database';
import type { PunchItem } from '../types';
import { today } from '../utils/format';
import { getCachedUser } from './auth';
import { buildMaster, sheetName } from './excel';

const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const safe = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
const photoPath = (it: PunchItem) => `FOTOS/${safe(sheetName(it.area))}/${safe(it.tag)}_${it.localId.slice(0, 8)}.jpg`;

/**
 * Modo local (sem login Microsoft): gera a planilha no padrão do modelo com todos os itens do aparelho.
 * Havendo fotos de itens ainda não enviados, gera um .zip com a planilha + pasta FOTOS (links relativos na coluna Foto).
 */
export async function exportLocal(): Promise<string> {
  const user = await getCachedUser();
  const items = (await listItems()).map((it) => (it.fotoLocalUri && !it.fotoUrl ? { ...it, fotoUrl: photoPath(it) } : it));
  const xlsx = buildMaster(items, MODELO_BASE64, { emitidoPor: user?.displayName ?? '', today: today() });
  const base = `PunchList_${safe(user?.displayName ?? 'usuario')}_${today()}`;
  const photos = items.filter((it) => it.dirty && it.fotoLocalUri);
  if (!photos.length) {
    const out = `${FS.cacheDirectory}${base}.xlsx`;
    await FS.writeAsStringAsync(out, xlsx, { encoding: FS.EncodingType.Base64 });
    return out;
  }
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, `/${base}.xlsx`, b64ToBytes(xlsx));
  for (const it of photos) {
    const info = await FS.getInfoAsync(it.fotoLocalUri!);
    if (!info.exists) continue;
    XLSX.CFB.utils.cfb_add(zip, `/${it.fotoUrl}`, b64ToBytes(await FS.readAsStringAsync(it.fotoLocalUri!, { encoding: FS.EncodingType.Base64 })));
  }
  const out = `${FS.cacheDirectory}${base}.zip`;
  await FS.writeAsStringAsync(out, XLSX.CFB.write(zip, { fileType: 'zip', type: 'base64', compression: false }), { encoding: FS.EncodingType.Base64 });
  return out;
}

/** Após compartilhar: itens deixam de contar como pendentes de envio. */
export async function markExported() {
  await (await getDb()).runAsync('UPDATE items SET dirty = 0 WHERE dirty = 1');
}
