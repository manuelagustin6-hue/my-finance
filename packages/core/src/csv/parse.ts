/**
 * Parser CSV (RFC 4180): comillas dobles, comillas escapadas ("") y saltos de línea dentro
 * de campos entre comillas. Detecta el separador (coma, punto y coma o tabulación).
 */
export function parseCsv(text: string, delimiter?: string): string[][] {
  const input = text.replace(/^﻿/, '');
  const sep = delimiter ?? detectDelimiter(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === sep) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function isBlankRow(row: readonly string[]): boolean {
  return row.every((cell) => cell.trim() === '');
}

export function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates = [',', ';', '\t'];
  let best = ',';
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Convierte filas en objetos usando la primera fila como encabezado. Las filas vacías se
 * devuelven como null para conservar la numeración de líneas del archivo.
 */
export function rowsToRecords(rows: string[][]): { headers: string[]; records: (Record<string, string> | null)[] } {
  const [header, ...body] = rows;
  const headers = (header ?? []).map((h) => h.trim());
  const records = body.map((r) => {
    if (isBlankRow(r)) return null;
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => (rec[h] = (r[i] ?? '').trim()));
    return rec;
  });
  return { headers, records };
}

/**
 * Interpreta números en formatos "1,234.56", "1.234,56", "1234,56", "$ 1.000", "-0.5".
 * Devuelve NaN si no es un número.
 */
export function parseNumber(raw: string | undefined): number {
  if (raw === undefined) return NaN;
  let s = raw.trim().replace(/[^\d.,\-+eE]/g, '');
  if (s === '' || s === '-' || s === '+') return NaN;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    // El separador que aparece último es el decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (lastComma > -1) {
    // Una sola coma es separador decimal ("1234,56"); varias son separadores de miles ("1,234,567").
    const commas = s.split(',').length - 1;
    s = commas > 1 ? s.replace(/,/g, '') : s.replace(',', '.');
  } else if (lastDot > -1 && s.split('.').length - 1 > 1) {
    s = s.replace(/\./g, '');
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Normaliza fechas a ISO. Acepta ISO, "YYYY-MM-DD HH:mm:ss", "DD/MM/YYYY" y "MM/DD/YYYY"
 * (este último solo con `monthFirst`). Devuelve undefined si no puede interpretarla.
 */
export function parseDate(raw: string | undefined, monthFirst = false): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim().replace(/\s*(UTC|Z)$/i, '');
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ,;]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) return toIso(m[1]!, m[2]!, m[3]!, m[4], m[5], m[6]);
  m = /^(\d{4})(\d{2})(\d{2})(?:[;, ]+(\d{2}):?(\d{2}):?(\d{2})?)?$/.exec(s);
  if (m) return toIso(m[1]!, m[2]!, m[3]!, m[4], m[5], m[6]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})(?:[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (m) {
    const year = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    const [day, month] = monthFirst ? [m[2]!, m[1]!] : [m[1]!, m[2]!];
    return toIso(year, month, day, m[4], m[5], m[6]);
  }
  const t = Date.parse(s);
  return Number.isNaN(t) ? undefined : new Date(t).toISOString();
}

function toIso(y: string, mo: string, d: string, h?: string, mi?: string, se?: string): string | undefined {
  const month = Number(mo);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  if (h === undefined) return date;
  return `${date}T${h.padStart(2, '0')}:${mi ?? '00'}:${(se ?? '00').padStart(2, '0')}Z`;
}
