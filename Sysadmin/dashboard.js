/** Dsphere Dashboard: complete sidebar, validation and UI functions. */
'use strict';

const NAVIGATION = [
  {
    page: 'dashboard.html',
    icon: '⌂',
    label: 'Dashboard Overview'
  },
  {
    page: 'user-management.html',
    icon: '♟',
    label: 'User Management',
    children: [
      {
        page: 'user-registration.html',
        label: 'User Registration & Accounts'
      },
      {
        page: 'user-activation.html',
        label: 'User Activation & Access Revocation'
      }
    ]
  },
  {
    page: 'master-data.html',
    icon: '▤',
    label: 'Master Data Management'
  },
  {
    page: 'configuration.html',
    icon: '⚙',
    label: 'Configuration Center',
    children: [
      {
        page: 'system-configuration.html',
        label: 'System Configuration'
      },
      {
        page: 'emission-factor.html',
        label: 'Emission Factor Configuration'
      },
      {
        page: 'exchange-rules.html',
        label: 'Exchange Rules Configuration'
      },
      {
        page: 'sla-escalation.html',
        label: 'SLA & Escalation Configuration'
      }
    ]
  },
  {
    page: 'audit-trail.html',
    icon: '▣',
    label: 'Audit Trail'
  },
  {
    page: 'system-monitoring.html',
    icon: '▥',
    label: 'System Monitoring'
  },
  {
    page: 'reports-analytics.html',
    icon: '▮',
    label: 'Reports & Analytics'
  },
  {
    page: 'notifications.html',
    icon: '△',
    label: 'Notifications'
  }
];

const currentPage = location.pathname.split('/').pop() || 'dashboard.html';

document.addEventListener('DOMContentLoaded', () => {
  buildFunctionalSidebar();
  setupMobileSidebar();
  setupFormValidation();
  setupConfigurationActions();
  setupTableFilters();
  setupGlobalSearch();
  setupPageButtons();
  setupNotifications();
  setupMasterDataManagement();
  setupAccessManagement();
  setupUserRegistration();
  setupConfigurationTables();
});

function buildFunctionalSidebar() {
  const nav = document.querySelector('.side-nav, .sidebar nav');
  if (!nav) return;
  nav.className = 'side-nav';
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = '';

  NAVIGATION.forEach(item => {
    const group = document.createElement('div');
    group.className = 'nav-group';
    const childActive = item.children?.some(child => child.page === currentPage);
    const expanded = item.page === currentPage || childActive;

    const row = document.createElement('div');
    row.className = 'nav-row';
    const link = document.createElement('a');
    link.className = `nav-main${item.page === currentPage ? ' active' : ''}`;
    link.href = item.page;
    link.innerHTML = `<span class="nav-icon" aria-hidden="true">${item.icon}</span><span>${item.label}</span>`;
    if (item.page === currentPage) link.setAttribute('aria-current', 'page');
    row.appendChild(link);

    if (item.children) {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'submenu-toggle';
      toggle.setAttribute('aria-label', `Toggle ${item.label} subtopics`);
      toggle.setAttribute('aria-expanded', String(expanded));
      toggle.textContent = expanded ? '⌃' : '⌄';
      row.appendChild(toggle);

      const submenu = document.createElement('div');
      submenu.className = 'sub-nav';
      submenu.hidden = !expanded;
      item.children.forEach(child => {
        const childLink = document.createElement('a');
        childLink.href = child.page;
        childLink.textContent = child.label;
        if (child.page === currentPage) {
          childLink.className = 'active-sub';
          childLink.setAttribute('aria-current', 'page');
        }
        submenu.appendChild(childLink);
      });
      toggle.addEventListener('click', () => {
        submenu.hidden = !submenu.hidden;
        toggle.setAttribute('aria-expanded', String(!submenu.hidden));
        toggle.textContent = submenu.hidden ? '⌄' : '⌃';
      });
      group.append(row, submenu);
    } else {
      group.appendChild(row);
    }
    nav.appendChild(group);
  });
}

function setupMobileSidebar() {
  const sidebar = document.querySelector('.sidebar');
  const header = document.querySelector('.topbar');
  if (!sidebar || !header) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mobile-menu-button';
  button.textContent = '☰ Menu';
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', () => {
    const open = sidebar.classList.toggle('mobile-open');
    button.setAttribute('aria-expanded', String(open));
  });
  header.prepend(button);
  sidebar.addEventListener('click', event => {
    if (event.target.closest('a') && innerWidth <= 760) sidebar.classList.remove('mobile-open');
  });
}

function setupFormValidation() {
  document.querySelectorAll('form, .card.form').forEach((container, index) => {
    const fields = [...container.querySelectorAll('input, select, textarea')];
    if (!fields.length) return;
    const key = `dsphere:${currentPage}:form-${index}`;

    fields.forEach((field, fieldIndex) => {
      if (!field.name) field.name = slug(field.closest('label')?.childNodes[0]?.textContent || `field-${fieldIndex}`);
      if (field.tagName === 'SELECT' || ['text','email','tel','number','date','password'].includes(field.type)) field.required = true;
      field.addEventListener('blur', () => validateField(field));
      field.addEventListener('input', () => validateField(field));
      field.addEventListener('change', () => validateField(field));
    });

    restoreFields(fields, key);
    const saveButtons = [...container.querySelectorAll('button')].filter(b => /save|submit|register|activate/i.test(b.textContent));
    saveButtons.forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      const valid = fields.map(validateField).every(Boolean);
      if (!valid) {
        notify('Please correct the highlighted fields.', 'error');
        container.querySelector('[aria-invalid="true"]')?.focus();
        return;
      }
      storeFields(fields, key);
      notify('Validated and saved successfully.', 'success');
    }));

    const resetButtons = [...container.querySelectorAll('button')].filter(b => /reset|clear/i.test(b.textContent));
    resetButtons.forEach(button => button.addEventListener('click', event => {
      event.preventDefault();
      localStorage.removeItem(key);
      fields.forEach(field => {
        if (field.type === 'checkbox') field.checked = field.defaultChecked;
        else field.value = field.defaultValue || '';
        clearError(field);
      });
      notify('Form values reset.', 'info');
    }));

    if (container.tagName === 'FORM') container.addEventListener('submit', event => event.preventDefault());
  });
}

function validateField(field) {
  clearError(field);
  const value = field.value.trim();
  let message = '';
  if (field.required && field.type === 'checkbox' && !field.checked) message = 'This option is required.';
  else if (field.required && !value && field.type !== 'checkbox') message = 'This field is required.';
  else if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = 'Enter a valid email address.';
  else if (field.type === 'tel' && value && !/^[+]?[0-9][0-9\s-]{7,14}$/.test(value)) message = 'Enter a valid phone number.';
  else if (field.type === 'password' && value.length < 8) message = 'Password must contain at least 8 characters.';
  else if (field.type === 'number' && value && (!Number.isFinite(Number(value)) || (field.min && Number(value) < Number(field.min)) || (field.max && Number(value) > Number(field.max)))) message = `Enter a value from ${field.min || 0} to ${field.max || 'the allowed maximum'}.`;
  if (!message && /emission/i.test(field.name) && value && (Number(value) < 0 || Number(value) > 100)) message = 'Emission factor must be between 0 and 100.';
  if (!message && /confirm/i.test(field.name)) {
    const password = field.closest('form, .form')?.querySelector('input[type="password"]');
    if (password && password !== field && password.value !== field.value) message = 'Passwords do not match.';
  }
  if (message) {
    field.setAttribute('aria-invalid', 'true');
    const error = document.createElement('small');
    error.className = 'field-error';
    error.textContent = message;
    field.insertAdjacentElement('afterend', error);
    return false;
  }
  return true;
}

function clearError(field) {
  field.removeAttribute('aria-invalid');
  if (field.nextElementSibling?.classList.contains('field-error')) field.nextElementSibling.remove();
}

function setupConfigurationActions() {
  const headerSave = [...document.querySelectorAll('.page-head button')].find(b => /save/i.test(b.textContent));
  if (headerSave) headerSave.addEventListener('click', () => {
    const firstSave = [...document.querySelectorAll('.form button')].find(b => /save/i.test(b.textContent));
    if (firstSave) firstSave.click(); else notify('No configuration form is available on this page.', 'info');
  });
}

function setupTableFilters() {
  document.querySelectorAll('.filters').forEach(filters => {
    const card = filters.closest('.card');
    const table = card?.querySelector('table');
    if (!table) return;
    const controls = [...filters.querySelectorAll('input, select')];
    const apply = () => {
      const terms = controls.map(c => c.value.trim().toLowerCase()).filter(v => v && !v.startsWith('all '));
      table.querySelectorAll('tbody tr').forEach(row => row.hidden = !terms.every(term => row.textContent.toLowerCase().includes(term)));
    };
    controls.forEach(control => control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', apply));
    filters.querySelector('button')?.addEventListener('click', event => { event.preventDefault(); apply(); });
  });
}

function setupGlobalSearch() {
  const search = document.querySelector('.global-search');
  if (!search) return;
  search.addEventListener('input', () => {
    const term = search.value.trim().toLowerCase();
    document.querySelectorAll('main .card, main .stat-card, main .master-card').forEach(card => {
      card.hidden = Boolean(term) && !card.textContent.toLowerCase().includes(term);
    });
  });
}

function setupPageButtons() {
  document.querySelectorAll('button').forEach(button => {
    const label = button.textContent.trim().toLowerCase();
    if (label.includes('refresh')) button.addEventListener('click', () => notify('System status refreshed.', 'success'));
    if (label.includes('export') || label.includes('download')) button.addEventListener('click', exportTable);
    if (label.includes('generate report')) button.addEventListener('click', () => notify('Report generated in this browser prototype.', 'success'));
    if (label.includes('add user') && currentPage !== 'user-registration.html') button.addEventListener('click', () => location.href = 'user-registration.html');
    if (label.includes('manage users')) button.addEventListener('click', () => location.href = 'user-management.html');
  });
}

function setupNotifications() {
  document.querySelector('.bell')?.addEventListener('click', () => notify('You have 3 notifications.', 'info'));
}

function exportTable() {
  const table = document.querySelector('table');
  if (!table) return notify('No table is available to export.', 'error');
  const csv = [...table.querySelectorAll('tr:not([hidden])')].map(row => [...row.cells].map(cell => `"${cell.textContent.trim().replaceAll('"','""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: currentPage.replace('.html','') + '-export.csv' });
  link.click(); URL.revokeObjectURL(url); notify('Table exported as CSV.', 'success');
}

function storeFields(fields, key) {
  const data = {};
  fields.forEach(field => data[field.name] = field.type === 'checkbox' ? field.checked : field.value);
  localStorage.setItem(key, JSON.stringify(data));
}
function restoreFields(fields, key) {
  try {
    const data = JSON.parse(localStorage.getItem(key)); if (!data) return;
    fields.forEach(field => { if (!(field.name in data)) return; field.type === 'checkbox' ? field.checked = data[field.name] : field.value = data[field.name]; });
  } catch { localStorage.removeItem(key); }
}
function notify(message, type='success') {
  document.querySelector('.dashboard-toast')?.remove();
  const toast = document.createElement('div'); toast.className = `dashboard-toast ${type}`; toast.textContent = message; toast.setAttribute('role','status');
  document.body.appendChild(toast); setTimeout(() => toast.remove(), 2800);
}


/** Master Data Management: validated modal form and live record counts. */
function setupMasterDataManagement() {
  if (currentPage !== 'master-data.html') return;
  const addButton = [...document.querySelectorAll('button')].find(button => /add master record/i.test(button.textContent));
  if (!addButton) return;

  const storageKey = 'dsphere:master-records';
  let records = readJSON(storageKey, []);
  const masterTypes = {
    Product: { cardName: 'Product Master', prefix: 'PRD' },
    Distributor: { cardName: 'Distributor Master', prefix: 'DST' },
    Warehouse: { cardName: 'Warehouse Master', prefix: 'WH' },
    Location: { cardName: 'Location Master', prefix: 'LOC' }
  };

  const modal = document.createElement('div');
  modal.className = 'dashboard-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="master-modal-title">
      <div class="modal-head"><h2 id="master-modal-title">Add Master Record</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>
      <form id="masterRecordForm" novalidate>
        <label>Master Type<select name="masterType" required><option value="">Select master type</option><option>Product</option><option>Distributor</option><option>Warehouse</option><option>Location</option></select></label>
        <label>Record Code<input name="recordCode" type="text" minlength="3" maxlength="20" placeholder="Example: PRD-1001" required></label>
        <label>Record Name<input name="recordName" type="text" minlength="3" maxlength="60" placeholder="Enter record name" required></label>
        <label>Description<textarea name="description" maxlength="200" rows="3" placeholder="Enter a short description"></textarea></label>
        <label>Status<select name="status" required><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label>
        <div class="modal-actions"><button class="primary-button" type="submit">Save Record</button><button class="outline modal-cancel" type="button">Cancel</button></div>
      </form>
    </div>`;
  document.body.appendChild(modal);

  const form = modal.querySelector('form');
  const close = () => { modal.hidden = true; form.reset(); form.querySelectorAll('.field-error').forEach(error => error.remove()); };
  const open = () => { modal.hidden = false; form.querySelector('select').focus(); };
  addButton.addEventListener('click', open);
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.modal-cancel').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });

  form.querySelectorAll('input, select, textarea').forEach(field => {
    field.addEventListener('blur', () => validateMasterField(field, records));
    field.addEventListener('input', () => validateMasterField(field, records));
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = [...form.querySelectorAll('input, select, textarea')];
    const valid = fields.map(field => validateMasterField(field, records)).every(Boolean);
    if (!valid) return notify('Please correct the master record fields.', 'error');

    const data = Object.fromEntries(new FormData(form).entries());
    data.id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now());
    data.createdAt = new Date().toISOString();
    records.push(data);
    localStorage.setItem(storageKey, JSON.stringify(records));
    updateMasterCount(data.masterType, 1, masterTypes);
    renderRecentMasterRecords(records);
    close();
    notify(`${data.recordName} was added successfully.`, 'success');
  });

  renderRecentMasterRecords(records);
}

function validateMasterField(field, records) {
  clearError(field);
  const value = field.value.trim();
  let message = '';
  if (field.required && !value) message = 'This field is required.';
  else if (field.name === 'recordCode' && value && !/^[A-Za-z0-9][A-Za-z0-9_-]{2,19}$/.test(value)) message = 'Use 3 to 20 letters, numbers, hyphens or underscores.';
  else if (field.name === 'recordCode' && records.some(record => record.recordCode.toLowerCase() === value.toLowerCase())) message = 'This record code already exists.';
  else if (field.name === 'recordName' && value.length < 3) message = 'Record name must contain at least 3 characters.';
  if (!message) return true;
  field.setAttribute('aria-invalid', 'true');
  const error = document.createElement('small'); error.className = 'field-error'; error.textContent = message;
  field.insertAdjacentElement('afterend', error);
  return false;
}

function updateMasterCount(type, change, masterTypes) {
  const cardName = masterTypes[type]?.cardName;
  if (!cardName) return;
  const card = [...document.querySelectorAll('.feature.card')].find(item => item.querySelector('h2')?.textContent.trim() === cardName);
  const count = card?.querySelector('strong');
  if (!count) return;
  const current = Number(count.textContent.replace(/[^0-9]/g, '')) || 0;
  count.textContent = `${(current + change).toLocaleString()} Records`;
}

function renderRecentMasterRecords(records) {
  let section = document.querySelector('.recent-master-records');
  if (!section) {
    section = document.createElement('section'); section.className = 'card recent-master-records';
    document.querySelector('main')?.appendChild(section);
  }
  const latest = records.slice(-8).reverse();
  section.innerHTML = `<h2>Recently Added Master Records</h2>${latest.length ? `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Name</th><th>Type</th><th>Status</th><th>Action</th></tr></thead><tbody>${latest.map(record => `<tr data-record-id="${escapeHTML(record.id)}"><td>${escapeHTML(record.recordCode)}</td><td>${escapeHTML(record.recordName)}</td><td>${escapeHTML(record.masterType)}</td><td><mark class="${record.status === 'Active' ? '' : 'warn'}">${escapeHTML(record.status)}</mark></td><td><button class="delete-master outline" type="button">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p>No records have been added in this browser.</p>'}`;
  section.querySelectorAll('.delete-master').forEach(button => button.addEventListener('click', () => {
    const row = button.closest('tr'); const id = row.dataset.recordId;
    const all = readJSON('dsphere:master-records', []); const record = all.find(item => item.id === id);
    const updated = all.filter(item => item.id !== id); localStorage.setItem('dsphere:master-records', JSON.stringify(updated));
    row.remove(); if (record) notify(`${record.recordName} was deleted.`, 'info');
  }));
}

/** User Activation: replace text actions with working buttons and persist status. */
function setupAccessManagement() {
  if (currentPage !== 'user-activation.html') return;
  const table = document.querySelector('table');
  if (!table) return;

  const statusStorageKey = 'dsphere:user-access-status';
  const userStorageKey = 'dsphere:registered-users';
  const savedStatuses = readJSON(statusStorageKey, {});
  const registeredUsers = readJSON(userStorageKey, []);

  // Add users created on User Registration & Accounts to this table.
  registeredUsers.forEach(user => {
    const email = user.email.trim().toLowerCase();
    const alreadyVisible = [...table.querySelectorAll('tbody tr')]
      .some(row => row.cells[2]?.textContent.trim().toLowerCase() === email);
    if (!alreadyVisible) appendAccessRow(table, { ...user, status: savedStatuses[email] || user.status || 'Pending' });
  });

  // Apply the latest saved status to static and newly created users.
  table.querySelectorAll('tbody tr').forEach(row => {
    const email = row.cells[2]?.textContent.trim().toLowerCase();
    const statusCell = row.cells[4];
    const actionCell = row.cells[5];
    if (!email || !statusCell || !actionCell) return;
    const currentStatus = savedStatuses[email] || statusCell.textContent.trim() || 'Pending';
    applyAccessStatus(row, currentStatus);
  });

  table.addEventListener('click', event => {
    const button = event.target.closest('.access-action');
    if (!button) return;

    const row = button.closest('tr');
    const email = row.cells[2].textContent.trim().toLowerCase();
    const currentStatus = row.cells[4].textContent.trim();
    const nextStatus = currentStatus === 'Active' ? 'Suspended' : 'Active';

    applyAccessStatus(row, nextStatus);

    const statuses = readJSON(statusStorageKey, {});
    statuses[email] = nextStatus;
    localStorage.setItem(statusStorageKey, JSON.stringify(statuses));

    // Update the same user record used by User Registration & Accounts.
    const users = readJSON(userStorageKey, []);
    const user = users.find(item => item.email.trim().toLowerCase() === email);
    if (user) {
      user.status = nextStatus;
      user.updatedAt = new Date().toISOString();
      localStorage.setItem(userStorageKey, JSON.stringify(users));
    }

    notify(
      nextStatus === 'Active' ? `Access activated for ${email}.` : `Access revoked for ${email}.`,
      nextStatus === 'Active' ? 'success' : 'info'
    );
  });

  const manageButton = [...document.querySelectorAll('.page-head button')]
    .find(button => /manage access/i.test(button.textContent));
  manageButton?.addEventListener('click', () => table.scrollIntoView({ behavior: 'smooth', block: 'center' }));
}

function appendAccessRow(table, user) {
  const body = table.tBodies[0];
  const row = body.insertRow();
  row.dataset.userId = user.id || '';
  row.innerHTML = `<td>${body.rows.length}</td><td>${escapeHTML(user.fullName)}</td><td>${escapeHTML(user.email)}</td><td>${escapeHTML(user.role)}</td><td></td><td></td>`;
  applyAccessStatus(row, user.status || 'Pending');
}

function applyAccessStatus(row, status) {
  const statusCell = row.cells[4]; const actionCell = row.cells[5];
  statusCell.innerHTML = `<mark class="${status === 'Active' ? '' : 'warn'}">${status}</mark>`;
  actionCell.innerHTML = `<button type="button" class="access-action ${status === 'Active' ? 'danger-button' : 'success-button'}">${status === 'Active' ? 'Revoke Access' : 'Activate'}</button>`;
}

function readJSON(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } }
function escapeHTML(value) { return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char])); }



/** User Registration: validated modal, duplicate email check and live table update. */
function setupUserRegistration() {
  if (currentPage !== 'user-registration.html') return;
  const addButton = [...document.querySelectorAll('.page-head button')].find(button => /add user/i.test(button.textContent));
  const table = document.querySelector('table');
  if (!addButton || !table) return;

  const storageKey = 'dsphere:registered-users';
  let users = readJSON(storageKey, []);
  const modal = document.createElement('div');
  modal.className = 'dashboard-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="modal-panel" role="dialog" aria-modal="true" aria-labelledby="add-user-title">
      <div class="modal-head"><h2 id="add-user-title">Add User</h2><button type="button" class="modal-close" aria-label="Close">×</button></div>
      <form id="addUserForm" novalidate>
        <label>Full Name<input name="fullName" type="text" minlength="3" maxlength="50" placeholder="Enter full name" required></label>
        <label>Email Address<input name="email" type="email" maxlength="100" placeholder="name@company.com" required></label>
        <label>Role<select name="role" required><option value="">Select role</option><option>Administrator</option><option>Manufacturer</option><option>Distributor</option><option>Finance Manager</option><option>Sales Manager</option><option>Recovery & Resolution Manager</option></select></label>
        <label>Department<select name="department" required><option value="">Select department</option><option>IT</option><option>Sales</option><option>Finance</option><option>Operations</option><option>Manufacturing</option><option>Recovery</option></select></label>
        <label>Status<select name="status" required><option>Active</option><option>Pending</option><option>Suspended</option></select></label>
        <label>Password<input name="password" type="password" minlength="8" placeholder="Minimum 8 characters" required></label>
        <label>Confirm Password<input name="confirmPassword" type="password" minlength="8" placeholder="Re-enter password" required></label>
        <div class="modal-actions"><button type="submit">Create User</button><button type="button" class="outline modal-cancel">Cancel</button></div>
      </form>
    </div>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form');
  const close = () => { modal.hidden = true; form.reset(); form.querySelectorAll('.field-error').forEach(item => item.remove()); form.querySelectorAll('[aria-invalid]').forEach(item => item.removeAttribute('aria-invalid')); };
  addButton.addEventListener('click', event => { event.preventDefault(); modal.hidden = false; form.querySelector('input').focus(); });
  modal.querySelector('.modal-close').addEventListener('click', close);
  modal.querySelector('.modal-cancel').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });

  form.querySelectorAll('input, select').forEach(field => {
    field.addEventListener('input', () => validateUserField(field, form, users, table));
    field.addEventListener('change', () => validateUserField(field, form, users, table));
    field.addEventListener('blur', () => validateUserField(field, form, users, table));
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    const fields = [...form.querySelectorAll('input, select')];
    if (!fields.map(field => validateUserField(field, form, users, table)).every(Boolean)) {
      notify('Please correct the user details.', 'error');
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }
    const values = Object.fromEntries(new FormData(form).entries());
    const newUser = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), fullName: values.fullName.trim(), email: values.email.trim().toLowerCase(), role: values.role, department: values.department, status: values.status };
    users.push(newUser); localStorage.setItem(storageKey, JSON.stringify(users));
    const accessStatuses = readJSON('dsphere:user-access-status', {});
    accessStatuses[newUser.email] = newUser.status;
    localStorage.setItem('dsphere:user-access-status', JSON.stringify(accessStatuses));
    appendUserRow(table, newUser); close(); notify(`${newUser.fullName} was created successfully.`, 'success');
  });

  const accessStatuses = readJSON('dsphere:user-access-status', {});
  users.forEach(user => {
    const email = user.email.toLowerCase();
    user.status = accessStatuses[email] || user.status;
    const existingRow = [...table.querySelectorAll('tbody tr')].find(row => row.cells[2]?.textContent.trim().toLowerCase() === email);
    if (!existingRow) appendUserRow(table, user);
    else existingRow.cells[5].innerHTML = `<mark class="${user.status === 'Active' ? '' : 'warn'}">${escapeHTML(user.status)}</mark>`;
  });
}

function validateUserField(field, form, users, table) {
  clearError(field); const value = field.value.trim(); let message = '';
  if (field.required && !value) message = 'This field is required.';
  else if (field.name === 'fullName' && !/^[A-Za-z][A-Za-z .'-]{2,49}$/.test(value)) message = 'Enter 3 to 50 letters for the name.';
  else if (field.name === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) message = 'Enter a valid email address.';
  else if (field.name === 'email' && ([...table.querySelectorAll('tbody tr')].some(row => row.cells[2]?.textContent.trim().toLowerCase() === value.toLowerCase()) || users.some(user => user.email.toLowerCase() === value.toLowerCase()))) message = 'A user with this email already exists.';
  else if (field.name === 'password' && value.length < 8) message = 'Password must contain at least 8 characters.';
  else if (field.name === 'confirmPassword' && value !== form.elements.password.value) message = 'Passwords do not match.';
  if (!message) return true;
  field.setAttribute('aria-invalid', 'true'); const error = document.createElement('small'); error.className = 'field-error'; error.textContent = message; field.insertAdjacentElement('afterend', error); return false;
}

function appendUserRow(table, user) {
  const body = table.tBodies[0]; const row = body.insertRow(); const number = body.rows.length;
  row.innerHTML = `<td>${number}</td><td>${escapeHTML(user.fullName)}</td><td>${escapeHTML(user.email)}</td><td>${escapeHTML(user.role)}</td><td>${escapeHTML(user.department)}</td><td><mark class="${user.status === 'Active' ? '' : 'warn'}">${escapeHTML(user.status)}</mark></td>`;
}

/** Configuration pages: record tables for System, Emission and Exchange; single updatable row for SLA. */
function setupConfigurationTables() {
  const definitions = {
    'system-configuration.html': { mode: 'multiple', key: 'dsphere:system-configurations', title: 'Saved System Configurations', columns: ['Planning Horizon','Distance Unit','Allocation Method','Automatic Replenishment','Route Optimization'] },
    'emission-factor.html': { mode: 'multiple', key: 'dsphere:emission-configurations', title: 'Saved Emission Factor Configurations', columns: ['Transport Mode','Vehicle Type','Fuel Type','Transport Factor','Warehouse Factor'] },
    'exchange-rules.html': { mode: 'multiple', key: 'dsphere:exchange-configurations', title: 'Saved Exchange Rules', columns: ['Return Window','Exchange Condition','Auto Approval','Quality Check'] },
    'sla-escalation.html': { mode: 'single', key: 'dsphere:sla-configuration', title: 'Current SLA & Escalation Configuration', columns: ['Order Processing SLA','Transit SLA','Delivery SLA','Escalation Level'] }
  };
  const definition = definitions[currentPage]; if (!definition) return;
  const configurationForm = document.querySelector('.card.form'); if (!configurationForm) return;
  const controls = [...configurationForm.querySelectorAll('input, select, textarea')];
  const labels = controls.map(control => control.closest('label')?.childNodes[0]?.textContent.trim() || control.name || 'Setting');
  controls.forEach((control, index) => { if (!control.name) control.name = slug(labels[index]); if (control.type === 'number') { control.min = '0.001'; control.required = true; } if (control.tagName === 'SELECT') control.required = true; });

  let section = document.createElement('section'); section.className = 'card saved-configuration-table'; configurationForm.insertAdjacentElement('afterend', section);
  const saveButton = [...configurationForm.querySelectorAll('button')].find(button => /save/i.test(button.textContent));
  const resetButton = [...configurationForm.querySelectorAll('button')].find(button => /reset/i.test(button.textContent));
  let editingId = null;

  const getRecords = () => definition.mode === 'single' ? (readJSON(definition.key, null) ? [readJSON(definition.key, null)] : []) : readJSON(definition.key, []);
  const render = () => {
    const records = getRecords();
    section.innerHTML = `<div class="card-title"><h2>${definition.title}</h2><span>${definition.mode === 'single' ? 'One active record' : records.length + ' saved record(s)'}</span></div>${records.length ? `<div class="table-wrap"><table><thead><tr>${definition.columns.map(column => `<th>${column}</th>`).join('')}<th>Actions</th></tr></thead><tbody>${records.map(record => `<tr data-config-id="${escapeHTML(record.id)}">${record.values.map(value => `<td>${escapeHTML(value)}</td>`).join('')}<td><button type="button" class="edit-config">Edit</button>${definition.mode === 'multiple' ? ' <button type="button" class="delete-config danger-button">Delete</button>' : ''}</td></tr>`).join('')}</tbody></table></div>` : '<p>No configuration has been saved yet.</p>'}`;
    section.querySelectorAll('.edit-config').forEach(button => button.addEventListener('click', () => {
      const id = button.closest('tr').dataset.configId; const record = getRecords().find(item => item.id === id); if (!record) return;
      controls.forEach((control, index) => { if (control.type === 'checkbox') control.checked = record.raw[index] === true; else control.value = record.raw[index]; });
      editingId = id; if (saveButton) saveButton.textContent = definition.mode === 'single' ? 'Update Settings' : 'Update Configuration'; configurationForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }));
    section.querySelectorAll('.delete-config').forEach(button => button.addEventListener('click', () => {
      const id = button.closest('tr').dataset.configId; const records = getRecords().filter(item => item.id !== id); localStorage.setItem(definition.key, JSON.stringify(records)); render(); notify('Configuration deleted.', 'info');
    }));
  };

  saveButton?.addEventListener('click', event => {
    event.preventDefault(); event.stopImmediatePropagation();
    const valid = controls.map(validateConfigurationField).every(Boolean); if (!valid) return notify('Please correct the configuration values.', 'error');
    const raw = controls.map(control => control.type === 'checkbox' ? control.checked : control.value.trim());
    const values = controls.map((control, index) => control.type === 'checkbox' ? (raw[index] ? 'Enabled' : 'Disabled') : raw[index]);
    if (definition.mode === 'single') {
      const previous = readJSON(definition.key, null); const record = { id: previous?.id || 'SLA-001', raw, values, updatedAt: new Date().toISOString() }; localStorage.setItem(definition.key, JSON.stringify(record)); editingId = record.id;
    } else {
      const records = getRecords();
      const duplicate = records.some(record => record.id !== editingId && JSON.stringify(record.raw) === JSON.stringify(raw)); if (duplicate) return notify('The same configuration already exists.', 'error');
      if (editingId) { const record = records.find(item => item.id === editingId); if (record) { record.raw = raw; record.values = values; record.updatedAt = new Date().toISOString(); } }
      else records.push({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), raw, values, updatedAt: new Date().toISOString() });
      localStorage.setItem(definition.key, JSON.stringify(records));
    }
    editingId = null; saveButton.textContent = currentPage === 'system-configuration.html' ? 'Save Settings' : currentPage === 'emission-factor.html' ? 'Save Configuration' : currentPage === 'exchange-rules.html' ? 'Save Exchange Rule' : 'Update Settings'; render(); notify(definition.mode === 'single' ? 'The SLA configuration was updated.' : 'Configuration saved successfully.', 'success');
  }, true);

  resetButton?.addEventListener('click', () => { editingId = null; if (saveButton) saveButton.textContent = currentPage === 'system-configuration.html' ? 'Save Settings' : 'Save Configuration'; });
  render();
}

function validateConfigurationField(field) {
  clearError(field); const value = field.value.trim(); let message = '';
  if (field.required && !value) message = 'This setting is required.';
  else if (field.type === 'number' && (!Number.isFinite(Number(value)) || Number(value) <= 0)) message = 'Enter a number greater than zero.';
  if (!message) return true;
  field.setAttribute('aria-invalid','true'); const error=document.createElement('small'); error.className='field-error'; error.textContent=message; field.insertAdjacentElement('afterend',error); return false;
}

function slug(text) { return text.trim().toLowerCase().replace(/&/g,'and').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'') || 'field'; }
