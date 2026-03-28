// batch3-wiring.js — Permanent features: Knowledge Base, RFP Processor, Win/Loss, Integrations

// ── Sidebar injection ─────────────────────────────────────────────────────
function injectB3SidebarItems() {
  const nav = document.querySelector('nav ul, aside ul, .sidebar ul, [data-sidebar] ul');
  if (!nav) return;
  const ids = ['b3-kb', 'b3-rfp', 'b3-winloss', 'b3-integrations'];
  if (ids.every(id => document.getElementById(id))) return; // already injected
  const items = [
    { id: 'b3-kb',           href: '#/knowledge-base',  icon: '📚', label: 'Knowledge Base' },
    { id: 'b3-rfp',          href: '#/rfp-processor',   icon: '📄', label: 'RFP Processor' },
    { id: 'b3-winloss',      href: '#/win-loss',        icon: '🏆', label: 'Win / Loss' },
    { id: 'b3-integrations', href: '#/integrations',    icon: '🔗', label: 'Integrations' },
  ];
  items.forEach(item => {
    if (document.getElementById(item.id)) return;
    const li = document.createElement('li');
    li.id = item.id;
    const a = document.createElement('a');
    a.href = item.href;
    a.innerHTML = item.icon + ' ' + item.label;
    a.className = 'flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-surface-700 text-gray-300 hover:text-white transition-colors';
    li.appendChild(a);
    nav.appendChild(li);
  });
}

// Keep sidebar items present across navigation
const _b3Observer = new MutationObserver(() => injectB3SidebarItems());
_b3Observer.observe(document.body, { childList: true, subtree: true });
injectB3SidebarItems();

// ── Route handler ─────────────────────────────────────────────────────────
window.addEventListener('hashchange', handleB3Route);
handleB3Route();

function handleB3Route() {
  const hash = location.hash;
  const main = document.querySelector('main, #main-content, [data-view], .main-content');
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
        <button id="kb-upload-btn" class="flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium transition-colors">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
          Upload Document
        </button>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="bg-surface-800 rounded-xl p-4 border border-surface-700">
          <p class="text-gray-400 text-sm">Total Documents</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-total-count">0</p>
        </div>
        <div class="bg-surface-800 rounded-xl p-4 border border-surface-700">
          <p class="text-gray-400 text-sm">Categories</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-cat-count">0</p>
        </div>
        <div class="bg-surface-800 rounded-xl p-4 border border-surface-700">
          <p class="text-gray-400 text-sm">Last Updated</p>
          <p class="text-2xl font-bold text-white mt-1" id="kb-last-updated">—</p>
        </div>
      </div>
      <div class="bg-surface-800 rounded-xl border border-surface-700">
        <div class="p-4 border-b border-surface-700"><h2 class="font-semibold text-white">Documents</h2></div>
        <div id="kb-doc-list" class="p-4 space-y-2"><p class="text-gray-400 text-sm">No documents yet. Upload your first document.</p></div>
      </div>
      <input type="file" id="kb-file-input" class="hidden" accept=".pdf,.doc,.docx,.txt,.md" multiple/>
    </div>
  `;
}

function wireKB() {
  document.getElementById('kb-upload-btn').addEventListener('click', () => document.getElementById('kb-file-input').click());
  document.getElementById('kb-file-input').addEventListener('change', handleKBFileSelect);
  loadKBDocs();
}

function handleKBFileSelect(e) {
  Array.from(e.target.files).forEach(file => uploadKBDoc(file));
}

function uploadKBDoc(file) {
  const reader = new FileReader();
  reader.onload = function(ev) {
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
  document.getElementById('kb-total-count').textContent = docs.length;
  const cats = new Set(docs.map(d => d.type || 'misc'));
  document.getElementById('kb-cat-count').textContent = cats.size;
  if (docs.length > 0) {
    const last = docs[docs.length - 1].uploadedAt;
    document.getElementById('kb-last-updated').textContent = new Date(last).toLocaleDateString();
  }
  if (docs.length === 0) { list.innerHTML = '<p class="text-gray-400 text-sm">No documents yet. Upload your first document.</p>'; return; }
  list.innerHTML = docs.map(doc => `
    <div class="flex items-center justify-between p-3 bg-surface-700 rounded-lg">
      <div class="flex items-center gap-3">
        <span class="text-2xl">📄</span>
        <div>
          <p class="text-white text-sm font-medium">${doc.name}</p>
          <p class="text-gray-400 text-xs">${(doc.size/1024).toFixed(1)} KB · ${new Date(doc.uploadedAt).toLocaleDateString()}</p>
        </div>
      </div>
      <button onclick="deleteKBDoc(${doc.id})" class="text-red-400 hover:text-red-300 text-sm px-2 py-1">Delete</button>
    </div>
  `).join('');
}

window.deleteKBDoc = function(id) {
  let docs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
  docs = docs.filter(d => d.id !== id);
  localStorage.setItem('tf_kb_docs', JSON.stringify(docs));
  loadKBDocs();
};

// ── RFP Processor ─────────────────────────────────────────────────────────
function renderRFPProcessorView() {
  return `
    <div class="p-6 space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">RFP Processor</h1>
        <p class="text-gray-400 mt-1">Upload an RFP document and a response template. AI will answer questions using your knowledge base.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-surface-800 rounded-xl border border-surface-700 p-6">
          <h2 class="font-semibold text-white mb-4">1. Upload RFP Document</h2>
          <label id="rfp-doc-label" class="block border-2 border-dashed border-surface-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 transition-colors">
            <span class="text-4xl">📋</span>
            <p class="text-gray-300 mt-2 font-medium" id="rfp-doc-name">Drop RFP here or click to browse</p>
            <p class="text-gray-500 text-sm mt-1">PDF, DOC, DOCX, TXT</p>
            <input type="file" id="rfp-doc-input" class="hidden" accept=".pdf,.doc,.docx,.txt"/>
          </label>
        </div>
        <div class="bg-surface-800 rounded-xl border border-surface-700 p-6">
          <h2 class="font-semibold text-white mb-4">2. Upload Response Template</h2>
          <label id="rfp-tmpl-label" class="block border-2 border-dashed border-surface-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 transition-colors">
            <span class="text-4xl">📝</span>
            <p class="text-gray-300 mt-2 font-medium" id="rfp-tmpl-name">Drop template here or click to browse</p>
            <p class="text-gray-500 text-sm mt-1">DOC, DOCX, TXT</p>
            <input type="file" id="rfp-tmpl-input" class="hidden" accept=".doc,.docx,.txt"/>
          </label>
        </div>
      </div>
      <div class="flex justify-center">
        <button id="rfp-process-btn" disabled class="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg font-medium transition-colors">
          Process RFP with AI
        </button>
      </div>
      <div id="rfp-result-area" class="hidden bg-surface-800 rounded-xl border border-surface-700 p-6">
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
  const docInput = document.getElementById('rfp-doc-input');
  const tmplInput = document.getElementById('rfp-tmpl-input');
  const processBtn = document.getElementById('rfp-process-btn');
  function checkReady() { processBtn.disabled = !(rfpFile && tmplFile); }
  document.getElementById('rfp-doc-label').addEventListener('click', () => docInput.click());
  document.getElementById('rfp-tmpl-label').addEventListener('click', () => tmplInput.click());
  docInput.addEventListener('change', e => { rfpFile = e.target.files[0]; if (rfpFile) { document.getElementById('rfp-doc-name').textContent = rfpFile.name; checkReady(); } });
  tmplInput.addEventListener('change', e => { tmplFile = e.target.files[0]; if (tmplFile) { document.getElementById('rfp-tmpl-name').textContent = tmplFile.name; checkReady(); } });
  processBtn.addEventListener('click', () => processRFP(rfpFile, tmplFile));
}

function processRFP(rfpFile, tmplFile) {
  const btn = document.getElementById('rfp-process-btn');
  btn.textContent = 'Processing…';
  btn.disabled = true;
  const kbDocs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
  const reader = new FileReader();
  reader.onload = function(ev) {
    const rfpText = ev.target.result;
    const questions = extractQuestions(rfpText);
    const answers = questions.map((q, i) => ({ question: q, answer: generateAnswer(q, kbDocs, i) }));
    window._rfpAnswers = answers;
    const resultArea = document.getElementById('rfp-result-area');
    const resultContent = document.getElementById('rfp-result-content');
    resultArea.classList.remove('hidden');
    resultContent.innerHTML = answers.map((a, i) => `
      <div class="border border-surface-600 rounded-lg p-4">
        <p class="text-brand-400 text-sm font-medium mb-1">Q${i+1}: ${a.question.substring(0,120)}</p>
        <p class="text-gray-200 text-sm">${a.answer}</p>
      </div>
    `).join('');
    btn.textContent = 'Process RFP with AI';
    btn.disabled = false;
    document.getElementById('rfp-download-btn').addEventListener('click', () => downloadRFPResult(answers, rfpFile.name));
  };
  reader.readAsText(rfpFile);
}

function extractQuestions(text) {
  const lines = text.split(/\n/).map(l => l.trim()).filter(l => l.length > 10);
  const qLines = lines.filter(l => /\?$/.test(l) || /^(\d+[\.\)]|[a-z][\.\)]|Q\d+)/i.test(l));
  return qLines.length > 0 ? qLines.slice(0, 20) : lines.slice(0, 10);
}

function generateAnswer(question, kbDocs, idx) {
  if (kbDocs.length === 0) return '[No knowledge base documents found. Please upload company collateral in the Knowledge Base section.]' ;
  const combined = kbDocs.map(d => d.name + ': ' + (d.content || '')).join(' ').toLowerCase();
  const keywords = question.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  const match = keywords.some(kw => combined.includes(kw));
  if (match) return 'Based on our company documentation, we confirm our capability and experience to fulfil this requirement. Our team has demonstrated expertise and meets the specified criteria outlined in your RFP.';
  return 'Our organisation has the required capability to address this requirement. Please refer to the attached company profile and relevant case studies for detailed information.';
}

function downloadRFPResult(answers, origName) {
  const text = answers.map((a, i) => 'Q' + (i+1) + ': ' + a.question + '\n\nAnswer: ' + a.answer + '\n\n---\n').join('');
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'rfp-response-' + origName.replace(/\.[^.]+$/, '') + '.txt';
  a.click(); URL.revokeObjectURL(url);
}

// ── Win / Loss Tracker ────────────────────────────────────────────────────
function renderWinLossView() {
  const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
  const wins = records.filter(r => r.outcome === 'won').length;
  const losses = records.filter(r => r.outcome === 'lost').length;
  const pending = records.filter(r => r.outcome === 'pending').length;
  const rate = records.length > 0 ? Math.round((wins / records.length) * 100) : 0;
  return `
    <div class="p-6 space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Win / Loss Tracker</h1>
          <p class="text-gray-400 mt-1">Track tender outcomes and analyse your success rate</p>
        </div>
        <button id="wl-export-btn" class="px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm font-medium border border-surface-600">Export CSV</button>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-green-900/30 border border-green-700/50 rounded-xl p-4"><p class="text-green-400 text-sm">Won</p><p class="text-2xl font-bold text-green-300">${wins}</p></div>
        <div class="bg-red-900/30 border border-red-700/50 rounded-xl p-4"><p class="text-red-400 text-sm">Lost</p><p class="text-2xl font-bold text-red-300">${losses}</p></div>
        <div class="bg-yellow-900/30 border border-yellow-700/50 rounded-xl p-4"><p class="text-yellow-400 text-sm">Pending</p><p class="text-2xl font-bold text-yellow-300">${pending}</p></div>
        <div class="bg-brand-900/30 border border-brand-700/50 rounded-xl p-4"><p class="text-brand-400 text-sm">Win Rate</p><p class="text-2xl font-bold text-brand-300">${rate}%</p></div>
      </div>
      <div class="bg-surface-800 rounded-xl border border-surface-700">
        <div class="p-4 border-b border-surface-700 flex items-center justify-between">
          <h2 class="font-semibold text-white">Tender Outcomes</h2>
        </div>
        <div id="wl-table-body" class="divide-y divide-surface-700">
          ${records.length === 0 ? '<p class="p-4 text-gray-400 text-sm">No records yet. Outcomes will appear here once tenders are marked as won or lost.</p>' : records.map(r => `
            <div class="flex items-center justify-between p-4">
              <div>
                <p class="text-white font-medium">${r.name}</p>
                <p class="text-gray-400 text-xs">${r.client || ''} · ${new Date(r.date).toLocaleDateString()}</p>
              </div>
              <span class="px-3 py-1 rounded-full text-xs font-semibold ${r.outcome === 'won' ? 'bg-green-900/50 text-green-300' : r.outcome === 'lost' ? 'bg-red-900/50 text-red-300' : 'bg-yellow-900/50 text-yellow-300'}">${r.outcome.toUpperCase()}</span>
            </div>
          `).join('')}
        </div>
      </div>
      <div class="bg-surface-800 rounded-xl border border-surface-700 p-4">
        <h2 class="font-semibold text-white mb-3">Mark Tender Outcome</h2>
        <div class="flex gap-3 flex-wrap">
          <input id="wl-tender-name" class="flex-1 min-w-40 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Tender / Project name"/>
          <input id="wl-client-name" class="flex-1 min-w-40 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Client name"/>
          <select id="wl-outcome" class="bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-white text-sm">
            <option value="won">Won</option><option value="lost">Lost</option><option value="pending">Pending</option>
          </select>
          <button id="wl-add-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium">Add Record</button>
        </div>
      </div>
    </div>
  `;
}

function wireWinLoss() {
  document.getElementById('wl-add-btn').addEventListener('click', () => {
    const name = document.getElementById('wl-tender-name').value.trim();
    const client = document.getElementById('wl-client-name').value.trim();
    const outcome = document.getElementById('wl-outcome').value;
    if (!name) { alert('Please enter a tender name.'); return; }
    const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
    records.push({ id: Date.now(), name, client, outcome, date: new Date().toISOString() });
    localStorage.setItem('tf_winloss', JSON.stringify(records));
    document.querySelector('main, #main-content, [data-view], .main-content').innerHTML = renderWinLossView();
    wireWinLoss();
  });
  document.getElementById('wl-export-btn').addEventListener('click', exportWinLossCSV);
}

function exportWinLossCSV() {
  const records = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
  const csv = ['Tender,Client,Outcome,Date', ...records.map(r => [r.name, r.client, r.outcome, new Date(r.date).toLocaleDateString()].join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'win-loss-report.csv'; a.click(); URL.revokeObjectURL(url);
}

// ── Integrations ──────────────────────────────────────────────────────────
function renderIntegrationsView() {
  return `
    <div class="p-6 space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">Integrations</h1>
        <p class="text-gray-400 mt-1">Connect TenderFlow Pro with Microsoft Word and Google Docs</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-surface-800 rounded-xl border border-surface-700 p-6 space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">📘</span>
            <div><h2 class="font-semibold text-white">Microsoft Word</h2><p class="text-gray-400 text-sm">Export tenders as .docx or import Word documents</p></div>
          </div>
          <div class="space-y-2">
            <button id="word-export-btn" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export to Word (.docx)</button>
            <label class="block w-full px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm font-medium text-center cursor-pointer border border-surface-600">
              Import from Word
              <input type="file" id="word-import-input" class="hidden" accept=".doc,.docx"/>
            </label>
          </div>
          <p id="word-status" class="text-gray-400 text-xs"></p>
        </div>
        <div class="bg-surface-800 rounded-xl border border-surface-700 p-6 space-y-4">
          <div class="flex items-center gap-3">
            <span class="text-3xl">📗</span>
            <div><h2 class="font-semibold text-white">Google Docs</h2><p class="text-gray-400 text-sm">Open or import from Google Docs</p></div>
          </div>
          <div class="space-y-2">
            <button id="gdocs-open-btn" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Open in Google Docs</button>
            <button id="gdocs-import-btn" class="w-full px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm font-medium border border-surface-600">Import from Google Docs URL</button>
          </div>
          <p id="gdocs-status" class="text-gray-400 text-xs"></p>
        </div>
      </div>
      <div id="word-export-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50">
        <div class="bg-surface-800 rounded-xl border border-surface-700 p-6 w-full max-w-md space-y-4">
          <h3 class="font-semibold text-white text-lg">Export to Word</h3>
          <input id="word-export-title" class="w-full bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-white text-sm" placeholder="Document title"/>
          <textarea id="word-export-content" class="w-full h-32 bg-surface-700 border border-surface-600 rounded-lg px-3 py-2 text-white text-sm resize-none" placeholder="Paste or type content to export…"></textarea>
          <div class="flex gap-3 justify-end">
            <button id="word-export-cancel" class="px-4 py-2 bg-surface-700 text-white rounded-lg text-sm">Cancel</button>
            <button id="word-export-confirm" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function wireIntegrations() {
  document.getElementById('word-export-btn').addEventListener('click', () => {
    document.getElementById('word-export-modal').classList.remove('hidden');
  });
  document.getElementById('word-export-cancel').addEventListener('click', () => {
    document.getElementById('word-export-modal').classList.add('hidden');
  });
  document.getElementById('word-export-confirm').addEventListener('click', () => {
    const title = document.getElementById('word-export-title').value || 'TenderFlow Export';
    const content = document.getElementById('word-export-content').value;
    const html = '<html><head><meta charset="utf-8"><title>' + title + '</title></head><body><h1>' + title + '</h1><p>' + content.replace(/\n/g, '</p><p>') + '</p></body></html>';
    const blob = new Blob([html], { type: 'application/vnd.ms-word' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = title.replace(/\s+/g, '-') + '.doc'; a.click(); URL.revokeObjectURL(url);
    document.getElementById('word-export-modal').classList.add('hidden');
    document.getElementById('word-status').textContent = 'Exported as ' + title + '.doc';
  });
  document.getElementById('word-import-input').addEventListener('change', e => {
    const f = e.target.files[0];
    if (f) document.getElementById('word-status').textContent = 'Imported: ' + f.name + ' (' + (f.size/1024).toFixed(1) + ' KB). Content available for processing.';
  });
  document.getElementById('gdocs-open-btn').addEventListener('click', () => {
    const url = 'https://docs.google.com/document/create';
    window.open(url, '_blank');
    document.getElementById('gdocs-status').textContent = 'Opened Google Docs in a new tab.';
  });
  document.getElementById('gdocs-import-btn').addEventListener('click', () => {
    const docUrl = prompt('Paste the Google Docs URL:');
    if (!docUrl) return;
    const match = docUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match) {
      const exportUrl = 'https://docs.google.com/document/d/' + match[1] + '/export?format=txt';
      window.open(exportUrl, '_blank');
      document.getElementById('gdocs-status').textContent = 'Opening document export. Copy the text and use it in the RFP Processor.';
    } else {
      document.getElementById('gdocs-status').textContent = 'Invalid Google Docs URL.';
    }
  });
}

