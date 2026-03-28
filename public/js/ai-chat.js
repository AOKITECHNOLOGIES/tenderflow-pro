// ============================================================================
// TenderFlow Pro — AI Assistant Chat
// Floating chat panel powered by Claude with live page context
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, hasRoleLevel, isSuperAdmin } from './auth.js';
import { getCurrentRoute, getRouteParams } from './router.js';

let _chatHistory = [];
let _contextCache = null;
let _isOpen = false;
let _isThinking = false;

export function mountAIChat() {
  const profile = getProfile();
  if (!profile || !hasRoleLevel('bid_manager')) return;

  const style = document.createElement('style');
  style.textContent = `
    #ai-chat-panel {
      transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease;
    }
    #ai-chat-panel.hidden-panel {
      transform: translateX(100%);
      opacity: 0;
      pointer-events: none;
    }
    #ai-chat-panel.visible-panel {
      transform: translateX(0);
      opacity: 1;
      pointer-events: all;
    }
    #ai-chat-btn { transition: all 0.2s ease; }
    #ai-chat-btn:hover { transform: scale(1.05); }
    .chat-msg-user { animation: msgIn 0.2s ease-out; }
    .chat-msg-ai   { animation: msgIn 0.2s ease-out; }
    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .thinking-dot { animation: blink 1.2s infinite; }
    .thinking-dot:nth-child(2) { animation-delay: 0.2s; }
    .thinking-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes blink {
      0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1); }
    }
    #ai-chat-messages {
      scrollbar-width: thin;
      scrollbar-color: #334155 transparent;
    }
    .chat-prose p { margin-bottom: 0.5em; }
    .chat-prose ul { list-style: disc; padding-left: 1.2em; margin-bottom: 0.5em; }
    .chat-prose ol { list-style: decimal; padding-left: 1.2em; margin-bottom: 0.5em; }
    .chat-prose li { margin-bottom: 0.2em; }
    .chat-prose strong { color: #e2e8f0; font-weight: 600; }
    .chat-prose code { background: #1e293b; padding: 1px 5px; border-radius: 4px; font-size: 0.85em; color: #7dd3fc; }
    .chat-prose h3 { font-size: 0.9em; font-weight: 600; color: #e2e8f0; margin-bottom: 0.3em; margin-top: 0.6em; }
    .kb-indicator { animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  `;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.id = 'ai-chat-btn';
  btn.className = 'fixed bottom-6 right-6 z-[130] w-auto bg-violet-600 hover:bg-violet-500 text-white rounded-full shadow-xl shadow-violet-900/40 flex items-center justify-center gap-2 px-4 py-3';
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <span class="text-sm font-medium">AI Help</span>
    <span id="ai-chat-badge" class="hidden absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full text-[10px] text-slate-900 font-bold flex items-center justify-center">!</span>
  `;
  btn.onclick = toggleChat;
  document.body.appendChild(btn);

  const panel = document.createElement('div');
  panel.id = 'ai-chat-panel';
  panel.className = 'hidden-panel fixed bottom-0 right-0 z-[160] w-full max-w-md h-[85vh] bg-surface-900 border-l border-t border-slate-700/60 shadow-2xl flex flex-col rounded-tl-2xl';
  panel.innerHTML = `
    <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 shrink-0">
      <div class="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white">TenderFlow AI</p>
        <p class="text-xs text-slate-500" id="ai-chat-context-label">Loading context...</p>
      </div>
      <div class="flex items-center gap-2">
        <div id="ai-kb-indicator" class="hidden items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full" title="Knowledge Base loaded">
          <span class="w-1.5 h-1.5 bg-emerald-400 rounded-full kb-indicator"></span>
          <span class="text-[10px] text-emerald-400">KB</span>
        </div>
        <button onclick="window._aiChatClear()" title="Clear chat" class="text-slate-500 hover:text-slate-300 transition p-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
        </button>
        <button onclick="window._aiChatClose()" class="text-slate-500 hover:text-slate-300 transition p-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <div id="ai-chat-messages" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div class="chat-msg-ai flex gap-3">
        <div class="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div class="bg-surface-800 border border-slate-700/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-300 max-w-[85%] chat-prose">
          <p>Hi! I'm your TenderFlow assistant. I have access to:</p>
          <ul>
            <li>Your current page context and tender details</li>
            <li>Your Knowledge Base documents (including content)</li>
            <li>Your document repository</li>
            <li>Your active tasks and deadlines</li>
          </ul>
          <p class="mt-2 text-slate-400 text-xs">Ask me anything about your tenders, internal processes, or company documents.</p>
        </div>
      </div>
    </div>

    <div id="ai-chat-suggestions" class="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 border-t border-slate-800/60"></div>

    <div class="px-4 py-3 border-t border-slate-700/60 shrink-0">
      <div class="flex gap-2 items-end">
        <textarea
          id="ai-chat-input"
          rows="1"
          placeholder="Ask about tenders, processes, or your documents..."
          class="flex-1 px-3 py-2.5 bg-surface-800 border border-slate-600/50 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:border-violet-500/60 focus:ring-1 focus:ring-violet-500/30 resize-none transition"
          style="max-height: 120px; overflow-y: auto;"
          onkeydown="window._aiChatKeydown(event)"
          oninput="this.style.height='auto'; this.style.height=this.scrollHeight+'px'"
        ></textarea>
        <button
          id="ai-chat-send"
          onclick="window._aiChatSend()"
          class="w-9 h-9 bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl flex items-center justify-center shrink-0 transition"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <p class="text-[10px] text-slate-600 mt-1.5 text-center">Powered by Claude · Knowledge Base + Document context</p>
    </div>
  `;
  document.body.appendChild(panel);

  window.addEventListener('hashchange', () => {
    _contextCache = null;
    updateContextLabel();
    refreshSuggestions();
  });

  updateContextLabel();
  refreshSuggestions();
}

function toggleChat() { _isOpen ? closeChat() : openChat(); }

function openChat() {
  _isOpen = true;
  const panel = document.getElementById('ai-chat-panel');
  if (panel) { panel.classList.remove('hidden-panel'); panel.classList.add('visible-panel'); }
  document.getElementById('ai-chat-badge')?.classList.add('hidden');
  const btn = document.getElementById('ai-chat-btn');
  if (btn) btn.style.display = 'none';
  setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 300);
}

function closeChat() {
  _isOpen = false;
  const panel = document.getElementById('ai-chat-panel');
  if (panel) { panel.classList.add('hidden-panel'); panel.classList.remove('visible-panel'); }
  const btn = document.getElementById('ai-chat-btn');
  if (btn) btn.style.display = '';
}

window._aiChatClose = closeChat;
window._aiChatClear = () => {
  _chatHistory = [];
  _contextCache = null;
  const msgs = document.getElementById('ai-chat-messages');
  if (msgs) msgs.innerHTML = '';
  appendAIMessage("Chat cleared. I still have access to your Knowledge Base and current page context — ask me anything!");
  refreshSuggestions();
};
window._aiChatKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._aiChatSend(); }
};

// ── Load Knowledge Base documents from localStorage ──────────────────────────
function loadKnowledgeBase() {
  try {
    const docs = JSON.parse(localStorage.getItem('tf_kb_docs') || '[]');
    if (!docs.length) return null;

    const previews = docs.map(d => {
      let textPreview = '';
      const category = d.category === 'tender' ? 'Past Tender' : 'Company Document';

      if (d.content && typeof d.content === 'string') {
        try {
          if (d.content.startsWith('data:')) {
            const commaIdx = d.content.indexOf(',');
            if (commaIdx !== -1) {
              const header = d.content.substring(0, commaIdx);
              const base64Data = d.content.substring(commaIdx + 1);

              // Only decode text-based files — PDF binary won't be readable
              if (header.includes('text/') || header.includes('application/json') || d.name.endsWith('.txt') || d.name.endsWith('.md')) {
                try {
                  const decoded = atob(base64Data);
                  textPreview = decoded
                    .replace(/[^\x20-\x7E\n\r\t]/g, ' ')
                    .replace(/\s{3,}/g, '  ')
                    .trim()
                    .substring(0, 2000);
                } catch (_) {}
              } else if (d.name.endsWith('.pdf') || d.name.endsWith('.docx') || d.name.endsWith('.doc')) {
                textPreview = '[Binary file — upload a .txt or .md version for AI content access]';
              }
            }
          } else {
            // Plain text content stored directly
            textPreview = d.content.substring(0, 2000).replace(/[^\x20-\x7E\n\r\t]/g, ' ').trim();
          }
        } catch (_) {}
      }

      let entry = `[${category}] ${d.name}`;
      if (d.size) entry += ` (${(d.size / 1024).toFixed(1)} KB)`;
      if (textPreview && textPreview.length > 20) {
        entry += `\nContent preview:\n${textPreview}`;
      } else if (!textPreview) {
        entry += '\n(No text preview available — file may be binary)';
      }
      return entry;
    }).join('\n\n---\n\n');

    return {
      count: docs.length,
      companyDocs: docs.filter(d => d.category === 'company' || !d.category).length,
      tenderDocs:  docs.filter(d => d.category === 'tender').length,
      previews,
    };
  } catch (e) {
    return null;
  }
}

// ── Load documents from Supabase document vault ──────────────────────────────
async function loadDocumentRepository() {
  try {
    const profile = getProfile();
    const { data: docs } = await supabase
      .from('documents')
      .select('file_name, doc_type, created_at, tenders(title)')
      .eq('company_id', profile.company_id)
      .not('doc_type', 'eq', 'task_image')
      .order('created_at', { ascending: false })
      .limit(30);
    return docs || [];
  } catch (e) {
    return [];
  }
}

// ── Build context snapshot from current page ─────────────────────────────────
async function buildContext() {
  if (_contextCache) return _contextCache;

  const profile = getProfile();
  const route = getCurrentRoute();
  const params = getRouteParams();

  const ctx = {
    user: {
      name: profile.full_name,
      role: profile.role,
      department: profile.department || 'Not set',
      company: profile.companies?.name || 'Unknown',
    },
    current_page: route?.view || 'dashboard',
    tender: null,
    task: null,
    my_tasks: [],
    recent_tenders: [],
    knowledge_base: null,
    document_repository: [],
  };

  // Load Knowledge Base from localStorage (with content decoding)
  const kb = loadKnowledgeBase();
  if (kb) {
    ctx.knowledge_base = kb;
    const indicator = document.getElementById('ai-kb-indicator');
    if (indicator) { indicator.classList.remove('hidden'); indicator.classList.add('flex'); }
  }

  // Load document repository from Supabase
  ctx.document_repository = await loadDocumentRepository();

  // Fetch tender context
  if (params.id && (route?.view === 'tender-detail' || route?.view === 'tender-compile')) {
    const { data: tender } = await supabase.from('tenders')
      .select('id, title, reference_number, status, deadline, issuing_authority, account_manager, description, ai_analysis')
      .eq('id', params.id).single();
    if (tender) {
      const { data: tasks } = await supabase.from('tasks')
        .select('id, title, status, section_type, is_mandatory, priority, assigned_to, profiles!tasks_assigned_to_fkey(full_name)')
        .eq('tender_id', params.id).order('priority', { ascending: false });
      ctx.tender = {
        ...tender,
        tasks: (tasks || []).map(t => ({
          title: t.title,
          status: t.status,
          section_type: t.section_type,
          is_mandatory: t.is_mandatory,
          priority: t.priority,
          assigned_to: t.profiles?.full_name || 'Unassigned',
        })),
        summary: tender.ai_analysis?.summary || null,
        info_items: (tender.ai_analysis?.information_items || []).slice(0, 10),
      };
      delete ctx.tender.ai_analysis;
    }
  }

  // Fetch task context
  if (params.id && route?.view === 'task-detail') {
    const { data: task } = await supabase.from('tasks')
      .select('id, title, description, content, status, section_type, is_mandatory, priority, review_notes, tender_id, tenders(title, reference_number, deadline, issuing_authority)')
      .eq('id', params.id).single();
    if (task) ctx.task = task;
  }

  // Fetch user's active tasks
  const { data: myTasks } = await supabase.from('tasks')
    .select('id, title, status, due_date, tenders(title)')
    .eq('assigned_to', profile.id)
    .in('status', ['unassigned', 'assigned', 'in_progress', 'revision_needed', 'submitted'])
    .order('due_date', { ascending: true })
    .limit(8);
  ctx.my_tasks = (myTasks || []).map(t => ({
    title: t.title,
    status: t.status,
    due: t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No deadline',
    tender: t.tenders?.title || 'Unknown',
  }));

  // Fetch recent tenders
  const { data: tenders } = await supabase.from('tenders')
    .select('title, status, deadline, reference_number')
    .eq('company_id', profile.company_id)
    .not('status', 'in', '("archived")')
    .order('created_at', { ascending: false })
    .limit(5);
  ctx.recent_tenders = (tenders || []).map(t => ({
    title: t.title,
    status: t.status,
    deadline: t.deadline ? new Date(t.deadline).toLocaleDateString() : 'No deadline',
    ref: t.reference_number || 'No ref',
  }));

  _contextCache = ctx;
  return ctx;
}

// ── Update context label in header ───────────────────────────────────────────
async function updateContextLabel() {
  const label = document.getElementById('ai-chat-context-label');
  if (!label) return;
  const route = getCurrentRoute();
  const params = getRouteParams();
  const view = route?.view || 'dashboard';

  if (view === 'tender-detail' && params.id) {
    const { data } = await supabase.from('tenders').select('title').eq('id', params.id).single();
    label.textContent = data ? `Context: ${data.title}` : 'Tender context';
  } else if (view === 'task-detail' && params.id) {
    const { data } = await supabase.from('tasks').select('title').eq('id', params.id).single();
    label.textContent = data ? `Context: ${data.title}` : 'Task context';
  } else if (view === 'knowledge-base') {
    const kb = loadKnowledgeBase();
    label.textContent = kb
      ? `Knowledge Base · ${kb.count} doc${kb.count !== 1 ? 's' : ''} (${kb.companyDocs} company, ${kb.tenderDocs} tenders)`
      : 'Knowledge Base (empty)';
  } else {
    const viewLabels = {
      dashboard: 'Dashboard overview', tenders: 'Tenders list', tasks: 'My tasks',
      users: 'User management', settings: 'Settings', documents: 'Document vault',
      'rfp-processor': 'RFP Processor', 'win-loss': 'Win / Loss Tracker', integrations: 'Integrations',
    };
    label.textContent = viewLabels[view] || 'General context';
  }
}

// ── Context-aware suggestions ─────────────────────────────────────────────────
async function refreshSuggestions() {
  const container = document.getElementById('ai-chat-suggestions');
  if (!container) return;

  const route = getCurrentRoute();
  const view = route?.view || 'dashboard';
  const kb = loadKnowledgeBase();
  const hasKB = (kb?.count || 0) > 0;

  const suggestionMap = {
    'tender-detail': ['Summarise this tender for me', 'Which tasks are still pending?', 'What are the critical deadlines?', 'Help me write the executive summary'],
    'task-detail':   ['Help me write this section', 'What should I include here?', 'How long should this section be?', 'Give me a structure to follow'],
    'knowledge-base': ['What documents do I have?', 'Summarise my company profile', 'What are our key capabilities?', 'Find relevant info for a tender'],
    'documents':     ['What documents do I have uploaded?', 'Which documents are linked to tenders?', 'Help me find a specific document'],
    'dashboard':     ['What are my most urgent tasks?', 'Which tenders need attention?', hasKB ? 'What does my Knowledge Base contain?' : 'How do I use the Knowledge Base?'],
    'tenders':       ['What makes a winning tender?', 'How should I structure my response?', hasKB ? 'Use my KB to help with a tender' : 'Explain the tender process'],
    'default':       ['How does TenderFlow work?', 'Help me with B-BBEE compliance', hasKB ? 'Search my Knowledge Base' : 'What is a good pricing strategy?'],
  };

  const suggestions = suggestionMap[view] || suggestionMap.default;
  container.innerHTML = suggestions.map(s =>
    `<button onclick="window._aiChatSuggest('${s.replace(/'/g, "\\'")}')"
      class="shrink-0 px-3 py-1.5 bg-surface-800 border border-slate-700/40 hover:border-violet-500/40 hover:bg-violet-500/10 text-slate-400 hover:text-violet-300 text-xs rounded-full transition whitespace-nowrap">
      ${s}
    </button>`
  ).join('');
}

window._aiChatSuggest = (text) => {
  const input = document.getElementById('ai-chat-input');
  if (input) { input.value = text; input.focus(); }
  window._aiChatSend();
};

// ── Send message ──────────────────────────────────────────────────────────────
window._aiChatSend = async () => {
  if (_isThinking) return;
  const input = document.getElementById('ai-chat-input');
  const userMessage = input?.value.trim();
  if (!userMessage) return;

  if (input) { input.value = ''; input.style.height = 'auto'; }

  appendUserMessage(userMessage);
  _chatHistory.push({ role: 'user', content: userMessage });

  _isThinking = true;
  const thinkingId = showThinking();
  setInputDisabled(true);

  try {
    const ctx = await buildContext();
    const systemPrompt = buildSystemPrompt(ctx);

    const { data, error: fnError } = await supabase.functions.invoke('ai-chat', {
      body: {
        system: systemPrompt,
        messages: _chatHistory.map(m => ({ role: m.role, content: m.content })),
        max_tokens: 1000,
      },
    });

    if (fnError) throw new Error(fnError.message || 'Edge function error');
    if (data?.error) throw new Error(data.error);
    const assistantMessage = data?.content?.[0]?.text || 'Sorry, I could not generate a response.';

    _chatHistory.push({ role: 'assistant', content: assistantMessage });
    removeThinking(thinkingId);
    appendAIMessage(assistantMessage);

    if (_chatHistory.length > 20) _chatHistory = _chatHistory.slice(-20);

  } catch (err) {
    removeThinking(thinkingId);
    appendAIMessage(`Sorry, I ran into an error: ${err.message}. Please try again.`, true);
    console.error('[AI Chat]', err);
  } finally {
    _isThinking = false;
    setInputDisabled(false);
    document.getElementById('ai-chat-input')?.focus();
  }
};

// ── Build system prompt with page context + KB + documents ───────────────────
function buildSystemPrompt(ctx) {
  const roleLabels = { super_admin: 'Super Administrator', it_admin: 'IT Administrator', bid_manager: 'Bid Manager', dept_user: 'Team Member' };

  let prompt = `You are TenderFlow AI, an expert assistant built into the TenderFlow Pro tender management platform. You help bid managers and their teams write winning tender proposals, understand requirements, manage tasks, and navigate the platform.

## Current User
- Name: ${ctx.user.name}
- Role: ${roleLabels[ctx.user.role] || ctx.user.role}
- Department: ${ctx.user.department}
- Company: ${ctx.user.company}
- Current page: ${ctx.current_page}

## Your Expertise
You are an expert in:
- South African tender/RFQ processes and regulations
- B-BBEE (Broad-Based Black Economic Empowerment) compliance
- Public procurement (PFMA, MFMA, PPPFA)
- Proposal writing: executive summaries, methodologies, technical proposals, pricing
- Supply Chain Management (SCM) requirements
- CSD (Central Supplier Database) registration
- Tax clearance, company registration, professional memberships
- Bid strategy and win themes
- Project management and implementation plans`;

  // ── Knowledge Base context ──
  if (ctx.knowledge_base) {
    prompt += `

## Company Knowledge Base (${ctx.knowledge_base.count} documents — ${ctx.knowledge_base.companyDocs} company docs, ${ctx.knowledge_base.tenderDocs} past tenders)
The user has uploaded the following documents. Use these when answering questions about company capabilities, internal processes, or when helping write tender responses:

${ctx.knowledge_base.previews}

When answering questions about the company, reference these documents by name and use their content to give accurate, specific answers. If a document has readable content, use it directly to answer questions.`;
  } else {
    prompt += `

## Knowledge Base
No documents have been uploaded to the Knowledge Base yet. Suggest uploading .txt or .md versions of company documents (profile, capabilities, past proposals) for better AI assistance.`;
  }

  // ── Document repository context ──
  if (ctx.document_repository?.length) {
    prompt += `

## Document Repository (${ctx.document_repository.length} files)
${ctx.document_repository.map(doc =>
  `- ${doc.file_name} [${(doc.doc_type || 'document').replace(/_/g, ' ')}]${doc.tenders?.title ? ` — linked to: ${doc.tenders.title}` : ''} (${new Date(doc.created_at).toLocaleDateString()})`
).join('\n')}`;
  }

  // ── Tender context ──
  if (ctx.tender) {
    prompt += `

## Current Tender Context
- Title: ${ctx.tender.title}
- Reference: ${ctx.tender.reference_number || 'Not set'}
- Status: ${ctx.tender.status}
- Deadline: ${ctx.tender.deadline ? new Date(ctx.tender.deadline).toLocaleDateString() : 'Not set'}
- Issuing Authority: ${ctx.tender.issuing_authority || 'Not set'}
- Account Manager: ${ctx.tender.account_manager || 'Not set'}
${ctx.tender.summary ? `- AI Summary: ${ctx.tender.summary}` : ''}

### Tasks (${ctx.tender.tasks?.length || 0} total):
${(ctx.tender.tasks || []).map(t =>
  `- [${t.status.toUpperCase()}] ${t.title} (${t.section_type || 'general'})${t.is_mandatory ? ' ⚠ MANDATORY' : ''}${t.assigned_to !== 'Unassigned' ? ` → ${t.assigned_to}` : ' → Unassigned'}`
).join('\n') || 'No tasks yet'}

${ctx.tender.info_items?.length ? `### Key Information:\n${ctx.tender.info_items.map(i => `- ${i.title}: ${i.detail}`).join('\n')}` : ''}`;
  }

  // ── Task context ──
  if (ctx.task) {
    prompt += `

## Current Task Context
- Task Title: ${ctx.task.title}
- Section Type: ${ctx.task.section_type || 'general'}
- Status: ${ctx.task.status}
- Mandatory: ${ctx.task.is_mandatory ? 'Yes' : 'No'}
- Tender: ${ctx.task.tenders?.title || 'Unknown'} (${ctx.task.tenders?.reference_number || ''})
- Deadline: ${ctx.task.tenders?.deadline ? new Date(ctx.task.tenders.deadline).toLocaleDateString() : 'Not set'}
${ctx.task.description ? `- Brief: ${ctx.task.description}` : ''}
${ctx.task.review_notes ? `- Revision Notes: ${ctx.task.review_notes}` : ''}
${ctx.task.content ? `- Current Content (first 500 chars): ${ctx.task.content.substring(0, 500)}${ctx.task.content.length > 500 ? '...' : ''}` : '- No content written yet'}`;
  }

  if (ctx.my_tasks?.length) {
    prompt += `

## User's Active Tasks
${ctx.my_tasks.map(t => `- [${t.status}] "${t.title}" — ${t.tender} (Due: ${t.due})`).join('\n')}`;
  }

  if (ctx.recent_tenders?.length) {
    prompt += `

## Company's Active Tenders
${ctx.recent_tenders.map(t => `- ${t.title} [${t.status}] Ref: ${t.ref} — Due: ${t.deadline}`).join('\n')}`;
  }

  prompt += `

## Response Guidelines
- Be concise but thorough
- Use markdown formatting where helpful
- When helping write content, provide actual draft text
- For South African tenders, consider PPPFA 80/20 or 90/10, B-BBEE, and CSD requirements
- Reference specific Knowledge Base documents by name when answering questions about company capabilities
- If KB documents have content previews, use that information to give accurate, company-specific answers
- Never make up tender requirements or deadlines not in the context
- If something isn't in the KB, say so and suggest what documents would help`;

  return prompt;
}

// ── UI helpers ────────────────────────────────────────────────────────────────
function appendUserMessage(text) {
  const msgs = document.getElementById('ai-chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg-user flex justify-end';
  div.innerHTML = `<div class="bg-violet-600/80 text-white rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm max-w-[85%] leading-relaxed">${escapeHtml(text)}</div>`;
  msgs.appendChild(div);
  scrollToBottom();
}

function appendAIMessage(text, isError = false) {
  const msgs = document.getElementById('ai-chat-messages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'chat-msg-ai flex gap-3';
  div.innerHTML = `
    <div class="w-6 h-6 ${isError ? 'bg-red-600' : 'bg-violet-600'} rounded-full flex items-center justify-center shrink-0 mt-0.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
    </div>
    <div class="${isError ? 'bg-red-500/10 border-red-500/20' : 'bg-surface-800 border-slate-700/40'} border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-300 max-w-[85%] chat-prose leading-relaxed">
      ${markdownToHtml(text)}
    </div>`;
  msgs.appendChild(div);
  scrollToBottom();
  if (!_isOpen) document.getElementById('ai-chat-badge')?.classList.remove('hidden');
}

function showThinking() {
  const msgs = document.getElementById('ai-chat-messages');
  if (!msgs) return null;
  const id = `thinking-${Date.now()}`;
  const div = document.createElement('div');
  div.id = id;
  div.className = 'chat-msg-ai flex gap-3';
  div.innerHTML = `
    <div class="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
    </div>
    <div class="bg-surface-800 border border-slate-700/40 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1.5">
      <span class="thinking-dot w-2 h-2 bg-violet-400 rounded-full"></span>
      <span class="thinking-dot w-2 h-2 bg-violet-400 rounded-full"></span>
      <span class="thinking-dot w-2 h-2 bg-violet-400 rounded-full"></span>
    </div>`;
  msgs.appendChild(div);
  scrollToBottom();
  return id;
}

function removeThinking(id) { if (id) document.getElementById(id)?.remove(); }
function setInputDisabled(disabled) {
  const input = document.getElementById('ai-chat-input');
  const btn = document.getElementById('ai-chat-send');
  if (input) input.disabled = disabled;
  if (btn) btn.disabled = disabled;
}
function scrollToBottom() {
  const msgs = document.getElementById('ai-chat-messages');
  if (msgs) setTimeout(() => msgs.scrollTop = msgs.scrollHeight, 50);
}
function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
}
function markdownToHtml(text) {
  return text
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:#1e293b;padding:8px 12px;border-radius:6px;overflow-x:auto;font-size:0.8em;margin:6px 0;"><code>$1</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.+)/, '<p>$1')
    .replace(/(.+)$/, '$1</p>');
}
