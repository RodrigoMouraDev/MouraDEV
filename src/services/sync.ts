import NetInfo from '@react-native-community/netinfo';
import * as FS from 'expo-file-system/legacy';
import { COLUMNS } from '../config/columns';
import { AREAS } from '../config/constants';
import { ENV } from '../config/env';
import { areaEmissao, deleteItem, findBySpId, getItem, listItems, setMeta, upsertItem } from '../db/database';
import type { PunchItem } from '../types';
import { nowIso, today } from '../utils/format';
import { getCachedUser } from './auth';
import { buildMaster } from './excel';
import { createListItem, downloadFile, getAllListItems, updateListItem, uploadFile } from './graph';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MASTER_CACHE = `${FS.documentDirectory}master.xlsx`;
const MASTER_TEMPLATE = `${FS.cacheDirectory}master-template.xlsx`;

const toSp = (it: PunchItem) => {
  const f: Record<string, any> = { Title: `${it.area} - ${it.tag}`.slice(0, 255) };
  for (const c of COLUMNS) {
    const v = it[c.key];
    if (v === null || v === undefined || v === '') { f[c.sp] = null; continue; }
    f[c.sp] = c.type === 'date' ? `${String(v).slice(0, 10)}T12:00:00Z` : c.type === 'number' ? Number(v) : v;
  }
  if (it.item === null) delete f.Item;
  return f;
};

const fromSp = (id: string, f: Record<string, any>, local?: PunchItem | null): PunchItem => {
  const it: any = { ...(local ?? {}), spId: id, dirty: 0, updatedAt: f.Modified ?? nowIso(), fotoLocalUri: local?.fotoLocalUri ?? null };
  for (const c of COLUMNS) {
    const v = f[c.sp];
    it[c.key] = v === undefined || v === null || v === '' ? null : c.type === 'date' ? String(v).slice(0, 10) : c.type === 'number' ? Number(v) : v;
  }
  it.localId = local?.localId ?? f.LocalId ?? `sp-${id}`;
  it.situacao ??= 'Pendente';
  it.statusAprovacao ??= 'Aguardando Aprovação';
  return it as PunchItem;
};

export interface SyncResult { pushed: number; pulled: number; master: boolean }

let running: Promise<SyncResult> | null = null;
export const isOnline = async () => {
  const s = await NetInfo.fetch();
  return !!s.isConnected && s.isInternetReachable !== false;
};

/** Sincronização completa: SharePoint -> local, local -> SharePoint (fotos + lista), planilha mestre. */
export function syncNow(): Promise<SyncResult> {
  running ??= doSync().finally(() => { running = null; });
  return running;
}

async function doSync(): Promise<SyncResult> {
  if (!(await isOnline())) throw new Error('Sem conexão — os itens continuam salvos no aparelho.');
  const rev = today();

  // 1) Pull: atualiza base local com a Lista (itens sem alteração local).
  const remote = await getAllListItems();
  const remoteIds = new Set(remote.map((r) => r.id));
  for (const r of remote) {
    const local = (await findBySpId(r.id)) ?? (r.fields.LocalId ? await getItem(r.fields.LocalId) : null);
    if (local?.dirty) { if (!local.spId) await upsertItem({ ...local, spId: r.id }); continue; }
    await upsertItem(fromSp(r.id, r.fields, local));
  }
  for (const it of await listItems('spId IS NOT NULL AND dirty = 0')) if (!remoteIds.has(it.spId!)) await deleteItem(it.localId);

  // 2) Push: fotos + criação/atualização na Lista.
  const dirty = await listItems('dirty = 1');
  for (const it of dirty) {
    if (it.fotoLocalUri && !it.fotoUrl) {
      const safeArea = it.area.replace(/[^\w-]+/g, '_');
      it.fotoUrl = await uploadFile(it.fotoLocalUri, `${ENV.spPhotoFolder}/${safeArea}/${safeArea}_${it.tag.replace(/[^\w-]+/g, '_')}_${it.localId}.jpg`, 'image/jpeg');
    }
    it.emissaoInicial = await areaEmissao(it.area, it.emissaoInicial ?? rev);
    it.dataRevisao = rev;
    if (!it.spId) it.spId = await createListItem(toSp(it));
    else await updateListItem(it.spId, toSp(it));
    await upsertItem({ ...it, dirty: 0, updatedAt: nowIso() });
  }

  // 2b) "Item" sequencial por Área (1, 2, 3…), na ordem de criação no SharePoint (ID da Lista).
  //     Determinístico: aparelhos sincronizando ao mesmo tempo chegam à mesma numeração, sem conflito.
  for (const area of AREAS) {
    const list = (await listItems('area = ? AND spId IS NOT NULL', [area])).sort((a, b) => Number(a.spId) - Number(b.spId));
    for (const [i, it] of list.entries()) {
      if (it.item === i + 1) continue;
      await updateListItem(it.spId!, { Item: i + 1 });
      await upsertItem({ ...it, item: i + 1 });
    }
  }

  // 3) Planilha mestre no SharePoint, regenerada a partir da Lista (fonte única da verdade).
  let master = false;
  if (dirty.length > 0 || !(await FS.getInfoAsync(MASTER_CACHE)).exists) {
    await publishMaster(rev);
    master = true;
  }
  await setMeta('lastSync', nowIso());
  return { pushed: dirty.length, pulled: remote.length, master };
}

const header = async (rev: string) => ({ emitidoPor: (await getCachedUser())?.displayName ?? '', today: rev });

/** Baixa o modelo atual, aplica a base consolidada e devolve ao SharePoint. */
async function publishMaster(rev: string) {
  const tpl = await downloadFile(ENV.spMasterPath, MASTER_TEMPLATE);
  const template = tpl ? await FS.readAsStringAsync(tpl, { encoding: FS.EncodingType.Base64 }) : null;
  const items = await listItems('spId IS NOT NULL');
  await FS.writeAsStringAsync(MASTER_CACHE, buildMaster(items, template, await header(rev)), { encoding: FS.EncodingType.Base64 });
  await uploadFile(MASTER_CACHE, ENV.spMasterPath, XLSX_MIME);
}

/**
 * Planilha para compartilhar: online -> sincroniza e baixa a versão do SharePoint;
 * offline -> gera a partir da base local (última cópia do modelo).
 */
export async function exportMaster(): Promise<string> {
  const out = `${FS.cacheDirectory}${ENV.spMasterPath.split('/').pop()}`;
  if (await isOnline()) {
    await syncNow();
    const f = await downloadFile(ENV.spMasterPath, out);
    if (f) { await FS.copyAsync({ from: f, to: MASTER_CACHE }); return f; }
  }
  const has = (await FS.getInfoAsync(MASTER_CACHE)).exists;
  const template = has ? await FS.readAsStringAsync(MASTER_CACHE, { encoding: FS.EncodingType.Base64 }) : null;
  await FS.writeAsStringAsync(out, buildMaster(await listItems(), template, await header(today())), { encoding: FS.EncodingType.Base64 });
  return out;
}
