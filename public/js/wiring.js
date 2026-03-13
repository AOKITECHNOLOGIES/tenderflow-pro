// ============================================================================
// TenderFlow Pro — Wiring Patch (wiring.js)
// ============================================================================
// This module connects all the loose ends between existing modules:
//  - Hooks app-shell mount + renderView into the index.html bootstrap
//  - Wires tender creation form → Supabase insert
//  - Wires RFQ dropzone → file extraction → AI Edge Function
//  - Wires file uploads on tasks → Supabase Storage
//  - Wires document compiler view → compile + download + submit
//  - Wires user management (create/invite, role change, suspend)
//  - Wires company creation modal for Super Admin
//  - Wires task assignment modal for Bid Managers
//
// USAGE: Add this single import to index.html AFTER the existing imports:
//   import './js/wiring.js';
// ============================================================================

import { supabase } from './supabase-client.js';
import {
  getProfile, hasRoleLevel, isSuperAdmin, onAuthChange,
} from './auth.js';
import { initRouter, navigate, getRouteParams, getCurrentRoute } from './router.js';
import { mountAppShell, renderView } from './app-shell.js';
import { compileTender, submitTender, extractTextFromFile, triggerRFQAnalysis, downloadHTML } from './compiler.js';

// ============================================================================
// 1. BOOTSTRAP: Connect app-shell to index.html lifecycle
// ============================================================================

let _appMounted = false;

onAuthChange((event, profile) => {
  if (event === 'SIGNED_IN' && !_appMounted) {
    // Mount the app shell (sidebar + content area)
    mountAppShell();
    _appMounted = true;

    // Render current route
    const route = getCurrentRoute();
    if (route && !['login', 'signup', 'forgot-password', 'reset-password'].includes(route.view)) {
      renderView(route);
    }
  } else if (event === 'SIGNED_OUT') {
    _appMounted = false;
  }
});

// Override the router callback to use renderView
// We do this by re-initializing with our enhanced callback
const _origHashHandler = () => {
  const route = getCurrentRoute();
  if (!route) return;

  if (['login', 'signup', 'forgot-password', 'reset-password'].includes(route.view)) {
    return; // Let index.html handle auth views
  }

  if (_appMounted) {
    renderView(route);
    // After render, attach dynamic event handlers
    requestAnimationFrame(() => attachDynamicHandlers(route));
  }
};

window.addEventListener('hashchange', _origHashHandler);

// ============================================================================
// 2. DYNAMIC EVENT HANDLERS — attached after each view render
// ============================================================================

function attachDynamicHandlers(route) {
  switch (route.view) {
    case 'tender-create':
      attachTenderCreateHandlers();
      break;
    case 'tender-detail':
      attachTenderDetailHandlers();
      break;
    case 'tender-compile':
      attachCompileHandlers();
      break;
    case 'task-detail':
      attachTaskDetailHandlers();
      break;
    case 'users':
      // User management already partially wired via window._createUser
      break;
    case 'admin-companies':
      // Company management already wired via window._toggleCompany/_toggleAI
      break;
  }
}

// ============================================================================
// 3. TENDER CREATION — form submit + RFQ file upload
// ============================================================================

function attachTenderCreateHandlers() {
  const form = document.getElementById('create-tender-form');
  const dropzone = document.getElementById('rfq-dropzone');
  const fileInput = document.getElementById('tf-rfq-file');
  const fileNameEl = document.getElementById('rfq-file-name');

  if (!form) return;

  // Dropzone click → trigger file input
  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    // Drag & drop
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('border-brand-500/60', 'bg-brand-500/5');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('border-brand-500/60', 'bg-brand-500/5');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-brand-500/60', 'bg-brand-500/5');
      if (e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        showFileName(e.dataTransfer.files[0]);
      }
    });

    // File selected
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length > 0) {
        showFileName(fileInput.files[0]);
      }
    });
  }

  function showFileName(file) {
    if (fileNameEl) {
      fileNameEl.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
      fileNameEl.classList.remove('hidden');
    }
  }

  // Form submit
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('tender-form-error');
    const btn = form.querySelector('button[type="submit"]');
    errEl?.classList.add('hidden');

    const profile = getProfile();
    if (!profile?.company_id && !isSuperAdmin()) {
      errEl.textContent = 'You must be assigned to a company to create tenders.';
      errEl?.classList.remove('hidden');
      return;
    }

    const title = document.getElementById('tf-title')?.value?.trim();
    const ref = document.getElementById('tf-ref')?.value?.trim();
    const deadline = document.getElementById('tf-deadline')?.value;
    const authority = document.getElementById('tf-authority')?.value?.trim();
    const desc = document.getElementById('tf-desc')?.value?.trim();

    if (!title) {
      errEl.textContent = 'Tender title is required.';
      errEl?.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Creating...';

    try {
      // Insert tender
      const { data: tender, error } = await supabase.from('tenders').insert({
        company_id: profile.company_id,
        created_by: profile.id,
        title,
        reference_number: ref || null,
        deadline: deadline || null,
        issuing_authority: authority || null,
        description: desc || null,
        status: 'draft',
      }).select().single();

      if (error) throw new Error(error.message);

      // Upload RFQ file if provided
      const file = fileInput?.files?.[0];
      if (file && tender) {
        btn.textContent = 'Uploading RFQ...';

        const storagePath = `${profile.company_id}/${tender.id}/rfq_${file.name}`;
        const { error: uploadErr } = await supabase.storage
          .from('tender-documents')
          .upload(storagePath, file);

        if (!uploadErr) {
          // Create document record
          await supabase.from('documents').insert({
            company_id: profile.company_id,
            tender_id: tender.id,
            uploaded_by: profile.id,
            file_name: file.name,
            file_type: file.type,
            file_size: file.size,
            storage_path: storagePath,
            doc_type: 'rfq_source',
          });

          // If AI is enabled, trigger analysis
          const company = profile.companies;
          if (company?.ai_enabled) {
            btn.textContent = 'Running AI analysis...';
            try {
              const text = await extractTextFromFile(file);
              const result = await triggerRFQAnalysis(tender.id, text);
              window.TF?.toast?.(`AI extracted ${result.tasks_created} requirements`, 'success');
            } catch (aiErr) {
              console.error('[AI] Analysis failed:', aiErr);
              window.TF?.toast?.('AI analysis failed — you can add tasks manually', 'warning');
            }
          }
        } else {
          console.error('[Upload] RFQ upload failed:', uploadErr.message);
          window.TF?.toast?.('RFQ file upload failed, but tender was created', 'warning');
        }
      }

      window.TF?.toast?.('Tender created successfully', 'success');
      navigate(`/tenders/${tender.id}`);

    } catch (err) {
      errEl.textContent = err.message;
      errEl?.classList.remove('hidden');
    }

    btn.disabled = false;
    btn.textContent = 'Create Tender';
  });
}

// ============================================================================
// 4. TENDER DETAIL — Add Task modal + task assignment
// ============================================================================

function attachTenderDetailHandlers() {
  // Nothing extra needed here — task list renders from app-shell
  // The _addTask handler is attached below
}

window._addTask = async (tenderId) => {
  const profile = getProfile();
  if (!hasRoleLevel('bid_manager')) return;

  // Fetch company users for assignment dropdown
  const { data: users } = await supabase.from('profiles')
    .select('id, full_name, department')
    .eq('company_id', profile.company_id)
    .eq('is_active', true)
    .order('full_name');

  const userOptions = (users || []).map(u =>
    `<option value="${u.id}">${u.full_name}${u.department ? ` (${u.department})` : ''}</option>`
  ).join('');

  const sectionTypes = [
    'executive_summary', 'company_profile', 'project_approach', 'methodology',
    'technical_proposal', 'pricing', 'financial_proposal', 'timeline',
    'project_plan', 'cv_key_personnel', 'past_experience', 'references',
    'quality_assurance', 'health_safety', 'environmental', 'risk_management',
    'bbbee_certificate', 'tax_clearance', 'compliance', 'insurance', 'terms_conditions',
  ].map(s => `<option value="${s}">${s.replace(/_/g, ' ')}</option>`).join('');

  // Create modal
  const modal = document.createElement('div');
  modal.id = 'add-task-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
      <h3 class="text-lg font-semibold text-white mb-4">Add New Task</h3>
      <div id="add-task-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-1">Task Title *</label>
          <input id="at-title" type="text" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm focus:ring-2 focus:ring-brand-500/40" placeholder="e.g. Executive Summary" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-slate-300 mb-1">Section Type</label>
            <select id="at-section" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
              <option value="">— Select —</option>
              ${sectionTypes}
            </select>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Priority</label>
            <select id="at-priority" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
              <option value="0">Normal</option>
              <option value="1">High</option>
              <option value="2">Critical</option>
            </select>
          </div>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Assign To</label>
          <select id="at-assign" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="">— Unassigned —</option>
            ${userOptions}
          </select>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Description</label>
          <textarea id="at-desc" rows="2" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none" placeholder="What needs to be done..."></textarea>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Due Date</label>
          <input id="at-due" type="datetime-local" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
        </div>
        <label class="flex items-center gap-2 text-sm text-slate-300">
          <input id="at-mandatory" type="checkbox" class="rounded border-slate-600 bg-surface-900" />
          Mandatory requirement
        </label>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="at-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Add Task</button>
        <button id="at-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);

  // Close on cancel or backdrop click
  modal.querySelector('#at-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Submit
  modal.querySelector('#at-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#add-task-error');
    const title = modal.querySelector('#at-title').value.trim();
    if (!title) {
      errEl.textContent = 'Task title is required.';
      errEl.classList.remove('hidden');
      return;
    }

    const assignTo = modal.querySelector('#at-assign').value || null;

    const { error } = await supabase.from('tasks').insert({
      company_id: profile.company_id,
      tender_id: tenderId,
      title,
      section_type: modal.querySelector('#at-section').value || null,
      description: modal.querySelector('#at-desc').value.trim() || null,
      priority: parseInt(modal.querySelector('#at-priority').value) || 0,
      assigned_to: assignTo,
      assigned_by: assignTo ? profile.id : null,
      is_mandatory: modal.querySelector('#at-mandatory').checked,
      due_date: modal.querySelector('#at-due').value || null,
      status: assignTo ? 'assigned' : 'unassigned',
    });

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      return;
    }

    modal.remove();
    window.TF?.toast?.('Task added', 'success');
    renderView(getCurrentRoute());
  });
};

// ============================================================================
// 5. TASK DETAIL — File upload to Supabase Storage
// ============================================================================

function attachTaskDetailHandlers() {
  // Load existing documents for this task
  const { id } = getRouteParams();
  loadTaskDocuments(id);
}

async function loadTaskDocuments(taskId) {
  const listEl = document.getElementById('task-documents-list');
  if (!listEl) return;

  const { data: docs } = await supabase.from('documents')
    .select('id, file_name, file_size, doc_type, created_at, storage_path')
    .eq('task_id', taskId)
    .order('created_at', { ascending: false });

  if (!docs?.length) {
    listEl.innerHTML = '<p class="text-sm text-slate-500">No attachments yet.</p>';
    return;
  }

  listEl.innerHTML = docs.map(d => `
    <div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
      <div>
        <p class="text-sm text-white">${d.file_name}</p>
        <p class="text-xs text-slate-500">${(d.file_size / 1024).toFixed(1)} KB • ${(d.doc_type || '').replace(/_/g, ' ')}</p>
      </div>
      <button onclick="window._downloadDoc('${d.storage_path}', '${d.file_name}')" class="text-xs text-brand-400 hover:text-brand-300">Download</button>
    </div>
  `).join('');
}

window._uploadTaskDoc = async (taskId, input) => {
  const file = input?.files?.[0];
  if (!file) return;

  const profile = getProfile();
  const { data: task } = await supabase.from('tasks').select('tender_id').eq('id', taskId).single();
  if (!task) return;

  const storagePath = `${profile.company_id}/${task.tender_id}/${taskId}_${file.name}`;

  const { error: uploadErr } = await supabase.storage
    .from('tender-documents')
    .upload(storagePath, file);

  if (uploadErr) {
    window.TF?.toast?.(`Upload failed: ${uploadErr.message}`, 'error');
    return;
  }

  await supabase.from('documents').insert({
    company_id: profile.company_id,
    tender_id: task.tender_id,
    task_id: taskId,
    uploaded_by: profile.id,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: storagePath,
    doc_type: file.name.toLowerCase().includes('cv') ? 'cv' : 'supporting',
  });

  window.TF?.toast?.('File uploaded', 'success');
  loadTaskDocuments(taskId);
  input.value = ''; // Reset file input
};

window._downloadDoc = async (storagePath, fileName) => {
  const { data, error } = await supabase.storage
    .from('tender-documents')
    .download(storagePath);

  if (error) {
    window.TF?.toast?.('Download failed', 'error');
    return;
  }

  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};

// ============================================================================
// 6. COMPILE & SUBMIT VIEW — Full document compiler UI
// ============================================================================

function attachCompileHandlers() {
  // Handlers are inline via onclick in the rendered HTML
}

// Override the placeholder tender-compile view
// We do this by patching the views object after app-shell loads
const _patchCompileView = () => {
  const container = document.getElementById('view-container');
  if (!container) return;

  const route = getCurrentRoute();
  if (route?.view !== 'tender-compile') return;

  const { id } = getRouteParams();
  renderCompileView(id, container);
};

async function renderCompileView(tenderId, container) {
  const { data: tender } = await supabase.from('tenders')
    .select('*, companies(name)')
    .eq('id', tenderId).single();

  if (!tender) {
    container.innerHTML = '<p class="text-red-400">Tender not found.</p>';
    return;
  }

  if (['submitted', 'archived'].includes(tender.status)) {
    container.innerHTML = `
      <div class="view-enter space-y-6">
        <h1 class="text-xl font-bold text-white">Compile Tender</h1>
        <div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center">
          <p class="text-emerald-400 font-medium">This tender has already been submitted and locked.</p>
          <p class="text-sm text-slate-400 mt-2">Submitted: ${tender.submitted_at ? new Date(tender.submitted_at).toLocaleString() : '—'}</p>
          ${tender.snapshot_data ? `<p class="text-xs text-slate-500 mt-1">${tender.snapshot_data.metadata?.total_sections || 0} sections compiled</p>` : ''}
        </div>
        <a href="#/tenders/${tenderId}" class="inline-block text-brand-400 hover:text-brand-300 text-sm">← Back to Tender</a>
      </div>`;
    return;
  }

  // Fetch tasks for preview
  const { data: tasks } = await supabase.from('tasks')
    .select('id, title, section_type, status, is_mandatory, content, profiles!tasks_assigned_to_fkey(full_name)')
    .eq('tender_id', tenderId)
    .order('priority', { ascending: false });

  const mandatory = (tasks || []).filter(t => t.is_mandatory);
  const mandatoryApproved = mandatory.filter(t => t.status === 'approved');
  const allReady = mandatory.length === mandatoryApproved.length;

  const statusIcon = (s) => {
    if (s === 'approved') return '<span class="text-emerald-400">✓</span>';
    if (s === 'submitted') return '<span class="text-amber-400">⏳</span>';
    return '<span class="text-red-400">✗</span>';
  };

  container.innerHTML = `
    <div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <a href="#/tenders/${tenderId}" class="text-xs text-brand-400 hover:text-brand-300">← ${tender.title}</a>
          <h1 class="text-xl font-bold text-white mt-2">Compile & Submit</h1>
        </div>
      </div>

      <!-- Readiness Check -->
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5">
        <h3 class="text-sm font-semibold text-white mb-3">Readiness Check</h3>
        <div class="space-y-2">
          ${(tasks || []).map(t => `
            <div class="flex items-center justify-between text-sm">
              <div class="flex items-center gap-2">
                ${statusIcon(t.status)}
                <span class="${t.is_mandatory ? 'text-white font-medium' : 'text-slate-400'}">${t.title}</span>
                ${t.is_mandatory ? '<span class="text-[10px] bg-red-500/15 text-red-400 px-1.5 py-0.5 rounded">MANDATORY</span>' : ''}
              </div>
              <span class="text-xs text-slate-500 capitalize">${(t.status || '').replace(/_/g, ' ')}</span>
            </div>
          `).join('')}
        </div>
        <div class="mt-4 pt-3 border-t border-slate-700/30">
          <p class="text-xs ${allReady ? 'text-emerald-400' : 'text-amber-400'}">
            ${allReady
              ? '✓ All mandatory sections approved — ready to compile'
              : `⚠ ${mandatory.length - mandatoryApproved.length} mandatory section(s) still need approval`}
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="flex gap-3">
        <button id="btn-preview-compile" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">
          Preview & Download
        </button>
        <button id="btn-submit-tender" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition ${allReady ? '' : 'opacity-50 cursor-not-allowed'}" ${allReady ? '' : 'disabled'}>
          Submit & Lock Tender
        </button>
      </div>

      <div id="compile-status" class="hidden p-4 rounded-xl text-sm"></div>
    </div>`;

  // Wire compile buttons
  document.getElementById('btn-preview-compile')?.addEventListener('click', async () => {
    const statusEl = document.getElementById('compile-status');
    statusEl.className = 'p-4 rounded-xl text-sm bg-brand-500/10 border border-brand-500/20 text-brand-400';
    statusEl.textContent = 'Compiling document...';
    statusEl.classList.remove('hidden');

    try {
      const result = await compileTender(tenderId);
      downloadHTML(result.htmlDocument, `${tender.title.replace(/[^a-zA-Z0-9]/g, '_')}_Proposal.html`);
      statusEl.className = 'p-4 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
      statusEl.textContent = `✓ Document downloaded — ${result.sectionCount} sections (${result.mandatoryCount} mandatory)`;
    } catch (err) {
      statusEl.className = 'p-4 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400';
      statusEl.textContent = `✗ ${err.message}`;
    }
  });

  document.getElementById('btn-submit-tender')?.addEventListener('click', async () => {
    if (!allReady) return;

    const confirmed = confirm(
      'FINAL SUBMISSION\n\n' +
      'This will:\n' +
      '• Compile all approved sections\n' +
      '• Lock the tender — NO further edits allowed\n' +
      '• Lock ALL documents for this tender\n' +
      '• Create a permanent snapshot\n\n' +
      'This action CANNOT be undone. Proceed?'
    );
    if (!confirmed) return;

    const statusEl = document.getElementById('compile-status');
    statusEl.className = 'p-4 rounded-xl text-sm bg-amber-500/10 border border-amber-500/20 text-amber-400';
    statusEl.textContent = 'Compiling and submitting...';
    statusEl.classList.remove('hidden');

    try {
      const compiled = await compileTender(tenderId);
      await submitTender(tenderId, compiled.snapshotData);

      // Also upload the compiled document to storage
      const profile = getProfile();
      const blob = new Blob([compiled.htmlDocument], { type: 'text/html' });
      const compiledPath = `${profile.company_id}/${tenderId}/COMPILED_FINAL.html`;
      await supabase.storage.from('tender-documents').upload(compiledPath, blob);
      await supabase.from('documents').insert({
        company_id: profile.company_id,
        tender_id: tenderId,
        uploaded_by: profile.id,
        file_name: 'COMPILED_FINAL.html',
        file_type: 'text/html',
        file_size: blob.size,
        storage_path: compiledPath,
        doc_type: 'compiled_final',
        is_locked: true,
      });

      downloadHTML(compiled.htmlDocument, `${tender.title.replace(/[^a-zA-Z0-9]/g, '_')}_SUBMITTED.html`);

      statusEl.className = 'p-4 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
      statusEl.textContent = '✓ Tender submitted and locked. Document downloaded.';
      window.TF?.toast?.('Tender submitted successfully', 'success');

      // Disable buttons
      document.getElementById('btn-preview-compile')?.setAttribute('disabled', 'true');
      document.getElementById('btn-submit-tender')?.setAttribute('disabled', 'true');

    } catch (err) {
      statusEl.className = 'p-4 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400';
      statusEl.textContent = `✗ Submission failed: ${err.message}`;
    }
  });
}

// Listen for route changes to handle compile view
window.addEventListener('hashchange', () => {
  requestAnimationFrame(_patchCompileView);
});

// ============================================================================
// 7. USER MANAGEMENT — Create/Invite user modal
// ============================================================================

window._createUser = async () => {
  const profile = getProfile();

  const roleOptions = isSuperAdmin()
    ? '<option value="dept_user">Dept User</option><option value="bid_manager">Bid Manager</option><option value="it_admin">IT Admin</option>'
    : '<option value="dept_user">Dept User</option><option value="bid_manager">Bid Manager</option>';

  // If Super Admin, show company selector
  let companySelect = '';
  if (isSuperAdmin()) {
    const { data: companies } = await supabase.from('companies').select('id, name').eq('is_active', true).order('name');
    const opts = (companies || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    companySelect = `
      <div>
        <label class="block text-sm text-slate-300 mb-1">Company *</label>
        <select id="nu-company" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="">— Select —</option>
          ${opts}
        </select>
      </div>`;
  }

  const modal = document.createElement('div');
  modal.id = 'create-user-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-semibold text-white mb-4">Invite New User</h3>
      <p class="text-xs text-slate-400 mb-4">The user will receive a signup link. They'll use the company code to join.</p>
      <div id="nu-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
      <div id="nu-success" class="hidden mb-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm"></div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-1">Email *</label>
          <input id="nu-email" type="email" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="user@company.com" />
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Full Name *</label>
          <input id="nu-name" type="text" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="Jane Doe" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-sm text-slate-300 mb-1">Role</label>
            <select id="nu-role" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
              ${roleOptions}
            </select>
          </div>
          <div>
            <label class="block text-sm text-slate-300 mb-1">Department</label>
            <input id="nu-dept" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="Engineering" />
          </div>
        </div>
        ${companySelect}
      </div>
      <div class="flex gap-3 mt-6">
        <button id="nu-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Send Invite</button>
        <button id="nu-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('#nu-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#nu-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#nu-error');
    const successEl = modal.querySelector('#nu-success');
    errEl.classList.add('hidden');
    successEl.classList.add('hidden');

    const email = modal.querySelector('#nu-email').value.trim();
    const name = modal.querySelector('#nu-name').value.trim();
    const role = modal.querySelector('#nu-role').value;
    const dept = modal.querySelector('#nu-dept').value.trim();
    const companyId = isSuperAdmin()
      ? modal.querySelector('#nu-company')?.value
      : profile.company_id;

    if (!email || !name) {
      errEl.textContent = 'Email and name are required.';
      errEl.classList.remove('hidden');
      return;
    }
    if (isSuperAdmin() && !companyId) {
      errEl.textContent = 'Please select a company.';
      errEl.classList.remove('hidden');
      return;
    }

    // Get company slug for the invite message
    const { data: company } = await supabase.from('companies').select('slug, name').eq('id', companyId).single();

    successEl.innerHTML = `
      Invite details for <strong>${name}</strong>:<br/>
      <span class="font-mono text-xs">Email: ${email}</span><br/>
      <span class="font-mono text-xs">Company Code: ${company?.slug || '—'}</span><br/>
      <span class="font-mono text-xs">Role: ${role} (to be set after signup)</span><br/><br/>
      Share the signup URL and company code with them. After they sign up, run:<br/>
      <code class="text-xs bg-surface-900 px-2 py-1 rounded mt-1 inline-block">UPDATE profiles SET role = '${role}'${dept ? `, department = '${dept}'` : ''} WHERE email = '${email}';</code>
    `;
    successEl.classList.remove('hidden');

    window.TF?.toast?.('Invite details generated', 'success');
  });
};

// ============================================================================
// 8. COMPANY CREATION — Super Admin
// ============================================================================

window._createCompany = async () => {
  if (!isSuperAdmin()) return;

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
      <h3 class="text-lg font-semibold text-white mb-4">Add New Company</h3>
      <div id="nc-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
      <div class="space-y-4">
        <div>
          <label class="block text-sm text-slate-300 mb-1">Company Name *</label>
          <input id="nc-name" type="text" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="Acme Corporation" />
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Slug (Company Code) *</label>
          <input id="nc-slug" type="text" required class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" placeholder="acme-corp" />
          <p class="text-xs text-slate-500 mt-1">Users enter this when signing up</p>
        </div>
        <div>
          <label class="block text-sm text-slate-300 mb-1">Domain</label>
          <input id="nc-domain" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="acme.com" />
        </div>
        <div class="flex gap-4">
          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input id="nc-ai" type="checkbox" checked class="rounded border-slate-600 bg-surface-900" />
            Enable AI
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-300">
            <input id="nc-active" type="checkbox" checked class="rounded border-slate-600 bg-surface-900" />
            Active
          </label>
        </div>
      </div>
      <div class="flex gap-3 mt-6">
        <button id="nc-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Create Company</button>
        <button id="nc-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(modal);
  modal.querySelector('#nc-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  // Auto-generate slug from name
  modal.querySelector('#nc-name').addEventListener('input', (e) => {
    const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    modal.querySelector('#nc-slug').value = slug;
  });

  modal.querySelector('#nc-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#nc-error');
    errEl.classList.add('hidden');

    const name = modal.querySelector('#nc-name').value.trim();
    const slug = modal.querySelector('#nc-slug').value.trim().toLowerCase();
    const domain = modal.querySelector('#nc-domain').value.trim();

    if (!name || !slug) {
      errEl.textContent = 'Name and slug are required.';
      errEl.classList.remove('hidden');
      return;
    }

    const { error } = await supabase.from('companies').insert({
      name,
      slug,
      domain: domain || null,
      ai_enabled: modal.querySelector('#nc-ai').checked,
      is_active: modal.querySelector('#nc-active').checked,
    });

    if (error) {
      errEl.textContent = error.message.includes('duplicate') ? 'That slug is already taken.' : error.message;
      errEl.classList.remove('hidden');
      return;
    }

    modal.remove();
    window.TF?.toast?.(`Company "${name}" created`, 'success');
    renderView(getCurrentRoute());
  });
};

// ============================================================================
// 9. TASK STATUS MANAGEMENT — Bid Manager approve/revision actions
// ============================================================================

window._approveTask = async (taskId) => {
  await supabase.from('tasks').update({ status: 'approved' }).eq('id', taskId);
  window.TF?.toast?.('Task approved', 'success');
  renderView(getCurrentRoute());
};

window._requestRevision = async (taskId) => {
  const notes = prompt('Revision notes (optional):');
  await supabase.from('tasks').update({
    status: 'revision_needed',
    review_notes: notes || null,
  }).eq('id', taskId);
  window.TF?.toast?.('Revision requested', 'success');
  renderView(getCurrentRoute());
};

window._startTask = async (taskId) => {
  await supabase.from('tasks').update({
    status: 'in_progress',
    started_at: new Date().toISOString(),
  }).eq('id', taskId);
  window.TF?.toast?.('Task started', 'success');
  renderView(getCurrentRoute());
};

// ============================================================================
// 10. INITIALIZATION LOG
// ============================================================================

console.log('[TenderFlow] Wiring patch loaded — all modules connected');
