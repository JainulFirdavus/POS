
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { HttpError } from './utils.js';

const isNum = (c) => c.type === 'money' || c.type === 'number';

function display(v, col) {
  if (v == null || v === '') return '';
  if (col.type === 'money') return Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (col.type === 'number') return Number(v).toLocaleString('en-US');
  return String(v);
}

// Prefix strings that spreadsheet apps would treat as formulas.
function csvCell(v) {
  if (v == null) return '';
  let s = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function sendReport(res, format, { title, subtitle, columns, rows, totals, filename }) {
  if (format === 'csv') {
    const lines = [columns.map((c) => csvCell(c.header)).join(',')];
    for (const r of rows) lines.push(columns.map((c) => csvCell(r[c.key])).join(','));
    if (totals) lines.push(columns.map((c) => csvCell(totals[c.key])).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send('\uFEFF' + lines.join('\r\n'));
  }

  if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Smart POS';
    const ws = wb.addWorksheet(title.slice(0, 31));
    ws.addRow([title]).font = { bold: true, size: 14 };
    ws.addRow([subtitle]).font = { color: { argb: 'FF64748B' } };
    ws.addRow([]);
    const header = ws.addRow(columns.map((c) => c.header));
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } };
    });
    for (const r of rows) ws.addRow(columns.map((c) => r[c.key] ?? ''));
    if (totals) ws.addRow(columns.map((c) => totals[c.key] ?? '')).font = { bold: true };
    columns.forEach((c, i) => {
      const col = ws.getColumn(i + 1);
      col.width = c.width || 14;
      if (c.type === 'money') col.numFmt = '#,##0.00';
    });
    ws.views = [{ state: 'frozen', ySplit: 4 }];
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ size: 'A4', layout: columns.length > 6 ? 'landscape' : 'portrait', margin: 36 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0f172a').text(title);
    doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(subtitle);
    doc.moveDown();

    const left = 36;
    const W = doc.page.width - 72;
    const unit = columns.reduce((s, c) => s + (c.width || 14), 0);
    const widths = columns.map((c) => ((c.width || 14) / unit) * W);
    const rowH = 18;

    const drawRow = (values, { header, bold, zebra } = {}) => {
      if (doc.y + rowH > doc.page.height - 36) {
        doc.addPage();
        if (!header) drawRow(columns.map((c) => c.header), { header: true });
      }
      const y = doc.y;
      if (header) doc.rect(left, y, W, rowH).fill('#4f46e5');
      else if (zebra) doc.rect(left, y, W, rowH).fill('#f1f5f9');
      doc.font(header || bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor(header ? '#ffffff' : '#0f172a');
      let x = left;
      values.forEach((v, i) => {
        const col = columns[i];
        doc.text(header ? String(v) : display(v, col), x + 4, y + 5, {
          width: widths[i] - 8,
          height: rowH - 6,
          align: isNum(col) ? 'right' : 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += widths[i];
      });
      doc.x = left;
      doc.y = y + rowH;
    };

    drawRow(columns.map((c) => c.header), { header: true });
    rows.forEach((r, i) => drawRow(columns.map((c) => r[c.key]), { zebra: i % 2 === 1 }));
    if (totals) drawRow(columns.map((c) => totals[c.key]), { bold: true });
    if (!rows.length) doc.moveDown().font('Helvetica').fontSize(10).fillColor('#64748b').text('No records for this period.', left);
    doc.end();
    return;
  }

  throw new HttpError(400, 'Unsupported format');
}
 