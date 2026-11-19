import * as XLSX from 'xlsx';
import { COLUMNS, type ColumnDef } from '../config/columns';
import type { PunchItem } from '../types';
import { norm, parseDateInput, toDate } from '../utils/format';

const MAX_SCAN = 30;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const toSerial = (iso: string) => {
  const d = toDate(iso);
  const day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return (day - EXCEL_EPOCH) / 86400000 + (iso.length > 10 ? (d.getHours() * 60 + d.getMinutes()) / 1440 : 0);
};
const fromCell = (c: XLSX.CellObject | undefined, col: ColumnDef): any => {
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  if (col.type === 'number') return Number(c.v) || null;
  if (col.type === 'date' || col.type === 'datetime') {
    if (typeof c.v === 'number') {
      const p = XLSX.SSF.parse_date_code(c.v);
      return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    }
    return c.v instanceof Date ? c.v.toISOString().slice(0, 10) : parseDateInput(String(c.v));
  }
  return String(c.w ?? c.v).trim();
};

interface Located { ws: XLSX.WorkSheet; name: string; headerRow: number; cols: Map<keyof PunchItem, number>; lastCol: number }

/** Localiza a aba e a linha de cabeçalho (contendo TAG + Descrição). */
function locate(wb: XLSX.WorkBook): Located | null {
  const byHeader = new Map(COLUMNS.map((c) => [norm(c.header), c.key]));
  byHeader.set('descricao', 'descricao');
  byHeader.set('area', 'area');
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + MAX_SCAN); r++) {
      const cols = new Map<keyof PunchItem, number>();
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
        const key = typeof v === 'string' ? byHeader.get(norm(v)) : undefined;
        if (key && !cols.has(key)) cols.set(key, c);
      }
      if (cols.has('tag') && cols.has('descricao')) return { ws, name, headerRow: r, cols, lastCol: range.e.c };
    }
  }
  return null;
}

export interface ContractorParse { rows: Partial<PunchItem>[]; errors: string[] }

/** Lê planilha de contratada; valida colunas obrigatórias (TAG, Descrição). */
export function parseContractor(base64: string): ContractorParse {
  const wb = XLSX.read(base64, { type: 'base64', cellDates: false });
  const loc = locate(wb);
  if (!loc) return { rows: [], errors: ['Colunas obrigatórias não encontradas: "TAG" e "Descrição".'] };
  const { ws, headerRow, cols } = loc;
  const end = XLSX.utils.decode_range(ws['!ref']!).e.r;
  const rows: Partial<PunchItem>[] = [];
  const errors: string[] = [];
  for (let r = headerRow + 1; r <= end; r++) {
    const row: Partial<PunchItem> = {};
    for (const col of COLUMNS) {
      const c = cols.get(col.key);
      if (c !== undefined) (row as any)[col.key] = fromCell(ws[XLSX.utils.encode_cell({ r, c })], col);
    }
    if (!row.tag && !row.descricao) continue; // linha vazia
    if (!row.tag || !row.descricao) errors.push(`Linha ${r + 1}: TAG e Descrição são obrigatórios.`);
    else rows.push(row);
  }
  return { rows, errors };
}

/**
 * Gera a planilha mestre a partir dos itens consolidados.
 * Usa o modelo existente (cabeçalho, abas e blocos acima do cabeçalho preservados) ou cria um novo.
 */
export function buildMaster(items: PunchItem[], templateBase64: string | null, revisao: string): string {
  let wb: XLSX.WorkBook;
  let loc: Located | null = null;
  if (templateBase64) {
    wb = XLSX.read(templateBase64, { type: 'base64', cellStyles: true });
    loc = locate(wb);
  } else wb = XLSX.utils.book_new();

  if (!loc) {
    const ws = XLSX.utils.aoa_to_sheet([COLUMNS.map((c) => c.header)]);
    XLSX.utils.book_append_sheet(wb, ws, 'Punch List', true);
    loc = { ws, name: 'Punch List', headerRow: 0, cols: new Map(COLUMNS.map((c, i) => [c.key, i])), lastCol: COLUMNS.length - 1 };
  }
  const { ws, headerRow, cols } = loc;
  // Colunas ausentes no modelo são acrescentadas à direita.
  let last = Math.max(loc.lastCol, ...cols.values());
  for (const c of COLUMNS) {
    if (!cols.has(c.key)) {
      cols.set(c.key, ++last);
      ws[XLSX.utils.encode_cell({ r: headerRow, c: last })] = { t: 's', v: c.header };
    }
  }
  // Limpa linhas de dados antigas.
  for (const addr of Object.keys(ws)) {
    if (!addr.startsWith('!') && XLSX.utils.decode_cell(addr).r > headerRow) delete ws[addr];
  }
  ws['!merges'] = (ws['!merges'] ?? []).filter((m) => m.e.r <= headerRow);

  const sorted = [...items].sort((a, b) => (a.item ?? 1e9) - (b.item ?? 1e9));
  sorted.forEach((it, i) => {
    const r = headerRow + 1 + i;
    for (const col of COLUMNS) {
      const v = it[col.key];
      if (v === null || v === undefined || v === '') continue;
      const addr = XLSX.utils.encode_cell({ r, c: cols.get(col.key)! });
      if (col.type === 'date' || col.type === 'datetime')
        ws[addr] = { t: 'n', v: toSerial(String(v)), z: col.type === 'date' ? 'dd/mmm/yy' : 'dd/mmm/yy hh:mm' };
      else if (col.type === 'number') ws[addr] = { t: 'n', v: Number(v) };
      else ws[addr] = { t: 's', v: String(v) };
    }
  });

  // Rótulos "Emissão inicial" / "Data da revisão" no bloco acima do cabeçalho: preenche a célula à direita.
  const emissao = items.reduce<string | null>((m, it) => (it.emissaoInicial && (!m || it.emissaoInicial < m) ? it.emissaoInicial : m), null);
  for (let r = 0; r < headerRow; r++) {
    for (let c = 0; c <= last; c++) {
      const label = norm(String(ws[XLSX.utils.encode_cell({ r, c })]?.v ?? '')).replace(/:$/, '');
      const target = XLSX.utils.encode_cell({ r, c: c + 1 });
      if (label === 'data da revisao') ws[target] = { t: 'n', v: toSerial(revisao), z: 'dd/mmm/yy' };
      if (label === 'emissao inicial' && emissao && !ws[target]?.v) ws[target] = { t: 'n', v: toSerial(emissao), z: 'dd/mmm/yy' };
    }
  }
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: headerRow + Math.max(sorted.length, 1), c: last } });
  ws['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + sorted.length, c: last } }) };
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx', cellStyles: true });
}
