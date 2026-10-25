import { detectSheetKind, htmlTableToRows, isUtf8, rowsToCsv, xlsxWorkbookToRows } from '@my-finance/core';
import { strFromU8, unzipSync } from 'fflate';

/** El archivo es un Excel antiguo (.xls binario), que no se puede leer. */
export class UnsupportedSheetError extends Error {
  constructor() {
    super('xls-binary');
  }
}

export function decodeText(bytes: Uint8Array): string {
  return strFromU8(bytes, !isUtf8(bytes));
}

/** Convierte el archivo exportado (CSV, XLSX o tabla HTML con extensión .xls) a texto CSV. */
export function sheetBytesToCsv(bytes: Uint8Array): string {
  switch (detectSheetKind(bytes.subarray(0, 600))) {
    case 'xlsx': {
      const files = unzipSync(bytes, {
        filter: (f) => f.name === 'xl/workbook.xml' || f.name.startsWith('xl/_rels/') || f.name.startsWith('xl/worksheets/') || f.name === 'xl/sharedStrings.xml' || f.name === 'xl/styles.xml',
      });
      return rowsToCsv(xlsxWorkbookToRows((path) => (files[path] ? strFromU8(files[path]) : undefined)));
    }
    case 'html':
      return rowsToCsv(htmlTableToRows(decodeText(bytes)));
    case 'xls-binary':
      throw new UnsupportedSheetError();
    case 'text':
      return decodeText(bytes);
  }
}
