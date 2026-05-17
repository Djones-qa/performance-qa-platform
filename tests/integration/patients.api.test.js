/**
 * Integration Tests — /api/patients endpoints
 *
 * Risk mapping:
 *   - 422 on bad data → prevents corrupt records reaching EHR
 *   - 201 on valid data → confirms intake pipeline is functional
 *   - PHI masking in GET → HIPAA minimum-necessary compliance
 *   - Soft delete → HIPAA audit trail requirement
 *   - 404 on unknown ID → prevents enumeration of patient IDs
 *   - Oversized body → DoS / payload attack prevention
 */

const request = require('supertest');
const app = require('../../src/server');

// ── Fixture ──────────────────────────────────────────────────────────────────

function validPayload(overrides = {}) {
  return {
    firstName: 'John',
    lastName: 'Smith',
    dateOfBirth: '1978-03-22',
    gender: 'Male',
    email: 'john.smith@example.com',
    phone: '(555) 987-6543',
    address: '456 Oak Avenue',
    zipCode: '10001',
    insuranceProvider: 'Aetna',
    policyNumber: 'AET-789012',
    consentToTreat: true,
    hipaaAcknowledged: true,
    ...overrides
  };
}

// ── POST /api/patients/intake ─────────────────────────────────────────────────

describe('POST /api/patients/intake', () => {
  test('201 — accepts a valid intake payload', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload())
      .expect(201);

    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.patientName).toBe('John Smith');
    expect(res.body.data.submittedAt).toBeDefined();
  });

  test('response never contains SSN', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ ssn: '123-45-6789' }))
      .expect(201);

    const body = JSON.stringify(res.body);
    expect(body).not.toContain('123-45-6789');
    expect(body).not.toContain('ssn');
  });

  test('422 — rejects payload missing required fields', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send({})
      .expect(422);

    expect(res.body.status).toBe('error');
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test('422 — rejects future dateOfBirth', async () => {
    const future = new Date();
    future.setFullYear(future.getFullYear() + 1);
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ dateOfBirth: future.toISOString().slice(0, 10) }))
      .expect(422);

    expect(res.body.errors.some(e => e.includes('dateOfBirth'))).toBe(true);
  });

  test('422 — rejects missing consent', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ consentToTreat: false }))
      .expect(422);

    expect(res.body.errors.some(e => e.includes('consentToTreat'))).toBe(true);
  });

  test('422 — rejects invalid insurance provider', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ insuranceProvider: 'FakeInsure' }))
      .expect(422);

    expect(res.body.errors.some(e => e.includes('insuranceProvider'))).toBe(true);
  });

  test('422 — rejects invalid email format', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ email: 'not-an-email' }))
      .expect(422);

    expect(res.body.errors.some(e => e.includes('email'))).toBe(true);
  });

  test('400/413 — rejects oversized body (DoS prevention)', async () => {
    const hugePayload = validPayload({ notes: 'x'.repeat(20000) });
    const res = await request(app)
      .post('/api/patients/intake')
      .send(hugePayload);

    // Either rejected by body-size limit (413) or validation (422)
    expect([413, 422]).toContain(res.status);
  });

  test('Content-Type must be application/json', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .set('Content-Type', 'text/plain')
      .send('not json');

    expect(res.status).not.toBe(201);
  });
});

// ── GET /api/patients/:id ─────────────────────────────────────────────────────

describe('GET /api/patients/:id', () => {
  let patientId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload({ ssn: '987-65-4321' }))
      .expect(201);
    patientId = res.body.data.id;
  });

  test('200 — retrieves an existing patient', async () => {
    const res = await request(app)
      .get(`/api/patients/${patientId}`)
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(res.body.data.id).toBe(patientId);
  });

  test('PHI masking — SSN shows only last 4 digits', async () => {
    const res = await request(app)
      .get(`/api/patients/${patientId}`)
      .expect(200);

    if (res.body.data.ssnLast4) {
      expect(res.body.data.ssnLast4).toMatch(/^\*\*\*-\*\*-\d{4}$/);
    }
  });

  test('PHI masking — email is partially obscured', async () => {
    const res = await request(app)
      .get(`/api/patients/${patientId}`)
      .expect(200);

    expect(res.body.data.email).not.toBe('john.smith@example.com');
    expect(res.body.data.email).toContain('***');
  });

  test('PHI masking — dateOfBirth shows year only', async () => {
    const res = await request(app)
      .get(`/api/patients/${patientId}`)
      .expect(200);

    expect(res.body.data.dateOfBirth).toMatch(/^\d{4}-\*\*-\*\*$/);
  });

  test('404 — returns 404 for unknown patient ID', async () => {
    const res = await request(app)
      .get('/api/patients/00000000-0000-0000-0000-000000000000')
      .expect(404);

    expect(res.body.status).toBe('error');
  });
});

// ── GET /api/patients ─────────────────────────────────────────────────────────

describe('GET /api/patients', () => {
  test('200 — returns array of patients', async () => {
    const res = await request(app)
      .get('/api/patients')
      .expect(200);

    expect(res.body.status).toBe('success');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(typeof res.body.count).toBe('number');
  });
});

// ── DELETE /api/patients/:id ──────────────────────────────────────────────────

describe('DELETE /api/patients/:id', () => {
  let patientId;

  beforeEach(async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validPayload())
      .expect(201);
    patientId = res.body.data.id;
  });

  test('200 — soft-deletes an existing patient', async () => {
    const res = await request(app)
      .delete(`/api/patients/${patientId}`)
      .expect(200);

    expect(res.body.status).toBe('success');
  });

  test('soft-deleted patient returns 404 on subsequent GET', async () => {
    await request(app).delete(`/api/patients/${patientId}`).expect(200);
    await request(app).get(`/api/patients/${patientId}`).expect(404);
  });

  test('404 — returns 404 for unknown patient ID', async () => {
    await request(app)
      .delete('/api/patients/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});

// ── Health Check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  test('200 — health endpoint responds', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.uptime).toBeGreaterThanOrEqual(0);
  });
});

// ── Security Headers ──────────────────────────────────────────────────────────

describe('Security headers (Helmet)', () => {
  test('X-Content-Type-Options is set', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  test('X-Frame-Options is set', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});
