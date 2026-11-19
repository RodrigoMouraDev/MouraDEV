const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const pad = (n: number) => String(n).padStart(2, '0');

/** Data do calendário do dispositivo (meia-noite local) em ISO yyyy-mm-dd. */
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
export const nowIso = () => new Date().toISOString();

/** Converte 'yyyy-mm-dd' / ISO completo para Date local. */
export const toDate = (iso: string): Date =>
  /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) : new Date(iso);

/** DD/MMM/YY — mesmo padrão da planilha mestre. */
export const fmtDate = (iso?: string | null) => {
  if (!iso) return '';
  const d = toDate(iso);
  return `${pad(d.getDate())}/${MESES[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
};
export const fmtDateTime = (iso?: string | null) =>
  iso ? `${fmtDate(iso)} ${pad(toDate(iso).getHours())}:${pad(toDate(iso).getMinutes())}` : '';

/** Aceita DD/MM/AAAA, DD/MMM/YY ou ISO; devolve yyyy-mm-dd ou null. */
export const parseDateInput = (s: string): string | null => {
  const t = s.trim().toLowerCase();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})\/([a-z]{3}|\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  const mon = isNaN(+m[2]) ? MESES.indexOf(m[2]) + 1 : +m[2];
  if (mon < 1 || mon > 12) return null;
  const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
  return `${y}-${pad(mon)}-${pad(+m[1])}`;
};

/** Normaliza texto para comparação (sem acento, minúsculo, espaços simples). */
export const norm = (s?: string | null) =>
  (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Chave de duplicidade: Área + TAG + Descrição. */
export const dupKey = (area: string, tag: string, descricao: string) => `${norm(area)}|${norm(tag)}|${norm(descricao)}`;
