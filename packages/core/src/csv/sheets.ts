/**
 * Lectura de planillas que exportan los brokers, para convertirlas a CSV y reutilizar el importador:
 * - XLSX (Office Open XML): a partir del XML ya descomprimido de la hoja, las cadenas compartidas y los estilos.
 * - ".xls" que en realidad es una tabla HTML (lo generan varios brokers).
 */

export type SheetKind = 'xlsx' | 'html' | 'xls-binary' | 'text';

/** Tipo de archivo según sus primeros bytes. */
export function detectSheetKind(head: Uint8Array): SheetKind {
  if (head[0] === 0x50 && head[1] === 0x4b) return 'xlsx'; // "PK": ZIP
  if (head[0] === 0xd0 && head[1] === 0xcf && head[2] === 0x11 && head[3] === 0xe0) return 'xls-binary'; // OLE2
  let start = 0;
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) start = 3;
  let text = '';
  for (let i = start; i < Math.min(head.length, start + 512); i++) text += String.fromCharCode(head[i]!);
  if (/^\s*</.test(text) && /<(html|table|meta|!doctype|\?xml)/i.test(text)) return 'html';
  return 'text';
}

/** Filas → CSV (coma como separador; comillas cuando hace falta). */
export function rowsToCsv(rows: readonly (readonly string[])[]): string {
  return rows
    .map((row) => row.map((cell) => (/[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell)).join(','))
    .join('\n');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

export function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function cellText(html: string): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Filas de la tabla HTML con más filas del documento. */
export function htmlTableToRows(html: string): string[][] {
  const clean = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)[\s\S]*?<\/\1>/gi, '');
  const tables = clean.match(/<table[\s\S]*?<\/table>/gi) ?? [clean];
  let best: string[][] = [];
  for (const table of tables) {
    const rows: string[][] = [];
    for (const tr of table.match(/<tr[\s\S]*?(?=<tr|<\/table|$)/gi) ?? []) {
      const cells: string[] = [];
      for (const m of tr.matchAll(/<t([dh])([^>]*)>([\s\S]*?)(?=<t[dh][\s>]|<\/tr|$)/gi)) {
        const text = cellText(m[3]!.replace(/<\/t[dh]>[\s\S]*$/i, ''));
        const span = Number(/colspan\s*=\s*["']?(\d+)/i.exec(m[2]!)?.[1] ?? 1);
        cells.push(text);
        for (let i = 1; i < Math.min(span, 50); i++) cells.push('');
      }
      if (cells.some((c) => c !== '')) rows.push(cells);
    }
    if (rows.length > best.length) best = rows;
  }
  return best;
}

/** Formatos numéricos de fecha predefinidos de Excel. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function attr(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`).exec(tag)?.[1];
}

/** Índices de estilo de celda (cellXfs) que corresponden a formatos de fecha. */
export function dateStyleIndices(stylesXml?: string): Set<number> {
  const out = new Set<number>();
  if (!stylesXml) return out;
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\b[^>]*>/g)) {
    const id = Number(attr(m[0], 'numFmtId'));
    const code = attr(m[0], 'formatCode');
    if (Number.isFinite(id) && code !== undefined) custom.set(id, decodeEntities(code));
  }
  const xfs = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(stylesXml)?.[1] ?? '';
  let index = 0;
  for (const m of xfs.matchAll(/<xf\b[^>]*?(\/>|>)/g)) {
    const id = Number(attr(m[0], 'numFmtId') ?? 0);
    const code = custom.get(id);
    if (BUILTIN_DATE_FORMATS.has(id) || (code !== undefined && isDateFormat(code))) out.add(index);
    index++;
  }
  return out;
}

function isDateFormat(code: string): boolean {
  // Se quitan textos entre comillas, escapes y colores/condiciones ([Red], [$-409]) antes de buscar d/m/y.
  const bare = code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[[^\]]*\]/g, '');
  return /[dy]/i.test(bare) || /m{3,}/i.test(bare);
}

/** Número serial de Excel (sistema 1900) → fecha ISO (con hora si la tiene). */
export function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000);
  const iso = new Date(ms).toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 19).replace('T', ' ');
}

/** Cadenas compartidas (sharedStrings.xml), concatenando los fragmentos con formato. */
export function parseSharedStrings(xml?: string): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const body = si[1]!.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    let text = '';
    for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) text += t[1];
    out.push(decodeEntities(text));
  }
  return out;
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function formatNumber(value: number): string {
  // Evita colas de punto flotante (0.1 + 0.2) sin perder decimales significativos.
  return String(Number(value.toPrecision(15)));
}

export interface XlsxSheetInput {
  sheetXml: string;
  sharedStringsXml?: string;
  stylesXml?: string;
}

/** Filas de una hoja XLSX. Las fechas salen como `YYYY-MM-DD` y los números con punto decimal. */
export function xlsxToRows(input: XlsxSheetInput): string[][] {
  const shared = parseSharedStrings(input.sharedStringsXml);
  const dateStyles = dateStyleIndices(input.stylesXml);
  const rows: string[][] = [];
  const data = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(input.sheetXml)?.[1] ?? '';

  for (const rowMatch of data.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = [];
    let next = 0;
    for (const c of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]!;
      const body = c[2] ?? '';
      const ref = attr(attrs, 'r');
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = attr(attrs, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = raw !== undefined ? (shared[Number(raw)] ?? '') : '';
      else if (type === 'inlineStr') {
        for (const t of body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)) value += decodeEntities(t[1]!);
      } else if (type === 'b') value = raw === '1' ? 'TRUE' : raw === '0' ? 'FALSE' : '';
      else if (type === 'str' || type === 'e') value = decodeEntities(raw ?? '');
      else if (raw !== undefined && raw !== '') {
        const n = Number(raw);
        const style = Number(attr(attrs, 's') ?? 0);
        if (!Number.isFinite(n)) value = decodeEntities(raw);
        else if (dateStyles.has(style) && n > 0 && n < 2_958_466) value = excelSerialToIso(n);
        else value = formatNumber(n);
      }
      while (row.length < col) row.push('');
      row[col] = value;
    }
    if (row.some((cell) => cell !== '')) rows.push(row);
  }
  return rows;
}

/**
 * Filas de la primera hoja de un libro XLSX. `read` devuelve el contenido (texto) de un archivo
 * del ZIP por su ruta, p. ej. `xl/workbook.xml`, o undefined si no existe.
 */
export function xlsxWorkbookToRows(read: (path: string) => string | undefined): string[][] {
  const workbook = read('xl/workbook.xml') ?? '';
  const rels = read('xl/_rels/workbook.xml.rels') ?? '';
  const firstSheet = /<sheet\b[^>]*>/.exec(workbook)?.[0];
  const relId = firstSheet ? (attr(firstSheet, 'r:id') ?? attr(firstSheet, 'id')) : undefined;
  let target: string | undefined;
  if (relId) {
    for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
      if (attr(m[0], 'Id') === relId) target = attr(m[0], 'Target');
    }
  }
  const sheetPath = target
    ? target.startsWith('/')
      ? target.slice(1)
      : `xl/${target.replace(/^\.\//, '')}`
    : 'xl/worksheets/sheet1.xml';
  const sheetXml = read(sheetPath) ?? read('xl/worksheets/sheet1.xml');
  if (!sheetXml) return [];
  return xlsxToRows({
    sheetXml,
    sharedStringsXml: read('xl/sharedStrings.xml'),
    stylesXml: read('xl/styles.xml'),
  });
}

/** true si los bytes son UTF-8 válido (si no, el archivo suele venir en Latin-1 / Windows-1252). */
export function isUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i]!;
    const extra = b < 0x80 ? 0 : b >= 0xc2 && b <= 0xdf ? 1 : b >= 0xe0 && b <= 0xef ? 2 : b >= 0xf0 && b <= 0xf4 ? 3 : -1;
    if (extra < 0) return false;
    if (i + extra >= bytes.length && extra > 0) return false;
    for (let k = 1; k <= extra; k++) if ((bytes[i + k]! & 0xc0) !== 0x80) return false;
    i += extra + 1;
  }
  return true;
}
