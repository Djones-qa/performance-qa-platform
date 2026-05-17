/**
 * E2E Tests — Patient Intake Form (Playwright)
 *
 * Risk mapping:
 *   - Form submission with valid data → confirms full stack works end-to-end
 *   - Client-side validation feedback → prevents bad data reaching server
 *   - Consent checkboxes required → legal / liability compliance
 *   - Accessibility checks → ADA / Section 508 compliance
 *
 * Run: npx playwright test
 * Run headed: npx playwright test --headed
 */

const { test, expect } = require('@playwright/test');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function fillValidForm(page) {
  await page.fill('#firstName', 'Alice');
  await page.fill('#lastName', 'Walker');
  await page.fill('#dateOfBirth', '1982-07-14');
  await page.fill('#gender', 'Female');
  await page.fill('#email', 'alice.walker@example.com');
  await page.fill('#phone', '555-234-5678');
  await page.fill('#address', '789 Elm Street');
  await page.fill('#zipCode', '30301');
  await page.selectOption('#insuranceProvider', 'Cigna');
  await page.fill('#policyNumber', 'CIG-445566');
  await page.check('#consentToTreat');
  await page.check('#hipaaAcknowledged');
}

// ── Page Load ─────────────────────────────────────────────────────────────────

test.describe('Page load', () => {
  test('loads the intake form page', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page).toHaveTitle(/Patient Intake/i);
    await expect(page.locator('h1')).toContainText('Patient Intake Form');
  });

  test('form has all required fieldsets', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('fieldset')).toHaveCount(5);
  });

  test('submit button is visible and enabled on load', async ({ page }) => {
    await page.goto(BASE_URL);
    const btn = page.locator('#submit-btn');
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});

// ── Accessibility ─────────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test('all required inputs have associated labels', async ({ page }) => {
    await page.goto(BASE_URL);
    const inputs = page.locator('input[required], select[required]');
    const count = await inputs.count();

    for (let i = 0; i < count; i++) {
      const input = inputs.nth(i);
      const id = await input.getAttribute('id');
      if (id) {
        const label = page.locator(`label[for="${id}"]`);
        await expect(label).toBeVisible();
      }
    }
  });

  test('error messages use role=alert for screen readers', async ({ page }) => {
    await page.goto(BASE_URL);
    const errorSpans = page.locator('span.field-error[role="alert"]');
    const count = await errorSpans.count();
    expect(count).toBeGreaterThan(0);
  });

  test('form has aria-label', async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.locator('form#intake-form')).toHaveAttribute('aria-label');
  });
});

// ── Client-Side Validation ────────────────────────────────────────────────────

test.describe('Client-side validation', () => {
  test('shows error when submitting empty form', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.click('#submit-btn');
    await expect(page.locator('.alert.alert-error')).toBeVisible();
  });

  test('shows inline error for invalid email on blur', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#email', 'not-an-email');
    await page.locator('#email').blur();
    await expect(page.locator('#email-error')).toContainText(/valid email/i);
    await expect(page.locator('#email')).toHaveClass(/invalid/);
  });

  test('shows inline error for future date of birth', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#dateOfBirth', '2099-01-01');
    await page.locator('#dateOfBirth').blur();
    await expect(page.locator('#dob-error')).toContainText(/future/i);
  });

  test('shows error when consent checkboxes are unchecked', async ({ page }) => {
    await page.goto(BASE_URL);
    await fillValidForm(page);
    await page.uncheck('#consentToTreat');
    await page.click('#submit-btn');
    await expect(page.locator('#consent-error')).toContainText(/consent/i);
  });

  test('clears error when valid value is entered', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#email', 'bad');
    await page.locator('#email').blur();
    await expect(page.locator('#email')).toHaveClass(/invalid/);

    await page.fill('#email', 'good@example.com');
    await page.locator('#email').blur();
    await expect(page.locator('#email')).toHaveClass(/valid/);
    await expect(page.locator('#email-error')).toBeEmpty();
  });
});

// ── Notes Character Counter ───────────────────────────────────────────────────

test.describe('Notes character counter', () => {
  test('updates counter as user types', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#notes', 'Hello world');
    await expect(page.locator('#notes-counter')).toContainText('11 / 2000');
  });
});

// ── Successful Submission ─────────────────────────────────────────────────────

test.describe('Form submission', () => {
  test('submits valid form and shows success banner', async ({ page }) => {
    await page.goto(BASE_URL);
    await fillValidForm(page);
    await page.click('#submit-btn');

    await expect(page.locator('.alert.alert-success')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.alert.alert-success')).toContainText(/submitted successfully/i);
  });

  test('form resets after successful submission', async ({ page }) => {
    await page.goto(BASE_URL);
    await fillValidForm(page);
    await page.click('#submit-btn');

    await expect(page.locator('.alert.alert-success')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#firstName')).toHaveValue('');
  });

  test('submit button is re-enabled after submission', async ({ page }) => {
    await page.goto(BASE_URL);
    await fillValidForm(page);
    await page.click('#submit-btn');

    await expect(page.locator('.alert.alert-success')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#submit-btn')).toBeEnabled();
    await expect(page.locator('#submit-btn')).toHaveText('Submit Intake Form');
  });
});

// ── Clear Form ────────────────────────────────────────────────────────────────

test.describe('Clear form button', () => {
  test('reset button clears all fields', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.fill('#firstName', 'Test');
    await page.fill('#email', 'test@example.com');
    await page.click('button[type="reset"]');

    await expect(page.locator('#firstName')).toHaveValue('');
    await expect(page.locator('#email')).toHaveValue('');
  });
});
