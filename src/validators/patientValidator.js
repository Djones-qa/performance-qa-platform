/**
 * patientValidator.js
 * Pure validation logic — no Express dependency.
 * Each rule maps to a real healthcare/finance compliance risk.
 */

const xss = require('xss');

// ── Constants ────────────────────────────────────────────────────────────────

const SSN_REGEX = /^\d{3}-\d{2}-\d{4}$/;
const PHONE_REGEX = /^\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/;
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NPI_REGEX = /^\d{10}$/;

const ALLOWED_INSURANCE_PROVIDERS = [
  'BlueCross', 'Aetna', 'Cigna', 'UnitedHealth', 'Humana', 'Medicare', 'Medicaid', 'Other'
];

const ALLOWED_BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];

const MAX_FIELD_LENGTH = 255;
const MAX_NOTES_LENGTH = 2000;

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize a string: trim whitespace and strip XSS vectors.
 * Risk: stored XSS in patient records viewed by clinical staff.
 */
function sanitize(value) {
  if (typeof value !== 'string') return value;
  // xss() strips HTML tags; additionally strip javascript: URIs and null bytes
  return xss(value.trim())
    .replace(/javascript\s*:/gi, '')
    .replace(/\x00/g, '');
}

/**
 * Check a value is a non-empty string within max length.
 * Risk: buffer overflow / DB truncation errors on insert.
 */
function isNonEmptyString(value, maxLen = MAX_FIELD_LENGTH) {
  return typeof value === 'string' && value.trim().length > 0 && value.trim().length <= maxLen;
}

/**
 * Validate ISO date string and ensure it is not in the future.
 * Risk: future DOB bypasses age-gating for controlled substance prescriptions.
 */
function isValidPastDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return false;
  return d <= new Date();
}

/**
 * Calculate age from ISO date string.
 */
function calculateAge(dateStr) {
  const dob = new Date(dateStr);
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age--;
  return age;
}

// ── Core Validator ───────────────────────────────────────────────────────────

/**
 * Validate and sanitize a patient intake payload.
 *
 * @param {object} data - Raw request body
 * @returns {{ valid: boolean, errors: string[], sanitized: object }}
 */
function validatePatient(data) {
  const errors = [];
  const sanitized = {};

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object'], sanitized: {} };
  }

  // ── Personal Information ─────────────────────────────────────────────────

  // First name — HIPAA minimum necessary: required for patient identity
  if (!isNonEmptyString(data.firstName)) {
    errors.push('firstName is required and must be ≤255 characters');
  } else {
    sanitized.firstName = sanitize(data.firstName);
  }

  // Last name
  if (!isNonEmptyString(data.lastName)) {
    errors.push('lastName is required and must be ≤255 characters');
  } else {
    sanitized.lastName = sanitize(data.lastName);
  }

  // Date of birth — future dates blocked (controlled substance risk)
  if (!data.dateOfBirth || !isValidPastDate(data.dateOfBirth)) {
    errors.push('dateOfBirth must be a valid past date in YYYY-MM-DD format');
  } else {
    const age = calculateAge(data.dateOfBirth);
    if (age < 0 || age > 150) {
      errors.push('dateOfBirth results in an implausible age');
    } else {
      sanitized.dateOfBirth = data.dateOfBirth;
      sanitized.age = age;
    }
  }

  // Gender — open string, sanitized (not enumerated to respect non-binary identities)
  if (!isNonEmptyString(data.gender)) {
    errors.push('gender is required');
  } else {
    sanitized.gender = sanitize(data.gender);
  }

  // ── Contact Information ──────────────────────────────────────────────────

  // Email — required for appointment reminders / billing
  if (!data.email || !EMAIL_REGEX.test(data.email)) {
    errors.push('email must be a valid email address');
  } else {
    sanitized.email = sanitize(data.email).toLowerCase();
  }

  // Phone — US format
  if (!data.phone || !PHONE_REGEX.test(data.phone)) {
    errors.push('phone must be a valid US phone number');
  } else {
    sanitized.phone = sanitize(data.phone);
  }

  // Address
  if (!isNonEmptyString(data.address)) {
    errors.push('address is required');
  } else {
    sanitized.address = sanitize(data.address);
  }

  // ZIP code — used for geographic risk scoring
  if (!data.zipCode || !ZIP_REGEX.test(data.zipCode)) {
    errors.push('zipCode must be a valid US ZIP code (e.g. 12345 or 12345-6789)');
  } else {
    sanitized.zipCode = data.zipCode;
  }

  // ── Insurance / Financial ────────────────────────────────────────────────

  // Insurance provider — must be from approved list (billing system integration)
  if (!data.insuranceProvider || !ALLOWED_INSURANCE_PROVIDERS.includes(data.insuranceProvider)) {
    errors.push(`insuranceProvider must be one of: ${ALLOWED_INSURANCE_PROVIDERS.join(', ')}`);
  } else {
    sanitized.insuranceProvider = data.insuranceProvider;
  }

  // Insurance policy number — alphanumeric, required for claims
  if (!isNonEmptyString(data.policyNumber)) {
    errors.push('policyNumber is required');
  } else if (!/^[A-Z0-9-]{4,20}$/i.test(data.policyNumber.trim())) {
    errors.push('policyNumber must be 4–20 alphanumeric characters (hyphens allowed)');
  } else {
    sanitized.policyNumber = sanitize(data.policyNumber).toUpperCase();
  }

  // ── SSN — PII / HIPAA PHI ────────────────────────────────────────────────
  // Risk: SSN exposure in logs, responses, or error messages is a HIPAA violation.
  if (data.ssn !== undefined) {
    if (!SSN_REGEX.test(data.ssn)) {
      errors.push('ssn must be in format XXX-XX-XXXX');
    } else {
      // Store only last 4 digits in sanitized output — never echo full SSN
      sanitized.ssnLast4 = data.ssn.slice(-4);
    }
  }

  // ── Clinical Information ─────────────────────────────────────────────────

  // Blood type — optional, must be from allowed list
  if (data.bloodType !== undefined) {
    if (!ALLOWED_BLOOD_TYPES.includes(data.bloodType)) {
      errors.push(`bloodType must be one of: ${ALLOWED_BLOOD_TYPES.join(', ')}`);
    } else {
      sanitized.bloodType = data.bloodType;
    }
  }

  // Allergies — optional array of strings
  if (data.allergies !== undefined) {
    if (!Array.isArray(data.allergies)) {
      errors.push('allergies must be an array of strings');
    } else if (data.allergies.length > 50) {
      errors.push('allergies array must not exceed 50 entries');
    } else {
      sanitized.allergies = data.allergies
        .filter(a => typeof a === 'string' && a.trim().length > 0)
        .map(a => sanitize(a));
    }
  }

  // Medications — optional array
  if (data.currentMedications !== undefined) {
    if (!Array.isArray(data.currentMedications)) {
      errors.push('currentMedications must be an array of strings');
    } else {
      sanitized.currentMedications = data.currentMedications
        .filter(m => typeof m === 'string' && m.trim().length > 0)
        .map(m => sanitize(m));
    }
  }

  // Referring physician NPI — 10-digit National Provider Identifier
  if (data.referringNPI !== undefined) {
    if (!NPI_REGEX.test(String(data.referringNPI))) {
      errors.push('referringNPI must be a 10-digit National Provider Identifier');
    } else {
      sanitized.referringNPI = String(data.referringNPI);
    }
  }

  // Clinical notes — long text, strict length cap
  if (data.notes !== undefined) {
    if (typeof data.notes !== 'string' || data.notes.length > MAX_NOTES_LENGTH) {
      errors.push(`notes must be a string ≤${MAX_NOTES_LENGTH} characters`);
    } else {
      sanitized.notes = sanitize(data.notes);
    }
  }

  // ── Consent ──────────────────────────────────────────────────────────────
  // Risk: treating a patient without recorded consent is a liability.
  if (data.consentToTreat !== true) {
    errors.push('consentToTreat must be true — patient consent is required');
  } else {
    sanitized.consentToTreat = true;
    sanitized.consentTimestamp = new Date().toISOString();
  }

  if (data.hipaaAcknowledged !== true) {
    errors.push('hipaaAcknowledged must be true — HIPAA notice acknowledgment is required');
  } else {
    sanitized.hipaaAcknowledged = true;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized
  };
}

module.exports = {
  validatePatient,
  sanitize,
  isValidPastDate,
  calculateAge,
  ALLOWED_INSURANCE_PROVIDERS,
  ALLOWED_BLOOD_TYPES
};
