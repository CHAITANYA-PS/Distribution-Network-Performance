/* Dsphere client-side form validation */
(() => {
  'use strict';

  const RULES = {
    name: {
      required: true,
      minLength: 2,
      maxLength: 80,
      pattern: /^[A-Za-z0-9][A-Za-z0-9 .&'()-]*$/,
      message: 'Enter a valid name using letters, numbers, spaces, and common punctuation.'
    },
    region: { required: true },
    category: { required: true },
    status: { required: true },
    type: { required: true },
    priority: { required: true },
    period: {
      required: true,
      minLength: 3,
      maxLength: 40,
      message: 'Enter a valid period, for example Oct 2026 or Q4 2026.'
    },
    value: {
      required: true,
      min: 0,
      max: 9999999999,
      message: 'Target value must be a positive number.'
    },
    health: {
      required: true,
      min: 0,
      max: 100,
      message: 'Health score must be between 0 and 100.'
    },
    remarks: {
      required: true,
      minLength: 5,
      maxLength: 500,
      message: 'Remarks must contain between 5 and 500 characters.'
    },
    text: {
      required: true,
      minLength: 10,
      maxLength: 500,
      message: 'Recommendation must contain between 10 and 500 characters.'
    },
    distributor: { required: true },
    issue: {
      required: true,
      minLength: 3,
      maxLength: 120,
      message: 'Issue must contain between 3 and 120 characters.'
    },
    amount: {
      required: true,
      min: 1,
      max: 999999999,
      message: 'Amount must be greater than zero.'
    }
  };

  const trimValue = field => {
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
      field.value = field.value.trim().replace(/\s{2,}/g, ' ');
    }
  };

  const errorId = field => `error-${field.name || field.id || 'field'}`;

  const clearError = field => {
    field.classList.remove('field-invalid');
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    const error = document.getElementById(errorId(field));
    if (error) error.remove();
  };

  const showError = (field, message) => {
    clearError(field);
    field.classList.add('field-invalid');
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', errorId(field));
    const error = document.createElement('small');
    error.id = errorId(field);
    error.className = 'field-error';
    error.textContent = message;
    field.insertAdjacentElement('afterend', error);
  };

  const validateField = field => {
    if (!field.name || field.disabled || ['submit', 'button', 'reset'].includes(field.type)) return true;
    trimValue(field);
    clearError(field);

    const rule = RULES[field.name] || {};
    const value = field.value.trim();
    const required = rule.required || field.required;

    if (required && !value) {
      showError(field, 'This field is required.');
      return false;
    }
    if (!value) return true;

    if (rule.minLength && value.length < rule.minLength) {
      showError(field, rule.message || `Enter at least ${rule.minLength} characters.`);
      return false;
    }
    if (rule.maxLength && value.length > rule.maxLength) {
      showError(field, rule.message || `Use no more than ${rule.maxLength} characters.`);
      return false;
    }
    if (rule.pattern && !rule.pattern.test(value)) {
      showError(field, rule.message || 'Enter a valid value.');
      return false;
    }
    if (field.type === 'number') {
      const number = Number(value);
      if (!Number.isFinite(number)) {
        showError(field, 'Enter a valid number.');
        return false;
      }
      if (rule.min !== undefined && number < rule.min) {
        showError(field, rule.message || `Value must be at least ${rule.min}.`);
        return false;
      }
      if (rule.max !== undefined && number > rule.max) {
        showError(field, rule.message || `Value must not exceed ${rule.max}.`);
        return false;
      }
    }
    return true;
  };

  const validateForm = form => {
    const fields = [...form.querySelectorAll('input, select, textarea')];
    const results = fields.map(validateField);
    const firstInvalid = fields.find(field => field.classList.contains('field-invalid'));
    if (firstInvalid) firstInvalid.focus();
    return results.every(Boolean);
  };

  document.addEventListener('submit', event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    if (!validateForm(form)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const toast = document.getElementById('toast');
      if (toast) {
        toast.textContent = 'Please correct the highlighted fields.';
        toast.classList.add('show');
        window.setTimeout(() => toast.classList.remove('show'), 2500);
      }
    }
  }, true);

  document.addEventListener('input', event => {
    const field = event.target;
    if (field.matches('input, textarea') && field.classList.contains('field-invalid')) {
      validateField(field);
    }
  });

  document.addEventListener('change', event => {
    const field = event.target;
    if (field.matches('select') && field.classList.contains('field-invalid')) {
      validateField(field);
    }
  });

  window.DsphereValidation = { validateField, validateForm };
})();
