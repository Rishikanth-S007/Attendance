const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');

const { FORMATS, toCsv, toXlsx, toPdf } = require('../src/services/exporters');

const report = {
  title: 'Attendance Register',
  subtitle: '2026-11-01 to 2026-11-30',
  columns: [
    { key: 'name', header: 'Name', width: 12 },
    { key: 'note', header: 'Note', width: 12 },
    { key: 'hours', header: 'Hours', width: 6 },
  ],
  rows: [
    { name: 'Asha, K', note: 'said "hi"', hours: 8.5 },
    { name: '=HYPERLINK("http://evil")', note: '+cmd', hours: 0 },
    { name: 'Zoë Müller', note: '-5', hours: 7 },
  ],
};

test('CSV quotes commas and quotes, and defuses formula injection', () => {
  const csv = toCsv(report).replace(/^﻿/, '');
  const lines = csv.trim().split('\r\n');
  assert.equal(lines[0], 'Name,Note,Hours');
  assert.equal(lines[1], '"Asha, K","said ""hi""",8.5');
  assert.ok(lines[2].startsWith(`"'=HYPERLINK(""http://evil"")"`), lines[2]);
  assert.ok(lines[2].includes(",'+cmd,"), lines[2]);
  // a plain negative number is still a number, not "defused"
  assert.ok(lines[3].includes(',-5,') || lines[3].includes(",'-5,"), lines[3]);
  assert.ok(csv.includes('Zoë Müller'));
});

test('XLSX opens, has the right shape, and stores formula-looking text as text', async () => {
  const buffer = await toXlsx(report);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const sheet = wb.worksheets[0];
  assert.equal(sheet.getCell(1, 1).value, 'Attendance Register');
  assert.equal(sheet.getRow(3).getCell(1).value, 'Name');
  assert.equal(sheet.rowCount, 6);
  const risky = sheet.getRow(5).getCell(1).value;
  assert.ok(risky.richText, 'formula-looking text must not be stored as a formula');
  assert.equal(risky.richText[0].text, '=HYPERLINK("http://evil")');
  assert.equal(sheet.getRow(4).getCell(3).value, 8.5);
});

test('PDF is a valid, paginated document', async () => {
  const many = { ...report, rows: Array.from({ length: 120 }, (_, i) => ({ name: `Person ${i}`, note: 'ok', hours: i / 10 })) };
  const buffer = await toPdf(many);
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
  assert.ok(buffer.subarray(-1024).toString('latin1').includes('%%EOF'));
  const pageCount = (buffer.toString('latin1').match(/\/Type \/Page\b/g) || []).length;
  assert.ok(pageCount >= 3, `expected several pages for 120 rows, got ${pageCount}`);
});

test('PDF handles an empty result', async () => {
  const buffer = await toPdf({ ...report, rows: [] });
  assert.equal(buffer.subarray(0, 5).toString(), '%PDF-');
});

test('format table exposes content types', () => {
  assert.equal(FORMATS.pdf.contentType, 'application/pdf');
  assert.equal(FORMATS.xlsx.extension, 'xlsx');
  assert.equal(FORMATS.csv.extension, 'csv');
});
