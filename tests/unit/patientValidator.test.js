/**
 * Unit Tests — patientValidator.js
 *
 * Risk mapping:
 *   - Future DOB → controlled substance age-gating bypass
 *   - Invalid SSN format → HIPAA PHI integrity
 *   - Missing consent → liability / legal
 *   - XSS in name fields → stored XSS in clinical staff UI
 *   - Invalid insurance provider → billing system rejection
 *   - Oversized payload fields → DB truncation / buffer overflow
 */

const {
  validatePatient,
  sanitize,
  isValidPastDate,
  calculateAge,
  ALLOWED_INSURANCE_PROVIDERS,
  ALLOWED_BLOOD_TYPES
} = require('../../src/validators/patientValidator');

// ── Fixture ──────────────────────────────────────────────────────────────────

function validPayload(overrides = {}) {
  return {
    firstName: 'Jane',
    lastName: 'Doe',
    dateOfBirth: '1985-06-15',
    gender: 'Female',
    email: 'jane.doe@example.com',
    phone: '(555) 123-4567',
    address: '123 Main St',
    zipCode: '90210',
    insuranceProvider: 'BlueCross',
    policyNumber: 'BC-123456',
    consentToTreat: true,
    hipaaAcknowledged: true,
    ...overrides
  };
}

// ── Happy Path ────────────────────────────────────────────────────────────────

describe('validatePatient — valid payload', () => {
  test('returns valid=true for a complete correct payload', () => {
    const { valid, errors } = validatePatient(validPayload());
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test('sanitized output includes age derived from dateOfBirth', () => {
    const { sanitized } = validatePatient(validPayload());
    expect(sanitized.age).toBeGreaterThan(0);
    expect(typeof sanitized.age).toBe('number');
  });

  test('consentTimestamp is set when consent is given', () => {
    const { sanitized } = validatePatient(validPayload());
    expect(sanitized.consentTimestamp).toBeDefined();
    expect(new Date(sanitized.consentTimestamp).getTime()).not.toBeNaN();
  });

  test('SSN is not echoed — only last 4 digits stored', () => {
    const { sanitized } = validatePatient(validPayload({ ssn: '123-45-6789' }));
    expect(sanitized.ssnLast4).toBe('6789');
    expect(sanitized.ssn).toBeUndefined();
  });

  test('email is lowercased in sanitized output', () => {
    const { sanitized } = validatePatient(validPayload({ email: 'Jane.DOE@Example.COM' }));
    expect(sanitized.email).toBe('jane.doe@example.com');
  });

  test('policyNumber is uppercased in sanitized output', () => {
    const { sanitized } = validatePatient(validPayload({ policyNumber: 'bc-123456' }));
    expect(sanitized.policyNumber).toBe('BC-123456');
  });

  test('allergies array is sanitized and returned', () => {
    const { valid, sanitized } = validatePatient(
      validPayload({ allergies: ['Penicillin', 'Latex'] })
    );
    expect(valid).toBe(true);
    expect(sanitized.allergies).toEqual(['Penicillin', 'Latex']);
  });

  test('optional fields absent from payload are not in sanitized output', () => {
    const { sanitized } = validatePatient(validPayload());
    expect(sanitized.bloodType).toBeUndefined();
    expect(sanitized.allergies).toBeUndefined();
    expect(sanitized.notes).toBeUndefined();
  });
});

// ── Personal Information ──────────────────────────────────────────────────────

describe('validatePatient — personal information', () => {
  test('rejects missing firstName', () => {
    const { valid, errors } = validatePatient(validPayload({ firstName: '' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('firstName'))).toBe(true);
  });

  test('rejects firstName exceeding 255 characters', () => {
    const { valid, errors } = validatePatient(validPayload({ firstName: 'A'.repeat(256) }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('firstName'))).toBe(true);
  });

  test('rejects missing lastName', () => {
    const { valid, errors } = validatePatient(validPayload({ lastName: '' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('lastName'))).toBe(true);
  });

  // RISK: future DOB bypasses age-gating for controlled substances
  test('rejects future dateOfBirth', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const { valid, errors } = validatePatient(
      validPayload({ dateOfBirth: future.toISOString().slice(0, 10) })
    );
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('dateOfBirth'))).toBe(true);
  });

  test('rejects malformed dateOfBirth', () => {
    const { valid } = validatePatient(validPayload({ dateOfBirth: '15/06/1985' }));
    expect(valid).toBe(false);
  });

  test('rejects missing gender', () => {
    const { valid } = validatePatient(validPayload({ gender: '' }));
    expect(valid).toBe(false);
  });
});

// ── Contact Information ───────────────────────────────────────────────────────

describe('validatePatient — contact information', () => {
  test('rejects invalid email', () => {
    const { valid, errors } = validatePatient(validPayload({ email: 'not-an-email' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('email'))).toBe(true);
  });

  test('rejects email with no domain', () => {
    const { valid } = validatePatient(validPayload({ email: 'user@' }));
    expect(valid).toBe(false);
  });

  test('rejects invalid phone number', () => {
    const { valid, errors } = validatePatient(validPayload({ phone: '123' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('phone'))).toBe(true);
  });

  test('accepts various valid US phone formats', () => {
    const formats = ['5551234567', '555-123-4567', '(555) 123-4567', '+1 555 123 4567'];
    formats.forEach(phone => {
      const { valid } = validatePatient(validPayload({ phone }));
      expect(valid).toBe(true);
    });
  });

  test('rejects invalid ZIP code', () => {
    const { valid, errors } = validatePatient(validPayload({ zipCode: '1234' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('zipCode'))).toBe(true);
  });

  test('accepts ZIP+4 format', () => {
    const { valid } = validatePatient(validPayload({ zipCode: '90210-1234' }));
    expect(valid).toBe(true);
  });

  test('rejects missing address', () => {
    const { valid } = validatePatient(validPayload({ address: '' }));
    expect(valid).toBe(false);
  });
});

// ── Insurance / Financial ─────────────────────────────────────────────────────

describe('validatePatient — insurance / financial', () => {
  test('rejects unknown insurance provider', () => {
    const { valid, errors } = validatePatient(validPayload({ insuranceProvider: 'FakeInsure' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('insuranceProvider'))).toBe(true);
  });

  test('accepts all allowed insurance providers', () => {
    ALLOWED_INSURANCE_PROVIDERS.forEach(provider => {
      const { valid } = validatePatient(validPayload({ insuranceProvider: provider }));
      expect(valid).toBe(true);
    });
  });

  test('rejects policy number shorter than 4 characters', () => {
    const { valid } = validatePatient(validPayload({ policyNumber: 'AB' }));
    expect(valid).toBe(false);
  });

  test('rejects policy number longer than 20 characters', () => {
    const { valid } = validatePatient(validPayload({ policyNumber: 'A'.repeat(21) }));
    expect(valid).toBe(false);
  });

  // RISK: SSN format validation — HIPAA PHI integrity
  test('rejects malformed SSN', () => {
    const { valid, errors } = validatePatient(validPayload({ ssn: '123456789' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('ssn'))).toBe(true);
  });

  test('accepts correctly formatted SSN', () => {
    const { valid } = validatePatient(validPayload({ ssn: '123-45-6789' }));
    expect(valid).toBe(true);
  });
});

// ── Clinical Information ──────────────────────────────────────────────────────

describe('validatePatient — clinical information', () => {
  test('rejects invalid blood type', () => {
    const { valid, errors } = validatePatient(validPayload({ bloodType: 'Z+' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('bloodType'))).toBe(true);
  });

  test('accepts all valid blood types', () => {
    ALLOWED_BLOOD_TYPES.forEach(bt => {
      const { valid } = validatePatient(validPayload({ bloodType: bt }));
      expect(valid).toBe(true);
    });
  });

  test('rejects non-array allergies', () => {
    const { valid } = validatePatient(validPayload({ allergies: 'Penicillin' }));
    expect(valid).toBe(false);
  });

  test('rejects allergies array exceeding 50 entries', () => {
    const { valid } = validatePatient(
      validPayload({ allergies: Array.from({ length: 51 }, (_, i) => `Allergen${i}`) })
    );
    expect(valid).toBe(false);
  });

  test('rejects invalid NPI (not 10 digits)', () => {
    const { valid, errors } = validatePatient(validPayload({ referringNPI: '12345' }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('referringNPI'))).toBe(true);
  });

  test('accepts valid 10-digit NPI', () => {
    const { valid } = validatePatient(validPayload({ referringNPI: '1234567890' }));
    expect(valid).toBe(true);
  });

  test('rejects notes exceeding 2000 characters', () => {
    const { valid } = validatePatient(validPayload({ notes: 'x'.repeat(2001) }));
    expect(valid).toBe(false);
  });
});

// ── Consent ───────────────────────────────────────────────────────────────────

describe('validatePatient — consent (liability risk)', () => {
  test('rejects when consentToTreat is false', () => {
    const { valid, errors } = validatePatient(validPayload({ consentToTreat: false }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('consentToTreat'))).toBe(true);
  });

  test('rejects when consentToTreat is missing', () => {
    const payload = validPayload();
    delete payload.consentToTreat;
    const { valid } = validatePatient(payload);
    expect(valid).toBe(false);
  });

  test('rejects when hipaaAcknowledged is false', () => {
    const { valid, errors } = validatePatient(validPayload({ hipaaAcknowledged: false }));
    expect(valid).toBe(false);
    expect(errors.some(e => e.includes('hipaaAcknowledged'))).toBe(true);
  });
});

// ── XSS / Injection ───────────────────────────────────────────────────────────

describe('validatePatient — XSS sanitization (stored XSS risk)', () => {
  test('strips script tags from firstName', () => {
    const { sanitized } = validatePatient(
      validPayload({ firstName: '<script>alert(1)</script>Jane' })
    );
    expect(sanitized.firstName).not.toContain('<script>');
  });

  test('strips img onerror XSS from lastName', () => {
    const { sanitized } = validatePatient(
      validPayload({ lastName: '<img src=x onerror=alert(1)>Doe' })
    );
    expect(sanitized.lastName).not.toContain('onerror');
  });

  test('strips XSS from notes field', () => {
    const { sanitized } = validatePatient(
      validPayload({ notes: 'Normal note <script>steal(document.cookie)</script>' })
    );
    expect(sanitized.notes).not.toContain('<script>');
  });
});

// ── Edge Cases ────────────────────────────────────────────────────────────────

describe('validatePatient — edge cases', () => {
  test('rejects null input', () => {
    const { valid, errors } = validatePatient(null);
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(0);
  });

  test('rejects non-object input', () => {
    const { valid } = validatePatient('string input');
    expect(valid).toBe(false);
  });

  test('rejects empty object', () => {
    const { valid, errors } = validatePatient({});
    expect(valid).toBe(false);
    expect(errors.length).toBeGreaterThan(5);
  });

  test('accumulates multiple errors in a single pass', () => {
    const { errors } = validatePatient({
      firstName: '',
      lastName: '',
      email: 'bad',
      consentToTreat: false,
      hipaaAcknowledged: false
    });
    expect(errors.length).toBeGreaterThan(3);
  });
});

// ── Helper Functions ──────────────────────────────────────────────────────────

describe('isValidPastDate', () => {
  test('returns true for a valid past date', () => {
    expect(isValidPastDate('1990-01-01')).toBe(true);
  });

  test('returns false for a future date', () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    expect(isValidPastDate(future.toISOString().slice(0, 10))).toBe(false);
  });

  test('returns false for invalid format', () => {
    expect(isValidPastDate('01/01/1990')).toBe(false);
    expect(isValidPastDate('not-a-date')).toBe(false);
  });
});

describe('calculateAge', () => {
  test('calculates correct age', () => {
    const today = new Date();
    const dob = new Date(today.getFullYear() - 30, today.getMonth(), today.getDate());
    expect(calculateAge(dob.toISOString().slice(0, 10))).toBe(30);
  });
});

describe('sanitize', () => {
  test('trims whitespace', () => {
    expect(sanitize('  hello  ')).toBe('hello');
  });

  test('returns non-string values unchanged', () => {
    expect(sanitize(42)).toBe(42);
    expect(sanitize(null)).toBe(null);
  });
});
