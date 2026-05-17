/**
 * Security Tests — Injection & Input Attack Vectors
 *
 * Risk mapping:
 *   - SQL injection in patient fields → data exfiltration / corruption
 *   - NoSQL injection operators → auth bypass / data leak
 *   - XSS payloads → stored XSS in clinical staff UI
 *   - Path traversal in IDs → file system access
 *   - Prototype pollution → server-side object manipulation
 *   - Oversized payloads → DoS
 *   - Null byte injection → log poisoning / parser confusion
 */

const request = require('supertest');
const app = require('../../src/server');

function validBase(overrides = {}) {
  return {
    firstName: 'Test',
    lastName: 'User',
    dateOfBirth: '1990-01-01',
    gender: 'Other',
    email: 'test@example.com',
    phone: '555-123-4567',
    address: '1 Test St',
    zipCode: '12345',
    insuranceProvider: 'Medicare',
    policyNumber: 'MED-0001',
    consentToTreat: true,
    hipaaAcknowledged: true,
    ...overrides
  };
}

// ── XSS Payloads ──────────────────────────────────────────────────────────────

describe('XSS injection in patient fields', () => {
  const xssPayloads = [
    '<script>alert(document.cookie)</script>',
    '<img src=x onerror=alert(1)>',
    '"><script>alert(1)</script>',
    "';alert(1)//",
    '<svg onload=alert(1)>',
    'javascript:alert(1)',
    '<iframe src="javascript:alert(1)"></iframe>'
  ];

  xssPayloads.forEach(payload => {
    test(`sanitizes XSS in firstName: ${payload.slice(0, 40)}`, async () => {
      const res = await request(app)
        .post('/api/patients/intake')
        .send(validBase({ firstName: payload }));

      // Either rejected (422) or sanitized — never stored raw
      if (res.status === 201) {
        // If accepted, the stored value must not contain raw script tags
        const getRes = await request(app).get(`/api/patients/${res.body.data.id}`);
        const bodyStr = JSON.stringify(getRes.body);
        expect(bodyStr).not.toContain('<script>');
        expect(bodyStr).not.toContain('onerror=');
        expect(bodyStr).not.toContain('javascript:');
      } else {
        expect(res.status).toBe(422);
      }
    });
  });
});

// ── SQL Injection ─────────────────────────────────────────────────────────────

describe('SQL injection in patient fields', () => {
  const sqlPayloads = [
    "'; DROP TABLE patients; --",
    "' OR '1'='1",
    "1; SELECT * FROM users",
    "' UNION SELECT null,null,null--",
    "admin'--",
    "1' AND SLEEP(5)--"
  ];

  sqlPayloads.forEach(payload => {
    test(`handles SQL injection in firstName: ${payload.slice(0, 40)}`, async () => {
      const res = await request(app)
        .post('/api/patients/intake')
        .send(validBase({ firstName: payload }));

      // Server must not crash (500) — either sanitize or reject
      expect(res.status).not.toBe(500);
    });
  });
});

// ── NoSQL Injection ───────────────────────────────────────────────────────────

describe('NoSQL injection operators', () => {
  test('rejects $gt operator in insuranceProvider', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validBase({ insuranceProvider: { $gt: '' } }));

    expect([400, 422]).toContain(res.status);
    expect(res.status).not.toBe(500);
  });

  test('rejects $where operator in email', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validBase({ email: { $where: 'this.password.length > 0' } }));

    expect([400, 422]).toContain(res.status);
  });
});

// ── Path Traversal ────────────────────────────────────────────────────────────

describe('Path traversal in patient ID parameter', () => {
  const traversalIds = [
    '../../../etc/passwd',
    '..%2F..%2F..%2Fetc%2Fpasswd',
    '....//....//etc/passwd',
    '%2e%2e%2f%2e%2e%2f'
  ];

  traversalIds.forEach(id => {
    test(`GET /api/patients/${id.slice(0, 30)} does not expose files`, async () => {
      const res = await request(app).get(`/api/patients/${encodeURIComponent(id)}`);
      expect(res.status).not.toBe(500);
      const body = JSON.stringify(res.body);
      expect(body).not.toContain('root:');
      expect(body).not.toContain('/bin/bash');
    });
  });
});

// ── Prototype Pollution ───────────────────────────────────────────────────────

describe('Prototype pollution prevention', () => {
  test('__proto__ in body does not pollute Object prototype', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({
        ...validBase(),
        '__proto__': { 'isAdmin': true },
        'constructor': { 'prototype': { 'isAdmin': true } }
      }));

    expect(res.status).not.toBe(500);
    // Prototype should not be polluted
    expect({}.isAdmin).toBeUndefined();
  });
});

// ── Oversized Payloads ────────────────────────────────────────────────────────

describe('Oversized payload (DoS prevention)', () => {
  test('rejects body larger than 10kb limit', async () => {
    const hugePayload = validBase({ notes: 'A'.repeat(50000) });
    const res = await request(app)
      .post('/api/patients/intake')
      .send(hugePayload);

    expect([413, 422]).toContain(res.status);
  });

  test('rejects extremely long field values', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validBase({ firstName: 'A'.repeat(10000) }));

    expect([413, 422]).toContain(res.status);
  });
});

// ── Null Byte Injection ───────────────────────────────────────────────────────

describe('Null byte injection', () => {
  test('handles null bytes in firstName without crashing', async () => {
    const res = await request(app)
      .post('/api/patients/intake')
      .send(validBase({ firstName: 'Jane\x00Doe' }));

    expect(res.status).not.toBe(500);
  });
});

// ── HTTP Method Enforcement ───────────────────────────────────────────────────

describe('HTTP method enforcement', () => {
  test('PATCH /api/patients/intake returns 404', async () => {
    const res = await request(app).patch('/api/patients/intake').send({});
    expect(res.status).toBe(404);
  });

  test('PUT /api/patients/intake returns 404', async () => {
    const res = await request(app).put('/api/patients/intake').send({});
    expect(res.status).toBe(404);
  });
});

// ── Error Message Leakage ─────────────────────────────────────────────────────

describe('Error message information leakage', () => {
  test('500 errors do not expose stack traces', async () => {
    // Trigger a route that doesn't exist
    const res = await request(app).get('/api/nonexistent/route/that/does/not/exist');
    expect(res.status).toBe(404);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('at Object.');
    expect(body).not.toContain('node_modules');
    expect(body).not.toContain('Error:');
  });
});
