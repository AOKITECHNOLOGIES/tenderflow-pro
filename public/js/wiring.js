// ============================================================================
// TenderFlow Pro — Wiring (event handlers, post-render hooks, UI logic)
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, hasRoleLevel, isSuperAdmin, saveDraftOffline } from './auth.js';
import { getRouteParams, getCurrentRoute, navigate } from './router.js';
import { renderView, refreshView } from './app-shell.js';

// ── Route-specific post-render hooks ──────────────────────────────────────────
export function attachDynamicHandlers(route) {
  switch (route.view) {
    case 'tender-create':   attachTenderCreateHandlers(); break;
    case 'tender-detail':   attachTenderDetailHandlers(); break;
    case 'task-detail':     attachTaskDetailHandlers();   break;
    case 'tender-compile':  attachCompileHandlers();      break;
    default: break;
  }
}

// ── Tender Create ─────────────────────────────────────────────────────────────
function attachTenderCreateHandlers() {
  const form      = document.getElementById('create-tender-form');
  const dropzone  = document.getElementById('rfq-dropzone');
  const fileInput = document.getElementById('tf-rfq-file');
  const fileName  = document.getElementById('rfq-file-name');
  if (!form) return;

  dropzone?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f && fileName) { fileName.textContent = `📎 ${f.name}`; fileName.classList.remove('hidden'); }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('tender-form-error');
    const title     = document.getElementById('tf-title')?.value.trim();
    const ref       = document.getElementById('tf-ref')?.value.trim();
    const deadline  = document.getElementById('tf-deadline')?.value;
    const authority = document.getElementById('tf-authority')?.value.trim();
    const desc      = document.getElementById('tf-desc')?.value.trim();
    const rfqFile   = document.getElementById('tf-rfq-file')?.files?.[0];

    if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.remove('hidden'); return; }
    errEl.classList.add('hidden');

    const profile   = getProfile();
    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Creating...'; }

    const accountManager = document.getElementById('tf-account-manager')?.value.trim();
    const { data: tender, error } = await supabase.from('tenders').insert({
      title,
      reference_number: ref || null,
      deadline: deadline || null,
      issuing_authority: authority || null,
      account_manager: accountManager || null,
      description: desc || null,
      company_id: profile.company_id,
      created_by: profile.id,
      status: 'draft',
    }).select().single();

    if (error) {
      errEl.textContent = error.message;
      errEl.classList.remove('hidden');
      if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Create Tender'; }
      return;
    }

    if (rfqFile && tender) {
      await uploadRFQ(rfqFile, tender.id, profile);
    }

    window.TF?.toast?.('Tender created!', 'success');
    navigate(`/tenders/${tender.id}`);
  });
}

async function uploadRFQ(file, tenderId, profile) {
  const overlay = document.createElement('div');
  overlay.id = 'parse-overlay';
  overlay.className = 'fixed inset-0 z-[200] bg-black/70 backdrop-blur-sm flex items-center justify-center';
  overlay.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-8 w-full max-w-sm text-center shadow-2xl">
    <div class="w-12 h-12 bg-violet-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
    </div>
    <p class="text-white font-semibold mb-1" id="parse-status">Uploading document...</p>
    <p class="text-xs text-slate-400 mb-5" id="parse-substatus">Please wait while we process your RFQ</p>
    <div class="w-full bg-surface-900 rounded-full h-2 overflow-hidden">
      <div id="parse-bar" class="h-full bg-violet-500 rounded-full transition-all duration-500" style="width:10%"></div>
    </div>
    <p class="text-xs text-slate-500 mt-3" id="parse-pct">10%</p>
  </div>`;
  document.body.appendChild(overlay);

  function setProgress(pct, status, sub) {
    const bar      = document.getElementById('parse-bar');
    const statusEl = document.getElementById('parse-status');
    const subEl    = document.getElementById('parse-substatus');
    const pctEl    = document.getElementById('parse-pct');
    if (bar) bar.style.width = pct + '%';
    if (statusEl) statusEl.textContent = status;
    if (subEl && sub) subEl.textContent = sub;
    if (pctEl) pctEl.textContent = pct + '%';
  }

  try {
    setProgress(15, 'Uploading document...', 'Storing your RFQ file securely');
    const ext = file.name.split('.').pop();
    const storagePath = `${profile.company_id}/${tenderId}/rfq_${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('documents').upload(storagePath, file, { upsert: true });
    if (uploadErr) { overlay.remove(); return; }

    setProgress(30, 'File stored...', 'Recording document metadata');
    await supabase.from('documents').insert({
      company_id: profile.company_id,
      tender_id: tenderId,
      uploaded_by: profile.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      doc_type: 'rfq_source',
    });

    setProgress(45, 'Extracting text...', 'Reading document contents');
    const { data: { session } } = await supabase.auth.getSession();
    const { extractTextFromFile } = await import('./compiler.js');
    const text = await extractTextFromFile(file);

    setProgress(60, 'Analysing with AI...', 'Identifying actionable sections and requirements');
    await supabase.from('tenders').update({ status: 'analyzing' }).eq('id', tenderId);

    setProgress(75, 'Creating tasks...', 'Building your task list from the document');
    const { data: parseResult, error: parseErr } = await supabase.functions.invoke('parse-document', {
      body: { tender_id: tenderId, document_text: text, mode: 'rfq' },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (parseErr) {
      await supabase.functions.invoke('parse-rfq', {
        body: { tender_id: tenderId, text },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
    }

    setProgress(95, 'Finalising...', 'Almost done');
    await supabase.from('tenders').update({ status: 'in_progress' }).eq('id', tenderId);
    setProgress(100, 'Done!', 'Tasks created successfully');
    await new Promise(r => setTimeout(r, 600));
  } catch (err) {
    window.TF?.toast?.('Document uploaded but AI parse failed — you can import it manually from the tender page', 'warning');
  } finally {
    overlay.remove();
  }
}

// ── Tender Detail ─────────────────────────────────────────────────────────────
function attachTenderDetailHandlers() {
  // _addTask is wired inline from the view HTML
  // Nothing additional needed here — task rows are interactive via inline onclick
}

window._addTask = async (tenderId) => {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-4">Add Task</h3>
    <div id="at-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
    <div class="space-y-4">
      <div><label class="block text-sm text-slate-300 mb-1">Title *</label>
        <input id="at-title" type="text" placeholder="e.g. Executive Summary" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Section Type</label>
        <select id="at-section" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="">— General —</option>
          <option value="executive_summary">Executive Summary</option>
          <option value="company_profile">Company Profile</option>
          <option value="project_approach">Project Approach</option>
          <option value="methodology">Methodology</option>
          <option value="technical_proposal">Technical Proposal</option>
          <option value="timeline">Timeline</option>
          <option value="cv_key_personnel">CV / Key Personnel</option>
          <option value="past_experience">Past Experience</option>
          <option value="pricing">Pricing</option>
          <option value="bbbee_certificate">B-BBEE Certificate</option>
          <option value="tax_clearance">Tax Clearance</option>
          <option value="compliance">Compliance</option>
        </select></div>
      <div><label class="block text-sm text-slate-300 mb-1">Description</label>
        <textarea id="at-desc" rows="2" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none" placeholder="Optional notes for the assignee"></textarea></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm text-slate-300 mb-1">Priority</label>
          <select id="at-priority" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="0">Normal</option>
            <option value="1">High</option>
            <option value="2">Critical</option>
          </select></div>
        <div><label class="block text-sm text-slate-300 mb-1">Due Date</label>
          <input id="at-due" type="datetime-local" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      </div>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input id="at-mandatory" type="checkbox" /> Mandatory
      </label>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="at-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Add Task</button>
      <button id="at-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#at-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#at-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#at-error');
    const title = modal.querySelector('#at-title').value.trim();
    if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.remove('hidden'); return; }
    const profile = getProfile();
    const { data: tenderRow } = await supabase.from('tenders').select('company_id').eq('id', tenderId).maybeSingle();
    const { error } = await supabase.from('tasks').insert({
      tender_id: tenderId,
      company_id: tenderRow?.company_id || profile.company_id,
      title,
      section_type: modal.querySelector('#at-section').value || null,
      description: modal.querySelector('#at-desc').value.trim() || null,
      priority: parseInt(modal.querySelector('#at-priority').value) || 0,
      due_date: modal.querySelector('#at-due').value || null,
      is_mandatory: modal.querySelector('#at-mandatory').checked,
      status: 'unassigned',
      created_by: profile.id,
    });
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    modal.remove();
    window.TF?.toast?.('Task added', 'success');
    const route = getCurrentRoute(); if (route) refreshView(route);
  });
};

// ── Task Detail ───────────────────────────────────────────────────────────────
function attachTaskDetailHandlers() {
  const { id } = getRouteParams();
  if (!id) return;

  // Guard against double-init — check if already wired for this task
  if (document.getElementById('quill-editor')?._wiringDone === id) return;
  const editorEl = document.getElementById('quill-editor');
  if (editorEl) editorEl._wiringDone = id;

  // Load all dynamic panels
  window._loadTaskDocuments(id);
  window._loadTaskAssignFields && window._loadTaskAssignFields(id);
  window._loadTaskImages(id);

  // Initialize Quill editor if present
  if (editorEl && window.Quill) {
    if (window._quillEditor) {
      try { window._quillEditor = null; } catch (_) {}
    }

    window._quillEditor = new Quill('#quill-editor', {
      theme: 'snow',
      placeholder: 'Write your section content here...',
      modules: {
        toolbar: [
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          ['blockquote', 'code-block'],
          [{ align: [] }],
          ['link'],
          ['clean'],
        ],
      },
    });

    const hidden = document.getElementById('task-content-hidden');
    if (hidden?.textContent?.trim()) {
      window._quillEditor.root.innerHTML = hidden.textContent;
    }

    const toolbar   = editorEl.querySelector('.ql-toolbar');
    const container = editorEl.querySelector('.ql-container');
    if (toolbar) {
      toolbar.style.cssText = [
        'border-color: rgba(100,116,139,0.3)',
        'border-radius: 8px 8px 0 0',
        'background: #1e293b',
      ].join('; ');
      toolbar.querySelectorAll('button, .ql-picker').forEach(el => { el.style.color = '#94a3b8'; });
      toolbar.querySelectorAll('.ql-stroke').forEach(el => el.style.stroke = '#94a3b8');
      toolbar.querySelectorAll('.ql-fill').forEach(el => el.style.fill = '#94a3b8');
    }
    if (container) {
      container.style.cssText = [
        'border-color: rgba(100,116,139,0.3)',
        'border-radius: 0 0 8px 8px',
        'font-size: 14px',
        'min-height: 240px',
        'color: #e2e8f0',
        'background: #0f172a',
      ].join('; ');
    }

    const styleId = 'quill-scope-fix';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .ql-editor { white-space: normal; }
        .ql-editor p { margin: 0 0 0.6em 0; }
        .ql-editor ol, .ql-editor ul { margin: 0.2em 0; padding-left: 1.5em; }
        .ql-editor li { margin: 0; }
        .ql-editor .ql-indent-1 { padding-left: 3em; }
        .ql-editor .ql-indent-2 { padding-left: 4.5em; }
        .ql-editor .ql-indent-3 { padding-left: 6em; }
        .ql-editor td, .ql-editor th { border: 1px solid #475569 !important; padding: 6px 10px !important; min-width: 80px; }
        .ql-editor table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .ql-editor th { background: #1e293b; font-weight: 600; color: #94a3b8; }
        .ql-editor td { background: #0f172a; color: #e2e8f0; }
        .ql-toolbar button:hover svg .ql-stroke { stroke: #e2e8f0 !important; }
        .ql-toolbar button:hover svg .ql-fill { fill: #e2e8f0 !important; }
        .ql-toolbar button.ql-active svg .ql-stroke { stroke: #38bdf8 !important; }
        .ql-toolbar button.ql-active svg .ql-fill { fill: #38bdf8 !important; }
        .ql-toolbar .ql-picker-label { color: #94a3b8 !important; }
        .ql-toolbar .ql-picker-options { background: #1e293b !important; border-color: rgba(100,116,139,0.3) !important; }
        .ql-toolbar .ql-picker-item { color: #e2e8f0 !important; }
        .ql-editor.ql-blank::before { color: #475569 !important; font-style: italic; }
      `;
      document.head.appendChild(style);
    }
  } else {
    window._quillEditor = null;
  }
}

// ── Task Documents ────────────────────────────────────────────────────────────
async function loadTaskDocuments(taskId) {
  const container = document.getElementById('task-documents-list');
  if (!container) return;

  const { data: docs } = await supabase.from('documents')
    .select('id, file_name, file_type, file_size, storage_path, created_at, profiles!documents_uploaded_by_fkey(full_name)')
    .eq('task_id', taskId)
    .not('doc_type', 'eq', 'task_image')
    .order('created_at', { ascending: false });

  if (!docs?.length) {
    container.innerHTML = '<p class="text-slate-500 text-sm">No attachments yet.</p>';
    return;
  }

  container.innerHTML = docs.map(d => {
    const size = d.file_size ? `${(d.file_size / 1024).toFixed(0)} KB` : '';
    const { data: { publicUrl } } = supabase.storage.from('documents').getPublicUrl(d.storage_path);
    return `<div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0">
      <div class="min-w-0">
        <a href="${publicUrl}" target="_blank" class="text-sm text-brand-400 hover:text-brand-300 truncate block">${d.file_name}</a>
        <p class="text-xs text-slate-500">${size} · ${d.profiles?.full_name || 'Unknown'} · ${new Date(d.created_at).toLocaleDateString()}</p>
      </div>
      <button onclick="window._deleteTaskDoc('${d.id}', '${d.storage_path}', '${taskId}')" class="ml-3 text-xs text-red-400 hover:text-red-300 shrink-0">Delete</button>
    </div>`;
  }).join('');
}

// Expose on window so app-shell's setTimeout can call it too
window._loadTaskDocuments = loadTaskDocuments;

window._uploadTaskDoc = async (taskId, input) => {
  const file = input?.files?.[0];
  if (!file) return;
  const profile = getProfile();
  const { data: task } = await supabase.from('tasks').select('tender_id').eq('id', taskId).maybeSingle();
  const ext = file.name.split('.').pop();
  const storagePath = `${profile.company_id}/${task?.tender_id || 'general'}/${taskId}/doc_${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('documents').upload(storagePath, file, { upsert: true });
  if (error) { window.TF?.toast?.(`Upload failed: ${error.message}`, 'error'); return; }
  await supabase.from('documents').insert({
    company_id: profile.company_id,
    tender_id: task?.tender_id || null,
    task_id: taskId,
    uploaded_by: profile.id,
    file_name: file.name,
    file_type: file.type,
    file_size: file.size,
    storage_path: storagePath,
    doc_type: 'supporting',
  });
  window.TF?.toast?.('File uploaded', 'success');
  input.value = '';
  loadTaskDocuments(taskId);
};

window._deleteTaskDoc = async (docId, storagePath, taskId) => {
  if (!confirm('Delete this attachment?')) return;
  await supabase.storage.from('documents').remove([storagePath]);
  await supabase.from('documents').delete().eq('id', docId);
  window.TF?.toast?.('Attachment deleted', 'success');
  loadTaskDocuments(taskId);
};

// ── Task Images ───────────────────────────────────────────────────────────────
window._uploadTaskImage = async (taskId, input) => {
  const files = Array.from(input?.files || []);
  if (!files.length) return;
  const profile = getProfile();
  const { data: task } = await supabase.from('tasks').select('tender_id').eq('id', taskId).maybeSingle();
  if (!task) return;

  const btn = document.getElementById('img-upload-btn');
  if (btn) btn.textContent = `Uploading ${files.length} image(s)...`;

  let uploaded = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) { window.TF?.toast?.(`${file.name} is not an image`, 'warning'); continue; }
    const ext = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    const storagePath = `${profile.company_id}/${task.tender_id}/${taskId}/${fileName}`;
    const { error } = await supabase.storage.from('task-images').upload(storagePath, file, { upsert: true });
    if (error) { window.TF?.toast?.(`Failed to upload ${file.name}: ${error.message}`, 'error'); continue; }
    const { data: { publicUrl } } = supabase.storage.from('task-images').getPublicUrl(storagePath);
    await supabase.from('documents').insert({
      company_id: profile.company_id,
      tender_id: task.tender_id,
      task_id: taskId,
      uploaded_by: profile.id,
      file_name: file.name,
      file_type: file.type,
      file_size: file.size,
      storage_path: storagePath,
      doc_type: 'task_image',
      metadata: { public_url: publicUrl },
    });
    uploaded++;
  }

  window.TF?.toast?.(`${uploaded} image(s) uploaded`, 'success');
  if (btn) btn.textContent = '+ Add Images';
  input.value = '';
  window._loadTaskImages(taskId);
};

window._loadTaskImages = async (taskId) => {
  const container = document.getElementById('task-images-list');
  if (!container) return;

  const { data: docs } = await supabase.from('documents')
    .select('id, file_name, storage_path, metadata')
    .eq('task_id', taskId)
    .eq('doc_type', 'task_image')
    .order('created_at', { ascending: true });

  if (!docs?.length) {
    container.innerHTML = '<p class="text-xs text-slate-500 col-span-3">No images yet.</p>';
    return;
  }

  container.innerHTML = docs.map(d => {
    const url = d.metadata?.public_url || supabase.storage.from('task-images').getPublicUrl(d.storage_path).data.publicUrl;
    return `<div class="relative group">
      <img src="${url}" alt="${d.file_name}" class="w-full h-32 object-cover rounded-lg border border-slate-700/50 cursor-pointer" onclick="window._previewImage('${url}', '${d.file_name}')" />
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
        <a href="${url}" target="_blank" class="text-xs text-white bg-surface-900/80 px-2 py-1 rounded">View</a>
        <button onclick="window._deleteTaskImage('${d.id}', '${d.storage_path}', '${taskId}')" class="text-xs text-red-400 bg-surface-900/80 px-2 py-1 rounded">Delete</button>
      </div>
      <p class="text-xs text-slate-500 mt-1 truncate">${d.file_name}</p>
    </div>`;
  }).join('');
};

window._previewImage = (url, name) => {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer';
  modal.innerHTML = `<div class="max-w-4xl max-h-[90vh] overflow-auto p-4" onclick="event.stopPropagation()">
    <img src="${url}" alt="${name}" class="rounded-xl max-w-full max-h-[80vh] object-contain" />
    <p class="text-xs text-slate-400 text-center mt-2">${name}</p>
  </div>`;
  modal.addEventListener('click', () => modal.remove());
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { modal.remove(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(modal);
};

window._deleteTaskImage = async (docId, storagePath, taskId) => {
  if (!confirm('Delete this image?')) return;
  await supabase.storage.from('task-images').remove([storagePath]);
  await supabase.from('documents').delete().eq('id', docId);
  window.TF?.toast?.('Image deleted', 'success');
  window._loadTaskImages(taskId);
};

// ── Compile Handler ───────────────────────────────────────────────────────────
async function attachCompileHandlers() {
  const { id } = getRouteParams();
  const container = document.getElementById('view-container');
  if (!container || !id) return;

  const { data: tender } = await supabase.from('tenders').select('*').eq('id', id).single();
  const { data: tasks } = await supabase.from('tasks').select('*').eq('tender_id', id).eq('status', 'approved').order('priority', { ascending: false });

  if (!tender) return;

  const incompleteCount = await supabase.from('tasks')
    .select('id', { count: 'exact' })
    .eq('tender_id', id)
    .neq('status', 'approved')
    .then(r => r.count || 0);

  container.innerHTML = `<div class="view-enter max-w-2xl space-y-6">
    <div>
      <a href="#/tenders/${id}" class="text-xs text-brand-400 hover:text-brand-300">← ${tender.title}</a>
      <h1 class="text-xl font-bold text-white mt-2">Compile & Submit</h1>
    </div>
    ${incompleteCount > 0 ? `<div class="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-sm text-amber-300">
      ⚠ ${incompleteCount} task(s) are not yet approved and will be excluded from the compiled document.
    </div>` : ''}
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5 space-y-4">
      <h2 class="text-sm font-semibold text-white">Summary</h2>
      <div class="grid grid-cols-2 gap-4 text-sm">
        <div><p class="text-slate-500">Approved sections</p><p class="text-white font-medium">${tasks?.length || 0}</p></div>
        <div><p class="text-slate-500">Pending sections</p><p class="text-white font-medium">${incompleteCount}</p></div>
      </div>
    </div>
    <div class="flex gap-3">
      <button id="compile-btn" class="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-medium rounded-lg transition">Compile Document</button>
      <a href="#/tenders/${id}" class="px-6 py-2.5 border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700/20 transition">Cancel</a>
    </div>
    <div id="compile-output" class="hidden"></div>
  </div>`;

  document.getElementById('compile-btn')?.addEventListener('click', async () => {
    const btn    = document.getElementById('compile-btn');
    const output = document.getElementById('compile-output');
    btn.disabled = true; btn.textContent = 'Compiling...';
    try {
      const { compileAndDownload } = await import('./compiler.js');
      await compileAndDownload(tender, tasks || []);
      await supabase.from('tenders').update({ status: 'submitted' }).eq('id', id);
      window.TF?.toast?.('Document compiled & tender submitted!', 'success');
      output.innerHTML = '<p class="text-emerald-400 text-sm">✓ Document compiled. Tender marked as submitted.</p>';
      output.classList.remove('hidden');
    } catch (err) {
      output.innerHTML = `<p class="text-red-400 text-sm">Error: ${err.message}</p>`;
      output.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Compile Document';
    }
  });
}

// ── Toast system ──────────────────────────────────────────────────────────────
function initToastSystem() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'fixed bottom-5 right-5 z-[100] flex flex-col gap-2 pointer-events-none';
    document.body.appendChild(container);
  }

  window.TF = window.TF || {};
  window.TF.toast = (message, type = 'info') => {
    const colors = {
      success: 'bg-emerald-500/90 border-emerald-400/30 text-white',
      error:   'bg-red-500/90 border-red-400/30 text-white',
      warning: 'bg-amber-500/90 border-amber-400/30 text-white',
      info:    'bg-surface-800/95 border-slate-600/40 text-slate-200',
    };
    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border shadow-xl text-sm font-medium backdrop-blur-sm transition-all duration-300 translate-y-2 opacity-0 ${colors[type] || colors.info}`;
    toast.innerHTML = `<span class="shrink-0">${icons[type] || icons.info}</span><span>${message}</span>`;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.classList.remove('translate-y-2', 'opacity-0'); });
    setTimeout(() => {
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  };
}

// ── Global init ───────────────────────────────────────────────────────────────
initToastSystem();

// Expose attachDynamicHandlers globally so app-shell can call it
// after every renderView/refreshView without a dynamic import
window._attachDynamicHandlers = attachDynamicHandlers;
