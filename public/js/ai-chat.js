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

// ── Mount the chat button + panel into the DOM ───────────────────────────────
export function mountAIChat() {
  // Only show for bid_manager and above
  const profile = getProfile();
  if (!profile || !hasRoleLevel('bid_manager')) return;

  // Inject styles
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
    #ai-chat-btn {
      transition: all 0.2s ease;
    }
    #ai-chat-btn:hover {
      transform: scale(1.05);
    }
    .chat-msg-user { animation: msgIn 0.2s ease-out; }
    .chat-msg-ai   { animation: msgIn 0.2s ease-out; }
    @keyframes msgIn {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .thinking-dot {
      animation: blink 1.2s infinite;
    }
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
  `;
  document.head.appendChild(style);

  // Chat button
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

  // Chat panel
  const panel = document.createElement('div');
  panel.id = 'ai-chat-panel';
  panel.className = 'hidden-panel fixed bottom-0 right-0 z-[160] w-full max-w-md h-[85vh] bg-surface-900 border-l border-t border-slate-700/60 shadow-2xl flex flex-col rounded-tl-2xl';
  panel.innerHTML = `
    <!-- Header -->
    <div class="flex items-center gap-3 px-4 py-3 border-b border-slate-700/60 shrink-0">
      <div class="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm font-semibold text-white">TenderFlow AI</p>
        <p class="text-xs text-slate-500" id="ai-chat-context-label">Loading context...</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="window._aiChatClear()" title="Clear chat" class="text-slate-500 hover:text-slate-300 transition p-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-3.51"/></svg>
        </button>
        <button onclick="window._aiChatClose()" class="text-slate-500 hover:text-slate-300 transition p-1 rounded">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>

    <!-- Messages -->
    <div id="ai-chat-messages" class="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div class="chat-msg-ai flex gap-3">
        <div class="w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
        </div>
        <div class="bg-surface-800 border border-slate-700/40 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-slate-300 max-w-[85%] chat-prose">
          <p>Hi! I'm your TenderFlow assistant. I can see your current page context and help with:</p>
          <ul>
            <li>Writing proposal sections</li>
            <li>Understanding tender requirements</li>
            <li>Task and deadline questions</li>
            <li>B-BBEE, compliance, and bid strategy</li>
          </ul>
          <p class="mt-2 text-slate-400 text-xs">Ask me anything about this tender or your tasks.</p>
        </div>
      </div>
    </div>

    <!-- Suggestions -->
    <div id="ai-chat-suggestions" class="px-4 py-2 flex gap-2 overflow-x-auto shrink-0 border-t border-slate-800/60">
    </div>

    <!-- Input -->
    <div class="px-4 py-3 border-t border-slate-700/60 shrink-0">
      <div class="flex gap-2 items-end">
        <textarea
          id="ai-chat-input"
          rows="1"
          placeholder="Ask anything about this tender..."
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
      <p class="text-[10px] text-slate-600 mt-1.5 text-center">Powered by Claude · Context-aware</p>
    </div>
  `;
  document.body.appendChild(panel);

  // Load context when page changes
  window.addEventListener('hashchange', () => {
    _contextCache = null;
    updateContextLabel();
    refreshSuggestions();
  });

  updateContextLabel();
  refreshSuggestions();
}

// ── Toggle panel ──────────────────────────────────────────────────────────────
function toggleChat() {
  _isOpen ? closeChat() : openChat();
}

function openChat() {
  _isOpen = true;
  const panel = document.getElementById('ai-chat-panel');
  if (panel) { panel.classList.remove('hidden-panel'); panel.classList.add('visible-panel'); }
  document.getElementById('ai-chat-badge')?.classList.add('hidden');
  // Hide floating button while panel is open
  const btn = document.getElementById('ai-chat-btn');
  if (btn) btn.style.display = 'none';
  setTimeout(() => document.getElementById('ai-chat-input')?.focus(), 300);
}

function closeChat() {
  _isOpen = false;
  const panel = document.getElementById('ai-chat-panel');
  if (panel) { panel.classList.add('hidden-panel'); panel.classList.remove('visible-panel'); }
  // Show floating button again
  const btn = document.getElementById('ai-chat-btn');
  if (btn) btn.style.display = '';
}

window._aiChatClose = closeChat;
window._aiChatClear = () => {
  _chatHistory = [];
  _contextCache = null;
  const msgs = document.getElementById('ai-chat-messages');
  if (msgs) msgs.innerHTML = '';
  appendAIMessage("Chat cleared. I still have context from your current page — ask me anything!");
  refreshSuggestions();
};

window._aiChatKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); window._aiChatSend(); }
};

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
  };

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
      // Remove full ai_analysis to keep context lean
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

  // Fetch user's active tasks (always useful)
  const { data: myTasks } = await supabase.from('tasks')
    .select('id, title, status, due_date, tenders(title)')
    .eq('assigned_to', profile.id)
    .not('status', 'in', '("approved","archived")')
    .order('due_date', { ascending: true })
    .limit(8);
  ctx.my_tasks = (myTasks || []).map(t => ({
    title: t.title,
    status: t.status,
    due: t.due_date ? new Date(t.due_date).toLocaleDateString() : 'No deadline',
    tender: t.tenders?.title || 'Unknown',
  }));

  // Fetch recent tenders for context
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
  } else {
    const viewLabels = {
      dashboard: 'Dashboard overview',
      tenders: 'Tenders list',
      tasks: 'My tasks',
      users: 'User management',
      settings: 'Settings',
      documents: 'Document vault',
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

  const suggestionMap = {
    'tender-detail': [
      'Summarise this tender for me',
      'Which tasks are still pending?',
      'What are the critical deadlines?',
      'Help me write the executive summary',
    ],
    'task-detail': [
      'Help me write this section',
      'What should I include here?',
      'How long should this section be?',
      'Give me a structure to follow',
    ],
    'dashboard': [
      'What are my most urgent tasks?',
      'Which tenders need attention?',
      'Help me prioritise my work',
    ],
    'tenders': [
      'What makes a winning tender?',
      'How should I structure my response?',
      'Explain the tender process',
    ],
    'default': [
      'How does TenderFlow work?',
      'Help me with B-BBEE compliance',
      'What is a good pricing strategy?',
    ],
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

  // Clear input
  if (input) { input.value = ''; input.style.height = 'auto'; }

  // Add user message to UI
  appendUserMessage(userMessage);

  // Add to history
  _chatHistory.push({ role: 'user', content: userMessage });

  // Show thinking indicator
  _isThinking = true;
  const thinkingId = showThinking();
  setInputDisabled(true);

  try {
    // Build context (cached after first call per page)
    const ctx = await buildContext();

    // Build system prompt
    const systemPrompt = buildSystemPrompt(ctx);

    // Call Claude API
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        system: systemPrompt,
        messages: _chatHistory.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || `API error ${response.status}`);
    }

    const data = await response.json();
    const assistantMessage = data.content?.[0]?.text || 'Sorry, I could not generate a response.';

    // Add to history
    _chatHistory.push({ role: 'assistant', content: assistantMessage });

    // Remove thinking, show response
    removeThinking(thinkingId);
    appendAIMessage(assistantMessage);

    // Keep history to last 20 messages to avoid token bloat
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

// ── Build system prompt with page context ────────────────────────────────────
function buildSystemPrompt(ctx) {
  const roleLabels = {
    super_admin: 'Super Administrator',
    it_admin: 'IT Administrator',
    bid_manager: 'Bid Manager',
    dept_user: 'Team Member',
  };

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

### Tasks on this Tender (${ctx.tender.tasks?.length || 0} total):
${(ctx.tender.tasks || []).map(t =>
  `- [${t.status.toUpperCase()}] ${t.title} (${t.section_type || 'general'})${t.is_mandatory ? ' ⚠ MANDATORY' : ''}${t.assigned_to !== 'Unassigned' ? ` → ${t.assigned_to}` : ' → Unassigned'}`
).join('\n') || 'No tasks yet'}

${ctx.tender.info_items?.length ? `### Key Information Items:
${ctx.tender.info_items.map(i => `- ${i.title}: ${i.detail}`).join('\n')}` : ''}`;
  }

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
- Be concise but thorough — this is a chat interface, not a document
- Use markdown formatting: **bold**, bullet lists, numbered lists where helpful
- When helping write content, provide actual draft text they can copy into their task
- For South African tenders, always consider PPPFA 80/20 or 90/10 scoring, B-BBEE requirements, and CSD requirements
- If asked to write a section, produce a proper professional draft suitable for a tender submission
- Reference specific task names, deadlines, and tender details from the context above when relevant
- Keep responses focused — if a question is vague, answer the most likely interpretation then ask for clarification
- Never make up tender requirements or deadlines not in the context`;

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

  // Show badge if panel is closed
  if (!_isOpen) {
    document.getElementById('ai-chat-badge')?.classList.remove('hidden');
  }
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

function removeThinking(id) {
  if (id) document.getElementById(id)?.remove();
}

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
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>');
}

function markdownToHtml(text) {
  return text
    // Code blocks
    .replace(/```[\w]*\n?([\s\S]*?)```/g, '<pre style="background:#1e293b;padding:8px 12px;border-radius:6px;overflow-x:auto;font-size:0.8em;margin:6px 0;"><code>$1</code></pre>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    // H3
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    // H2
    .replace(/^## (.+)$/gm, '<h3>$1</h3>')
    // Unordered lists
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Ordered lists
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Paragraphs (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines
    .replace(/\n/g, '<br>')
    // Wrap in paragraph
    .replace(/^(.+)/, '<p>$1')
    .replace(/(.+)$/, '$1</p>');
}

console.log('[TenderFlow] AI Chat module loaded');