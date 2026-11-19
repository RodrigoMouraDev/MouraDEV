/**
 * Versão web (iPhone via Safari / tela de início): mesma API do SQLite, gravando em IndexedDB.
 * Itens ficam em memória e cada alteração é persistida.
 */
import type { PunchItem } from '../types';
import type { ItemFilter } from './database';

export type { ItemFilter } from './database';

let mem: Map<string, PunchItem> | null = null;
const meta = new Map<string, string>();
let dbp: Promise<IDBDatabase> | null = null;

const idb = () => {
  dbp ??= new Promise((res, rej) => {
    const r = indexedDB.open('punchlist', 1);
    r.onupgradeneeded = () => { r.result.createObjectStore('items', { keyPath: 'localId' }); r.result.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
};
const tx = async (store: string, fn: (s: IDBObjectStore) => void) => {
  const db = await idb();
  await new Promise<void>((res, rej) => {
    const t = db.transaction(store, 'readwrite');
    fn(t.objectStore(store));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
  });
};
const all = <T,>(store: string) => idb().then((db) => new Promise<{ k: IDBValidKey; v: T }[]>((res, rej) => {
  const out: { k: IDBValidKey; v: T }[] = [];
  const r = db.transaction(store).objectStore(store).openCursor();
  r.onsuccess = () => { const c = r.result; if (c) { out.push({ k: c.key, v: c.value }); c.continue(); } else res(out); };
  r.onerror = () => rej(r.error);
}));

async function load() {
  if (mem) return mem;
  navigator.storage?.persist?.().catch(() => {});
  mem = new Map((await all<PunchItem>('items')).map(({ v }) => [v.localId, v]));
  for (const { k, v } of await all<string>('meta')) meta.set(String(k), v);
  return mem;
}

export const getDb = load;

export async function upsertItem(it: PunchItem) {
  (await load()).set(it.localId, { ...it });
  await tx('items', (s) => s.put({ ...it }));
}

export async function listItems(f: ItemFilter = {}) {
  const areas = Array.isArray(f.area) ? f.area : f.area ? [f.area] : null;
  return [...(await load()).values()]
    .filter((i) => (!areas || areas.includes(i.area))
      && (f.disciplina === undefined || i.disciplina === f.disciplina)
      && (f.situacao === undefined || i.situacao === f.situacao)
      && (f.statusAprovacao === undefined || i.statusAprovacao === f.statusAprovacao)
      && (f.dirty === undefined || i.dirty === f.dirty)
      && (f.synced === undefined || !!i.spId === f.synced))
    .sort((a, b) => (b.item ?? 1e9) - (a.item ?? 1e9) || b.dataInsercao.localeCompare(a.dataInsercao));
}

export const getItem = async (localId: string) => (await load()).get(localId) ?? null;
export const findBySpId = async (spId: string) => [...(await load()).values()].find((i) => i.spId === spId) ?? null;
export const pendingCount = async () => [...(await load()).values()].filter((i) => i.dirty).length;

export async function markAllClean() {
  const changed = [...(await load()).values()].filter((i) => i.dirty).map((i) => ({ ...i, dirty: 0 }));
  for (const i of changed) mem!.set(i.localId, i);
  await tx('items', (s) => changed.forEach((i) => s.put(i)));
}

export async function getMeta(key: string) { await load(); return meta.get(key) ?? null; }
export async function setMeta(key: string, value: string) { meta.set(key, value); await tx('meta', (s) => s.put(value, key)); }

export async function areaEmissao(area: string, fallback: string) {
  const ds = [...(await load()).values()].filter((i) => i.area === area && i.emissaoInicial).map((i) => i.emissaoInicial!).sort();
  return ds[0] ?? fallback;
}

export async function deleteItem(localId: string) {
  (await load()).delete(localId);
  await tx('items', (s) => s.delete(localId));
}

export async function nextItem(area: string) {
  return Math.max(0, ...[...(await load()).values()].filter((i) => i.area === area).map((i) => i.item ?? 0)) + 1;
}
