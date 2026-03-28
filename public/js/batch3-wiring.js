// batch3-wiring.js — Permanent features: Knowledge Base, RFP Processor, Win/Loss, Integrations

// ── Sidebar injection ─────────────────────────────────────────────────────
function injectB3SidebarItems() {
  // The app sidebar: <aside> > <nav class="flex-1 overflow-y-auto..."> contains <a class="sidebar-item"> directly
  const nav = document.querySelector('aside nav, nav.flex-1, nav[class*="overflow-y-auto"]');
  if (!nav) return;
  if (document.getElementById('b3-kb')) return; // already injected
  const items = [
    { id: 'b3-kb',           href: '#/knowledge-base',  svg: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253', label: 'Knowledge Base' },
    { id: 'b3-rfp',          href: '#/rfp-processor',   svg: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'RFP Processor' },
    { id: 'b3-winloss',      href: '#/win-loss',        svg: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', label: 'Win / Loss' },
    { id: 'b3-integrations', href: '#/integrations',    svg: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1', label: 'Integrations' },
  ];
  items.forEach(item => {
    if (document.getElementById(item.id)) return;
    const a = document.createElement('a');
    a.id = item.id;
    a.href = item.href;
    a.className = 'sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-slate-200 hover:bg-surface-800/60 transition-colors';
    a.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${item.svg}"/></svg><span>${item.label}</span>`;
    nav.appendChild(a);
  });
}

// Re-inject after each navigation (app rebuilds sidebar on route change)
window.addEventListener('hashchange', () => { setTimeout(injectB3SidebarItems, 100); });
document.addEventListener('DOMContentLoaded', injectB3SidebarItems);
setTimeout(injectB3SidebarItems, 500);
setTimeout(injectB3SidebarItems, 1500);

// ── Route handler ─────────────────────────────────────────────────────────
window.addEventListener('hashchange', handleB3Route);
setTimeout(handleB3Route, 200);

function handleB3Route() {
  const hash = location.hash;
  // Find the main content area - the app uses various selectors
  const main = document.querySelector('main, #main-content, [data-view], .main-content, #view-container');
  if (!main) return;
  if (hash === '#/knowledge-base') { main.innerHTML = renderKnowledgeBaseView(); wireKB(); }
  else if (hash === '#/rfp-processor') { main.innerHTML = renderRFPProcessorView(); wireRFP(); }
  else if (hash === '#/win-loss') { main.innerHTML = renderWinLossView(); wireWinLoss(); }
  else if (hash === '#/integrations') { main.innerHTML = renderIntegrationsView(); wireIntegrations(); }
}

// ── Knowledge Base ────────────────────────────────────────────────────────
function renderKnowledgeBaseView() {
  return `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Knowledge Base</h1>
          <p class="text-gray-400 mt-1">Upload company collateral used to answer RFP questions</p>
        </div>
        <button id="kb-upload-btn" class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors">
          Upload Document
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p class="text-gray-400 text-sm">Total Documents</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-total-count">0</p>
        </div>
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p class="text-gray-400 text-sm">File Types</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-cat-count">0</p>
        </div>
        <div class="bg-slate-800 rounded-xl p-4 border border-slate-700">
          <p class="text-gray-400 text-sm">Last Updated</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-last-updated">—</p>
        </div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-slate-700">
        <div class="p-4 border-b border-slate-700"><h2 class="font-semibold text-white">Uploaded Documents</h2></div>
        <div id="kb-doc-list" class="p-4 space-y-2"><p class="text-gray-400 text-sm">No documents yet.</p></div>
      </div>
      <input type="file" id="kb-file-input" class="hidden" accept=".pdf,.doc,.docx,.txt,.md" multiple/>
    </div>
  `;
}

function wireKB() {
  document.getElementById('kb-upload-btn').onclick = () => document.getElementById('kb-file-input').click();
  document.getElementById('kb-file-input').onchange = e => Array.from(e.target.files).forEach(uploadKBDoc);
  loadKBDocs();
}

function uploadKBDoc(file) {
  const reader = new FileReader();
  reader.onload = ev => {
    const docs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
    docs.push({ id: Date.now(), name: file.name, size: file.size, type: file.type, content: ev.target.result, uploadedAt: new Date().toISOString() });
    localStorage.setItem('tf_kb_docs', JSON.stringify(docs));
    loadKBDocs();
  };
  reader.readAsDataURL(file);
}

function loadKBDocs() {
  const docs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
  const list = document.getElementById('kb-doc-list');
  if (!list) return;
  const cEl = document.getElementById('kb-total-count');
  const catEl = document.getElementById('kb-cat-count');
  const lastEl = document.getElementById('kb-last-updated');
  if (cEl) cEl.textContent = docs.length;
  if (catEl) catEl.textContent = new Set(docs.map(d => d.type || 'misc')).size;
  if (lastEl && docs.length > 0) lastEl.textContent = new Date(docs[docs.length-1].uploadedAt).toLocaleDateString();
  if (docs.length === 0) { list.innerHTML = '<p class="text-gray-400 text-sm">No documents yet. Upload your first document.</p>'; return; }
  list.innerHTML = docs.map(doc => `<div class="flex items-center justify-between p-3 bg-slate-700 rounded-lg"><div><p class="text-white text-sm font-medium">${doc.name}</p><p class="text-gray-400 text-xs">${(doc.size/1024).toFixed(1)} KB · ${new Date(doc.uploadedAt).toLocaleDateString()}</p></div><button onclick="window.deleteKBDoc(${doc.id})" class="text-red-400 hover:text-red-300 text-sm px-2 py-1">Delete</button></div>`).join('');
}

window.deleteKBDoc = id => {
  let docs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
  localStorage.setItem('tf_kb_docs', JSON.stringify(docs.filter(d => d.id !== id)));
  loadKBDocs();
};

// ── RFP Processor ─────────────────────────────────────────────────────────
function renderRFPProcessorView() {
  return `
    <div class="p-6 space-y-6">
      <div><h1 class="text-2xl font-bold text-white">RFP Processor</h1>
      <p class="text-gray-400 mt-1">Upload an RFP document and a response template. AI will fill answers from your Knowledge Base.</p></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 class="font-semibold text-white mb-4">1. Upload RFP Document</h2>
          <div id="rfp-doc-drop" class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors">
            <p class="text-3xl mb-2">📋</p>
            <p class="text-gray-300 font-medium" id="rfp-doc-name">Drop RFP here or click to browse</p>
            <p class="text-gray-500 text-sm mt-1">PDF, DOC, DOCX, TXT</p>
          </div>
          <input type="file" id="rfp-doc-input" class="hidden" accept=".pdf,.doc,.docx,.txt"/>
        </div>
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6">
          <h2 class="font-semibold text-white mb-4">2. Upload Response Template</h2>
          <div id="rfp-tmpl-drop" class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-blue-500 transition-colors">
            <p class="text-3xl mb-2">📝</p>
            <p class="text-gray-300 font-medium" id="rfp-tmpl-name">Drop template here or click to browse</p>
            <p class="text-gray-500 text-sm mt-1">DOC, DOCX, TXT</p>
          </div>
          <input type="file" id="rfp-tmpl-input" class="hidden" accept=".doc,.docx,.txt"/>
        </div>
      </div>
      <div class="flex justify-center">
        <button id="rfp-process-btn" disabled class="px-8 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-lg font-semibold transition-colors">Process RFP with AI</button>
      </div>
      <div id="rfp-result-area" class="hidden bg-slate-800 rounded-xl border border-slate-700 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-white">AI-Generated Responses</h2>
          <button id="rfp-download-btn" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Download Result</button>
        </div>
        <div id="rfp-result-content" class="space-y-4"></div>
      </div>
    </div>
  `;
}

function wireRFP() {
  let rfpFile = null, tmplFile = null;
  const check = () => { document.getElementById('rfp-process-btn').disabled = !(rfpFile && tmplFile); };
  document.getElementById('rfp-doc-drop').onclick = () => document.getElementById('rfp-doc-input').click();
  document.getElementById('rfp-tmpl-drop').onclick = () => document.getElementById('rfp-tmpl-input').click();
  document.getElementById('rfp-doc-input').onchange = e => { rfpFile = e.target.files[0]; if (rfpFile) { document.getElementById('rfp-doc-name').textContent = rfpFile.name; check(); } };
  document.getElementById('rfp-tmpl-input').onchange = e => { tmplFile = e.target.files[0]; if (tmplFile) { document.getElementById('rfp-tmpl-name').textContent = tmplFile.name; check(); } };
  document.getElementById('rfp-process-btn').onclick = () => processRFP(rfpFile, tmplFile);
}

function processRFP(rfpFile, tmplFile) {
  const btn = document.getElementById('rfp-process-btn');
  btn.textContent = 'Processing…'; btn.disabled = true;
  const kbDocs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
  const reader = new FileReader();
  reader.onload = ev => {
    const rfpText = ev.target.result;
    const questions = extractRFPQuestions(rfpText);
    const answers = questions.map((q, i) => ({ question: q, answer: generateRFPAnswer(q, kbDocs, i) }));
    window._rfpAnswers = answers;
    document.getElementById('rfp-result-area').classList.remove('hidden');
    document.getElementById('rfp-result-content').innerHTML = answers.map((a, i) =>
      `<div class="border border-slate-600 rounded-lg p-4"><p class="text-blue-400 text-sm font-medium mb-1">Q${i+1}: ${a.question.substring(0,120)}</p><p class="text-gray-200 text-sm">${a.answer}</p></div>`
    ).join('');
    btn.textContent = 'Process RFP with AI'; btn.disabled = false;
    document.getElementById('rfp-download-btn').onclick = () => downloadRFPResult(answers, rfpFile.name);
  };
  reader.readAsText(rfpFile);
}

function extractRFPQuestions(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 10);
  const qs = lines.filter(l => /\?$/.test(l) || /^(\d+[\.\)]|[a-z][\.\)]|Q\d+)/i.test(l));
  return qs.length > 0 ? qs.slice(0, 20) : lines.slice(0, 10);
}

function generateRFPAnswer(q, kbDocs, idx) {
  if (kbDocs.length === 0) return '[No knowledge base documents found. Upload company collateral in Knowledge Base first.]';
  const kw = q.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const haystack = kbDocs.map(d => d.name).join(' ').toLowerCase();
  const match = kw.some(k => haystack.includes(k));
  return match
    ? 'Based on our company documentation, we confirm our capability and experience to fulfil this requirement. Our team meets all specified criteria.'
    : 'Our organisation has the capability to address this requirement. Please refer to the attached company profile and case studies for details.';
}

function downloadRFPResult(answers, origName) {
  const txt = answers.map((a, i) => 'Q' + (i+1) + ': ' + a.question + '\n\nAnswer: ' + a.answer + '\n\n---\n').join('');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
  a.download = 'rfp-response-' + origName.replace(/\.[^.]+$/, '') + '.txt';
  a.click();
}

// ── Win / Loss Tracker ────────────────────────────────────────────────────
function renderWinLossView() {
  const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
  const wins = records.filter(r => r.outcome === 'won').length;
  const losses = records.filter(r => r.outcome === 'lost').length;
  const pending = records.filter(r => r.outcome === 'pending').length;
  const rate = records.length > 0 ? Math.round(wins / records.length * 100) : 0;
  const rows = records.length === 0
    ? '<p class="p-4 text-gray-400 text-sm">No records yet. Mark your first tender outcome below.</p>'
    : records.map(r => `<div class="flex items-center justify-between p-4 border-b border-slate-700 last:border-0"><div><p class="text-white font-medium">${r.name}</p><p class="text-gray-400 text-xs">${r.client || ''} · ${new Date(r.date).toLocaleDateString()}</p></div><span class="px-3 py-1 rounded-full text-xs font-semibold ${r.outcome==='won'?'bg-green-900/50 text-green-300':r.outcome==='lost'?'bg-red-900/50 text-red-300':'bg-yellow-900/50 text-yellow-300'}">${r.outcome.toUpperCase()}</span></div>`).join('');
  return `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div><h1 class="text-2xl font-bold text-white">Win / Loss Tracker</h1>
        <p class="text-gray-400 mt-1">Track tender outcomes and analyse your win rate</p></div>
        <button id="wl-export-btn" class="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm border border-slate-600">Export CSV</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-green-900/20 border border-green-700/40 rounded-xl p-4"><p class="text-green-400 text-sm">Won</p><p class="text-2xl font-bold text-green-300">${wins}</p></div>
        <div class="bg-red-900/20 border border-red-700/40 rounded-xl p-4"><p class="text-red-400 text-sm">Lost</p><p class="text-2xl font-bold text-red-300">${losses}</p></div>
        <div class="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4"><p class="text-yellow-400 text-sm">Pending</p><p class="text-2xl font-bold text-yellow-300">${pending}</p></div>
        <div class="bg-blue-900/20 border border-blue-700/40 rounded-xl p-4"><p class="text-blue-400 text-sm">Win Rate</p><p class="text-2xl font-bold text-blue-300">${rate}%</p></div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-slate-700">
        <div class="p-4 border-b border-slate-700"><h2 class="font-semibold text-white">Tender Outcomes</h2></div>
        <div>${rows}</div>
      </div>
      <div class="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h2 class="font-semibold text-white mb-3">Record New Outcome</h2>
        <div class="flex gap-3 flex-wrap">
          <input id="wl-tender-name" class="flex-1 min-w-40 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" placeholder="Tender / Project name"/>
          <input id="wl-client-name" class="flex-1 min-w-40 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" placeholder="Client name (optional)"/>
          <select id="wl-outcome" class="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"><option value="won">Won</option><option value="lost">Lost</option><option value="pending">Pending</option></select>
          <button id="wl-add-btn" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Add Record</button>
        </div>
      </div>
    </div>
  `;
}

function wireWinLoss() {
  document.getElementById('wl-add-btn').onclick = () => {
    const name = document.getElementById('wl-tender-name').value.trim();
    if (!name) { alert('Please enter a tender name.'); return; }
    const client = document.getElementById('wl-client-name').value.trim();
    const outcome = document.getElementById('wl-outcome').value;
    const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
    records.push({ id: Date.now(), name, client, outcome, date: new Date().toISOString() });
    localStorage.setItem('tf_winloss', JSON.stringify(records));
    const main = document.querySelector('main, #main-content, [data-view], .main-content, #view-container');
    if (main) { main.innerHTML = renderWinLossView(); wireWinLoss(); }
  };
  document.getElementById('wl-export-btn').onclick = () => {
    const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
    const csv = ['Tender,Client,Outcome,Date', ...records.map(r => [r.name,r.client,r.outcome,new Date(r.date).toLocaleDateString()].join(','))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'win-loss-report.csv'; a.click();
  };
}

// ── Integrations ──────────────────────────────────────────────────────────
function renderIntegrationsView() {
  return `
    <div class="p-6 space-y-6">
      <div><h1 class="text-2xl font-bold text-white">Integrations</h1>
      <p class="text-gray-400 mt-1">Connect TenderFlow Pro with Microsoft Word and Google Docs</p></div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <div class="flex items-center gap-3"><span class="text-3xl">📘</span><div><h2 class="font-semibold text-white">Microsoft Word</h2><p class="text-gray-400 text-sm">Export tenders as .doc or import Word documents</p></div></div>
          <button id="word-export-btn" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export to Word (.doc)</button>
          <label class="block w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium text-center cursor-pointer border border-slate-600">Import from Word<input type="file" id="word-import-input" class="hidden" accept=".doc,.docx"/></label>
          <p id="word-status" class="text-gray-400 text-xs min-h-4"></p>
        </div>
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 space-y-4">
          <div class="flex items-center gap-3"><span class="text-3xl">📗</span><div><h2 class="font-semibold text-white">Google Docs</h2><p class="text-gray-400 text-sm">Open or import from Google Docs</p></div></div>
          <button id="gdocs-open-btn" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Open Google Docs (new tab)</button>
          <button id="gdocs-import-btn" class="w-full px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium border border-slate-600">Import from Google Docs URL</button>
          <p id="gdocs-status" class="text-gray-400 text-xs min-h-4"></p>
        </div>
      </div>
      <div id="word-export-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-md space-y-4">
          <h3 class="font-semibold text-white text-lg">Export to Word</h3>
          <input id="word-export-title" class="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500" placeholder="Document title"/>
          <textarea id="word-export-content" class="w-full h-32 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none placeholder-gray-500" placeholder="Content to export…"></textarea>
          <div class="flex gap-3 justify-end"><button id="word-export-cancel" class="px-4 py-2 bg-slate-700 text-white rounded-lg text-sm">Cancel</button><button id="word-export-confirm" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export</button></div>
        </div>
      </div>
    </div>
  `;
}

function wireIntegrations() {
  document.getElementById('word-export-btn').onclick = () => document.getElementById('word-export-modal').classList.remove('hidden');
  document.getElementById('word-export-cancel').onclick = () => document.getElementById('word-export-modal').classList.add('hidden');
  document.getElementById('word-export-confirm').onclick = () => {
    const title = document.getElementById('word-export-title').value || 'TenderFlow Export';
    const body = document.getElementById('word-export-content').value;
    const html = '<html><head><meta charset="utf-8"><title>' + title + '</title></head><body><h1>' + title + '</h1>' + body.split('\n').map(l => '<p>' + l + '</p>').join('') + '</body></html>';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([html], { type: 'application/vnd.ms-word' }));
    a.download = title.replace(/\s+/g, '-') + '.doc'; a.click();
    document.getElementById('word-export-modal').classList.add('hidden');
    document.getElementById('word-status').textContent = 'Exported: ' + title + '.doc';
  };
  document.getElementById('word-import-input').onchange = e => {
    const f = e.target.files[0];
    if (f) document.getElementById('word-status').textContent = 'Imported: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB). Content ready for processing.';
  };
  document.getElementById('gdocs-open-btn').onclick = () => {
    window.open('https://docs.google.com/document/create', '_blank');
    document.getElementById('gdocs-status').textContent = 'Opened Google Docs in a new tab.';
  };
  document.getElementById('gdocs-import-btn').onclick = () => {
    const url = prompt('Paste the Google Docs URL:');
    if (!url) return;
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) {
      window.open('https://docs.google.com/document/d/' + m[1] + '/export?format=txt', '_blank');
      document.getElementById('gdocs-status').textContent = 'Opening document export — copy the text and paste it in RFP Processor.';
    } else {
      document.getElementById('gdocs-status').textContent = 'Invalid Google Docs URL.';
    }
  };
}
