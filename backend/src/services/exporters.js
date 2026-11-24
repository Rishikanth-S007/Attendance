// Turns a report ({ title, subtitle, columns, rows }) into CSV, XLSX or PDF.
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

/**
 * CSV with RFC 4180 quoting, plus protection against spreadsheet formula
 * injection: a cell beginning with = + - @ is prefixed with an apostrophe so
 * Excel treats an employee name like "=HYPERLINK(...)" as text, not a formula.
 */
function toCsv({ columns, rows }) {
  const cell = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[=+\-@\t\r]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => cell(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cell(row[c.key])).join(','));
  return `﻿${lines.join('\r\n')}\r\n`; // BOM so Excel opens UTF-8 names correctly
}

async function toXlsx({ title, subtitle, columns, rows }) {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31), { views: [{ state: 'frozen', ySplit: 3 }] });

  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };
  sheet.mergeCells(2, 1, 2, columns.length);
  sheet.getCell(2, 1).value = subtitle;
  sheet.getCell(2, 1).font = { color: { argb: 'FF6B7178' } };

  const header = sheet.getRow(3);
  columns.forEach((c, i) => {
    const cell = header.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF151A21' } };
    cell.alignment = { vertical: 'middle', wrapText: true };
    sheet.getColumn(i + 1).width = Math.max(c.width * 1.6, c.header.length + 2);
  });
  header.height = 24;

  for (const row of rows) {
    // Text that begins with = + - @ is written as an explicit string, never a formula.
    sheet.addRow(columns.map((c) => {
      const v = row[c.key];
      return typeof v === 'string' ? { richText: [{ text: v }] } : v;
    }));
  }
  sheet.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: columns.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function toPdf({ title, subtitle, columns, rows }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const totalWeight = columns.reduce((sum, c) => sum + c.width, 0);
    const widths = columns.map((c) => (c.width / totalWeight) * usable);
    const left = doc.page.margins.left;
    const rowHeight = 18;
    const bottomLimit = doc.page.height - doc.page.margins.bottom - 14;
    const pad = 3;

    const drawRow = (y, values, { header = false, shaded = false } = {}) => {
      if (header) doc.rect(left, y, usable, rowHeight).fill('#151A21');
      else if (shaded) doc.rect(left, y, usable, rowHeight).fill('#F4F2ED');
      doc.fillColor(header ? '#FFFFFF' : '#1C2127').font(header ? 'Helvetica-Bold' : 'Helvetica').fontSize(header ? 7.5 : 8);
      let x = left;
      values.forEach((value, i) => {
        doc.text(String(value ?? ''), x + pad, y + 5, { width: widths[i] - pad * 2, height: rowHeight - 6, ellipsis: true, lineBreak: false });
        x += widths[i];
      });
    };

    doc.fillColor('#1C2127').font('Helvetica-Bold').fontSize(16).text(title, left, doc.page.margins.top);
    doc.fillColor('#6B7178').font('Helvetica').fontSize(9).text(subtitle);
    doc.moveDown(0.2).text(`Generated ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC  |  ${rows.length} row(s)`);

    let y = doc.y + 10;
    drawRow(y, columns.map((c) => c.header), { header: true });
    y += rowHeight;

    if (rows.length === 0) {
      doc.fillColor('#6B7178').fontSize(10).text('No records for this selection.', left, y + 8);
    }

    rows.forEach((row, index) => {
      if (y + rowHeight > bottomLimit) {
        doc.addPage();
        y = doc.page.margins.top;
        drawRow(y, columns.map((c) => c.header), { header: true });
        y += rowHeight;
      }
      drawRow(y, columns.map((c) => row[c.key]), { shaded: index % 2 === 1 });
      y += rowHeight;
    });

    // Page numbers. Margins are zeroed while writing the footer, otherwise
    // text below the bottom margin would make PDFKit start a new page.
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      const savedBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.fillColor('#6B7178').font('Helvetica').fontSize(8)
        .text(`Page ${i + 1} of ${range.count}`, left, doc.page.height - 28, { width: usable, align: 'right', lineBreak: false });
      doc.page.margins.bottom = savedBottom;
    }

    doc.end();
  });
}

const FORMATS = {
  csv: { contentType: 'text/csv; charset=utf-8', extension: 'csv', build: async (report) => Buffer.from(toCsv(report), 'utf8') },
  xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', extension: 'xlsx', build: toXlsx },
  pdf: { contentType: 'application/pdf', extension: 'pdf', build: toPdf },
};

module.exports = { FORMATS, toCsv, toXlsx, toPdf };
