'knowledge-base': async function() {
    const allDocs    = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
    const companyDocs = allDocs.filter(d => d.category === 'company' || !d.category);
    const tenderDocs  = allDocs.filter(d => d.category === 'tender');

    window._deleteKBDoc = id => {
      const d = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]').filter(x => x.id !== id);
      localStorage.setItem('tf_kb_docs', JSON.stringify(d));
      const route = getCurrentRoute();
      if (route) refreshView(route);
    };

    window._uploadKBDocs = (files, category) => {
      Array.from(files).forEach(f => {
        const rd = new FileReader();
        rd.onload = ev => {
          const d = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
          d.push({ id: Date.now() + Math.random(), name: f.name, size: f.size, type: f.type, category: category || 'company', content: ev.target.result, uploadedAt: new Date().toISOString() });
          localStorage.setItem('tf_kb_docs', JSON.stringify(d));
        };
        rd.onloadend = () => { const route = getCurrentRoute(); if (route) refreshView(route); };
        rd.readAsDataURL(f);
      });
    };

    window._showKBUploadModal = () => {
      const modal = document.createElement('div');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
      modal.innerHTML = `
        <div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <h3 class="text-lg font-semibold text-white mb-1">Upload to Knowledge Base</h3>
          <p class="text-xs text-slate-500 mb-4">Choose a category before uploading.</p>
          <div class="space-y-4">
            <div>
              <label class="block text-sm text-slate-300 mb-2">Category</label>
              <div class="grid grid-cols-2 gap-3">
                <button id="kb-cat-company" onclick="window._selectKBCategory('company')"
                  class="kb-cat-btn flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-brand-500 bg-brand-500/10 text-brand-400 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
                  <span class="text-sm font-medium">Company Documents</span>
                  <span class="text-xs text-slate-500 text-center">Profiles, certs, capabilities</span>
                </button>
                <button id="kb-cat-tender" onclick="window._selectKBCategory('tender')"
                  class="kb-cat-btn flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-transparent bg-surface-700 text-slate-400 hover:border-slate-500 transition">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                  <span class="text-sm font-medium">Past Tenders</span>
                  <span class="text-xs text-slate-500 text-center">Previous proposals & bids</span>
                </button>
              </div>
            </div>
            <div>
              <label class="block text-sm text-slate-300 mb-1">Select Files</label>
              <input id="kb-upload-input" type="file" accept=".pdf,.doc,.docx,.txt,.md" multiple
                class="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-brand-500/20 file:text-brand-400 hover:file:bg-brand-500/30" />
            </div>
          </div>
          <div class="flex gap-3 mt-5">
            <button onclick="window._confirmKBUpload()" class="flex-1 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Upload</button>
            <button onclick="this.closest('.fixed').remove()" class="px-4 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Cancel</button>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
      window._selectedKBCategory = 'company';
    };

    window._selectKBCategory = (cat) => {
      window._selectedKBCategory = cat;
      document.querySelectorAll('.kb-cat-btn').forEach(btn => {
        btn.classList.remove('border-brand-500', 'bg-brand-500/10', 'text-brand-400');
        btn.classList.add('border-transparent', 'bg-surface-700', 'text-slate-400');
      });
      const active = document.getElementById(`kb-cat-${cat}`);
      if (active) {
        active.classList.add('border-brand-500', 'bg-brand-500/10', 'text-brand-400');
        active.classList.remove('border-transparent', 'bg-surface-700', 'text-slate-400');
      }
    };

    window._confirmKBUpload = () => {
      const input = document.getElementById('kb-upload-input');
      const files = input?.files;
      if (!files || files.length === 0) { window.TF?.toast?.('Please select at least one file', 'warning'); return; }
      window._uploadKBDocs(files, window._selectedKBCategory || 'company');
      document.querySelector('.fixed.inset-0')?.remove();
      window.TF?.toast?.(`${files.length} file(s) uploaded to ${window._selectedKBCategory === 'tender' ? 'Past Tenders' : 'Company Documents'}`, 'success');
    };

    function docRow(d) {
      return `<div class="flex items-center justify-between p-3 bg-surface-700/60 rounded-lg">
        <div class="min-w-0">
          <p class="text-white text-sm font-medium truncate">${d.name}</p>
          <p class="text-slate-400 text-xs">${(d.size/1024).toFixed(1)} KB · ${new Date(d.uploadedAt).toLocaleDateString()}</p>
        </div>
        <button onclick="window._deleteKBDoc(${d.id})" class="text-red-400 hover:text-red-300 text-xs px-2 py-1 rounded hover:bg-red-500/10 transition ml-3 shrink-0">Delete</button>
      </div>`;
    }

    return `<div class="space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold text-white">Knowledge Base</h1>
          <p class="text-slate-400 mt-1">Company documents and past tenders used to answer RFP questions</p>
        </div>
        <button onclick="window._showKBUploadModal()" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg font-medium flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Upload Document
        </button>
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div class="bg-surface-800 rounded-xl p-4 border border-slate-700"><p class="text-slate-400 text-sm">Total Documents</p><p class="text-2xl font-bold text-white">${allDocs.length}</p></div>
        <div class="bg-surface-800 rounded-xl p-4 border border-slate-700"><p class="text-slate-400 text-sm">Company Docs</p><p class="text-2xl font-bold text-brand-400">${companyDocs.length}</p></div>
        <div class="bg-surface-800 rounded-xl p-4 border border-slate-700"><p class="text-slate-400 text-sm">Past Tenders</p><p class="text-2xl font-bold text-violet-400">${tenderDocs.length}</p></div>
      </div>
      <div class="bg-surface-800 rounded-xl border border-slate-700">
        <div class="p-4 border-b border-slate-700 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-brand-400"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
            <h2 class="font-semibold text-white">Company Documents</h2>
            <span class="text-xs text-slate-500 bg-slate-700/60 px-2 py-0.5 rounded-full">${companyDocs.length}</span>
          </div>
          <p class="text-xs text-slate-500">Profiles, certificates, capabilities, case studies</p>
        </div>
        <div class="p-4 space-y-2">
          ${companyDocs.length > 0 ? companyDocs.map(docRow).join('') : '<p class="text-slate-500 text-sm text-center py-4">No company documents yet. Upload your company profile, B-BBEE certificate, tax clearance, etc.</p>'}
        </div>
      </div>
      <div class="bg-surface-800 rounded-xl border border-slate-700">
        <div class="p-4 border-b border-slate-700 flex items-center justify-between">
          <div class="flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-violet-400"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <h2 class="font-semibold text-white">Past Tenders</h2>
            <span class="text-xs text-slate-500 bg-slate-700/60 px-2 py-0.5 rounded-full">${tenderDocs.length}</span>
          </div>
          <p class="text-xs text-slate-500">Previous proposals and bid responses</p>
        </div>
        <div class="p-4 space-y-2">
          ${tenderDocs.length > 0 ? tenderDocs.map(docRow).join('') : '<p class="text-slate-500 text-sm text-center py-4">No past tenders yet. Upload previous proposals to improve AI responses.</p>'}
        </div>
      </div>
    </div>`;
  },
  'rfp-processor': async function() {
    window._rfpS = {};
    window._setRFP = (k, f) => {
      window._rfpS[k] = f;
      document.getElementById('rfp-' + k + '-lbl').textContent = f.name;
      const btn = document.getElementById('rfp-btn');
      if (btn) btn.disabled = !(window._rfpS.rfp && window._rfpS.tmpl);
    };
    window._doRFP = async () => {
      const btn = document.getElementById('rfp-btn');
      btn.textContent = 'Processing…'; btn.disabled = true;
      const kb = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');

      try {
        // Use PDF.js for PDFs, mammoth for Word docs, plain text for txt
        let extractedText = '';
        const file = window._rfpS.rfp;

        if (file.type === 'application/pdf') {
          const pdfjs = window.pdfjsLib;
          if (!pdfjs) throw new Error('PDF.js not loaded');
          if (!pdfjs.GlobalWorkerOptions.workerSrc) {
            pdfjs.GlobalWorkerOptions.workerSrc =
              'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
          }
          const arrayBuffer = await file.arrayBuffer();
          const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
          for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // Filter out garbage characters — only keep printable ASCII and common unicode
            const pageText = content.items
              .map(item => item.str)
              .join(' ')
              .replace(/[^\x20-\x7E\u00A0-\u024F\u2000-\u206F\n\r\t]/g, ' ')
              .replace(/\s{3,}/g, ' ')
              .trim();
            if (pageText.length > 20) extractedText += pageText + '\n\n';
          }
        } else if (file.name.endsWith('.docx') || file.type.includes('wordprocessingml')) {
          const mammoth = await import('https://esm.sh/mammoth@1.6.0');
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          extractedText = result.value;
        } else {
          extractedText = await file.text();
        }

        // Clean up extracted text
        extractedText = extractedText
          .replace(/[^\x20-\x7E\u00A0-\u024F\n\r\t]/g, ' ')
          .replace(/[ \t]{3,}/g, '  ')
          .replace(/\n{4,}/g, '\n\n')
          .trim();

        if (extractedText.length < 50) {
          throw new Error('Could not extract readable text from this document. The PDF may use custom fonts or be image-based. Try a Word (.docx) version instead.');
        }

        // Extract questions using AI
        const { data: { session } } = await supabase.auth.getSession();
        const kbContext = kb.length > 0
          ? `Company Knowledge Base documents available: ${kb.map(d => d.name).join(', ')}`
          : 'No Knowledge Base documents uploaded yet.';

        const { data: aiResult } = await supabase.functions.invoke('ai-chat', {
          body: {
            system: `You are a tender response specialist. You will be given an RFP document and must:
1. Extract all questions, requirements, and sections that need a response
2. Generate professional answers based on the company knowledge base context provided
3. Return ONLY a JSON array like this:
[{"question": "requirement text here", "answer": "professional response here"}, ...]
Extract up to 20 key questions/requirements. Keep answers professional and concise.
${kbContext}`,
            messages: [{
              role: 'user',
              content: `Process this RFP document and extract questions with answers:\n\n${extractedText.substring(0, 12000)}`,
            }],
            max_tokens: 2000,
          },
        });

        let questions = [];
        if (aiResult?.content?.[0]?.text) {
          try {
            const raw = aiResult.content[0].text;
            const jsonMatch = raw.match(/\[[\s\S]*\]/);
            if (jsonMatch) questions = JSON.parse(jsonMatch[0]);
          } catch (e) {
            // AI parse failed — fall back to line-based extraction
          }
        }

        // Fallback: line-based extraction if AI fails
        if (questions.length === 0) {
          const lines = extractedText.split(/\n/).map(l => l.trim()).filter(l => l.length > 15);
          const qs = lines.filter(l => /\?$/.test(l) || /^(\d+[\.\)]|\([a-z]\))/i.test(l)).slice(0, 20);
          const source = qs.length > 0 ? qs : lines.slice(0, 15);
          questions = source.map(q => ({
            question: q,
            answer: kb.length
              ? 'Based on our company documentation, we confirm our capability and experience to fulfil this requirement. Our team meets all specified criteria.'
              : '[Upload Knowledge Base documents for AI-generated answers.]',
          }));
        }

        window._rfpAns = questions.map(q => ({ q: q.question, a: q.answer }));
        document.getElementById('rfp-result').classList.remove('hidden');
        document.getElementById('rfp-content').innerHTML = window._rfpAns.map((x, i) =>
          `<div class="border border-slate-700 rounded-lg p-4">
            <p class="text-brand-400 text-sm font-medium mb-1">Q${i+1}: ${x.q.substring(0, 200)}</p>
            <p class="text-slate-200 text-sm leading-relaxed">${x.a}</p>
          </div>`
        ).join('');

      } catch (err) {
        document.getElementById('rfp-result').classList.remove('hidden');
        document.getElementById('rfp-content').innerHTML = `
          <div class="border border-red-500/20 bg-red-500/10 rounded-lg p-4">
            <p class="text-red-400 text-sm font-medium">Processing failed</p>
            <p class="text-slate-300 text-sm mt-1">${err.message}</p>
          </div>`;
      }

      btn.textContent = 'Process RFP with AI'; btn.disabled = false;
    };
    window._dlRFP = () => {
      if (!window._rfpAns) return;
      const txt = window._rfpAns.map((x, i) => 'Q' + (i+1) + ': ' + x.q + '\n\nAnswer: ' + x.a + '\n\n---\n').join('');
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/plain' }));
      a.download = 'rfp-response.txt';
      a.click();
    };
    return `<div class="space-y-6">
      <div>
        <h1 class="text-2xl font-bold text-white">RFP Processor</h1>
        <p class="text-slate-400 mt-1">Upload an RFP document and a response template. AI fills answers from your Knowledge Base.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-surface-800 rounded-xl border border-slate-700 p-6">
          <h2 class="font-semibold text-white mb-4">1. Upload RFP Document</h2>
          <div onclick="document.getElementById('rfp-doc-in').click()" class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 transition-colors">
            <p class="text-3xl mb-2">📋</p>
            <p class="text-slate-300 font-medium" id="rfp-rfp-lbl">Drop RFP here or click to browse</p>
            <p class="text-slate-500 text-sm mt-1">PDF, DOC, DOCX, TXT</p>
          </div>
          <input type="file" id="rfp-doc-in" class="hidden" accept=".pdf,.doc,.docx,.txt" onchange="window._setRFP('rfp', this.files[0])"/>
        </div>
        <div class="bg-surface-800 rounded-xl border border-slate-700 p-6">
          <h2 class="font-semibold text-white mb-4">2. Upload Response Template</h2>
          <div onclick="document.getElementById('rfp-tmpl-in').click()" class="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center cursor-pointer hover:border-brand-500 transition-colors">
            <p class="text-3xl mb-2">📝</p>
            <p class="text-slate-300 font-medium" id="rfp-tmpl-lbl">Drop template here or click to browse</p>
            <p class="text-slate-500 text-sm mt-1">DOC, DOCX, TXT</p>
          </div>
          <input type="file" id="rfp-tmpl-in" class="hidden" accept=".doc,.docx,.txt" onchange="window._setRFP('tmpl', this.files[0])"/>
        </div>
      </div>
      <div class="flex justify-center">
        <button id="rfp-btn" disabled onclick="window._doRFP()" class="px-8 py-3 bg-brand-500 hover:bg-brand-600 disabled:opacity-40 text-white rounded-lg font-semibold">Process RFP with AI</button>
      </div>
      <div id="rfp-result" class="hidden bg-surface-800 rounded-xl border border-slate-700 p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="font-semibold text-white">AI-Generated Responses</h2>
          <button onclick="window._dlRFP()" class="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Download Result</button>
        </div>
        <div id="rfp-content" class="space-y-4"></div>
      </div>
    </div>`;
  },
  'win-loss': async function() {
    const recs = JSON.parse(localStorage.getItem('tf_winloss') || '[]');
    const wins=recs.filter(r=>r.outcome==='won').length, losses=recs.filter(r=>r.outcome==='lost').length, pend=recs.filter(r=>r.outcome==='pending').length;
    const rate=recs.length>0?Math.round(wins/recs.length*100):0;
    const rows=recs.length===0?'<p class="p-4 text-slate-500 text-sm">No records yet.</p>':recs.map(r=>`<div class="flex items-center justify-between p-4 border-b border-slate-700 last:border-0"><div><p class="text-white font-medium">${r.name}</p><p class="text-slate-400 text-xs">${r.client||''}${r.client?' · ':''}${new Date(r.date).toLocaleDateString()}</p></div><span class="px-3 py-1 rounded-full text-xs font-semibold ${r.outcome==='won'?'bg-green-900/50 text-green-300':r.outcome==='lost'?'bg-red-900/50 text-red-300':'bg-yellow-900/50 text-yellow-300'}">${r.outcome.toUpperCase()}</span></div>`).join('');
    window._addWL = () => { const n=document.getElementById('wl-name').value.trim(); if(!n){alert('Enter tender name');return;} const c=document.getElementById('wl-client').value.trim(),o=document.getElementById('wl-out').value; const d=JSON.parse(localStorage.getItem('tf_winloss')||'[]'); d.push({id:Date.now(),name:n,client:c,outcome:o,date:new Date().toISOString()}); localStorage.setItem('tf_winloss',JSON.stringify(d)); navigate('/win-loss'); };
    window._exportWL = () => { const d=JSON.parse(localStorage.getItem('tf_winloss')||'[]'); const csv=['Tender,Client,Outcome,Date',...d.map(r=>[r.name,r.client||'',r.outcome,new Date(r.date).toLocaleDateString()].join(','))].join('\n'); const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download='win-loss.csv'; a.click(); };
    return `<div class="space-y-6"><div class="flex items-center justify-between"><div><h1 class="text-2xl font-bold text-white">Win / Loss Tracker</h1><p class="text-slate-400 mt-1">Track tender outcomes and analyse your win rate</p></div><button onclick="window._exportWL()" class="px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm border border-slate-600">Export CSV</button></div><div class="grid grid-cols-2 md:grid-cols-4 gap-4"><div class="bg-green-900/20 border border-green-700/40 rounded-xl p-4"><p class="text-green-400 text-sm">Won</p><p class="text-2xl font-bold text-green-300">${wins}</p></div><div class="bg-red-900/20 border border-red-700/40 rounded-xl p-4"><p class="text-red-400 text-sm">Lost</p><p class="text-2xl font-bold text-red-300">${losses}</p></div><div class="bg-yellow-900/20 border border-yellow-700/40 rounded-xl p-4"><p class="text-yellow-400 text-sm">Pending</p><p class="text-2xl font-bold text-yellow-300">${pend}</p></div><div class="bg-brand-900/20 border border-brand-700/40 rounded-xl p-4"><p class="text-brand-400 text-sm">Win Rate</p><p class="text-2xl font-bold text-brand-300">${rate}%</p></div></div><div class="bg-surface-800 rounded-xl border border-slate-700"><div class="p-4 border-b border-slate-700"><h2 class="font-semibold text-white">Tender Outcomes</h2></div><div>${rows}</div></div><div class="bg-surface-800 rounded-xl border border-slate-700 p-4"><h2 class="font-semibold text-white mb-3">Record New Outcome</h2><div class="flex gap-3 flex-wrap"><input id="wl-name" class="flex-1 min-w-40 bg-surface-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500" placeholder="Tender / Project name"/><input id="wl-client" class="flex-1 min-w-40 bg-surface-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500" placeholder="Client name (optional)"/><select id="wl-out" class="bg-surface-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm"><option value="won">Won</option><option value="lost">Lost</option><option value="pending">Pending</option></select><button onclick="window._addWL()" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg text-sm font-medium">Add Record</button></div></div></div>`;
  },
  'integrations': async function() {
    window._showWordModal = () => document.getElementById('word-modal').classList.remove('hidden');
    window._hideWordModal = () => document.getElementById('word-modal').classList.add('hidden');
    window._doWordExport = () => { const title=document.getElementById('word-title').value||'TenderFlow Export',body=document.getElementById('word-body').value; const html='<html><head><meta charset="utf-8"><title>'+title+'</title></head><body><h1>'+title+'</h1>'+body.split('\n').map(l=>'<p>'+l+'</p>').join('')+'</body></html>'; const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([html],{type:'application/vnd.ms-word'})); a.download=title.replace(/\s+/g,'-')+'.doc'; a.click(); window._hideWordModal(); document.getElementById('word-status').textContent='Exported: '+title+'.doc'; };
    window._wordImported = e => { const f=e.target.files[0]; if(f) document.getElementById('word-status').textContent='Imported: '+f.name+' ('+( f.size/1024).toFixed(1)+' KB)'; };
    window._openGDocs = () => { window.open('https://docs.google.com/document/create','_blank'); document.getElementById('gdocs-status').textContent='Opened Google Docs in a new tab.'; };
    window._importGDocs = () => { const u=prompt('Paste the Google Docs URL:'); if(!u) return; const m=u.match(/\/d\/([a-zA-Z0-9_-]+)/); if(m){window.open('https://docs.google.com/document/d/'+m[1]+'/export?format=txt','_blank');document.getElementById('gdocs-status').textContent='Export opened. Copy the text and paste into RFP Processor.';}else{document.getElementById('gdocs-status').textContent='Invalid Google Docs URL.';} };
    return `<div class="space-y-6"><div><h1 class="text-2xl font-bold text-white">Integrations</h1><p class="text-slate-400 mt-1">Connect TenderFlow Pro with Microsoft Word and Google Docs</p></div><div class="grid grid-cols-1 md:grid-cols-2 gap-6"><div class="bg-surface-800 rounded-xl border border-slate-700 p-6 space-y-4"><div class="flex items-center gap-3"><span class="text-3xl">📘</span><div><h2 class="font-semibold text-white">Microsoft Word</h2><p class="text-slate-400 text-sm">Export tenders as .doc or import Word documents</p></div></div><button onclick="window._showWordModal()" class="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export to Word (.doc)</button><label class="block w-full px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm font-medium text-center cursor-pointer border border-slate-600">Import from Word<input type="file" class="hidden" accept=".doc,.docx" onchange="window._wordImported(event)"/></label><p id="word-status" class="text-slate-400 text-xs min-h-4"></p></div><div class="bg-surface-800 rounded-xl border border-slate-700 p-6 space-y-4"><div class="flex items-center gap-3"><span class="text-3xl">📗</span><div><h2 class="font-semibold text-white">Google Docs</h2><p class="text-slate-400 text-sm">Open or import from Google Docs</p></div></div><button onclick="window._openGDocs()" class="w-full px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium">Open Google Docs (new tab)</button><button onclick="window._importGDocs()" class="w-full px-4 py-2 bg-surface-700 hover:bg-surface-600 text-white rounded-lg text-sm font-medium border border-slate-600">Import from Google Docs URL</button><p id="gdocs-status" class="text-slate-400 text-xs min-h-4"></p></div></div><div id="word-modal" class="hidden fixed inset-0 bg-black/60 flex items-center justify-center z-50"><div class="bg-surface-800 rounded-xl border border-slate-700 p-6 w-full max-w-md space-y-4"><h3 class="font-semibold text-white text-lg">Export to Word</h3><input id="word-title" class="w-full bg-surface-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm placeholder-slate-500" placeholder="Document title"/><textarea id="word-body" class="w-full h-32 bg-surface-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm resize-none placeholder-slate-500" placeholder="Content to export…"></textarea><div class="flex gap-3 justify-end"><button onclick="window._hideWordModal()" class="px-4 py-2 bg-surface-700 text-white rounded-lg text-sm">Cancel</button><button onclick="window._doWordExport()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">Export</button></div></div></div></div>`;
  },

};

export function mountAppShell() {
  const root = document.getElementById('app-root');
  if (!root) return;
  root.innerHTML = `
    ${renderSidebar()}
    <main id="main-content" class="flex-1 overflow-y-auto p-6 lg:p-8">
      <div class="max-w-6xl mx-auto">
        <div id="view-container" class="min-h-[50vh]">
          <div class="shimmer h-8 w-48 rounded mb-4"></div>
          <div class="shimmer h-4 w-96 rounded mb-2"></div>
          <div class="shimmer h-4 w-72 rounded"></div>
        </div>
      </div>
    </main>`;
  if (isSuperAdmin()) loadCompaniesForScope();

  // Mount AI chat for bid_manager+
  import('./ai-chat.js').then(({ mountAIChat }) => mountAIChat()).catch(() => {});
}

async function loadCompaniesForScope() {
  const select = document.getElementById('scope-company-select');
  if (!select) return;
  const { data } = await supabase.from('companies').select('id, name').eq('is_active', true).order('name');
  for (const c of (data || [])) {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.name;
    select.appendChild(opt);
  }
}

// ── refreshView: swaps content in-place, no shimmer flash ────────────────────
export async function refreshView(route) {
  const container = document.getElementById('view-container');
  if (!container) return;
  const renderer = views[route.view];
  if (!renderer) return;
  try {
    const html = await renderer();
    const temp = document.createElement('div');
    temp.innerHTML = html;
    container.replaceChildren(...temp.childNodes);
  } catch (err) {
    console.error('[View] Refresh error:', err);
  }
}

// ── renderView: full reload with shimmer (navigation + scope changes only) ───
export async function renderView(route) {
  const container = document.getElementById('view-container');
  if (!container) return;
  container.innerHTML = `<div class="shimmer h-8 w-48 rounded mb-4"></div><div class="shimmer h-4 w-96 rounded"></div>`;
  const renderer = views[route.view];
  if (renderer) {
    try { container.innerHTML = await renderer(); }
    catch (err) { console.error('[View] Render error:', err); container.innerHTML = `<div class="p-8 text-center"><p class="text-red-400">Error loading view: ${err.message}</p></div>`; }
  } else {
    container.innerHTML = `<div class="p-8 text-center text-slate-500">View "${route.view}" not implemented yet.</div>`;
  }
  const sidebar = document.getElementById('sidebar');
  if (sidebar) { sidebar.outerHTML = renderSidebar(); if (isSuperAdmin()) loadCompaniesForScope(); }
}

// ── Global Handlers ──────────────────────────────────────────────────────────
window._logout = async () => { await logout(); navigate('/login'); };

// Keep renderView for scope/company switches — these are intentional full reloads
window._setScope = (scope) => {
  _viewScope = scope;
  document.getElementById('scope-company-select')?.classList.toggle('hidden', scope !== 'company');
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._selectCompany = async (id) => {
  _selectedCompanyId = id || null;
  const route = getCurrentRoute(); if (!route || !_selectedCompanyId) return;
  await renderView(route);
};

// Keep renderView for company/AI toggles — they affect global state
window._toggleCompany = async (id, active) => {
  await supabase.from('companies').update({ is_active: active }).eq('id', id);
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._toggleAI = async (id, enabled) => {
  await supabase.from('companies').update({ ai_enabled: enabled }).eq('id', id);
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._saveTaskContent = async (taskId) => {
  const content = window._quillEditor ? window._quillEditor.root.innerHTML : document.getElementById('task-content-editor')?.value;
  if (content === undefined) return;
  saveDraftOffline(taskId, content);
  const { error } = await supabase.from('tasks').update({ content }).eq('id', taskId);
  const statusEl = document.getElementById('save-status');
  if (statusEl) { statusEl.textContent = error ? 'Save failed — saved offline' : 'Saved ✓'; statusEl.className = `text-xs ${error ? 'text-amber-400' : 'text-emerald-400'}`; }
};

window._submitTask = async (taskId) => {
  await window._saveTaskContent(taskId);
  await supabase.from('tasks').update({ status: 'submitted', completed_at: new Date().toISOString() }).eq('id', taskId);
  const route = getCurrentRoute(); if (route) refreshView(route);
};

let _autoSaveTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.closest('#quill-editor') || e.target.id === 'task-content-editor') {
    clearTimeout(_autoSaveTimer);
    const taskId = getRouteParams().id;
    _autoSaveTimer = setTimeout(() => {
      const content = window._quillEditor ? window._quillEditor.root.innerHTML : e.target.value;
      saveDraftOffline(taskId, content);
      const el = document.getElementById('save-status');
      if (el) { el.textContent = 'Draft saved locally'; el.className = 'text-xs text-slate-500'; }
    }, 1500);
  }
});

// ── Tender Edit/Delete ───────────────────────────────────────────────────────
window._editTender = async (tenderId) => {
  const { data: tender } = await supabase.from('tenders').select('*').eq('id', tenderId).single();
  if (!tender) return;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-lg shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-4">Edit Tender</h3>
    <div id="et-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
    <div class="space-y-4">
      <div><label class="block text-sm text-slate-300 mb-1">Title *</label>
        <input id="et-title" type="text" value="${tender.title}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm text-slate-300 mb-1">Reference</label>
          <input id="et-ref" type="text" value="${tender.reference_number || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
        <div><label class="block text-sm text-slate-300 mb-1">Deadline</label>
          <input id="et-deadline" type="datetime-local" value="${tender.deadline ? tender.deadline.slice(0,16) : ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      </div>
      <div><label class="block text-sm text-slate-300 mb-1">Issuing Authority</label>
        <input id="et-authority" type="text" value="${tender.issuing_authority || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Account Manager</label>
        <input id="et-account-manager" type="text" value="${tender.account_manager || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Description</label>
        <textarea id="et-desc" rows="3" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none">${tender.description || ''}</textarea></div>
      <div><label class="block text-sm text-slate-300 mb-1">Status</label>
        <select id="et-status" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          ${['draft','analyzing','in_progress','review','approved'].map(s => `<option value="${s}" ${tender.status === s ? 'selected' : ''}>${s.replace(/_/g,' ')}</option>`).join('')}
        </select></div>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="et-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Save Changes</button>
      <button id="et-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#et-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#et-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#et-error');
    const title = modal.querySelector('#et-title').value.trim();
    if (!title) { errEl.textContent = 'Title is required.'; errEl.classList.remove('hidden'); return; }
    const { error } = await supabase.from('tenders').update({
      title,
      reference_number: modal.querySelector('#et-ref').value.trim() || null,
      deadline: modal.querySelector('#et-deadline').value || null,
      issuing_authority: modal.querySelector('#et-authority').value.trim() || null,
      description: modal.querySelector('#et-desc').value.trim() || null,
      status: modal.querySelector('#et-status').value,
      account_manager: modal.querySelector('#et-account-manager')?.value.trim() || null,
    }).eq('id', tenderId);
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    modal.remove(); window.TF?.toast?.('Tender updated', 'success');
    const route = getCurrentRoute(); if (route) refreshView(route);
  });
};

window._deleteTender = async (tenderId) => {
  if (!confirm('Delete this tender? This will also delete all tasks and documents. This cannot be undone.')) return;
  await supabase.from('tasks').delete().eq('tender_id', tenderId);
  await supabase.from('documents').delete().eq('tender_id', tenderId);
  const { error } = await supabase.from('tenders').delete().eq('id', tenderId);
  if (error) { window.TF?.toast?.(`Delete failed: ${error.message}`, 'error'); return; }
  window.TF?.toast?.('Tender deleted', 'success');
  navigate('/tenders');
};

window._unlockTender = async (tenderId) => {
  if (!confirm('Unlock this tender? This will set it back to "in_progress" and allow editing and re-submission.')) return;
  const { error } = await supabase.from('tenders')
    .update({ status: 'in_progress' })
    .eq('id', tenderId);
  if (error) { window.TF?.toast?.(`Unlock failed: ${error.message}`, 'error'); return; }
  await supabase.from('documents')
    .update({ is_locked: false })
    .eq('tender_id', tenderId);
  window.TF?.toast?.('Tender unlocked — you can now edit and re-submit', 'success');
  const route = getCurrentRoute();
  if (route) refreshView(route);
};
// ── User Management ──────────────────────────────────────────────────────────
window._toggleUser = async (userId, active) => {
  await supabase.from('profiles').update({ is_active: active }).eq('id', userId);
  window.TF?.toast?.(active ? 'User activated' : 'User suspended', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._editUser = async (userId) => {
  const { data: u } = await supabase.from('profiles').select('*').eq('id', userId).single();
  if (!u) return;
  const departments = await getDepartments();
  const deptOptions = departments.map(d => `<option value="${d}" ${u.department === d ? 'selected' : ''}>${d}</option>`).join('');
  const roleOptions = ['dept_user', 'bid_manager', 'it_admin', ...(isSuperAdmin() ? ['super_admin'] : [])]
    .map(r => `<option value="${r}" ${u.role === r ? 'selected' : ''}>${r.replace(/_/g, ' ')}</option>`).join('');

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-4">Edit User</h3>
    <div class="space-y-4">
      <div><label class="block text-sm text-slate-300 mb-1">Full Name</label>
        <input id="eu-name" type="text" value="${u.full_name}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Role</label>
        <select id="eu-role" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">${roleOptions}</select></div>
      <div><label class="block text-sm text-slate-300 mb-1">Department</label>
        <select id="eu-dept" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="">— None —</option>${deptOptions}
        </select></div>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="eu-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Save</button>
      <button id="eu-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#eu-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#eu-submit').addEventListener('click', async () => {
    const { error } = await supabase.from('profiles').update({
      full_name: modal.querySelector('#eu-name').value.trim(),
      role: modal.querySelector('#eu-role').value,
      department: modal.querySelector('#eu-dept').value || null,
    }).eq('id', userId);
    if (error) { window.TF?.toast?.(`Update failed: ${error.message}`, 'error'); return; }
    modal.remove(); window.TF?.toast?.('User updated', 'success');
    const route = getCurrentRoute(); if (route) refreshView(route);
  });
};

window._manageDepartments = async () => {
  const profile = getProfile();
  const companyId = _selectedCompanyId || profile.company_id;

  async function loadDepts() {
    const { data } = await supabase.from('departments')
      .select('id, name').eq('company_id', companyId).order('name');
    return data || [];
  }

  function renderDeptList(depts) {
    const list = document.getElementById('dept-list');
    if (!list) return;
    if (!depts.length) {
      list.innerHTML = '<p class="text-sm text-slate-500 px-3">No departments yet.</p>';
      return;
    }
    list.innerHTML = depts.map(d => `
      <div class="flex items-center justify-between px-3 py-2 bg-surface-900/60 rounded-lg" data-dept-id="${d.id}">
        <span class="text-sm text-white">${d.name}</span>
        <div class="flex gap-2">
          <button onclick="window._renameDepartmentById('${d.id}', '${d.name.replace(/'/g, "\'")}')" class="text-xs text-brand-400 hover:text-brand-300">Rename</button>
          <button onclick="window._deleteDepartment('${d.id}', '${d.name.replace(/'/g, "\'")}')" class="text-xs text-red-400 hover:text-red-300">Delete</button>
        </div>
      </div>`).join('');
  }

  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-1">Manage Departments</h3>
    <p class="text-xs text-slate-500 mb-4">Departments are saved permanently and available when assigning users.</p>
    <div id="dept-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
    <div id="dept-list" class="space-y-2 mb-4 max-h-64 overflow-y-auto">
      <p class="text-xs text-slate-500 px-3">Loading...</p>
    </div>
    <div class="flex gap-2 mb-4">
      <input id="new-dept-input" type="text" placeholder="New department name e.g. Finance" class="flex-1 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
      <button id="add-dept-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Add</button>
    </div>
    <button id="dept-close" class="w-full py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20">Close</button>
  </div>`;
  document.body.appendChild(modal);

  // Load and render
  const depts = await loadDepts();
  renderDeptList(depts);

  modal.querySelector('#dept-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

  modal.querySelector('#add-dept-btn').addEventListener('click', async () => {
    const input = modal.querySelector('#new-dept-input');
    const errEl = modal.querySelector('#dept-error');
    const name = input.value.trim();
    if (!name) return;
    errEl.classList.add('hidden');
    const { error } = await supabase.from('departments').insert({ name, company_id: companyId });
    if (error) {
      errEl.textContent = error.code === '23505' ? `"${name}" already exists.` : error.message;
      errEl.classList.remove('hidden');
      return;
    }
    input.value = '';
    window.TF?.toast?.(`Department "${name}" saved`, 'success');
    const updated = await loadDepts();
    renderDeptList(updated);
  });

  // Enter key to add
  modal.querySelector('#new-dept-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') modal.querySelector('#add-dept-btn').click();
  });
};

window._renameDepartmentById = async (deptId, oldName) => {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName.trim() === oldName) return;
  const profile = getProfile();
  const companyId = _selectedCompanyId || profile.company_id;
  const { error } = await supabase.from('departments')
    .update({ name: newName.trim() }).eq('id', deptId);
  if (error) { window.TF?.toast?.(`Rename failed: ${error.message}`, 'error'); return; }
  // Also update existing users with this department name
  await supabase.from('profiles').update({ department: newName.trim() })
    .eq('department', oldName).eq('company_id', companyId);
  window.TF?.toast?.(`Renamed to "${newName.trim()}"`, 'success');
  window._manageDepartments(); // Reopen with fresh data
};

window._deleteDepartment = async (deptId, name) => {
  if (!confirm(`Delete department "${name}"?\n\nUsers assigned to this department will have their department cleared.`)) return;
  const profile = getProfile();
  const companyId = _selectedCompanyId || profile.company_id;
  await supabase.from('profiles').update({ department: null })
    .eq('department', name).eq('company_id', companyId);
  const { error } = await supabase.from('departments').delete().eq('id', deptId);
  if (error) { window.TF?.toast?.(`Delete failed: ${error.message}`, 'error'); return; }
  window.TF?.toast?.(`Department "${name}" deleted`, 'success');
  window._manageDepartments();
};

// _renameDepartment replaced by _renameDepartmentById

window._createUser = async () => {
  const profile = getProfile();
  const departments = await getDepartments();
  const deptOptions = departments.map(d => `<option value="${d}">${d}</option>`).join('');
  const roleOptions = isSuperAdmin()
    ? '<option value="dept_user">Dept User</option><option value="bid_manager">Bid Manager</option><option value="it_admin">IT Admin</option>'
    : '<option value="dept_user">Dept User</option><option value="bid_manager">Bid Manager</option>';
  let companySelect = '';
  if (isSuperAdmin()) {
    const { data: companies } = await supabase.from('companies').select('id, name').eq('is_active', true).order('name');
    companySelect = `<div><label class="block text-sm text-slate-300 mb-1">Company *</label>
      <select id="nu-company" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
        <option value="">— Select —</option>
        ${(companies || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
      </select></div>`;
  }
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-4">Add New User</h3>
    <div id="nu-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
    <div id="nu-success" class="hidden mb-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm"></div>
    <div class="space-y-4">
      <div><label class="block text-sm text-slate-300 mb-1">Full Name *</label>
        <input id="nu-name" type="text" placeholder="Jane Doe" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Email *</label>
        <input id="nu-email" type="email" placeholder="jane@company.com" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
      <div><label class="block text-sm text-slate-300 mb-1">Temporary Password *</label>
        <input id="nu-password" type="text" placeholder="Min 8 characters" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" /></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block text-sm text-slate-300 mb-1">Role</label>
          <select id="nu-role" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">${roleOptions}</select></div>
        <div><label class="block text-sm text-slate-300 mb-1">Department</label>
          <select id="nu-dept" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="">— None —</option>${deptOptions}
          </select></div>
      </div>
      ${companySelect}
    </div>
    <div class="flex gap-3 mt-6">
      <button id="nu-submit" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Create User</button>
      <button id="nu-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#nu-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#nu-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#nu-error');
    const successEl = modal.querySelector('#nu-success');
    errEl.classList.add('hidden'); successEl.classList.add('hidden');
    const name = modal.querySelector('#nu-name').value.trim();
    const email = modal.querySelector('#nu-email').value.trim();
    const password = modal.querySelector('#nu-password').value.trim();
    const role = modal.querySelector('#nu-role').value;
    const dept = modal.querySelector('#nu-dept').value;
    const companyId = isSuperAdmin() ? modal.querySelector('#nu-company')?.value : (_selectedCompanyId || profile.company_id);
    if (!name || !email || !password) { errEl.textContent = 'Name, email and password required.'; errEl.classList.remove('hidden'); return; }
    if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; errEl.classList.remove('hidden'); return; }
    if (isSuperAdmin() && !companyId) { errEl.textContent = 'Please select a company.'; errEl.classList.remove('hidden'); return; }
    const btn = modal.querySelector('#nu-submit'); btn.disabled = true; btn.textContent = 'Creating...';
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('create-user', {
      body: { email, password, full_name: name, role, department: dept || null, company_id: companyId || null },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || !data?.success) { errEl.textContent = data?.error || error?.message || 'Failed to create user'; errEl.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Create User'; return; }
    successEl.textContent = `User "${name}" created successfully. They can log in with their email and temporary password.`;
    successEl.classList.remove('hidden'); btn.disabled = false; btn.textContent = 'Create User';
    window.TF?.toast?.(`User "${name}" created`, 'success');
    setTimeout(() => { modal.remove(); const route = getCurrentRoute(); if (route) refreshView(route); }, 2000);
  });
};

// ── Task Actions ─────────────────────────────────────────────────────────────
window._approveTask = async (taskId) => {
  await supabase.from('tasks').update({ status: 'approved' }).eq('id', taskId);
  window.TF?.toast?.('Task approved', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._requestRevision = async (taskId) => {
  const notes = prompt('Revision notes (optional):');
  await supabase.from('tasks').update({ status: 'revision_needed', review_notes: notes || null }).eq('id', taskId);
  window.TF?.toast?.('Revision requested', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._startTask = async (taskId) => {
  await supabase.from('tasks').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', taskId);
  window.TF?.toast?.('Task started', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._deleteTask = async (taskId, tenderId) => {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  const { error } = await supabase.from('tasks').delete().eq('id', taskId);
  if (error) { window.TF?.toast?.(`Delete failed: ${error.message}`, 'error'); return; }
  window.TF?.toast?.('Task deleted', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._loadTaskAssignFields = async (taskId) => {
  const container = document.getElementById('task-assign-fields');
  if (!container) return;
  const profile = getProfile();
  const { data: taskRow } = await supabase.from('tasks').select('company_id').eq('id', taskId).maybeSingle();
  const companyId = taskRow?.company_id || _selectedCompanyId || profile.company_id;
  const { data: users } = await supabase.from('profiles')
    .select('id, full_name, department')
    .eq('company_id', companyId)
    .eq('is_active', true).order('full_name');
  const { data: task, error: taskErr } = await supabase.from('tasks')
    .select('assigned_to, due_date, priority, is_mandatory')
    .eq('id', taskId).maybeSingle();
  if (taskErr) { console.error('[Assign] Task fetch error:', taskErr.message); return; }
  const userOptions = (users || []).map(u =>
    `<option value="${u.id}" ${task?.assigned_to === u.id ? 'selected' : ''}>${u.full_name}${u.department ? ` (${u.department})` : ''}</option>`
  ).join('');
  container.innerHTML = `
    <div><label class="block text-xs text-slate-400 mb-1">Assigned To</label>
      <select id="ta-assign" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
        <option value="">— Unassigned —</option>${userOptions}
      </select></div>
    <div class="grid grid-cols-2 gap-3">
      <div><label class="block text-xs text-slate-400 mb-1">Priority</label>
        <select id="ta-priority" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="0" ${task?.priority === 0 ? 'selected' : ''}>Normal</option>
          <option value="1" ${task?.priority === 1 ? 'selected' : ''}>High</option>
          <option value="2" ${task?.priority === 2 ? 'selected' : ''}>Critical</option>
        </select></div>
      <div><label class="block text-xs text-slate-400 mb-1">Due Date</label>
        <input id="ta-due" type="datetime-local" value="${task?.due_date ? task.due_date.slice(0,16) : ''}"
          class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" /></div>
    </div>
    <label class="flex items-center gap-2 text-sm text-slate-300">
      <input id="ta-mandatory" type="checkbox" ${task?.is_mandatory ? 'checked' : ''} /> Mandatory
    </label>
    <button onclick="window._saveTaskAssignment('${taskId}')" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-lg transition">Save Assignment</button>`;
};

window._saveTaskAssignment = async (taskId) => {
  const assignTo = document.getElementById('ta-assign')?.value || null;
  const priority = parseInt(document.getElementById('ta-priority')?.value) || 0;
  const dueDate = document.getElementById('ta-due')?.value || null;
  const isMandatory = document.getElementById('ta-mandatory')?.checked || false;
  const profile = getProfile();
  const { error } = await supabase.from('tasks').update({
    assigned_to: assignTo || null,
    assigned_by: assignTo ? profile.id : null,
    priority,
    due_date: dueDate || null,
    is_mandatory: isMandatory,
    status: assignTo ? 'assigned' : 'unassigned',
  }).eq('id', taskId);
  if (error) {
    const errEl = document.getElementById('task-assign-error');
    if (errEl) { errEl.textContent = error.message; errEl.classList.remove('hidden'); }
    return;
  }
  window.TF?.toast?.('Task assignment saved', 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

window._importDocument = async (tenderId) => {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-2">Import Document as Sections</h3>
    <p class="text-xs text-slate-400 mb-4">The AI will split your document into editable sections. You can then assign each section to a team member.</p>
    <div id="id-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
    <div id="id-success" class="hidden mb-3 p-2 bg-emerald-500/10 border border-emerald-500/20 rounded-lg text-emerald-400 text-sm"></div>
    <div class="space-y-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">Upload RFP Document (PDF or DOCX)</label>
        <div id="id-rfp-drop" onclick="document.getElementById('id-file').click()" class="border-2 border-dashed border-slate-600 rounded-xl p-5 text-center cursor-pointer hover:border-brand-500 transition-colors">
          <p class="text-2xl mb-1">📋</p>
          <p class="text-slate-300 text-sm font-medium" id="id-rfp-lbl">Drop RFP here or click to browse</p>
          <p class="text-slate-500 text-xs mt-0.5">PDF, DOCX</p>
        </div>
        <input id="id-file" type="file" accept=".pdf,.docx" class="hidden" onchange="document.getElementById('id-rfp-lbl').textContent = this.files[0]?.name || 'Drop RFP here or click to browse'" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Upload Response Template <span class="text-slate-500">(optional)</span></label>
        <div id="id-tmpl-drop" onclick="document.getElementById('id-tmpl-file').click()" class="border-2 border-dashed border-slate-600 rounded-xl p-5 text-center cursor-pointer hover:border-brand-500 transition-colors">
          <p class="text-2xl mb-1">📝</p>
          <p class="text-slate-300 text-sm font-medium" id="id-tmpl-lbl">Drop template here or click to browse</p>
          <p class="text-slate-500 text-xs mt-0.5">DOC, DOCX, TXT</p>
        </div>
        <input id="id-tmpl-file" type="file" accept=".doc,.docx,.txt" class="hidden" onchange="document.getElementById('id-tmpl-lbl').textContent = this.files[0]?.name || 'Drop template here or click to browse'" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Existing Tasks</label>
        <select id="id-replace" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="false">Keep existing tasks, add new sections</option>
          <option value="true">Replace all existing tasks with imported sections</option>
        </select>
      </div>
    </div>
    <div class="flex gap-3 mt-6">
      <button id="id-submit" class="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg">Import & Parse</button>
      <button id="id-cancel" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  
  document.body.appendChild(modal);
  modal.querySelector('#id-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#id-submit').addEventListener('click', async () => {
    const errEl = modal.querySelector('#id-error');
    const successEl = modal.querySelector('#id-success');
    const fileInput = modal.querySelector('#id-file');
    const replaceExisting = modal.querySelector('#id-replace').value === 'true';
    errEl.classList.add('hidden'); successEl.classList.add('hidden');
    const file = fileInput?.files?.[0];
    if (!file) { errEl.textContent = 'Please select a file.'; errEl.classList.remove('hidden'); return; }
    const btn = modal.querySelector('#id-submit');
    btn.disabled = true; btn.textContent = 'Parsing...';
    try {
      const { extractTextFromFile, triggerDocumentParse } = await import('./compiler.js');
      const text = await extractTextFromFile(file);
      const result = await triggerDocumentParse(tenderId, text, replaceExisting);
      successEl.textContent = `✓ Created ${result.sections_created} sections from your document. Assign them to team members below.`;
      successEl.classList.remove('hidden');
      btn.textContent = 'Done';
      setTimeout(() => { modal.remove(); const route = getCurrentRoute(); if (route) refreshView(route); }, 2000);
    } catch (err) {
      errEl.textContent = err.message; errEl.classList.remove('hidden');
      btn.disabled = false; btn.textContent = 'Import & Parse';
    }
  });
};

// ── User Delete ──────────────────────────────────────────────────────────────
window._deleteUserPrompt = async (userId, userName) => {
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-2">Delete User</h3>
    <p class="text-sm text-slate-400 mb-6">Choose how to remove <strong class="text-white">${userName}</strong>:</p>
    <div class="flex flex-col gap-3">
      <button id="du-soft" class="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg">Deactivate (keeps data, blocks login)</button>
      <button id="du-hard" class="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg">Permanently Delete (cannot be undone)</button>
      <button id="du-cancel" class="px-5 py-2.5 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#du-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#du-soft').addEventListener('click', async () => {
    await supabase.from('profiles').update({ is_active: false }).eq('id', userId);
    modal.remove(); window.TF?.toast?.(`${userName} deactivated`, 'success');
    const route = getCurrentRoute(); if (route) refreshView(route);
  });
  modal.querySelector('#du-hard').addEventListener('click', async () => {
    if (!confirm(`Permanently delete ${userName}? This cannot be undone.`)) return;
    const { data: { session } } = await supabase.auth.getSession();
    await supabase.functions.invoke('create-user', {
      body: { _action: 'delete', user_id: userId },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    await supabase.from('profiles').delete().eq('id', userId);
    modal.remove(); window.TF?.toast?.(`${userName} permanently deleted`, 'success');
    const route = getCurrentRoute(); if (route) refreshView(route);
  });
};

// ── Bulk Tender Actions ───────────────────────────────────────────────────────
window._toggleAllTenders = (checked) => {
  document.querySelectorAll('.tender-checkbox').forEach(cb => cb.checked = checked);
  window._updateTenderBulkBar();
};
window._updateTenderBulkBar = () => {
  const checked = document.querySelectorAll('.tender-checkbox:checked');
  const bar = document.getElementById('tender-bulk-bar');
  const count = document.getElementById('tender-bulk-count');
  if (bar) { bar.classList.toggle('hidden', checked.length === 0); bar.classList.toggle('flex', checked.length > 0); }
  if (count) count.textContent = `${checked.length} selected`;
};
window._clearTenderSelection = () => {
  document.querySelectorAll('.tender-checkbox').forEach(cb => cb.checked = false);
  const selectAll = document.getElementById('tender-select-all');
  if (selectAll) selectAll.checked = false;
  window._updateTenderBulkBar();
};
window._bulkDeleteTenders = async () => {
  const ids = [...document.querySelectorAll('.tender-checkbox:checked')].map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm(`Permanently delete ${ids.length} tender(s) and all their tasks? This cannot be undone.`)) return;
  for (const id of ids) {
    await supabase.from('tasks').delete().eq('tender_id', id);
    await supabase.from('documents').delete().eq('tender_id', id);
    await supabase.from('tenders').delete().eq('id', id);
  }
  window.TF?.toast?.(`${ids.length} tender(s) deleted`, 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

// ── Bulk Task Actions ─────────────────────────────────────────────────────────
window._toggleAllTasks = (checked) => {
  document.querySelectorAll('.task-checkbox').forEach(cb => cb.checked = checked);
  window._updateTaskBulkBar();
};
window._updateTaskBulkBar = () => {
  const checked = document.querySelectorAll('.task-checkbox:checked');
  const bar = document.getElementById('task-bulk-bar');
  const count = document.getElementById('task-bulk-count');
  if (bar) { bar.classList.toggle('hidden', checked.length === 0); bar.classList.toggle('flex', checked.length > 0); }
  if (count) count.textContent = `${checked.length} selected`;
};
window._clearTaskSelection = () => {
  document.querySelectorAll('.task-checkbox').forEach(cb => cb.checked = false);
  const selectAll = document.getElementById('task-select-all');
  if (selectAll) selectAll.checked = false;
  window._updateTaskBulkBar();
};
window._bulkDeleteTasks = async (tenderId) => {
  const ids = [...document.querySelectorAll('.task-checkbox:checked')].map(cb => cb.value);
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} task(s)? This cannot be undone.`)) return;
  for (const id of ids) {
    await supabase.from('tasks').delete().eq('id', id);
  }
  window.TF?.toast?.(`${ids.length} task(s) deleted`, 'success');
  const route = getCurrentRoute(); if (route) refreshView(route);
};

// ── Table helpers (work on the Quill editor DOM directly) ────────────────────
function _quillTableHelper() {
  const editor = window._quillEditor;
  if (!editor) { window.TF?.toast?.('Editor not ready', 'error'); return null; }
  return editor;
}

function _buildTable(rows, cols) {
  const borderStyle = 'border:1px solid #475569;padding:6px 10px;min-width:80px;';
  let html = `<table style="border-collapse:collapse;width:100%;margin:8px 0;">`;
  for (let r = 0; r < rows; r++) {
    html += '<tr>';
    for (let c = 0; c < cols; c++) {
      const tag = r === 0 ? 'th' : 'td';
      const bg = r === 0 ? 'background:#1e293b;font-weight:600;color:#94a3b8;' : 'background:#0f172a;color:#e2e8f0;';
      html += `<${tag} style="${borderStyle}${bg}" contenteditable="true">${r === 0 ? `Header ${c + 1}` : ''}</${tag}>`;
    }
    html += '</tr>';
  }
  html += '</table><p><br></p>';
  return html;
}

window._insertTable = () => {
  const editor = _quillTableHelper(); if (!editor) return;
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-xs shadow-2xl">
    <h3 class="text-sm font-semibold text-white mb-4">Insert Table</h3>
    <div class="space-y-3">
      <div class="flex items-center gap-3">
        <label class="text-xs text-slate-400 w-16">Rows</label>
        <input id="tbl-rows" type="number" value="3" min="1" max="20" class="flex-1 px-3 py-1.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
      </div>
      <div class="flex items-center gap-3">
        <label class="text-xs text-slate-400 w-16">Columns</label>
        <input id="tbl-cols" type="number" value="3" min="1" max="10" class="flex-1 px-3 py-1.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
      </div>
    </div>
    <div class="flex gap-2 mt-5">
      <button id="tbl-insert" class="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Insert</button>
      <button id="tbl-cancel" class="flex-1 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#tbl-cancel').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#tbl-insert').addEventListener('click', () => {
    const rows = parseInt(modal.querySelector('#tbl-rows').value) || 3;
    const cols = parseInt(modal.querySelector('#tbl-cols').value) || 3;
    modal.remove();
    // Insert table directly into editor DOM (dangerouslyPasteHTML at index is unreliable for tables)
    const range = editor.getSelection(true);
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = _buildTable(rows, cols);
    const table = tempDiv.firstChild;
    // Find insertion point in editor DOM
    const editorRoot = editor.root;
    let insertAfter = null;
    if (range) {
      // Find which block element the cursor is in
      const [leaf] = editor.getLeaf(range.index);
      if (leaf && leaf.domNode) {
        let node = leaf.domNode;
        while (node && node.parentNode !== editorRoot) node = node.parentNode;
        insertAfter = node;
      }
    }
    if (insertAfter && insertAfter !== editorRoot) {
      editorRoot.insertBefore(table, insertAfter.nextSibling);
    } else {
      editorRoot.appendChild(table);
    }
    // Add a paragraph after the table so cursor can move past it
    const p = document.createElement('p');
    p.innerHTML = '<br>';
    table.after(p);
    // Make table cells editable and focusable
    table.querySelectorAll('td, th').forEach(cell => {
      cell.setAttribute('contenteditable', 'true');
      cell.style.cursor = 'text';
    });
    editor.update();
  });
};

window._tableAddRow = () => {
  const editor = _quillTableHelper(); if (!editor) return;
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  const row = sel.anchorNode.closest ? sel.anchorNode.closest('tr') : null;
  if (!row) { window.TF?.toast?.('Click inside a table cell first', 'info'); return; }
  const cols = row.children.length;
  const newRow = document.createElement('tr');
  for (let i = 0; i < cols; i++) {
    const td = document.createElement('td');
    td.style.cssText = 'border:1px solid #475569;padding:6px 10px;min-width:80px;background:#0f172a;color:#e2e8f0;';
    td.setAttribute('contenteditable', 'true');
    newRow.appendChild(td);
  }
  row.parentNode.insertBefore(newRow, row.nextSibling);
};

window._tableAddCol = () => {
  const editor = _quillTableHelper(); if (!editor) return;
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  const cell = sel.anchorNode.closest ? sel.anchorNode.closest('td, th') : null;
  if (!cell) { window.TF?.toast?.('Click inside a table cell first', 'info'); return; }
  const table = cell.closest('table');
  if (!table) return;
  const colIdx = [...cell.parentNode.children].indexOf(cell);
  table.querySelectorAll('tr').forEach((row, ri) => {
    const newCell = document.createElement(ri === 0 ? 'th' : 'td');
    const bg = ri === 0 ? 'background:#1e293b;font-weight:600;color:#94a3b8;' : 'background:#0f172a;color:#e2e8f0;';
    newCell.style.cssText = `border:1px solid #475569;padding:6px 10px;min-width:80px;${bg}`;
    newCell.setAttribute('contenteditable', 'true');
    const ref = row.children[colIdx + 1] || null;
    row.insertBefore(newCell, ref);
  });
};

window._tableDelete = () => {
  const editor = _quillTableHelper(); if (!editor) return;
  const sel = window.getSelection();
  if (!sel || !sel.anchorNode) return;
  const table = sel.anchorNode.closest ? sel.anchorNode.closest('table') : null;
  if (!table) { window.TF?.toast?.('Click inside a table first', 'info'); return; }
  if (!confirm('Remove this table?')) return;
  table.remove();
};
