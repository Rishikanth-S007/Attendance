const employeeService = require('../services/employeeService');
const faceService = require('../services/faceService');
const AuditLog = require('../models/AuditLog');
const env = require('../config/environment');
const asyncHandler = require('../utils/asyncHandler');
const { AppError } = require('../utils/errors');
const { success } = require('../utils/response');

const audit = (req, action, entityId, previousValue, newValue) =>
  AuditLog.create({ adminId: req.admin.id, action, entity: 'Employee', entityId, previousValue, newValue });

const mustFind = async (employeeId) => {
  const employee = await employeeService.getEmployeeByEmployeeId(employeeId);
  if (!employee) throw new AppError('Employee not found', 404, 'NOT_FOUND');
  return employee;
};

const list = asyncHandler(async (req, res) => {
  const { search, department, status } = req.query;
  const employees = await employeeService.listEmployees({ search, department, status });
  return success(res, 200, 'Employees retrieved', { employees });
});

const create = asyncHandler(async (req, res) => {
  const employee = await employeeService.createEmployee(req.body);
  await audit(req, 'CREATE_EMPLOYEE', employee.employeeId, null, employee.toObject());
  return success(res, 201, 'Employee created', { employee });
});

const getOne = asyncHandler(async (req, res) =>
  success(res, 200, 'Employee retrieved', { employee: await mustFind(req.params.id) }));

const update = asyncHandler(async (req, res) => {
  const before = await mustFind(req.params.id);
  const employee = await employeeService.updateEmployee(req.params.id, req.body);
  await audit(req, 'UPDATE_EMPLOYEE', req.params.id, before.toObject(), employee.toObject());
  return success(res, 200, 'Employee updated', { employee });
});

// DELETE maps to deactivation, per Rule 9.
const remove = asyncHandler(async (req, res) => {
  await mustFind(req.params.id);
  const employee = await employeeService.deactivateEmployee(req.params.id);
  await audit(req, 'DEACTIVATE_EMPLOYEE', req.params.id, null, { status: 'inactive' });
  return success(res, 200, 'Employee deactivated', { employee });
});

const FACE_LABELS = ['primary', 'front', 'left', 'right'];

// FR-003: Face Registration. Several labelled captures (front / left / right)
// make recognition far more tolerant of head angle and lighting.
const registerFace = asyncHandler(async (req, res) => {
  if (!req.file) throw new AppError('Face image is required', 400, 'IMAGE_REQUIRED');
  const label = FACE_LABELS.includes(req.body.label) ? req.body.label : 'primary';
  const employee = await mustFind(req.params.id);
  if (employee.status !== 'active') throw new AppError('Cannot enrol a face for an inactive employee', 400, 'EMPLOYEE_INACTIVE');

  const result = await faceService.registerFace(req.params.id, req.file.buffer, label);
  if (!result.success) {
    // no face, several faces, too dark, blurry, turned away, ...
    throw new AppError(result.message || 'Face registration failed quality checks', 422, result.code || 'FACE_QUALITY');
  }

  // One face must not be enrolled under two employee IDs (buddy punching).
  const others = await employeeService.templatesForDuplicateCheck(req.params.id);
  if (others.length > 0) {
    const dup = await faceService.compareEmbedding(result.embedding, others);
    if (dup.matched && dup.distance <= env.faceMaxDistance) {
      const owner = others.find((o) => o.employeeId === dup.employeeId);
      throw new AppError(
        `This face is already registered to ${owner ? owner.name : 'another employee'} (${dup.employeeId}).`,
        409, 'DUPLICATE_FACE'
      );
    }
  }

  const updated = await employeeService.storeFaceEmbedding(req.params.id, result.embedding, label);
  await audit(req, 'REGISTER_FACE', req.params.id, null, { label, faceSamples: updated.faceSamples });
  return success(res, 200, 'Face registered successfully', {
    employeeId: req.params.id, faceSamples: updated.faceSamples, quality: result.quality,
  });
});

const clearFace = asyncHandler(async (req, res) => {
  await mustFind(req.params.id);
  const employee = await employeeService.clearFace(req.params.id);
  await audit(req, 'CLEAR_FACE', req.params.id, null, { faceSamples: 0 });
  return success(res, 200, 'Face data removed', { employee });
});

module.exports = { list, create, getOne, update, remove, registerFace, clearFace };
