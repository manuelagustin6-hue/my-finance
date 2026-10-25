import { strToU8, unzipSync, zipSync, strFromU8 } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  detectSheetKind,
  excelSerialToIso,
  htmlTableToRows,
  importCsv,
  isSmartResult,
  isUtf8,
  rowsToCsv,
  xlsxToRows,
  xlsxWorkbookToRows,
} from '../src/index.ts';

const SHARED = `<?xml version="1.0"?><sst count="5" uniqueCount="5">
<si><t>Fecha</t></si><si><t>Operación</t></si><si><t>Especie</t></si><si><t>Cantidad</t></si>
<si><r><t>Com</t></r><r><t xml:space="preserve">pra</t></r></si></sst>`;

const STYLES = `<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts>
<cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/><xf numFmtId="4"/></cellXfs></styleSheet>`;

const SHEET = `<worksheet><sheetData>
<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="E1" t="inlineStr"><is><t>Precio</t></is></c></row>
<row r="3"><c r="A3" s="1"><v>45729</v></c><c r="B3" t="s"><v>4</v></c><c r="C3" t="inlineStr"><is><t>AAPL &amp; Co</t></is></c><c r="E3" s="2"><v>0.30000000000000004</v></c></row>
</sheetData></worksheet>`;

describe('planillas', () => {
  it('detecta el tipo de archivo por sus primeros bytes', () => {
    expect(detectSheetKind(new Uint8Array([0x50, 0x4b, 3, 4]))).toBe('xlsx');
    expect(detectSheetKind(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0]))).toBe('xls-binary');
    expect(detectSheetKind(strToU8('\n<html><table>'))).toBe('html');
    expect(detectSheetKind(strToU8('Fecha;Tipo\n'))).toBe('text');
  });

  it('lee una hoja XLSX con cadenas compartidas, fechas y celdas vacías', () => {
    const rows = xlsxToRows({ sheetXml: SHEET, sharedStringsXml: SHARED, stylesXml: STYLES });
    expect(rows).toEqual([
      ['Fecha', 'Operación', 'Especie', 'Cantidad', 'Precio'],
      ['2025-03-13', 'Compra', 'AAPL & Co', '', '0.3'],
    ]);
  });

  it('convierte seriales de Excel con y sin hora', () => {
    expect(excelSerialToIso(45729)).toBe('2025-03-13');
    expect(excelSerialToIso(45729.5)).toBe('2025-03-13 12:00:00');
  });

  it('lee la primera hoja de un libro XLSX comprimido', () => {
    const zip = zipSync({
      'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Movimientos" sheetId="1" r:id="rId3"/></sheets></workbook>'),
      'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId3" Target="worksheets/hoja.xml"/></Relationships>'),
      'xl/worksheets/hoja.xml': strToU8(SHEET),
      'xl/sharedStrings.xml': strToU8(SHARED),
      'xl/styles.xml': strToU8(STYLES),
    });
    expect(detectSheetKind(zip.subarray(0, 8))).toBe('xlsx');
    const files = unzipSync(zip);
    const rows = xlsxWorkbookToRows((path) => (files[path] ? strFromU8(files[path]) : undefined));
    expect(rows[1]![0]).toBe('2025-03-13');
  });

  it('lee el ".xls" que en realidad es una tabla HTML', () => {
    const html = `<html><body><table><tr><td>Logo</td></tr></table>
      <table><thead><tr><th>Fecha</th><th>Tipo</th><th>Especie</th><th>Cantidad</th><th>Precio</th></tr></thead>
      <tbody><tr><td>13/03/2025</td><td>Compra</td><td>GGAL&nbsp;</td><td>10</td><td>5.000,50</td></tr>
      <tr><td colspan="2">Total</td><td></td></tr></tbody></table></body></html>`;
    expect(htmlTableToRows(html)).toEqual([
      ['Fecha', 'Tipo', 'Especie', 'Cantidad', 'Precio'],
      ['13/03/2025', 'Compra', 'GGAL', '10', '5.000,50'],
      ['Total', '', ''],
    ]);
  });

  it('las filas pasan por el importador inteligente como CSV', () => {
    const csv = rowsToCsv([
      ['Fecha', 'Operación', 'Especie', 'Cantidad', 'Precio'],
      ['2025-03-13', 'Compra', 'APPLE INC (AAPL)', '10', '200.5'],
      ['2025-03-14', 'Venta', 'Texto, con "comillas"', '1', '1'],
    ]);
    expect(csv.split('\n')[2]).toBe('2025-03-14,Venta,"Texto, con ""comillas""",1,1');
    const r = importCsv(csv, undefined, { defaultCurrency: 'USD' });
    expect(isSmartResult(r)).toBe(true);
    expect(r.rows[0]).toMatchObject({ symbol: 'AAPL', quantity: 10, price: 200.5, type: 'buy' });
  });
});

describe('codificación de texto', () => {
  it('distingue UTF-8 de Latin-1', () => {
    expect(isUtf8(strToU8('Operación;Señal'))).toBe(true);
    expect(isUtf8(new Uint8Array([0x4f, 0x70, 0xe9, 0x3b]))).toBe(false); // "Opé;" en Latin-1
  });
});
