import ExcelJS from 'exceljs';

/** Parse .xlsx / .xls / .csv into array of objects keyed by header row. */
export async function parseSpreadsheet(filePath: string): Promise<Record<string, string>[]> {
  const wb = new ExcelJS.Workbook();
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.csv')) {
    await wb.csv.readFile(filePath);
  } else {
    await wb.xlsx.readFile(filePath);
  }
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: any[][] = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    rows.push((row.values as unknown[]).slice(1)); // exceljs values are 1-indexed
  });
  if (rows.length < 2) return [];
  const headers = rows[0].map((h) => String(h ?? '').trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      const v = r[i];
      obj[h] = v === undefined || v === null ? '' : String(v).trim();
    });
    return obj;
  });
}

export interface ExportColumn {
  key: string;
  header: string;
  map?: (row: any) => unknown;
}

function buildRows(data: any[], columns: ExportColumn[]): { header: string[]; rows: unknown[][] } {
  return {
    header: columns.map((c) => c.header),
    rows: data.map((row) => columns.map((c) => (c.map ? c.map(row) : row[c.key] ?? ''))),
  };
}

/** CSV export with UTF-8 BOM so Excel opens Nepali text correctly. */
export function toCsv(data: any[], columns: ExportColumn[]): string {
  const { header, rows } = buildRows(data, columns);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [header.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))];
  return '\uFEFF' + lines.join('\r\n');
}

/** XLSX export with a styled header row. */
export async function toXlsx(data: any[], columns: ExportColumn[], sheetName = 'Sheet1'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(columns.map((c) => c.header));
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } };
  for (const { header, rows } of [buildRows(data, columns)]) {
    for (const r of rows) ws.addRow(r as any[]);
    void header;
  }
  ws.columns.forEach((col) => {
    col.width = 18;
  });
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

/** Build a downloadable import template. */
export async function templateXlsx(columns: ExportColumn[], example: Record<string, unknown>): Promise<Buffer> {
  return toXlsx([example], columns, 'Template');
}
