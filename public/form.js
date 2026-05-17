/**
 * form.js — Client-side form handling
 * Provides immediate feedback; server-side validation is the authoritative check.
 */

(function () {
  'use strict';

  const form = document.getElementById('intake-form');
  const alertBanner = document.getElementById('alert-banner');
  const submitBtn = document.getElementById('submit-btn');
  const notesField = document.getElementById('notes');
  const notesCounter = document.getElementById('notes-counter');

  // ── Notes character counter ──────────────────────────────────────────────
  if (notesField && notesCounter) {
    notesField.addEventListener('input', () => {
      const len = notesField.value.length;
      notesCounter.textContent = `${len} / 2000 characters`;
      notesCounter.style.color = len > 1800 ? '#e67e22' : '';
    });
  }

  // ── Client-side field validators ─────────────────────────────────────────
  const validators = {
    firstName:         v => v.trim().length > 0 ? null : 'First name is required',
    lastName:          v => v.trim().length > 0 ? null : 'Last name is required',
    dateOfBirth:       v => {
      if (!v) return 'Date of birth is required';
      if (new Date(v) > new Date()) return 'Date of birth cannot be in the future';
      return null;
    },
    gender:            v => v.trim().length > 0 ? null : 'Gender is required',
    email:             v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : 'Enter a valid email address',
    phone:             v => /^\+?1?\s?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}$/.test(v) ? null : 'Enter a valid US phone number',
    address:           v => v.trim().length > 0 ? null : 'Address is required',
    zipCode:           v => /^\d{5}(-\d{4})?$/.test(v) ? null : 'Enter a valid ZIP code (e.g. 12345)',
    insuranceProvider: v => v !== '' ? null : 'Select an insurance provider',
    policyNumber:      v => /^[A-Z0-9-]{4,20}$/i.test(v.trim()) ? null : 'Policy number must be 4–20 alphanumeric characters',
    ssn:               v => {
      if (!v) return null; // optional
      return /^\d{3}-\d{2}-\d{4}$/.test(v) ? null : 'SSN must be in format XXX-XX-XXXX';
    },
    consentToTreat:    v => v ? null : 'You must consent to treatment',
    hipaaAcknowledged: v => v ? null : 'You must acknowledge the HIPAA notice'
  };

  // ── Validate a single field ───────────────────────────────────────────────
  function validateField(name, value) {
    const fn = validators[name];
    return fn ? fn(value) : null;
  }

  function setFieldState(input, error) {
    const errorEl = document.getElementById(
      input.getAttribute('aria-describedby')?.split(' ').find(id => id.endsWith('-error'))
    );
    if (error) {
      input.classList.add('invalid');
      input.classList.remove('valid');
      if (errorEl) errorEl.textContent = error;
    } else {
      input.classList.remove('invalid');
      input.classList.add('valid');
      if (errorEl) errorEl.textContent = '';
    }
  }

  // ── Inline validation on blur ─────────────────────────────────────────────
  form.querySelectorAll('input, select, textarea').forEach(input => {
    input.addEventListener('blur', () => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      const error = validateField(input.name, value);
      if (error !== undefined) setFieldState(input, error);
    });
  });

  // ── Show banner ───────────────────────────────────────────────────────────
  function showBanner(type, message) {
    alertBanner.className = `alert alert-${type}`;
    alertBanner.textContent = message;
    alertBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideBanner() {
    alertBanner.className = 'alert hidden';
    alertBanner.textContent = '';
  }

  // ── Build payload ─────────────────────────────────────────────────────────
  function buildPayload() {
    const fd = new FormData(form);
    const payload = {};

    for (const [key, value] of fd.entries()) {
      if (value !== '') payload[key] = value;
    }

    // Checkboxes not in FormData when unchecked
    payload.consentToTreat    = document.getElementById('consentToTreat').checked;
    payload.hipaaAcknowledged = document.getElementById('hipaaAcknowledged').checked;

    // Convert comma-separated strings to arrays
    if (payload.allergies) {
      payload.allergies = payload.allergies.split(',').map(s => s.trim()).filter(Boolean);
    }
    if (payload.currentMedications) {
      payload.currentMedications = payload.currentMedications.split(',').map(s => s.trim()).filter(Boolean);
    }

    return payload;
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideBanner();

    // Run all client-side validators
    let hasErrors = false;
    form.querySelectorAll('input, select, textarea').forEach(input => {
      const value = input.type === 'checkbox' ? input.checked : input.value;
      const error = validateField(input.name, value);
      if (error) {
        setFieldState(input, error);
        hasErrors = true;
      }
    });

    if (hasErrors) {
      showBanner('error', 'Please correct the highlighted fields before submitting.');
      form.querySelector('.invalid')?.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const response = await fetch('/api/patients/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload())
      });

      const result = await response.json();

      if (response.ok) {
        showBanner('success',
          `Intake submitted successfully. Patient ID: ${result.data.id}. ` +
          `Our team will review your information shortly.`
        );
        form.reset();
        form.querySelectorAll('input, select, textarea').forEach(el => {
          el.classList.remove('valid', 'invalid');
        });
      } else {
        const errorList = result.errors?.join(' • ') || result.message;
        showBanner('error', `Submission failed: ${errorList}`);
      }
    } catch (err) {
      showBanner('error', 'Network error. Please check your connection and try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Intake Form';
    }
  });
})();
