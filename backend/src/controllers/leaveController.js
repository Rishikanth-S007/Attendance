const leaveService = require('../services/leaveService');
const attendanceService = require('../services/attendanceService');
const scanLog = require('../services/scanLogService');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');

// ---- Admin ----
const list = asyncHandler(async (req, res) =>
  success(res, 200, 'Leave requests retrieved', { leaves: await leaveService.listLeaves(req.query) }));

const create = asyncHandler(async (req, res) => {
  const { autoApprove, ...input } = req.body;
  const leave = await leaveService.createLeave({ ...input, requestedVia: 'admin' }, { adminId: req.admin.id, autoApprove });
  return success(res, 201, autoApprove ? 'Leave recorded' : 'Leave request created', { leave });
});

const decide = asyncHandler(async (req, res) =>
  success(res, 200, `Leave ${req.body.status}`, { leave: await leaveService.decide(req.params.id, req.body, req.admin.id) }));

const cancel = asyncHandler(async (req, res) =>
  success(res, 200, 'Leave cancelled', { leave: await leaveService.cancel(req.params.id, req.admin.id) }));

const balance = asyncHandler(async (req, res) =>
  success(res, 200, 'Leave balance retrieved', { balance: await leaveService.getBalance(req.params.employeeId, req.query.year) }));

// ---- Employee app: identity comes from the face, never from the request ----
const needImage = (req) => { if (!req.file) throw new AppError('Face image is required', 400, 'IMAGE_REQUIRED'); };
const ctxOf = (req) => ({ deviceId: req.device && req.device.id, ip: req.ip });

const appRequest = asyncHandler(async (req, res) => {
  needImage(req);
  const r = await scanLog.logged('leave_request', ctxOf(req), async () => {
    const identity = await attendanceService.identifyEmployeeFromImage(req.file.buffer);
    const leave = await leaveService.createLeave(
      { ...req.body, employeeId: identity.employee.employeeId, requestedVia: 'face_app', faceDistance: identity.faceDistance },
      {}
    );
    return { ...identity, leave, message: `Leave request submitted for ${identity.employee.name}` };
  });
  return success(res, 201, r.message, { leave: r.leave, balance: await leaveService.getBalance(r.employee.employeeId, Number(r.leave.startDate.slice(0, 4))) });
});

const appBalance = asyncHandler(async (req, res) => {
  needImage(req);
  const r = await scanLog.logged('verify', ctxOf(req), () => attendanceService.identifyEmployeeFromImage(req.file.buffer));
  const year = Number(req.body.year) >= 2000 && Number(req.body.year) <= 2200 ? Number(req.body.year) : undefined;
  const [balance, leaves] = await Promise.all([
    leaveService.getBalance(r.employee.employeeId, year),
    leaveService.listLeaves({ employeeId: r.employee.employeeId }),
  ]);
  return success(res, 200, 'OK', {
    employee: { employeeId: r.employee.employeeId, name: r.employee.name },
    balance,
    leaves: leaves.slice(0, 20).map(({ _id, type, startDate, endDate, days, status, reason }) => ({ id: _id, type, startDate, endDate, days, status, reason })),
  });
});

module.exports = { list, create, decide, cancel, balance, appRequest, appBalance };
