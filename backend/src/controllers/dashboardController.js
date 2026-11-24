const dashboardService = require('../services/dashboardService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');
const { todayKey } = require('../utils/date');

const summary = asyncHandler(async (req, res) => success(res, 200, 'Dashboard summary retrieved', await dashboardService.summary()));
const today = asyncHandler(async (req, res) => success(res, 200, "Today's attendance retrieved", { records: await dashboardService.todaysAttendance() }));
const department = asyncHandler(async (req, res) => success(res, 200, 'Department stats retrieved', { data: await dashboardService.byDepartment() }));

const monthly = asyncHandler(async (req, res) => {
  const [y, m] = todayKey().split('-').map(Number);
  const year = req.query.year ? Number(req.query.year) : y;
  const month = req.query.month ? Number(req.query.month) : m;
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12 || year < 2000 || year > 2200) {
    throw new AppError('year and month must be valid numbers', 400, 'VALIDATION_FAILED');
  }
  return success(res, 200, 'Monthly stats retrieved', { data: await dashboardService.monthly(year, month) });
});

module.exports = { summary, today, monthly, department };
