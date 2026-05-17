/**
 * k6 Load Test — Healthcare Patient Intake API
 *
 * Scenarios:
 *   1. smoke      — 1 VU, 1 min  — verify system works at minimal load
 *   2. load       — ramp to 50 VUs over 5 min — normal peak traffic
 *   3. stress     — ramp to 200 VUs — find breaking point
 *   4. spike      — sudden burst to 500 VUs — simulate viral event / breach alert
 *   5. soak       — 20 VUs for 30 min — detect memory leaks / degradation over time
 *
 * Business risk thresholds:
 *   - p95 response time < 500ms  (patient wait time SLA)
 *   - error rate < 1%            (intake pipeline reliability)
 *   - p99 < 2000ms               (worst-case acceptable UX)
 *
 * Run: k6 run tests/performance/load-test.js
 * Run specific scenario: k6 run --env SCENARIO=smoke tests/performance/load-test.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom Metrics ────────────────────────────────────────────────────────────

const intakeErrorRate    = new Rate('intake_error_rate');
const intakeLatency      = new Trend('intake_latency_ms', true);
const validationErrors   = new Counter('validation_error_responses');
const successfulIntakes  = new Counter('successful_intakes');

// ── Configuration ─────────────────────────────────────────────────────────────

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const SCENARIO = __ENV.SCENARIO || 'load';

const SCENARIOS = {
  smoke: {
    executor: 'constant-vus',
    vus: 1,
    duration: '1m',
    tags: { scenario: 'smoke' }
  },
  load: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 10 },
      { duration: '5m', target: 50 },
      { duration: '2m', target: 50 },
      { duration: '1m', target: 0 }
    ],
    tags: { scenario: 'load' }
  },
  stress: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '2m', target: 50 },
      { duration: '5m', target: 100 },
      { duration: '5m', target: 200 },
      { duration: '5m', target: 200 },
      { duration: '2m', target: 0 }
    ],
    tags: { scenario: 'stress' }
  },
  spike: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '30s', target: 10 },
      { duration: '30s', target: 500 },  // sudden spike
      { duration: '1m',  target: 500 },
      { duration: '30s', target: 10 },
      { duration: '30s', target: 0 }
    ],
    tags: { scenario: 'spike' }
  },
  soak: {
    executor: 'constant-vus',
    vus: 20,
    duration: '30m',
    tags: { scenario: 'soak' }
  }
};

export const options = {
  scenarios: {
    [SCENARIO]: SCENARIOS[SCENARIO] || SCENARIOS.load
  },
  thresholds: {
    // Patient wait time SLA
    'http_req_duration{endpoint:intake}': ['p(95)<500', 'p(99)<2000'],
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    // Intake pipeline reliability
    'intake_error_rate': ['rate<0.01'],
    // Overall HTTP error rate
    'http_req_failed': ['rate<0.05']
  }
};

// ── Data Generators ───────────────────────────────────────────────────────────

const INSURANCE_PROVIDERS = ['BlueCross', 'Aetna', 'Cigna', 'UnitedHealth', 'Humana', 'Medicare', 'Medicaid', 'Other'];
const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const FIRST_NAMES = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank', 'Grace', 'Henry'];
const LAST_NAMES  = ['Smith', 'Jones', 'Williams', 'Brown', 'Davis', 'Miller', 'Wilson'];

function randomElement(arr) {
  return arr[randomIntBetween(0, arr.length - 1)];
}

function randomDOB() {
  const year  = randomIntBetween(1940, 2000);
  const month = String(randomIntBetween(1, 12)).padStart(2, '0');
  const day   = String(randomIntBetween(1, 28)).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function generatePatient() {
  const firstName = randomElement(FIRST_NAMES);
  const lastName  = randomElement(LAST_NAMES);
  return {
    firstName,
    lastName,
    dateOfBirth: randomDOB(),
    gender: randomElement(['Male', 'Female', 'Non-binary', 'Other']),
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}${randomIntBetween(1, 9999)}@example.com`,
    phone: `555-${String(randomIntBetween(100, 999))}-${String(randomIntBetween(1000, 9999))}`,
    address: `${randomIntBetween(1, 9999)} Main St`,
    zipCode: String(randomIntBetween(10000, 99999)),
    insuranceProvider: randomElement(INSURANCE_PROVIDERS),
    policyNumber: `POL-${randomIntBetween(100000, 999999)}`,
    bloodType: randomElement(BLOOD_TYPES),
    allergies: ['Penicillin'],
    consentToTreat: true,
    hipaaAcknowledged: true
  };
}

// ── Test Scenarios ────────────────────────────────────────────────────────────

export default function () {
  const headers = { 'Content-Type': 'application/json' };

  group('health check', () => {
    const res = http.get(`${BASE_URL}/health`, { tags: { endpoint: 'health' } });
    check(res, {
      'health: status 200': r => r.status === 200,
      'health: body has ok': r => {
        try { return JSON.parse(r.body).status === 'ok'; } catch { return false; }
      }
    });
  });

  sleep(randomIntBetween(1, 3) / 10);

  group('patient intake — valid submission', () => {
    const payload = JSON.stringify(generatePatient());
    const res = http.post(`${BASE_URL}/api/patients/intake`, payload, {
      headers,
      tags: { endpoint: 'intake' }
    });

    const success = check(res, {
      'intake: status 201': r => r.status === 201,
      'intake: has patient id': r => {
        try { return !!JSON.parse(r.body).data?.id; } catch { return false; }
      },
      'intake: response time < 500ms': r => r.timings.duration < 500
    });

    intakeLatency.add(res.timings.duration);
    intakeErrorRate.add(!success);

    if (res.status === 201) {
      successfulIntakes.add(1);
    } else if (res.status === 422) {
      validationErrors.add(1);
    }
  });

  sleep(randomIntBetween(1, 5) / 10);

  group('patient intake — invalid submission (validation path)', () => {
    const badPayload = JSON.stringify({
      firstName: '',
      email: 'not-an-email',
      consentToTreat: false
    });
    const res = http.post(`${BASE_URL}/api/patients/intake`, badPayload, {
      headers,
      tags: { endpoint: 'intake_invalid' }
    });

    check(res, {
      'invalid intake: status 422': r => r.status === 422,
      'invalid intake: has errors array': r => {
        try { return Array.isArray(JSON.parse(r.body).errors); } catch { return false; }
      }
    });
  });

  sleep(randomIntBetween(5, 15) / 10);
}

// ── Teardown ──────────────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    scenario: SCENARIO,
    thresholds: {},
    metrics: {}
  };

  // Extract key metrics
  for (const [name, metric] of Object.entries(data.metrics)) {
    if (['intake_error_rate', 'successful_intakes', 'validation_error_responses'].includes(name)) {
      summary.metrics[name] = metric.values;
    }
  }

  for (const [name, result] of Object.entries(data.thresholds || {})) {
    summary.thresholds[name] = result.ok ? 'PASS' : 'FAIL';
  }

  return {
    'tests/performance/results/summary.json': JSON.stringify(summary, null, 2),
    stdout: `\n=== Performance Test Complete ===\nScenario: ${SCENARIO}\n`
  };
}
