# Test Strategy — Risk Mapping

## Overview

Every test in this platform maps to a concrete business or compliance risk.
This document is the authoritative reference for why each test layer exists.

---

## Risk → Test Layer Matrix

| Business Risk | Compliance Driver | Test Layer | Specific Test |
|---|---|---|---|
| Future DOB bypasses age-gating for controlled substances | DEA / state pharmacy law | Unit | `rejects future dateOfBirth` |
| SSN echoed in API response | HIPAA §164.514 (PHI) | Unit + Integration | `SSN is not echoed`, `response never contains SSN` |
| Missing patient consent | State tort law / HIPAA | Unit + Integration | `rejects when consentToTreat is false` |
| Stored XSS in clinical staff UI | OWASP Top 10 A03 | Unit + Security | `sanitizes XSS in firstName` |
| SQL injection via patient fields | OWASP Top 10 A03 | Security | `handles SQL injection in firstName` |
| NoSQL operator injection | OWASP Top 10 A03 | Security | `rejects $gt operator` |
| Invalid insurance provider → claim rejection | Revenue cycle management | Unit + Integration | `rejects unknown insurance provider` |
| Oversized payload → DoS / DB truncation | Availability SLA | Security + Integration | `rejects body larger than 10kb` |
| PHI in list endpoint (minimum-necessary) | HIPAA §164.502(b) | Integration | `PHI masking — email is partially obscured` |
| Hard delete removes audit trail | HIPAA §164.530(j) | Integration | `soft-deletes an existing patient` |
| Stack trace in error response | Information disclosure | Security | `500 errors do not expose stack traces` |
| Path traversal via patient ID | OWASP Top 10 A01 | Security | `GET /api/patients/../etc/passwd` |
| Prototype pollution | Server-side object manipulation | Security | `__proto__ in body does not pollute` |
| API unavailable during peak intake | Availability / patient care | Performance | `load scenario — p95 < 500ms` |
| Memory leak under sustained load | Reliability | Performance | `soak scenario — 30 min at 20 VUs` |
| Sudden traffic spike (breach alert / viral) | Resilience | Performance | `spike scenario — 500 VUs burst` |
| Form unusable without mouse | ADA / Section 508 | E2E | `all required inputs have associated labels` |
| Error messages not announced to screen readers | WCAG 2.1 AA | E2E | `error messages use role=alert` |
| Form submits with missing consent | Legal liability | E2E | `shows error when consent checkboxes are unchecked` |

---

## Test Layer Descriptions

### Unit Tests (`tests/unit/`)
**Tool:** Jest  
**Scope:** Pure validation logic in `src/validators/patientValidator.js`  
**Why:** Fastest feedback loop. Catches logic errors before they reach the network layer.  
**Coverage target:** 80% branches, functions, lines, statements.

### Integration Tests (`tests/integration/`)
**Tool:** Jest + Supertest  
**Scope:** Full HTTP request/response cycle through Express  
**Why:** Validates that routing, middleware (Helmet, rate limiting, body parsing), and validation work together correctly.

### Security Tests (`tests/security/`)
**Tool:** Jest + Supertest  
**Scope:** Attack vector simulation — XSS, SQLi, NoSQLi, path traversal, prototype pollution, DoS  
**Why:** Healthcare data is a high-value target. HIPAA breach notification costs average $10.9M per incident (IBM 2023).

### Performance Tests (`tests/performance/`)
**Tool:** k6  
**Scope:** Load, stress, spike, soak scenarios against the running server  
**Why:** Patient intake systems must remain available during peak hours (morning clinic opens, insurance verification windows). Degraded performance = delayed care.

**Scenarios:**
- **Smoke** (1 VU, 1 min) — sanity check before any deployment
- **Load** (ramp to 50 VUs) — normal peak traffic simulation
- **Stress** (ramp to 200 VUs) — find the breaking point
- **Spike** (burst to 500 VUs) — simulate a breach alert or viral event driving traffic
- **Soak** (20 VUs, 30 min) — detect memory leaks and performance degradation over time

**Thresholds:**
- `p(95) < 500ms` — patient wait time SLA
- `p(99) < 2000ms` — worst-case acceptable UX
- `error rate < 1%` — intake pipeline reliability

### E2E Tests (`tests/e2e/`)
**Tool:** Playwright (Chromium, Firefox, WebKit, Mobile Chrome)  
**Scope:** Full browser interaction with the HTML form  
**Why:** Validates the complete user journey including client-side validation, accessibility, and API integration from the browser's perspective.

---

## HIPAA PHI Handling

The following fields are classified as Protected Health Information (PHI) and receive special treatment:

| Field | Treatment |
|---|---|
| SSN | Only last 4 digits stored; never echoed in responses |
| Date of Birth | Year-only in list/get responses |
| Email | Partially masked in responses |
| Phone | Partially masked in responses |
| Clinical notes | Stored sanitized; not returned in list endpoint |

---

## Running the Full Test Suite

```bash
# Install dependencies
npm install

# Unit + Integration + Security tests
npm test

# With coverage report
npm run test:coverage

# E2E tests (requires server running or uses webServer config)
npm run test:e2e

# Performance tests (requires k6 installed + server running)
npm run test:perf

# Specific scenario
k6 run --env SCENARIO=smoke tests/performance/load-test.js
k6 run --env SCENARIO=stress tests/performance/load-test.js
```
