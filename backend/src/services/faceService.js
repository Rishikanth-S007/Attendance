const axios = require('axios');
const FormData = require('form-data');
const env = require('../config/environment');
const { AppError } = require('../utils/errors');

// This is the ONLY module that talks to the Python face service. It keeps
// identification (AI) cleanly separated from the business rules, which stay in
// the backend: "AI identifies the person; the backend decides whether the
// attendance action is valid."

const client = axios.create({ baseURL: env.faceServiceUrl, timeout: 15000 });

async function call(path, form) {
  try {
    const { data } = await client.post(path, form, { headers: form.getHeaders() });
    return data;
  } catch (err) {
    throw new AppError(
      'Face recognition is temporarily unavailable. Please try again shortly.',
      503,
      'FACE_SERVICE_UNAVAILABLE',
      { cause: err.message }
    );
  }
}

/** Detect one face, check quality and return its embedding (FR-003). */
async function registerFace(employeeId, imageBuffer, label = 'primary') {
  const form = new FormData();
  form.append('employee_id', employeeId);
  form.append('label', label);
  form.append('image', imageBuffer, { filename: 'face.jpg', contentType: 'image/jpeg' });
  return call('/api/face/register', form); // { success, embedding, quality, code, message }
}

/**
 * Compare a captured face with every candidate's stored embeddings (FR-004).
 * Returns { matched, employeeId, distance, secondDistance, margin, confidence, code?, message? }.
 * The backend never accepts a client-supplied employee ID: identity always
 * comes from this comparison.
 */
async function recognizeFace(imageBuffer, registeredEmployees) {
  const form = new FormData();
  form.append('image', imageBuffer, { filename: 'capture.jpg', contentType: 'image/jpeg' });
  form.append('registered_employees', JSON.stringify(registeredEmployees));
  return call('/api/face/recognize', form);
}

/** Compare an existing embedding with candidates (used to catch duplicate enrolments). */
async function compareEmbedding(embedding, registeredEmployees) {
  const form = new FormData();
  form.append('embedding', JSON.stringify(embedding));
  form.append('registered_employees', JSON.stringify(registeredEmployees));
  return call('/api/face/compare', form);
}

module.exports = { registerFace, recognizeFace, compareEmbedding };
