# Performance Engineering Platform — Healthcare Patient Intake

A mock healthcare patient intake form (HTML + Node.js/Express) with a complete performance and validation test strategy. Every test layer maps to a real business or compliance risk.

## Architecture

```
performance-qa-platform/
├── src/
│   ├── server.js                    # Express app (Helmet, rate limiting, body limits)
│   ├── routes/
│   │   └── patients.js              # REST API: intake, get, list, soft-delete
│   └── validators/
│       └── patientValidator.js      # Pure validation + XSS sanitization logic
├── public/
│   ├── index.html                   # Patient intake form (accessible, WCAG 2.1)
│   ├── styles.css                   # Responsive CSS
│   └── form.js                      # Client-side validation + fetch submission
├── tests/
│   ├── unit/
│   │   └── patientValidator.test.js # 50+ unit tests — validation logic
│   ├── integration/
│   │   └── patients.api.test.js     # API contract + PHI masking tests
│   ├── security/
│   │   └── injection.test.js        # XSS, SQLi, NoSQLi, path traversal, DoS
│   ├── performance/
│   │   └── load-test.js             # k6: smoke, load, stress, spike, soak
│   └── e2e/
│       └── intake-form.spec.js      # Playwright: Chrome, Firefox, Safari, Mobile
├── docs/
│   └── risk-mapping.md              # Business risk → test layer matrix
├── playwright.config.js
└── package.json
```

## Quick Start

```bash
npm install
npm start          # http://localhost:3000
```

## Test Commands

```bash
npm test                  # Unit + Integration + Security (Jest)
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:security     # Security/injection tests only
npm run test:coverage     # All Jest tests with coverage report
npm run test:e2e          # Playwright E2E (auto-starts server)
npm run test:perf         # k6 load test (requires k6 + running server)
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/patients/intake` | Submit patient intake form |
| `GET`  | `/api/patients/:id` | Get patient record (PHI masked) |
| `GET`  | `/api/patients` | List all active patients (PHI masked) |
| `DELETE` | `/api/patients/:id` | Soft-delete patient record |
| `GET`  | `/health` | Health check |

## Test Strategy

See [`docs/risk-mapping.md`](docs/risk-mapping.md) for the full risk → test layer matrix.

### Test Layers

| Layer | Tool | Risk Addressed |
|-------|------|----------------|
| Unit | Jest | Validation logic, XSS sanitization, PHI handling |
| Integration | Jest + Supertest | API contracts, PHI masking, security headers |
| Security | Jest + Supertest | Injection attacks, DoS, information leakage |
| Performance | k6 | Availability SLA, memory leaks, spike resilience |
| E2E | Playwright | Full user journey, accessibility, client validation |

### Performance Thresholds

- `p(95) < 500ms` — patient wait time SLA
- `p(99) < 2000ms` — worst-case acceptable UX  
- `error rate < 1%` — intake pipeline reliability

### k6 Scenarios

```bash
k6 run --env SCENARIO=smoke  tests/performance/load-test.js   # 1 VU, 1 min
k6 run --env SCENARIO=load   tests/performance/load-test.js   # ramp to 50 VUs
k6 run --env SCENARIO=stress tests/performance/load-test.js   # ramp to 200 VUs
k6 run --env SCENARIO=spike  tests/performance/load-test.js   # burst to 500 VUs
k6 run --env SCENARIO=soak   tests/performance/load-test.js   # 20 VUs, 30 min
```

## Security Controls

- **Helmet** — secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
- **Rate limiting** — 100 req/15min on intake, 500 req/15min globally
- **Body size limit** — 10kb max to prevent payload attacks
- **XSS sanitization** — all string fields sanitized via `xss` library
- **PHI masking** — SSN (last 4 only), DOB (year only), email/phone partially masked
- **Soft delete** — HIPAA audit trail preserved, no hard deletes
- **No stack traces** — global error handler never leaks internals

## Compliance Notes

- **HIPAA** — PHI fields masked in responses, consent timestamps recorded, soft-delete audit trail
- **WCAG 2.1 AA** — `aria-required`, `role="alert"` on errors, `aria-describedby` associations, keyboard navigable
- **ADA / Section 508** — all form controls have visible labels, error states announced to screen readers

> Full WCAG validation requires manual testing with assistive technologies and expert accessibility review.
