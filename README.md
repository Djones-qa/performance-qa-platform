# Performance Engineering Platform — Healthcare Patient Intake

[![CI](https://github.com/Djones-qa/performance-qa-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/Djones-qa/performance-qa-platform/actions/workflows/ci.yml)
[![Security Scan](https://github.com/Djones-qa/performance-qa-platform/actions/workflows/security.yml/badge.svg)](https://github.com/Djones-qa/performance-qa-platform/actions/workflows/security.yml)
[![Coverage](https://img.shields.io/badge/coverage-80%25%2B-brightgreen)](#test-commands)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-Darrius%20Jones-0077B5?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/darrius-jones-28226b350/)

A mock healthcare patient intake form (HTML + Node.js/Express) with a complete performance and validation test strategy. Every test layer maps to a real business or compliance risk.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [API Endpoints](#api-endpoints)
- [Test Strategy](#test-strategy)
- [Test Commands](#test-commands)
- [Security Controls](#security-controls)
- [Compliance Notes](#compliance-notes)
- [Author](#author)
- [License](#license)

---

## Architecture

```
performance-qa-platform/
├── .github/
│   └── workflows/
│       ├── ci.yml           # Unit + Integration + Security tests on every push/PR
│       └── security.yml     # npm audit + dependency vulnerability scan
├── src/
│   ├── server.js            # Express app (Helmet, rate limiting, body limits)
│   ├── routes/
│   │   └── patients.js      # REST API: intake, get, list, soft-delete
│   └── validators/
│       └── patientValidator.js  # Pure validation + XSS sanitization logic
├── public/
│   ├── index.html           # Patient intake form (accessible, WCAG 2.1)
│   ├── styles.css           # Responsive CSS
│   └── form.js              # Client-side validation + fetch submission
├── tests/
│   ├── unit/
│   │   └── patientValidator.test.js  # 50+ unit tests — validation logic
│   ├── integration/
│   │   └── patients.api.test.js      # API contract + PHI masking tests
│   ├── security/
│   │   └── injection.test.js         # XSS, SQLi, NoSQLi, path traversal, DoS
│   ├── performance/
│   │   └── load-test.js              # k6: smoke, load, stress, spike, soak
│   └── e2e/
│       └── intake-form.spec.js       # Playwright: Chrome, Firefox, Safari, Mobile
├── docs/
│   └── risk-mapping.md      # Business risk → test layer matrix
├── playwright.config.js
└── package.json
```

---

## Quick Start

```bash
git clone https://github.com/Djones-qa/performance-qa-platform.git
cd performance-qa-platform
npm install
npm start          # http://localhost:3000
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/patients/intake` | Submit patient intake form |
| `GET` | `/api/patients/:id` | Get patient record (PHI masked) |
| `GET` | `/api/patients` | List all active patients (PHI masked) |
| `DELETE` | `/api/patients/:id` | Soft-delete patient record |
| `GET` | `/health` | Health check / uptime |

---

## Test Strategy

See [`docs/risk-mapping.md`](docs/risk-mapping.md) for the full risk → test layer matrix. Every test exists because of a specific business or compliance risk — not just for coverage.

### Test Layers

| Layer | Tool | Risk Addressed |
|-------|------|----------------|
| Unit | Jest | Validation logic, XSS sanitization, PHI handling |
| Integration | Jest + Supertest | API contracts, PHI masking, security headers |
| Security | Jest + Supertest | Injection attacks, DoS, information leakage |
| Performance | k6 | Availability SLA, memory leaks, spike resilience |
| E2E | Playwright | Full user journey, accessibility, client validation |

### Performance Thresholds

| Metric | Threshold | Business Reason |
|--------|-----------|-----------------|
| `p(95) response time` | < 500ms | Patient wait time SLA |
| `p(99) response time` | < 2000ms | Worst-case acceptable UX |
| `error rate` | < 1% | Intake pipeline reliability |

### k6 Scenarios

```bash
k6 run --env SCENARIO=smoke  tests/performance/load-test.js   # 1 VU, 1 min — sanity check
k6 run --env SCENARIO=load   tests/performance/load-test.js   # ramp to 50 VUs — normal peak
k6 run --env SCENARIO=stress tests/performance/load-test.js   # ramp to 200 VUs — breaking point
k6 run --env SCENARIO=spike  tests/performance/load-test.js   # burst to 500 VUs — viral event
k6 run --env SCENARIO=soak   tests/performance/load-test.js   # 20 VUs, 30 min — memory leaks
```

---

## Test Commands

```bash
npm test                  # Unit + Integration + Security (Jest) — 97 tests
npm run test:unit         # Unit tests only
npm run test:integration  # Integration tests only
npm run test:security     # Security/injection tests only
npm run test:coverage     # All Jest tests with coverage report (80%+ threshold)
npm run test:e2e          # Playwright E2E — auto-starts server
npm run test:perf         # k6 load test — requires k6 installed + server running
```

---

## Security Controls

| Control | Implementation |
|---------|---------------|
| Secure headers | Helmet (CSP, HSTS, X-Frame-Options, X-Content-Type-Options) |
| Rate limiting | 100 req/15min on intake endpoint, 500 req/15min globally |
| Body size limit | 10kb max — prevents payload-based DoS |
| XSS sanitization | `xss` library + `javascript:` URI stripping on all string fields |
| PHI masking | SSN → last 4 only, DOB → year only, email/phone partially masked in responses |
| Audit trail | Soft delete only — HIPAA requires records, not hard deletes |
| Error handling | Global handler never leaks stack traces or internal paths |

---

## Compliance Notes

- **HIPAA** — PHI fields masked in all responses, consent timestamps recorded, soft-delete audit trail preserved
- **WCAG 2.1 AA** — `aria-required`, `role="alert"` on error messages, `aria-describedby` field associations, fully keyboard navigable
- **ADA / Section 508** — all form controls have visible labels, error states announced to screen readers

> Full WCAG compliance requires manual testing with assistive technologies and expert accessibility review.

---

## Author

**Darrius Jones** — Performance & QA Engineer

[![LinkedIn](https://img.shields.io/badge/LinkedIn-Connect-0077B5?logo=linkedin&logoColor=white)](https://www.linkedin.com/in/darrius-jones-28226b350/)

Focused on building test strategies that map directly to business risk — not just chasing coverage numbers. This platform demonstrates end-to-end quality engineering across unit, integration, security, performance, and E2E layers in a healthcare compliance context.

---

## License

MIT License

Copyright (c) 2026 Darrius Jones

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
