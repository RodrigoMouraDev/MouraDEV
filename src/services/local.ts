import * as XLSX from 'xlsx';
import { MODELO_BASE64 } from '../assets/modeloTemplate';
import { listItems } from '../db/database';
import type { PunchItem } from '../types';
import { fileExists, readBase64 } from '../utils/files';
import { today } from '../utils/format';
import { getCachedUser } from './auth';
import { buildMaster, sheetName } from './excel';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const b64ToBytes = (b64: string) => {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const safe = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_').replace(/_+/g, '_');
const photoPath = (it: PunchItem) => `FOTOS/${safe(sheetName(it.area))}/${safe(it.tag)}_${it.localId.slice(0, 8)}.jpg`;

/**
 * Modo local (sem login Microsoft): planilha no padrão do modelo com todos os itens do aparelho.
 * Havendo fotos de itens ainda não enviados, gera um .zip com a planilha + pasta FOTOS (links relativos na coluna Foto).
 */
export async function exportLocal(): Promise<{ name: string; base64: string; mime: string }> {
  const user = await getCachedUser();
  const items = (await listItems()).map((it) => (it.fotoLocalUri && !it.fotoUrl ? { ...it, fotoUrl: photoPath(it) } : it));
  const xlsx = buildMaster(items, MODELO_BASE64, { emitidoPor: user?.displayName ?? '', today: today() });
  const base = `PunchList_${safe(user?.displayName ?? 'usuario')}_${today()}`;
  const photos = items.filter((it) => it.dirty && it.fotoLocalUri);
  if (!photos.length) return { name: `${base}.xlsx`, base64: xlsx, mime: XLSX_MIME };
  const zip = XLSX.CFB.utils.cfb_new();
  XLSX.CFB.utils.cfb_add(zip, `/${base}.xlsx`, b64ToBytes(xlsx));
  for (const it of photos) {
    if (!(await fileExists(it.fotoLocalUri!))) continue;
    XLSX.CFB.utils.cfb_add(zip, `/${it.fotoUrl}`, b64ToBytes(await readBase64(it.fotoLocalUri!)));
  }
  return { name: `${base}.zip`, base64: XLSX.CFB.write(zip, { fileType: 'zip', type: 'base64', compression: false }), mime: 'application/zip' };
}
