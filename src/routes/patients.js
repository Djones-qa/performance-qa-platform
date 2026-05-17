/**
 * patients.js — REST routes for patient intake
 *
 * POST /api/patients/intake   — submit a new patient intake form
 * GET  /api/patients/:id      — retrieve a patient record (masked PHI)
 * GET  /api/patients          — list all patients (admin, masked)
 * DELETE /api/patients/:id    — soft-delete a patient record
 */

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { validatePatient } = require('../validators/patientValidator');

const router = express.Router();

// In-memory store — replace with DB in production
const patientStore = new Map();

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mask PHI fields before returning to client.
 * Risk: returning raw SSN or full DOB in list endpoints violates HIPAA minimum-necessary.
 */
function maskRecord(record) {
  const { ssnLast4, dateOfBirth, email, phone, ...rest } = record;
  return {
    ...rest,
    ssnLast4: ssnLast4 ? `***-**-${ssnLast4}` : undefined,
    dateOfBirth: dateOfBirth ? dateOfBirth.slice(0, 4) + '-**-**' : undefined,
    email: email ? email.replace(/(.{2}).+(@.+)/, '$1***$2') : undefined,
    phone: phone ? phone.replace(/\d(?=\d{4})/g, '*') : undefined
  };
}

// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * POST /api/patients/intake
 * Submit a new patient intake form.
 * Business risk: invalid data reaching EHR system causes claim rejections.
 */
router.post('/intake', (req, res) => {
  const { valid, errors, sanitized } = validatePatient(req.body);

  if (!valid) {
    return res.status(422).json({
      status: 'error',
      message: 'Validation failed',
      errors
    });
  }

  const id = uuidv4();
  const record = {
    id,
    ...sanitized,
    createdAt: new Date().toISOString(),
    status: 'pending_review',
    deleted: false
  };

  patientStore.set(id, record);

  // Never return SSN or unmasked PHI in the response
  const { ssnLast4, ...safeRecord } = record;

  return res.status(201).json({
    status: 'success',
    message: 'Patient intake submitted successfully',
    data: {
      id,
      patientName: `${sanitized.firstName} ${sanitized.lastName}`,
      submittedAt: record.createdAt
    }
  });
});

/**
 * GET /api/patients/:id
 * Retrieve a single patient record with masked PHI.
 */
router.get('/:id', (req, res) => {
  const record = patientStore.get(req.params.id);

  if (!record || record.deleted) {
    return res.status(404).json({
      status: 'error',
      message: 'Patient record not found'
    });
  }

  return res.status(200).json({
    status: 'success',
    data: maskRecord(record)
  });
});

/**
 * GET /api/patients
 * List all active patient records (masked).
 */
router.get('/', (req, res) => {
  const records = Array.from(patientStore.values())
    .filter(r => !r.deleted)
    .map(maskRecord);

  return res.status(200).json({
    status: 'success',
    count: records.length,
    data: records
  });
});

/**
 * DELETE /api/patients/:id
 * Soft-delete a patient record (HIPAA requires audit trail, not hard delete).
 */
router.delete('/:id', (req, res) => {
  const record = patientStore.get(req.params.id);

  if (!record || record.deleted) {
    return res.status(404).json({
      status: 'error',
      message: 'Patient record not found'
    });
  }

  record.deleted = true;
  record.deletedAt = new Date().toISOString();
  patientStore.set(req.params.id, record);

  return res.status(200).json({
    status: 'success',
    message: 'Patient record deactivated'
  });
});

// Export store for test access
router._store = patientStore;

module.exports = router;
