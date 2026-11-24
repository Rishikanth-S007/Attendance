const reportService = require('../services/reportService');
const { FORMATS } = require('../services/exporters');
const asyncHandler = require('../utils/asyncHandler');
const { success } = require('../utils/response');

const send = (builder, name) => asyncHandler(async (req, res) => {
  const { format, ...params } = req.query;
  const report = await builder(params);

  if (format === 'json') return success(res, 200, 'Report generated', report);

  const target = FORMATS[format];
  const file = await target.build(report);
  res.setHeader('Content-Type', target.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${name}_${report.range.start}_${report.range.end}.${target.extension}"`);
  return res.status(200).send(file);
});

module.exports = {
  attendanceReport: send(reportService.attendanceRegister, 'attendance_register'),
  summaryReport: send(reportService.monthlySummary, 'attendance_summary'),
};
