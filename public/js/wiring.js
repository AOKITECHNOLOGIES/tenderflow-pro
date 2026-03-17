// ============================================================================
// TenderFlow Pro — Wiring (wiring.js)
// ONLY attaches form/interaction handlers after views render.
// All routing, auth, and shell mounting is handled by index.html ONLY.
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, hasRoleLevel, isSuperAdmin } from './auth.js';
import { getRouteParams, getCurrentRoute, navigate } from './router.js';
import { renderView } from './app-shell.js';
import { compileTender, submitTender, extractTextFromFile, triggerRFQAnalysis, downloadHTML, triggerDocumentParse } from './compiler.js';

export function attachDynamicHandlers(route) {
  switch (route.view) {
    case 'tender-create':  attachTenderCreateHandlers(); break;
    case 'tender-detail':  attachTenderDetailHandlers(); break;
    case 'tender-compile': attachCompileHandlers(); break;
    case 'task-detail':    attachTaskDetailHandlers(); break;
  }
}

// ── Tender Creation ──────────────────────────────────────────────────────────
function attachTenderCreateHandlers() {
  const form = document.getElementById('create-tender-form');
  const dropzone = document.getElementById('rfq-dropzone');
  const fileInput = document.getElementById('tf-rfq-file');
  const fileNameEl = document.getElementById('rfq-file-name');
  if (!form) return;

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('border-brand-500/60', 'bg-brand-500/5'); });
    dropzone.addEventListener('dragleave', () => { dropzone.classList.remove('border-brand-500/60', 'bg-brand-500/5'); });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('border-brand-500/60', 'bg-brand-500/5');
      if (e.dataTransfer.files.length > 0) { fileInput.files = e.dataTransfer.files; showFileName(e.dataTransfer.files[0]); }
    });
    fileInput.addEventListener('change', () => { if (fileInput.files.length > 0) showFileName(fileInput.files[0]); });
  }

  function showFileName(file) {
    if (fileNameEl) { fileNameEl.textContent = `📎 ${file.name} (${(file.size/1024).toFixed(1)} KB)`; fileNameEl.classList.remove('hidden'); }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('tender-form-error');
    const btn = form.querySelector('button[type="submit"]');
    errEl?.classList.add('hidden');
    const profile = getProfile();
    if (!profile?.company_id && !isSuperAdmin()) {
      if (errEl) errEl.textContent = 'You must be assigned to a company to create tenders.';
      errEl?.classList.remove('hidden'); return;
    }
    const title = document.getElementById('tf-title')?.value?.trim();
    if (!title) { if (errEl) errEl.textContent = 'Tender title is required.'; errEl?.classList.remove('hidden'); return; }
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const { data: tender, error } = await supabase.from('tenders').insert({
        company_id: profile.company_id,
        created_by: profile.id,
        title,
        reference_number: document.getElementById('tf-ref')?.value?.trim() || null,
        deadline: document.getElementById('tf-deadline')?.value || null,
        issuing_authority: document.getElementById('tf-authority')?.value?.trim() || null,
        description: document.getElementById('tf-desc')?.value?.trim() || null,
        status: 'draft',
      }).select().single();
      if (error) throw new Error(error.message);
      const file = fileInput?.files?.[0];
      if (file && tender) {
        btn.textContent = 'Uploading RFQ...';
        const storagePath = `${profile.company_id}/${tender.id}/rfq_${file.name}`;
        const { error: uploadErr } = await supabase.storage.from('tender-documents').upload(storagePath, file, { upsert: true });
        if (!uploadErr) {
          await supabase.from('documents').insert({ company_id: profile.company_id, tender_id: tender.id, uploaded_by: profile.id, file_name: file.name, file_type: file.type, file_size: file.size, storage_path: storagePath, doc_type: 'rfq_source' });
          if (profile.companies?.ai_enabled) {
            btn.textContent = 'Running AI analysis...';
            try {
              const text = await extractTextFromFile(file);
              const result = await triggerRFQAnalysis(tender.id, text);
              window.TF?.toast?.(`AI extracted ${result.tasks_created} requirements`, 'success');
            } catch (aiErr) { window.TF?.toast?.('AI analysis failed — add tasks manually', 'warning'); }
          }
        } else { window.TF?.toast?.('RFQ upload failed, tender was created', 'warning'); }
      }
      window.TF?.toast?.('Tender created successfully', 'success');
      navigate(`/tenders/${tender.id}`);
    } catch (err) { if (errEl) errEl.textContent = err.message; errEl?.classList.remove('hidden'); }
    btn.disabled = false; btn.textContent = 'Create Tender';
  });
}

// ── Tender Detail ────────────────────────────────────────────────────────────
function attachTenderDetailHandlers() {}

window._addTask = async (tenderId) => {
  const profile = getProfile();
  if (!hasRoleLevel('bid_manager')) return;
  const { data: users } = await supabase.from('profiles').select('id, full_name, department').eq('company_id', profile.company_id).eq('is_active', true).order('full_name');
  const userOptions = (users||[]).map(u => `<option value="${u.id}">${u.full_name}${u.department?` (${u.department})`:''}</option>`).join('');
  const sectionTypes = ['executive_summary','company_profile','project_approach','methodology','technical_proposal','pricing','financial_proposal','timeline','project_plan','cv_key_personnel','past_experience','references','quality_assurance','health_safety','environmental','risk_management','bbbee_certificate','tax_clearance','compliance','insurance','terms_conditions'].map(s=>`<option value="${s}">${s.replace(/_/g,' ')}</option>`).join('');
  const modal = document.createElement('div');
  modal.id = 'add-task-modal';
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl"><h3 class="text-lg font-semibold text-white mb-4">Add New Task</h3><div id="add-task-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div><div class="space-y-4"><div><label class="block text-sm text-slate-300 mb-1">Task Title *</label><input id="at-title" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div><div class="grid grid-cols-2 gap-3"><div><label class="block text-sm text-slate-300 mb-1">Section Type</label><select id="at-section" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm"><option value="">— Select —</option>${sectionTypes}</select></div><div><label class="block text-sm text-slate-300 mb-1">Priority</label><select id="at-priority" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm"><option value="0">Normal</option><option value="1">High</option><option value="2">Critical</option></select></div></div><div><label class="block text-sm text-slate-300 mb-1">Assign To</label><select id="at-assign" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm"><option value="">— Unassigned —</option>${userOptions}</select></div><div><label class="block text-sm text-slate-300 mb-1">Description</label><textarea id="at-desc" rows="2" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none"></textarea></div><div><label class="block text-sm text-slate-300 mb-1">Due Date</label><input id="at-due" type="datetime-local" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div><label class="flex items-center gap-2 text-sm text-slate-300"><input id="at-mandatory" type="checkbox" class="rounded" /> Mandatory</label></div><div class="flex gap-3 mt-6"><button id="at-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Add Task</button><button id="at-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#at-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target===modal) modal.remove(); });
  modal.querySelector('#at-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#add-task-error');
    const title = modal.querySelector('#at-title').value.trim();
    if (!title) { errEl.textContent='Title required'; errEl.classList.remove('hidden'); return; }
    const assignTo = modal.querySelector('#at-assign').value || null;
    const { error } = await supabase.from('tasks').insert({ company_id: profile.company_id, tender_id: tenderId, title, section_type: modal.querySelector('#at-section').value||null, description: modal.querySelector('#at-desc').value.trim()||null, priority: parseInt(modal.querySelector('#at-priority').value)||0, assigned_to: assignTo, assigned_by: assignTo?profile.id:null, is_mandatory: modal.querySelector('#at-mandatory').checked, due_date: modal.querySelector('#at-due').value||null, status: assignTo?'assigned':'unassigned' });
    if (error) { errEl.textContent=error.message; errEl.classList.remove('hidden'); return; }
    modal.remove(); window.TF?.toast?.('Task added','success'); renderView(getCurrentRoute());
  });
};

// ── Task Detail ──────────────────────────────────────────────────────────────
function attachTaskDetailHandlers() { const {id} = getRouteParams(); loadTaskDocuments(id); window._loadTaskAssignFields(id); window._loadTaskImages(id); }

async function loadTaskDocuments(taskId) {
  const listEl = document.getElementById('task-documents-list');
  if (!listEl) return;
  const { data: docs } = await supabase.from('documents').select('id,file_name,file_size,doc_type,created_at,storage_path').eq('task_id', taskId).order('created_at',{ascending:false});
  if (!docs?.length) { listEl.innerHTML='<p class="text-sm text-slate-500">No attachments yet.</p>'; return; }
  listEl.innerHTML = docs.map(d=>`<div class="flex items-center justify-between py-2 border-b border-slate-700/30 last:border-0"><div><p class="text-sm text-white">${d.file_name}</p><p class="text-xs text-slate-500">${(d.file_size/1024).toFixed(1)} KB</p></div><button onclick="window._downloadDoc('${d.storage_path}','${d.file_name}')" class="text-xs text-brand-400">Download</button></div>`).join('');
}

window._uploadTaskDoc = async (taskId, input) => {
  const file = input?.files?.[0]; if (!file) return;
  const profile = getProfile();
  const { data: task } = await supabase.from('tasks').select('tender_id').eq('id',taskId).single();
  if (!task) return;
  const storagePath = `${profile.company_id}/${task.tender_id}/${taskId}_${file.name}`;
  const { error } = await supabase.storage.from('tender-documents').upload(storagePath, file, { upsert: true });
  if (error) { window.TF?.toast?.(`Upload failed: ${error.message}`,'error'); return; }
  await supabase.from('documents').insert({ company_id: profile.company_id, tender_id: task.tender_id, task_id: taskId, uploaded_by: profile.id, file_name: file.name, file_type: file.type, file_size: file.size, storage_path: storagePath, doc_type: file.name.toLowerCase().includes('cv')?'cv':'supporting' });
  window.TF?.toast?.('File uploaded','success'); loadTaskDocuments(taskId); input.value='';
};

window._downloadDoc = async (storagePath, fileName) => {
  const { data, error } = await supabase.storage.from('tender-documents').download(storagePath);
  if (error) { window.TF?.toast?.('Download failed','error'); return; }
  const url = URL.createObjectURL(data); const a = document.createElement('a'); a.href=url; a.download=fileName; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
};

// ── Compile View ─────────────────────────────────────────────────────────────
function attachCompileHandlers() { const {id}=getRouteParams(); renderCompileView(id, document.getElementById('view-container')); }

async function renderCompileView(tenderId, container) {
  if (!container) return;
  const { data: tender } = await supabase.from('tenders').select('*,companies(name)').eq('id',tenderId).single();
  if (!tender) { container.innerHTML='<p class="text-red-400">Tender not found.</p>'; return; }
  if (['submitted','archived'].includes(tender.status)) { container.innerHTML=`<div class="view-enter space-y-6"><h1 class="text-xl font-bold text-white">Compile Tender</h1><div class="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6 text-center"><p class="text-emerald-400 font-medium">Already submitted and locked.</p></div><a href="#/tenders/${tenderId}" class="inline-block text-brand-400 text-sm">← Back</a></div>`; return; }
  const { data: tasks } = await supabase.from('tasks').select('id,title,section_type,status,is_mandatory,content,profiles!tasks_assigned_to_fkey(full_name)').eq('tender_id',tenderId).order('priority',{ascending:false});
  const mandatory=(tasks||[]).filter(t=>t.is_mandatory); const mandatoryApproved=mandatory.filter(t=>t.status==='approved'); const allReady=mandatory.length===mandatoryApproved.length;
  const si=(s)=>s==='approved'?'<span class="text-emerald-400">✓</span>':s==='submitted'?'<span class="text-amber-400">⏳</span>':'<span class="text-red-400">✗</span>';
  container.innerHTML=`<div class="view-enter space-y-6"><div><a href="#/tenders/${tenderId}" class="text-xs text-brand-400">← ${tender.title}</a><h1 class="text-xl font-bold text-white mt-2">Compile & Submit</h1></div><div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5"><h3 class="text-sm font-semibold text-white mb-3">Readiness Check</h3><div class="space-y-2">${(tasks||[]).map(t=>`<div class="flex items-center justify-between text-sm"><div class="flex items-center gap-2">${si(t.status)}<span class="${t.is_mandatory?'text-white font-medium':'text-slate-400'}">${t.title}</span>${t.is_mandatory?'<span class="text-[10px] bg-red-500/15 text-red-400 px-1.5 rounded">MANDATORY</span>':''}</div><span class="text-xs text-slate-500">${(t.status||'').replace(/_/g,' ')}</span></div>`).join('')}</div><div class="mt-4 pt-3 border-t border-slate-700/30"><p class="text-xs ${allReady?'text-emerald-400':'text-amber-400'}">${allReady?'✓ Ready to compile':'⚠ '+( mandatory.length-mandatoryApproved.length)+' mandatory section(s) pending'}</p></div></div><div class="flex gap-3"><button id="btn-preview-compile" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Preview & Download</button><button id="btn-submit-tender" class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg ${allReady?'':'opacity-50 cursor-not-allowed'}" ${allReady?'':'disabled'}>Submit & Lock</button></div><div id="compile-status" class="hidden p-4 rounded-xl text-sm"></div></div>`;
  document.getElementById('btn-preview-compile')?.addEventListener('click', async()=>{
    const s=document.getElementById('compile-status'); s.className='p-4 rounded-xl text-sm bg-brand-500/10 border border-brand-500/20 text-brand-400'; s.textContent='Compiling...'; s.classList.remove('hidden');
    try { const r=await compileTender(tenderId); downloadHTML(r.htmlDocument,`${tender.title.replace(/[^a-zA-Z0-9]/g,'_')}_Proposal.html`); s.className='p-4 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'; s.textContent=`✓ Downloaded — ${r.sectionCount} sections`; } catch(err){ s.className='p-4 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400'; s.textContent=`✗ ${err.message}`; }
  });
  document.getElementById('btn-submit-tender')?.addEventListener('click', async()=>{
    if(!allReady) return; if(!confirm('This will lock the tender permanently. Proceed?')) return;
    const s=document.getElementById('compile-status'); s.className='p-4 rounded-xl text-sm bg-amber-500/10 border border-amber-500/20 text-amber-400'; s.textContent='Submitting...'; s.classList.remove('hidden');
    try { const compiled=await compileTender(tenderId); await submitTender(tenderId,compiled.snapshotData); const profile=getProfile(); const blob=new Blob([compiled.htmlDocument],{type:'text/html'}); const cp=`${profile.company_id}/${tenderId}/COMPILED_FINAL.html`; await supabase.storage.from('tender-documents').upload(cp, blob, { upsert: true }); await supabase.from('documents').insert({company_id:profile.company_id,tender_id:tenderId,uploaded_by:profile.id,file_name:'COMPILED_FINAL.html',file_type:'text/html',file_size:blob.size,storage_path:cp,doc_type:'compiled_final',is_locked:true}); downloadHTML(compiled.htmlDocument,`${tender.title.replace(/[^a-zA-Z0-9]/g,'_')}_SUBMITTED.html`); s.className='p-4 rounded-xl text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'; s.textContent='✓ Submitted and locked.'; window.TF?.toast?.('Tender submitted','success'); } catch(err){ s.className='p-4 rounded-xl text-sm bg-red-500/10 border border-red-500/20 text-red-400'; s.textContent=`✗ ${err.message}`; }
  });
}

// ── User/Company Management ──────────────────────────────────────────────────
window._createCompany = async () => {
  if (!isSuperAdmin()) return;
  const modal = document.createElement('div'); modal.className='fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML=`<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl"><h3 class="text-lg font-semibold text-white mb-4">Add New Company</h3><div id="nc-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div><div class="space-y-4"><div><label class="block text-sm text-slate-300 mb-1">Company Name *</label><input id="nc-name" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div><div><label class="block text-sm text-slate-300 mb-1">Slug *</label><input id="nc-slug" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" /><p class="text-xs text-slate-500 mt-1">Users enter this when signing up</p></div><div><label class="block text-sm text-slate-300 mb-1">Domain</label><input id="nc-domain" type="text" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div><div class="flex gap-4"><label class="flex items-center gap-2 text-sm text-slate-300"><input id="nc-ai" type="checkbox" checked /> Enable AI</label><label class="flex items-center gap-2 text-sm text-slate-300"><input id="nc-active" type="checkbox" checked /> Active</label></div></div><div class="flex gap-3 mt-6"><button id="nc-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Create</button><button id="nc-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button></div></div>`;
  document.body.appendChild(modal);
  modal.querySelector('#nc-cancel').addEventListener('click',()=>modal.remove());
  modal.addEventListener('click',(e)=>{if(e.target===modal)modal.remove();});
  modal.querySelector('#nc-name').addEventListener('input',(e)=>{modal.querySelector('#nc-slug').value=e.target.value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');});
  modal.querySelector('#nc-submit').addEventListener('click', async()=>{
    const errEl=modal.querySelector('#nc-error'); errEl.classList.add('hidden');
    const name=modal.querySelector('#nc-name').value.trim(); const slug=modal.querySelector('#nc-slug').value.trim().toLowerCase();
    if(!name||!slug){errEl.textContent='Name and slug required';errEl.classList.remove('hidden');return;}
    const {error}=await supabase.from('companies').insert({name,slug,domain:modal.querySelector('#nc-domain').value.trim()||null,ai_enabled:modal.querySelector('#nc-ai').checked,is_active:modal.querySelector('#nc-active').checked});
    if(error){errEl.textContent=error.message.includes('duplicate')?'Slug already taken':error.message;errEl.classList.remove('hidden');return;}
    modal.remove(); window.TF?.toast?.(`Company "${name}" created`,'success'); renderView(getCurrentRoute());
  });
};

// ── Task Actions ─────────────────────────────────────────────────────────────
window._approveTask = async (taskId) => { await supabase.from('tasks').update({status:'approved'}).eq('id',taskId); window.TF?.toast?.('Task approved','success'); renderView(getCurrentRoute()); };
window._requestRevision = async (taskId) => { const notes=prompt('Revision notes:'); await supabase.from('tasks').update({status:'revision_needed',review_notes:notes||null}).eq('id',taskId); window.TF?.toast?.('Revision requested','success'); renderView(getCurrentRoute()); };
window._startTask = async (taskId) => { await supabase.from('tasks').update({status:'in_progress',started_at:new Date().toISOString()}).eq('id',taskId); window.TF?.toast?.('Task started','success'); renderView(getCurrentRoute()); };

window._uploadTaskImage = async (taskId, input) => {
  const files = Array.from(input?.files || []);
  if (!files.length) return;
  const profile = getProfile();
  const { data: task } = await supabase.from('tasks').select('tender_id').eq('id', taskId).maybeSingle();
  if (!task) return;
  const btn = document.getElementById('img-upload-btn');
  if (btn) { btn.disabled = true; btn.textContent = `Uploading ${files.length} image(s)...`; }
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
  if (btn) { btn.disabled = false; btn.textContent = '+ Add Images'; }
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
  if (!docs?.length) { container.innerHTML = '<p class="text-xs text-slate-500">No images yet.</p>'; return; }
  container.innerHTML = docs.map(d => {
    const url = d.metadata?.public_url || supabase.storage.from('task-images').getPublicUrl(d.storage_path).data.publicUrl;
    return `<div class="relative group">
      <img src="${url}" alt="${d.file_name}" class="w-full h-32 object-cover rounded-lg border border-slate-700/50" />
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-2">
        <button onclick="window._deleteTaskImage('${d.id}', '${d.storage_path}', '${taskId}')" class="text-xs text-red-400 bg-surface-900/80 px-2 py-1 rounded">Delete</button>
      </div>
      <p class="text-xs text-slate-500 mt-1 truncate">${d.file_name}</p>
    </div>`;
  }).join('');
};

window._deleteTaskImage = async (docId, storagePath, taskId) => {
  if (!confirm('Delete this image?')) return;
  await supabase.storage.from('task-images').remove([storagePath]);
  await supabase.from('documents').delete().eq('id', docId);
  window.TF?.toast?.('Image deleted', 'success');
  window._loadTaskImages(taskId);
};

console.log('[TenderFlow] Wiring loaded');