import * as SQLite from 'expo-sqlite';
import type { PunchItem } from '../types';

const FIELDS: (keyof PunchItem)[] = [
  'localId', 'spId', 'item', 'area', 'tag', 'descricao', 'disciplina', 'fotoLocalUri', 'fotoUrl', 'categoria',
  'impactos', 'tipo', 'solicitadoPor', 'origem', 'dataInsercao', 'emissaoInicial', 'dataRevisao', 'responsavel',
  'dataPrevista', 'situacao', 'dataConclusao', 'comentarios', 'statusAprovacao', 'aprovador', 'frenteAprovacao',
  'dataAprovacao', 'justificativa', 'dirty', 'updatedAt',
];

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export const getDb = () => {
  dbPromise ??= (async () => {
    const db = await SQLite.openDatabaseAsync('punchlist.db');
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS items (
        ${FIELDS.map((f) => `${f} ${f === 'localId' ? 'TEXT PRIMARY KEY' : f === 'item' || f === 'dirty' ? 'INTEGER' : 'TEXT'}`).join(',\n')}
      );
      CREATE INDEX IF NOT EXISTS idx_items_sp ON items(spId);
      CREATE INDEX IF NOT EXISTS idx_items_dirty ON items(dirty);
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
    `);
    return db;
  })();
  return dbPromise;
};

export async function upsertItem(it: PunchItem) {
  const db = await getDb();
  await db.runAsync(
    `INSERT OR REPLACE INTO items (${FIELDS.join(',')}) VALUES (${FIELDS.map(() => '?').join(',')})`,
    FIELDS.map((f) => (it[f] ?? null) as SQLite.SQLiteBindValue),
  );
}

export async function listItems(where = '1=1', params: SQLite.SQLiteBindValue[] = []) {
  const db = await getDb();
  return db.getAllAsync<PunchItem>(`SELECT * FROM items WHERE ${where} ORDER BY COALESCE(item, 999999999) DESC, dataInsercao DESC`, params);
}

export const getItem = async (localId: string) =>
  (await getDb()).getFirstAsync<PunchItem>('SELECT * FROM items WHERE localId = ?', [localId]);

export const findBySpId = async (spId: string) =>
  (await getDb()).getFirstAsync<PunchItem>('SELECT * FROM items WHERE spId = ?', [spId]);

export async function pendingCount() {
  const r = await (await getDb()).getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM items WHERE dirty = 1');
  return r?.n ?? 0;
}

export async function getMeta(key: string) {
  const r = await (await getDb()).getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', [key]);
  return r?.value ?? null;
}
export async function setMeta(key: string, value: string) {
  await (await getDb()).runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

/** Emissão inicial da área: a mais antiga já registrada (local ou SharePoint) é preservada. */
export async function areaEmissao(area: string, fallback: string) {
  const r = await (await getDb()).getFirstAsync<{ v: string | null }>(
    'SELECT MIN(emissaoInicial) v FROM items WHERE area = ? AND emissaoInicial IS NOT NULL', [area]);
  return r?.v ?? fallback;
}

export async function deleteItem(localId: string) {
  await (await getDb()).runAsync('DELETE FROM items WHERE localId = ?', [localId]);
}

/** Próximo Item da área (modo local). */
export async function nextItem(area: string) {
  const r = await (await getDb()).getFirstAsync<{ n: number | null }>('SELECT MAX(item) n FROM items WHERE area = ?', [area]);
  return (r?.n ?? 0) + 1;
}
