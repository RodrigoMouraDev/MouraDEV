import * as FS from 'expo-file-system/legacy';
import { COLUMNS } from '../config/columns';
import { ENV } from '../config/env';
import { getMeta, setMeta } from '../db/database';
import { getAccessToken } from './auth';

const GRAPH = 'https://graph.microsoft.com/v1.0';
const encPath = (p: string) => p.split('/').map(encodeURIComponent).join('/');

export async function gfetch<T = any>(path: string, init: RequestInit = {}, retry = 2): Promise<T> {
  const token = await getAccessToken();
  const r = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  if ((r.status === 429 || r.status === 503) && retry > 0) {
    await new Promise((res) => setTimeout(res, 1000 * Number(r.headers.get('Retry-After') ?? 2)));
    return gfetch(path, init, retry - 1);
  }
  if (!r.ok) throw new Error(`Graph ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return (r.status === 204 ? null : r.json()) as T;
}

async function cached(key: string, load: () => Promise<string>) {
  const v = await getMeta(key);
  if (v) return v;
  const n = await load();
  await setMeta(key, n);
  return n;
}

export const siteId = () => cached('sp:site', async () => (await gfetch(`/sites/${ENV.spHost}:${ENV.spSitePath}`)).id);
/** Lista central; criada automaticamente (com todas as colunas) se ainda não existir no site. */
export const listId = () =>
  cached('sp:list', async () => {
    const site = await siteId();
    try {
      return (await gfetch(`/sites/${site}/lists/${encodeURIComponent(ENV.spListName)}`)).id;
    } catch (e) {
      if (!String(e).includes('Graph 404')) throw e;
      const columns = COLUMNS.map((c) => ({
        name: c.sp,
        ...(c.type === 'number' ? { number: {} }
          : c.type === 'date' ? { dateTime: { format: 'dateOnly' } }
          : c.type === 'datetime' ? { dateTime: { format: 'dateTime' } }
          : { text: { allowMultipleLines: ['Descricao', 'Comentarios', 'JustificativaDevolucao', 'FotoUrl'].includes(c.sp) } }),
        ...(['LocalId', 'Area', 'Item'].includes(c.sp) ? { indexed: true } : {}),
      }));
      return (await gfetch(`/sites/${site}/lists`, {
        method: 'POST', body: JSON.stringify({ displayName: ENV.spListName, columns, list: { template: 'genericList' } }),
      })).id;
    }
  });

/** Biblioteca pelo nome exibido ou pelo trecho da URL (ex.: "01 Documentao" para "01 Documentação"). */
export const driveId = () =>
  cached('sp:drive', async () => {
    const { value } = await gfetch<{ value: { id: string; name: string; webUrl: string }[] }>(`/sites/${await siteId()}/drives?$select=id,name,webUrl`);
    const want = ENV.spLibraryName.toLowerCase();
    const d = value.find((x) => x.name.toLowerCase() === want || decodeURIComponent(x.webUrl).toLowerCase().endsWith(`/${want}`));
    if (!d) throw new Error(`Biblioteca "${ENV.spLibraryName}" não encontrada no site`);
    return d.id;
  });

const itemsUrl = async () => `/sites/${await siteId()}/lists/${await listId()}/items`;

/** Todos os itens da Lista (paginado). */
export async function getAllListItems(): Promise<{ id: string; fields: Record<string, any> }[]> {
  const out: { id: string; fields: Record<string, any> }[] = [];
  let url: string | undefined = `${await itemsUrl()}?$expand=fields&$top=500`;
  while (url) {
    const page: any = await gfetch(url);
    out.push(...page.value);
    url = page['@odata.nextLink'];
  }
  return out;
}

export const createListItem = async (fields: Record<string, any>) =>
  (await gfetch<{ id: string }>(await itemsUrl(), { method: 'POST', body: JSON.stringify({ fields }) })).id;

export const updateListItem = async (id: string, fields: Record<string, any>) =>
  gfetch(`${await itemsUrl()}/${id}/fields`, { method: 'PATCH', body: JSON.stringify(fields) });

/** Envia arquivo local para a Biblioteca de Documentos; retorna webUrl. */
export async function uploadFile(localUri: string, drivePath: string, contentType: string): Promise<string> {
  const drive = `${GRAPH}/drives/${await driveId()}/root:/${encPath(drivePath)}`;
  const info = await FS.getInfoAsync(localUri);
  const size = info.exists ? info.size : 0;
  const token = await getAccessToken();
  let res: FS.FileSystemUploadResult;
  if (size < 4 * 1024 * 1024) {
    res = await FS.uploadAsync(`${drive}:/content`, localUri, {
      httpMethod: 'PUT', uploadType: FS.FileSystemUploadType.BINARY_CONTENT,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    });
  } else {
    const { uploadUrl } = await gfetch<{ uploadUrl: string }>(`${drive}:/createUploadSession`, {
      method: 'POST', body: JSON.stringify({ item: { '@microsoft.graph.conflictBehavior': 'replace' } }),
    });
    res = await FS.uploadAsync(uploadUrl, localUri, {
      httpMethod: 'PUT', uploadType: FS.FileSystemUploadType.BINARY_CONTENT,
      headers: { 'Content-Range': `bytes 0-${size - 1}/${size}` },
    });
  }
  if (res.status >= 300) throw new Error(`Upload ${drivePath}: ${res.status} ${res.body.slice(0, 200)}`);
  return JSON.parse(res.body).webUrl;
}

/** Baixa arquivo da Biblioteca. Retorna null se não existir. */
export async function downloadFile(drivePath: string, localUri: string): Promise<string | null> {
  try {
    const meta = await gfetch(`/drives/${await driveId()}/root:/${encPath(drivePath)}`);
    const r = await FS.downloadAsync(meta['@microsoft.graph.downloadUrl'], localUri);
    return r.status < 300 ? r.uri : null;
  } catch (e) {
    if (String(e).includes('Graph 404')) return null;
    throw e;
  }
}
