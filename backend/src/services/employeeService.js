const Employee = require('../models/Employee');
const env = require('../config/environment');
const { escapeRegex } = require('../utils/text');

async function listEmployees({ search, department, status } = {}) {
  const query = {};
  if (status) query.status = status;
  if (department) query.department = department;
  if (search) {
    const pattern = new RegExp(escapeRegex(search.trim()), 'i');
    query.$or = [{ name: pattern }, { employeeId: pattern }, { email: pattern }];
  }
  return Employee.find(query).sort({ createdAt: -1 });
}

async function createEmployee(payload) {
  return Employee.create(payload);
}

async function getEmployeeByEmployeeId(employeeId) {
  return Employee.findOne({ employeeId });
}

async function updateEmployee(employeeId, updates) {
  await Employee.updateOne({ employeeId }, updates, { runValidators: true });
  return Employee.findOne({ employeeId });
}

// Rule 9: deactivation, not destructive deletion.
async function deactivateEmployee(employeeId) {
  await Employee.updateOne({ employeeId }, { status: 'inactive' });
  return Employee.findOne({ employeeId });
}

/**
 * Store a face template. A new capture with an existing label (e.g. "front")
 * replaces the old one, and the total is capped so repeated enrolment cannot
 * grow without bound. Returns the updated employee (without embeddings).
 */
async function storeFaceEmbedding(employeeId, vector, label = 'primary') {
  const employee = await Employee.findOne({ employeeId }).select('+faceEmbeddings');
  if (!employee) return null;

  const kept = employee.faceEmbeddings.filter((f) => f.label !== label);
  kept.push({ vector, label, createdAt: new Date() });
  employee.faceEmbeddings = kept.slice(-env.maxFaceTemplates);
  employee.faceSamples = employee.faceEmbeddings.length;
  employee.faceRegistered = true;
  await employee.save();

  const { faceEmbeddings, ...rest } = employee.toObject();
  return rest;
}

/** Remove every stored template (offboarding, or a request to erase biometric data). */
async function clearFace(employeeId) {
  await Employee.updateOne({ employeeId }, { faceEmbeddings: [], faceSamples: 0, faceRegistered: false });
  return Employee.findOne({ employeeId });
}

/** Templates of every other active, enrolled employee: used to refuse one face under two IDs. */
async function templatesForDuplicateCheck(excludeEmployeeId) {
  const others = await Employee.find({
    status: 'active',
    faceRegistered: true,
    employeeId: { $ne: excludeEmployeeId },
  }).select('employeeId name +faceEmbeddings');

  return others.map((e) => ({
    employeeId: e.employeeId,
    name: e.name,
    embeddings: e.faceEmbeddings.map((f) => f.vector),
  }));
}

module.exports = {
  listEmployees,
  createEmployee,
  getEmployeeByEmployeeId,
  updateEmployee,
  deactivateEmployee,
  storeFaceEmbedding,
  clearFace,
  templatesForDuplicateCheck,
};
