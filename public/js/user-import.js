// ============================================================================
// TenderFlow Pro — Batch 2: Bulk User Import
// ============================================================================
// CSV upload → preview table → validate → batch create profiles.
// CSV format: full_name, email, role, department
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, isSuperAdmin } from './auth.js';

// ── Parse CSV ───────────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return { headers: [], rows: [], error: 'CSV must have a header row and at least one data row.' };

  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[^a-z_]/g, ''));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim().replace(/^["']|["']$/g, ''));
    if (values.length !== headers.length) continue;
    const row = {};
    headers.forEach((h, idx) => row[h] = values[idx]);
    rows.push(row);
  }

  // Validate required columns
  const required = ['full_name', 'email'];
  const missing = required.filter(r => !headers.includes(r));
  if (missing.length > 0) {
    return { headers, rows, error: `Missing required columns: ${missing.join(', ')}. Required: full_name, email. Optional: role, department` };
  }

  return { headers, rows, error: null };
}

// ── Validate Rows ───────────────────────────────────────────────────────────

function validateRows(rows) {
  const validRoles = ['dept_user', 'bid_manager', 'it_admin'];
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const seen = new Set();

  return rows.map((row, idx) => {
    const errors = [];

    if (!row.full_name || row.full_name.length < 2) errors.push('Name too short');
    if (!row.email || !emailRegex.test(row.email)) errors.push('Invalid email');
    if (row.role && !validRoles.includes(row.role)) errors.push(`Invalid role: ${row.role}`);
    if (seen.has(row.email?.toLowerCase())) errors.push('Duplicate email');

    seen.add(row.email?.toLowerCase());

    return {
      ...row,
      role: row.role || 'dept_user',
      department: row.department || '',
      _row: idx + 2,
      _errors: errors,
      _valid: errors.length === 0,
    };
  });
}

// ── Show Import Modal ───────────────────────────────────────────────────────

export function showBulkImportModal(companyId) {
  const profile = getProfile();
  const targetCompanyId = companyId || profile.company_id;

  const modal = document.createElement('div');
  modal.id = 'bulk-import-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-3xl shadow-2xl max-h-[85vh] overflow-y-auto">
      <h3 class="text-lg font-semibold text-white mb-2">Bulk Import Users</h3>
      <p class="text-xs text-slate-400 mb-4">Upload a CSV file with columns: <span class="font-mono text-brand-400">full_name, email</span> (required), <span class="font-mono text-slate-300">role, department</span> (optional)</p>

      <div id="bui-error" class="hidden mb-3 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
      <div id="bui-success" class="hidden mb-3 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm"></div>

      <!-- Upload Area -->
      <div id="bui-upload-area" class="border-2 border-dashed border-slate-600/50 rounded-lg p-8 text-center hover:border-brand-500/40 transition cursor-pointer mb-4">
        <p class="text-sm text-slate-400">📄 Drag & drop CSV or click to upload</p>
        <input id="bui-file" type="file" accept=".csv" class="hidden" />
      </div>

      <!-- Download Template -->
      <div class="mb-4">
        <button id="bui-template" class="text-xs text-brand-400 hover:text-brand-300">⬇ Download CSV template</button>
      </div>

      <!-- Preview Table -->
      <div id="bui-preview" class="hidden mb-4"></div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button id="bui-import" class="hidden px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Import Users</button>
        <button id="bui-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Close</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Close handlers
  modal.querySelector('#bui-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Upload area click
  const uploadArea = modal.querySelector('#bui-upload-area');
  const fileInput = modal.querySelector('#bui-file');
  uploadArea.addEventListener('click', () => fileInput.click());
  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('border-brand-500/60', 'bg-brand-500/5');
  });
  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('border-brand-500/60', 'bg-brand-500/5');
  });
  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('border-brand-500/60', 'bg-brand-500/5');
    if (e.dataTransfer.files[0]) handleCSVFile(e.dataTransfer.files[0], modal, targetCompanyId);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleCSVFile(fileInput.files[0], modal, targetCompanyId);
  });

  // Download template
  modal.querySelector('#bui-template').addEventListener('click', () => {
    const csv = 'full_name,email,role,department\nJane Doe,jane@company.com,dept_user,Engineering\nJohn Smith,john@company.com,bid_manager,Management\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'user_import_template.csv';
    a.click(); URL.revokeObjectURL(url);
  });
}

function handleCSVFile(file, modal, companyId) {
  const errEl = modal.querySelector('#bui-error');
  const previewEl = modal.querySelector('#bui-preview');
  const importBtn = modal.querySelector('#bui-import');
  errEl.classList.add('hidden');

  const reader = new FileReader();
  reader.onload = (e) => {
    const { headers, rows, error } = parseCSV(e.target.result);
    if (error) {
      errEl.textContent = error;
      errEl.classList.remove('hidden');
      return;
    }

    const validated = validateRows(rows);
    const validCount = validated.filter(r => r._valid).length;
    const invalidCount = validated.length - validCount;

    // Render preview table
    previewEl.innerHTML = `
      <p class="text-xs text-slate-400 mb-2">${validated.length} rows found — <span class="text-emerald-400">${validCount} valid</span>${invalidCount ? `, <span class="text-red-400">${invalidCount} errors</span>` : ''}</p>
      <div class="max-h-60 overflow-y-auto border border-slate-700/40 rounded-lg">
        <table class="w-full text-xs">
          <thead class="sticky top-0 bg-surface-800"><tr class="border-b border-slate-700/40">
            <th class="px-3 py-2 text-left text-slate-400">Row</th>
            <th class="px-3 py-2 text-left text-slate-400">Name</th>
            <th class="px-3 py-2 text-left text-slate-400">Email</th>
            <th class="px-3 py-2 text-left text-slate-400">Role</th>
            <th class="px-3 py-2 text-left text-slate-400">Department</th>
            <th class="px-3 py-2 text-left text-slate-400">Status</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/20">
            ${validated.map(r => `
              <tr class="${r._valid ? '' : 'bg-red-500/5'}">
                <td class="px-3 py-1.5 text-slate-500">${r._row}</td>
                <td class="px-3 py-1.5 text-white">${r.full_name || '—'}</td>
                <td class="px-3 py-1.5 text-slate-300 font-mono">${r.email || '—'}</td>
                <td class="px-3 py-1.5 text-slate-400">${r.role}</td>
                <td class="px-3 py-1.5 text-slate-400">${r.department || '—'}</td>
                <td class="px-3 py-1.5">${r._valid ? '<span class="text-emerald-400">✓</span>' : `<span class="text-red-400">${r._errors.join(', ')}</span>`}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
    previewEl.classList.remove('hidden');

    if (validCount > 0) {
      importBtn.classList.remove('hidden');
      importBtn.textContent = `Import ${validCount} Users`;

      // Remove old listener
      const newBtn = importBtn.cloneNode(true);
      importBtn.parentNode.replaceChild(newBtn, importBtn);

      newBtn.addEventListener('click', () => executeImport(validated.filter(r => r._valid), companyId, modal));
    }
  };
  reader.readAsText(file);
}

async function executeImport(users, companyId, modal) {
  const successEl = modal.querySelector('#bui-success');
  const errEl = modal.querySelector('#bui-error');
  const importBtn = modal.querySelector('#bui-import') || modal.querySelectorAll('button')[0];
  errEl.classList.add('hidden');

  if (importBtn) {
    importBtn.disabled = true;
    importBtn.textContent = 'Importing...';
  }

  let created = 0;
  let failed = 0;
  const errors = [];

  // Get company slug for reference
  const { data: company } = await supabase.from('companies')
    .select('slug').eq('id', companyId).single();

  for (const user of users) {
    try {
      // Note: We insert into profiles directly — the user won't have auth credentials
      // They'll need to sign up themselves using the company code
      // This pre-creates their profile so role/dept are set when they register
      const { error } = await supabase.from('profiles').insert({
        id: crypto.randomUUID(), // Temporary ID — gets replaced when they actually sign up
        company_id: companyId,
        full_name: user.full_name,
        email: user.email.toLowerCase(),
        role: user.role,
        department: user.department || null,
        is_active: true,
      });

      if (error) {
        if (error.message.includes('duplicate') || error.message.includes('unique')) {
          errors.push(`${user.email}: already exists`);
        } else {
          errors.push(`${user.email}: ${error.message}`);
        }
        failed++;
      } else {
        created++;
      }
    } catch (e) {
      errors.push(`${user.email}: ${e.message}`);
      failed++;
    }
  }

  if (successEl) {
    successEl.innerHTML = `
      ✓ Import complete: <strong>${created}</strong> created, <strong>${failed}</strong> failed.
      ${company?.slug ? `<br/><span class="text-xs text-slate-400">Users should sign up at your site with company code: <span class="font-mono text-brand-400">${company.slug}</span></span>` : ''}
      ${errors.length > 0 ? `<br/><details class="mt-2"><summary class="text-xs text-amber-400 cursor-pointer">Show ${errors.length} errors</summary><pre class="text-xs text-red-400 mt-1 whitespace-pre-wrap">${errors.join('\n')}</pre></details>` : ''}
    `;
    successEl.classList.remove('hidden');
  }

  if (importBtn) {
    importBtn.disabled = false;
    importBtn.textContent = 'Done';
  }

  window.TF?.toast?.(`Imported ${created} users`, created > 0 ? 'success' : 'warning');
}

// Global handler
window._showBulkImport = (companyId) => showBulkImportModal(companyId);


