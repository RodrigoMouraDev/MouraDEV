import * as XLSX from 'xlsx';
import { APPROVAL_KEYS, COLUMNS, HEADER_ALIASES, type ColumnDef } from '../config/columns';
import { AREAS, UNIDADES } from '../config/constants';
import type { PunchItem } from '../types';
import { fmtDateTime, norm, parseDateInput, toDate } from '../utils/format';
import { utf8Decode, utf8Encode } from '../utils/utf8';

/* ---------------------------------------------------------------- leitura */

const MAX_SCAN = 30;
const BY_HEADER = new Map<string, keyof PunchItem>([...COLUMNS.map((c) => [norm(c.header), c.key] as const), ...Object.entries(HEADER_ALIASES)]);
const COL_BY_KEY = new Map(COLUMNS.map((c) => [c.key, c]));

interface Located { ws: XLSX.WorkSheet; name: string; headerRow: number; dataRow: number; cols: Map<keyof PunchItem, number> }

/** Localiza aba + cabeçalho (linha com TAG e Descrição; aceita sub-cabeçalho, ex.: Classificação → Categoria/Impactos/Tipo). */
function locate(wb: XLSX.WorkBook, names: string[] = wb.SheetNames): Located | null {
  for (const name of names) {
    const ws = wb.Sheets[name];
    if (!ws['!ref']) continue;
    const range = XLSX.utils.decode_range(ws['!ref']);
    const scan = (r: number, cols: Map<keyof PunchItem, number>) => {
      let hits = 0;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const v = ws[XLSX.utils.encode_cell({ r, c })]?.v;
        const key = typeof v === 'string' ? BY_HEADER.get(norm(v).replace(/:$/, '')) : undefined;
        if (key && !cols.has(key)) { cols.set(key, c); hits++; }
      }
      return hits;
    };
    for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + MAX_SCAN); r++) {
      const cols = new Map<keyof PunchItem, number>();
      scan(r, cols);
      if (!cols.has('tag') || !cols.has('descricao')) continue;
      const sub = scan(r + 1, cols);
      return { ws, name, headerRow: r, dataRow: r + (sub ? 2 : 1), cols };
    }
  }
  return null;
}

const fromCell = (c: XLSX.CellObject | undefined, col: ColumnDef): any => {
  if (!c || c.v === undefined || c.v === null || c.v === '') return null;
  if (col.type === 'number') return Number(c.v) || null;
  if (col.type === 'date' || col.type === 'datetime') {
    if (typeof c.v === 'number') {
      const p = XLSX.SSF.parse_date_code(c.v);
      return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
    }
    return parseDateInput(String(c.v));
  }
  return String(c.w ?? c.v).trim();
};

export interface ContractorParse { rows: Partial<PunchItem>[]; errors: string[] }

/** Lê planilha da contratada (mesmo padrão do modelo); exige TAG e Descrição. */
export function parseContractor(base64: string): ContractorParse {
  const wb = XLSX.read(base64, { type: 'base64' });
  let found = false;
  const allRows: Partial<PunchItem>[] = [];
  const allErrors: string[] = [];
  // Abas com nome de Área (planilha exportada pelo app) trazem a área; senão usa a primeira aba preenchida.
  for (const name of wb.SheetNames) {
    const loc = locate(wb, [name]);
    if (!loc) continue;
    found = true;
    const sheetArea = AREAS.find((a) => sheetName(a) === name);
    if (!sheetArea && allRows.length) continue;
    const { ws, dataRow, cols } = loc;
    const end = XLSX.utils.decode_range(ws['!ref']!).e.r;
    const rows: Partial<PunchItem>[] = [];
    const errors: string[] = [];
    for (let r = dataRow; r <= end; r++) {
      const row: Partial<PunchItem> = {};
      for (const [key, c] of cols) (row as any)[key] = fromCell(ws[XLSX.utils.encode_cell({ r, c })], COL_BY_KEY.get(key)!);
      if (!row.tag && !row.descricao) continue;
      if (sheetArea) row.area = sheetArea;
      if (!row.tag || !row.descricao) errors.push(`Aba ${name}, linha ${r + 1}: TAG e Descrição são obrigatórios.`);
      else rows.push(row);
    }
    allRows.push(...rows); allErrors.push(...errors);
    if (!sheetArea && (rows.length || errors.length)) break; // planilha de contratada: uma aba só
  }
  if (allRows.length || allErrors.length) return { rows: allRows, errors: allErrors };
  return { rows: [], errors: [found ? 'Nenhuma pendência preenchida no arquivo.' : 'Colunas obrigatórias não encontradas: "TAG" e "Descrição".'] };
}

/* ---------------------------------------------------------- escrita (XML) */
/*
 * A planilha mestre é gerada editando o XML do próprio "Modelo - Punch list.xlsx": formatação, logo, abas
 * "Instruções"/"Dados"/"Controle" e a aba-modelo "Lista" ficam intactas. Cada Área ganha uma aba (clone da
 * "Lista") com cabeçalho (Área, Emissão inicial, Data da revisão, Emitido por) e as linhas de pendências.
 */

const TEMPLATE_SHEET = 'Lista';
const NS_REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const CT_SHEET = 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml';
const CT_DRAWING = 'application/vnd.openxmlformats-officedocument.drawing+xml';
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colLetter = (c: number) => XLSX.utils.encode_col(c);
const toSerial = (iso: string) => {
  const d = toDate(iso);
  return (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EXCEL_EPOCH) / 86400000;
};
export const sheetName = (area: string) => area.replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

class Pkg {
  z: any;
  constructor(b64: string) { this.z = XLSX.CFB.read(b64, { type: 'base64' }); }
  get(p: string): string | null {
    const e = XLSX.CFB.find(this.z, `/${p}`);
    return e ? utf8Decode(e.content) : null;
  }
  set(p: string, s: string) {
    const b = utf8Encode(s);
    const e = XLSX.CFB.find(this.z, `/${p}`);
    if (e) { e.content = b; e.size = b.length; } else XLSX.CFB.utils.cfb_add(this.z, `/${p}`, b);
  }
  copy(from: string, to: string) {
    const e = XLSX.CFB.find(this.z, `/${from}`);
    if (e) XLSX.CFB.utils.cfb_add(this.z, `/${to}`, e.content);
  }
  has(p: string) { return !!XLSX.CFB.find(this.z, `/${p}`); }
  out(): string { return XLSX.CFB.write(this.z, { fileType: 'zip', type: 'base64', compression: true }); }
}

type Val = { t: 's'; v: string } | { t: 'n'; v: number } | { t: 'f'; f: string; v: string } | null;
const cellXml = (ref: string, s: string | undefined, val: Val) => {
  const st = s ? ` s="${s}"` : '';
  if (!val) return `<c r="${ref}"${st}/>`;
  if (val.t === 'n') return `<c r="${ref}"${st}><v>${val.v}</v></c>`;
  if (val.t === 'f') return `<c r="${ref}"${st} t="str"><f>${esc(val.f)}</f><v>${esc(val.v)}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${esc(val.v)}</t></is></c>`;
};
const cellRe = (ref: string) => new RegExp(`<c r="${ref}"(?=[\\s/>])[^>]*?(?:/>|>[\\s\\S]*?</c>)`);

/** Substitui (mantendo o estilo) ou acrescenta uma célula no XML da planilha. */
function putCell(xml: string, ref: string, val: Val, style?: string): string {
  const m = xml.match(cellRe(ref));
  if (m) return xml.replace(m[0], cellXml(ref, style ?? m[0].match(/ s="(\d+)"/)?.[1], val));
  const row = ref.replace(/^[A-Z]+/, '');
  const rowRe = new RegExp(`<row r="${row}"([^>]*?)(/>|>([\\s\\S]*?)</row>)`);
  const rm = xml.match(rowRe);
  if (!rm) return xml;
  return xml.replace(rm[0], `<row r="${row}"${rm[1]}>${rm[3] ?? ''}${cellXml(ref, style, val)}</row>`);
}
const getStyle = (xml: string, ref: string) => xml.match(cellRe(ref))?.[0].match(/ s="(\d+)"/)?.[1];
const getValue = (xml: string, ref: string) => xml.match(cellRe(ref))?.[0].match(/<v>([^<]*)<\/v>|<t[^>]*>([^<]*)<\/t>/)?.slice(1).find(Boolean);

/** Garante um estilo (xf) em styles.xml e devolve o índice — sem duplicar a cada sincronização. */
function ensureXf(styles: { xml: string }, xf: string): string {
  const m = styles.xml.match(/<cellXfs count="(\d+)">([\s\S]*?)<\/cellXfs>/)!;
  const list: string[] = m[2].match(/<xf [^>]*?(?:\/>|>[\s\S]*?<\/xf>)/g) ?? [];
  const i = list.indexOf(xf);
  if (i >= 0) return String(i);
  styles.xml = styles.xml.replace(m[0], `<cellXfs count="${list.length + 1}">${m[2]}${xf}</cellXfs>`);
  return String(list.length);
}

interface Layout {
  cols: [keyof PunchItem, string][]; // campo -> letra da coluna
  headerRow: number; subRow: number; dataRow: number; // 1-based
  first: string; last: string;
  labels: Partial<Record<'area' | 'fornecedor' | 'emissao' | 'revisao' | 'emitido' | 'doc', string>>; // célula do valor
}

function layoutOf(wb: XLSX.WorkBook): Layout | null {
  const loc = locate(wb, wb.SheetNames.includes(TEMPLATE_SHEET) ? [TEMPLATE_SHEET] : wb.SheetNames);
  if (!loc) return null;
  const base = [...loc.cols.entries()].filter(([k]) => !APPROVAL_KEYS.includes(k)).sort((a, b) => a[1] - b[1]);
  let next = Math.max(...base.map(([, c]) => c)) + 1;
  const cols: [keyof PunchItem, string][] = [...base.map(([k, c]) => [k, colLetter(c)] as [keyof PunchItem, string]),
    ...APPROVAL_KEYS.map((k) => [k, colLetter(next++)] as [keyof PunchItem, string])];
  const labels: Layout['labels'] = {};
  const LABELS: Record<string, keyof Layout['labels']> = {
    'ilha de processo / area': 'area', unidade: 'area', area: 'area', fornecedor: 'fornecedor', 'emissao inicial': 'emissao',
    'data da revisao': 'revisao', 'emitido por': 'emitido',
  };
  for (const [addr, cell] of Object.entries(loc.ws)) {
    if (addr.startsWith('!') || typeof (cell as XLSX.CellObject).v !== 'string') continue;
    const { r, c } = XLSX.utils.decode_cell(addr);
    const lbl = norm((cell as XLSX.CellObject).v as string).replace(/:$/, '');
    const key = LABELS[lbl] ?? (lbl.startsWith('doc. n') ? 'doc' : undefined);
    if (key && r < loc.headerRow) labels[key] = XLSX.utils.encode_cell({ r: r + 1, c }); // valor logo abaixo do rótulo
  }
  return {
    cols, labels, headerRow: loc.headerRow + 1, subRow: loc.dataRow, dataRow: loc.dataRow + 1,
    first: cols.reduce((m, [, l]) => (XLSX.utils.decode_col(l) < XLSX.utils.decode_col(m) ? l : m), cols[0][1]),
    last: cols[cols.length - 1][1],
  };
}

const HEADERS: Partial<Record<keyof PunchItem, string>> = Object.fromEntries(COLUMNS.map((c) => [c.key, c.header]));

function renderSheet(xml: string, L: Layout, items: PunchItem[], head: { area: string; emissao: string | null; revisao: string; emitido: string },
  isNew: boolean, st: { text: string; left: string; date: string; num: string }): string {
  // Cabeçalho: área/emitido (nova aba), emissão inicial preservada, data da revisão sempre atualizada.
  const { labels } = L;
  if (isNew) {
    if (labels.area) xml = putCell(xml, labels.area, { t: 's', v: head.area });
    if (labels.fornecedor) xml = putCell(xml, labels.fornecedor, null);
    if (labels.emitido) xml = putCell(xml, labels.emitido, { t: 's', v: head.emitido });
    if (labels.doc) xml = putCell(xml, labels.doc, null);
  }
  if (labels.emissao && head.emissao && (isNew || !getValue(xml, labels.emissao))) xml = putCell(xml, labels.emissao, { t: 'n', v: toSerial(head.emissao) });
  if (labels.revisao) xml = putCell(xml, labels.revisao, { t: 'n', v: toSerial(head.revisao) });

  // Colunas de aprovação (cabeçalho mesclado em 2 linhas, mesmo estilo da última coluna do modelo).
  const lastBase = L.cols[L.cols.length - APPROVAL_KEYS.length - 1][1];
  const h1 = getStyle(xml, `${lastBase}${L.headerRow}`), h2 = getStyle(xml, `${lastBase}${L.subRow}`);
  const merges: string[] = [];
  for (const k of APPROVAL_KEYS) {
    const l = L.cols.find(([key]) => key === k)![1];
    xml = putCell(xml, `${l}${L.headerRow}`, { t: 's', v: HEADERS[k]! }, h1);
    if (L.subRow > L.headerRow) { xml = putCell(xml, `${l}${L.subRow}`, null, h2); merges.push(`${l}${L.headerRow}:${l}${L.subRow}`); }
  }

  // Linhas de dados.
  const rows = [...items].sort((a, b) => (a.item ?? 1e9) - (b.item ?? 1e9)).map((it, i) => {
    const r = L.dataRow + i;
    const cells = L.cols.map(([k, l]) => {
      const v = it[k];
      const ref = `${l}${r}`;
      const col = COL_BY_KEY.get(k)!;
      if (v === null || v === undefined || v === '') return cellXml(ref, st.text, null);
      if (k === 'fotoUrl') { // URL do SharePoint -> "Foto"; caminho relativo (pacote .zip) -> o próprio caminho
        const u = String(v).replace(/"/g, '""');
        const label = /^https?:/i.test(String(v)) ? 'Foto' : String(v);
        return cellXml(ref, st.text, { t: 'f', f: `HYPERLINK("${u}","${label.replace(/"/g, '""')}")`, v: label });
      }
      if (k === 'dataAprovacao') return cellXml(ref, st.text, { t: 's', v: fmtDateTime(String(v)) });
      if (col.type === 'date') return cellXml(ref, st.date, { t: 'n', v: toSerial(String(v)) });
      if (col.type === 'number') return cellXml(ref, st.num, { t: 'n', v: Number(v) });
      return cellXml(ref, k === 'descricao' || k === 'comentarios' || k === 'justificativa' ? st.left : st.text, { t: 's', v: String(v) });
    });
    return `<row r="${r}">${cells.join('')}</row>`;
  });
  const lastRow = Math.max(L.subRow, L.dataRow + items.length - 1);
  xml = xml.replace(/<sheetData>([\s\S]*?)<\/sheetData>|<sheetData\/>/, (_m, inner = '') => {
    const keep = (inner.match(/<row [^>]*?(?:\/>|>[\s\S]*?<\/row>)/g) ?? []).filter((row: string) => Number(row.match(/ r="(\d+)"/)![1]) < L.dataRow);
    return `<sheetData>${keep.join('')}${rows.join('')}</sheetData>`;
  });

  // Larguras das colunas novas, dimensão, filtro e mesclagens.
  const firstExtra = XLSX.utils.decode_col(L.cols[L.cols.length - APPROVAL_KEYS.length][1]) + 1;
  const lastExtra = XLSX.utils.decode_col(L.last) + 1;
  xml = xml.replace(/<cols>([\s\S]*?)<\/cols>/, (_m, inner: string) =>
    `<cols>${(inner.match(/<col [^>]*\/>/g) ?? []).filter((c) => Number(c.match(/min="(\d+)"/)![1]) < firstExtra).join('')}` +
    `<col min="${firstExtra}" max="${lastExtra}" width="22" customWidth="1"/><col min="${lastExtra + 1}" max="${lastExtra + 1}" width="1.7109375" customWidth="1"/></cols>`);
  xml = xml.replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="${L.first}1:${L.last}${lastRow}"/>`);
  xml = xml.replace(/<autoFilter ref="[^"]*"/, `<autoFilter ref="${L.first}${L.headerRow}:${L.last}${lastRow}"`);
  const existing: string[] = xml.match(/<mergeCell ref="[^"]*"\/>/g) ?? [];
  const merged = [...existing, ...merges.map((m) => `<mergeCell ref="${m}"/>`).filter((m) => !existing.includes(m))];
  xml = xml.replace(/<mergeCells count="\d+">[\s\S]*?<\/mergeCells>/, `<mergeCells count="${merged.length}">${merged.join('')}</mergeCells>`);
  return xml;
}

export interface MasterHeader { emitidoPor: string; today: string }

/** Gera a planilha mestre a partir do modelo (base64). Sem modelo, gera uma planilha simples. */
export function buildMaster(items: PunchItem[], templateBase64: string | null, h: MasterHeader): string {
  const wb = templateBase64 ? XLSX.read(templateBase64, { type: 'base64', bookSheets: false }) : null;
  const L = wb ? layoutOf(wb) : null;
  if (!templateBase64 || !L) return buildSimple(items);

  const pkg = new Pkg(templateBase64);
  const wbXml0 = pkg.get('xl/workbook.xml')!;
  let wbXml = wbXml0;
  let rels = pkg.get('xl/_rels/workbook.xml.rels')!;
  let ct = pkg.get('[Content_Types].xml')!;
  const styles = { xml: pkg.get('xl/styles.xml')! };

  const target = (rid: string) => rels.match(new RegExp(`<Relationship [^>]*Id="${rid}"[^>]*>`))![0].match(/Target="([^"]+)"/)![1].replace(/^\/?xl\//, '');
  const sheets = () => [...wbXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"[^>]*\/>/g)].map((m) => ({ name: m[1].replace(/&amp;/g, '&'), rid: m[2] }));
  const tpl = sheets().find((s) => s.name === TEMPLATE_SHEET) ?? sheets()[0];
  const tplPath = `xl/${target(tpl.rid)}`;
  const tplXml = pkg.get(tplPath)!;
  const tplRels = pkg.get(tplPath.replace('worksheets/', 'worksheets/_rels/') + '.rels');

  // Estilos das células de dados (fonte padrão, borda fina, alinhamento central / à esquerda, data dd-mmm-yy).
  const dateFmt = styles.xml.match(/<numFmt numFmtId="(\d+)" formatCode="\[\$-416\]d\\-mmm\\-yy;@"\/>/)?.[1] ?? '15';
  const border = '1';
  const xf = (fmt: string, h: string) =>
    `<xf numFmtId="${fmt}" fontId="0" fillId="0" borderId="${border}" xfId="0"${fmt !== '0' ? ' applyNumberFormat="1"' : ''} applyBorder="1" applyAlignment="1"><alignment horizontal="${h}" vertical="center" wrapText="1"/></xf>`;
  const st = { text: ensureXf(styles, xf('0', 'center')), left: ensureXf(styles, xf('0', 'left')), date: ensureXf(styles, xf(dateFmt, 'center')), num: ensureXf(styles, xf('0', 'center')) };

  let nextSheet = Math.max(0, ...[...ct.matchAll(/worksheets\/sheet(\d+)\.xml/g)].map((m) => +m[1])) + 1;
  let nextDrawing = Math.max(0, ...[...ct.matchAll(/drawings\/drawing(\d+)\.xml/g)].map((m) => +m[1])) + 1;
  let nextSheetId = Math.max(0, ...[...wbXml.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1])) + 1;

  const byArea = new Map<string, PunchItem[]>();
  for (const it of items) byArea.set(it.area, [...(byArea.get(it.area) ?? []), it]);
  const areas = [...byArea.keys()].sort((a, b) => AREAS.indexOf(a as any) - AREAS.indexOf(b as any));

  for (const area of areas) {
    const list = byArea.get(area)!;
    const name = sheetName(area);
    const unidade = Object.entries(UNIDADES).find(([, as]) => as.includes(area as any))?.[0];
    const head = {
      area: unidade ? `${area} — ${unidade}` : area,
      emissao: list.reduce<string | null>((m, it) => (it.emissaoInicial && (!m || it.emissaoInicial < m) ? it.emissaoInicial : m), null),
      revisao: list.reduce((m, it) => (it.dataRevisao && it.dataRevisao > m ? it.dataRevisao : m), '') || h.today,
      emitido: h.emitidoPor,
    };
    const found = sheets().find((s) => s.name === name);
    if (found) {
      const p = `xl/${target(found.rid)}`;
      pkg.set(p, renderSheet(pkg.get(p)!, L, list, head, false, st));
      continue;
    }
    // Nova aba: clone da "Lista" (sem uid/aba selecionada/impressora), com cópia do desenho (logo).
    const n = nextSheet++;
    const rid = `rIdPL${n}`;
    let xml = tplXml.replace(/ xr:uid="[^"]*"/g, '').replace(/ tabSelected="1"/, '').replace(/(<pageSetup[^>]*?) r:id="[^"]*"/, '$1');
    const drawRid = xml.match(/<drawing r:id="([^"]+)"\/>/)?.[1];
    const drawTarget = drawRid && tplRels?.match(new RegExp(`Id="${drawRid}"[^>]*Target="([^"]+)"|Target="([^"]+)"[^>]*Id="${drawRid}"`));
    if (drawTarget) {
      const src = `xl/drawings/${(drawTarget[1] ?? drawTarget[2]).split('/').pop()}`;
      const d = nextDrawing++;
      pkg.copy(src, `xl/drawings/drawing${d}.xml`);
      const dr = pkg.get(src.replace('drawings/', 'drawings/_rels/') + '.rels');
      if (dr) pkg.set(`xl/drawings/_rels/drawing${d}.xml.rels`, dr);
      pkg.set(`xl/worksheets/_rels/sheet${n}.xml.rels`,
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${NS_REL}/drawing" Target="../drawings/drawing${d}.xml"/></Relationships>`);
      xml = xml.replace(/<drawing r:id="[^"]+"\/>/, '<drawing r:id="rId1"/>');
      ct = ct.replace('</Types>', `<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="${CT_DRAWING}"/></Types>`);
    } else xml = xml.replace(/<drawing r:id="[^"]+"\/>/, '');
    pkg.set(`xl/worksheets/sheet${n}.xml`, renderSheet(xml, L, list, head, true, st));
    ct = ct.replace('</Types>', `<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="${CT_SHEET}"/></Types>`);
    rels = rels.replace('</Relationships>', `<Relationship Id="${rid}" Type="${NS_REL}/worksheet" Target="worksheets/sheet${n}.xml"/></Relationships>`);
    wbXml = wbXml.replace('</sheets>', `<sheet name="${esc(name)}" sheetId="${nextSheetId++}" r:id="${rid}"/></sheets>`);
  }

  // Nomes definidos (filtro e títulos de impressão) das abas de área.
  const all = sheets();
  const names: string[] = [];
  areas.forEach((area) => {
    const idx = all.findIndex((s) => s.name === sheetName(area));
    const n = byArea.get(area)!.length;
    const q = `'${sheetName(area).replace(/'/g, "''")}'`;
    wbXml = wbXml.replace(new RegExp(`<definedName [^>]*localSheetId="${idx}"[^>]*>[^<]*</definedName>`, 'g'), '');
    names.push(`<definedName name="_xlnm._FilterDatabase" localSheetId="${idx}" hidden="1">${q}!$${L.first}$${L.headerRow}:$${L.last}$${Math.max(L.subRow, L.dataRow + n - 1)}</definedName>`,
      `<definedName name="_xlnm.Print_Titles" localSheetId="${idx}">${q}!$1:$${L.subRow}</definedName>`);
  });
  if (/<definedNames>/.test(wbXml)) wbXml = wbXml.replace('</definedNames>', `${names.join('')}</definedNames>`);
  else wbXml = wbXml.replace('</sheets>', `</sheets><definedNames>${names.join('')}</definedNames>`);
  wbXml = wbXml.replace(/<definedNames><\/definedNames>/, '');

  pkg.set('xl/workbook.xml', wbXml);
  pkg.set('xl/_rels/workbook.xml.rels', rels);
  pkg.set('[Content_Types].xml', ct);
  pkg.set('xl/styles.xml', styles.xml);
  return pkg.out();
}

/** Fallback sem modelo: uma aba simples com todas as colunas. */
function buildSimple(items: PunchItem[]): string {
  const aoa: any[][] = [COLUMNS.map((c) => c.header)];
  for (const it of items) aoa.push(COLUMNS.map((c) => {
    const v = it[c.key];
    return v && c.type === 'date' ? toDate(String(v)) : v ?? '';
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true, dateNF: 'dd/mmm/yy' }), 'Punch List');
  return XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
}
