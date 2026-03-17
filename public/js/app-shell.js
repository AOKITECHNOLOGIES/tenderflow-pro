// ============================================================================
// TenderFlow Pro — App Shell
// ============================================================================

import { supabase } from './supabase-client.js';
import {
  getProfile, onAuthChange, logout, hasRoleLevel, isSuperAdmin,
  saveDraftOffline, getDraftOffline, syncDraftsToServer,
  canInstallPWA, promptPWAInstall,
} from './auth.js';
import { initRouter, navigate, getSidebarItems, getRouteParams, getCurrentRoute } from './router.js';

const ICONS = {
  grid:          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  'check-square':'<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
  'file-text':   '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>',
  folder:        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>',
  award:         '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"/><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"/></svg>',
  users:         '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  shield:        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  building:      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="6" x2="9" y2="6"/><line x1="15" y1="6" x2="15" y2="6"/><line x1="9" y1="10" x2="9" y2="10"/><line x1="15" y1="10" x2="15" y2="10"/><line x1="9" y1="14" x2="9" y2="14"/><line x1="15" y1="14" x2="15" y2="14"/><line x1="9" y1="18" x2="15" y2="18"/></svg>',
  'bar-chart':   '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  settings:      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  'log-out':     '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
  plus:          '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  upload:        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
  search:        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>',
  globe:         '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
  chevron:       '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
  download:      '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
};

function icon(name) { return ICONS[name] || ''; }

let _viewScope = 'global';
let _selectedCompanyId = null;

export function getViewScope() { return _viewScope; }
export function getSelectedCompanyId() { return _selectedCompanyId; }

function statCard(label, value, sublabel = '', color = 'brand') {
  const colors = {
    brand:   'from-brand-500/10 to-brand-500/5 border-brand-500/20',
    emerald: 'from-emerald-500/10 to-emerald-500/5 border-emerald-500/20',
    amber:   'from-amber-500/10 to-amber-500/5 border-amber-500/20',
    red:     'from-red-500/10 to-red-500/5 border-red-500/20',
    violet:  'from-violet-500/10 to-violet-500/5 border-violet-500/20',
  };
  return `<div class="bg-gradient-to-br ${colors[color]} border rounded-xl p-5">
    <p class="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">${label}</p>
    <p class="text-2xl font-bold text-white">${value}</p>
    ${sublabel ? `<p class="text-xs text-slate-500 mt-1">${sublabel}</p>` : ''}
  </div>`;
}

function statusBadge(status) {
  const map = {
    draft: 'bg-slate-500/15 text-slate-400', analyzing: 'bg-violet-500/15 text-violet-400',
    in_progress: 'bg-brand-500/15 text-brand-400', review: 'bg-amber-500/15 text-amber-400',
    approved: 'bg-emerald-500/15 text-emerald-400', submitted: 'bg-emerald-600/20 text-emerald-300',
    archived: 'bg-slate-600/15 text-slate-500', unassigned: 'bg-slate-500/15 text-slate-400',
    assigned: 'bg-brand-500/15 text-brand-400', revision_needed: 'bg-red-500/15 text-red-400',
  };
  const label = (status || 'unknown').replace(/_/g, ' ');
  return `<span class="inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${map[status] || map.draft}">${label}</span>`;
}

async function getDepartments() {
  const profile = getProfile();
  const companyId = _selectedCompanyId || profile.company_id;
  let query = supabase.from('profiles').select('department').not('department', 'is', null);
  if (companyId) query = query.eq('company_id', companyId);
  const { data } = await query;
  return [...new Set((data || []).map(d => d.department).filter(Boolean))].sort();
}

function renderSidebar() {
  const profile = getProfile();
  if (!profile) return '';
  const items = getSidebarItems(profile.role);
  const currentPath = (window.location.hash || '#/').replace('#', '');
  const roleBadge = { super_admin: 'Super Admin', it_admin: 'IT Admin', bid_manager: 'Bid Manager', dept_user: 'Team Member' };

  let html = `<aside id="sidebar" class="w-64 h-full bg-surface-950 border-r border-slate-800/60 flex flex-col shrink-0 overflow-hidden">
    <div class="p-5 border-b border-slate-800/60">
      <div class="flex items-center gap-2.5">
        <div class="w-9 h-9 bg-brand-500 rounded-lg flex items-center justify-center shrink-0"><span class="text-white font-bold text-base">T</span></div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-white truncate">TenderFlow Pro</p>
          <p class="text-[10px] text-slate-500 truncate">${profile.companies?.name || 'Global Admin'}</p>
        </div>
      </div>
    </div>`;

  if (isSuperAdmin()) {
    html += `<div class="px-4 py-3 border-b border-slate-800/60">
      <label class="text-[10px] uppercase tracking-wider text-slate-500 font-medium mb-2 block">View Scope</label>
      <div class="flex bg-surface-900 rounded-lg p-0.5">
        <button id="scope-global" class="flex-1 text-xs py-1.5 rounded-md text-center transition ${_viewScope === 'global' ? 'bg-brand-500/20 text-brand-400 font-medium' : 'text-slate-400 hover:text-slate-300'}" onclick="window._setScope('global')">${icon('globe')} Global</button>
        <button id="scope-company" class="flex-1 text-xs py-1.5 rounded-md text-center transition ${_viewScope === 'company' ? 'bg-brand-500/20 text-brand-400 font-medium' : 'text-slate-400 hover:text-slate-300'}" onclick="window._setScope('company')">${icon('building')} Company</button>
      </div>
      <select id="scope-company-select" class="${_viewScope === 'company' ? '' : 'hidden'} mt-2 w-full text-xs bg-surface-900 border border-slate-700/50 rounded-lg px-2 py-1.5 text-slate-300" onchange="window._selectCompany(this.value)">
        <option value="">Select company...</option>
      </select>
    </div>`;
  }

  html += `<nav class="flex-1 overflow-y-auto py-3 px-3 space-y-0.5">`;
  for (const item of items) {
    if (item.type === 'divider') { html += `<p class="text-[10px] uppercase tracking-wider text-slate-600 font-medium px-3 pt-5 pb-1">${item.label}</p>`; continue; }
    const isActive = currentPath === item.path || (item.path !== '/dashboard' && currentPath.startsWith(item.path));
    html += `<a href="#${item.path}" class="sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'active text-brand-400' : 'text-slate-400 hover:text-slate-200'}">${icon(item.icon)}<span>${item.label}</span></a>`;
  }
  html += `</nav>`;

  html += `<div class="p-4 border-t border-slate-800/60">
    <div class="flex items-center gap-3 mb-3">
      <div class="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-400 text-xs font-bold shrink-0">${(profile.full_name || 'U').charAt(0).toUpperCase()}</div>
      <div class="min-w-0 flex-1">
        <p class="text-sm text-white truncate font-medium">${profile.full_name}</p>
        <p class="text-[10px] text-slate-500">${roleBadge[profile.role]}</p>
      </div>
    </div>
    <button onclick="window._logout()" class="w-full flex items-center justify-center gap-2 text-xs text-slate-400 hover:text-red-400 py-1.5 rounded-lg hover:bg-red-500/5 transition">${icon('log-out')} Sign out</button>
  </div></aside>`;

  return html;
}

const views = {

  async dashboard() {
    const profile = getProfile();
    const companyFilter = isSuperAdmin() && _viewScope === 'global' ? {} : { company_id: _selectedCompanyId || profile.company_id };
    const [tenders, tasks, myTasks] = await Promise.all([
      supabase.from('tenders').select('id, status, deadline', { count: 'exact' }).match(companyFilter),
      supabase.from('tasks').select('id, status', { count: 'exact' }).match(companyFilter),
      supabase.from('tasks').select('id, status, title, due_date, tenders(title)').eq('assigned_to', profile.id).neq('status', 'approved').limit(10),
    ]);
    const tenderCount = tenders.count || 0;
    const taskCount = tasks.count || 0;
    const activeTenders = (tenders.data || []).filter(t => !['submitted', 'archived'].includes(t.status)).length;
    const pendingTasks = (myTasks.data || []).length;

    let html = `<div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Dashboard</h1>
          <p class="text-sm text-slate-400 mt-0.5">${isSuperAdmin() && _viewScope === 'global' ? 'Global Overview' : _selectedCompanyId ? 'Company View' : profile.companies?.name || 'Overview'}</p>
        </div>
        ${hasRoleLevel('bid_manager') ? `<a href="#/tenders/new" class="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">${icon('plus')} New Tender</a>` : ''}
      </div>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${statCard('Total Tenders', tenderCount, '', 'brand')}
        ${statCard('Active Tenders', activeTenders, '', 'emerald')}
        ${statCard('Total Tasks', taskCount, '', 'violet')}
        ${statCard('My Pending', pendingTasks, '', 'amber')}
      </div>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-700/40"><h2 class="text-sm font-semibold text-white">My Active Tasks</h2></div>
        <div class="divide-y divide-slate-700/30">`;

    if (myTasks.data?.length > 0) {
      for (const task of myTasks.data) {
        html += `<a href="#/tasks/${task.id}" class="flex items-center justify-between px-5 py-3 hover:bg-slate-700/10 transition">
          <div class="min-w-0"><p class="text-sm text-white truncate">${task.title}</p><p class="text-xs text-slate-500">${task.tenders?.title || 'Unlinked'}</p></div>
          <div class="flex items-center gap-3 shrink-0">${statusBadge(task.status)}${task.due_date ? `<span class="text-xs text-slate-500">${new Date(task.due_date).toLocaleDateString()}</span>` : ''}</div>
        </a>`;
      }
    } else {
      html += `<div class="px-5 py-8 text-center text-sm text-slate-500">No active tasks assigned to you.</div>`;
    }
    html += `</div></div></div>`;
    return html;
  },

  async tenders() {
    const profile = getProfile();
    const query = supabase.from('tenders').select('*, profiles!tenders_created_by_fkey(full_name)').order('created_at', { ascending: false });
    if (!(isSuperAdmin() && _viewScope === 'global')) query.eq('company_id', _selectedCompanyId || profile.company_id);
    const { data: tenders } = await query;

    let html = `<div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-white">Tenders</h1>
        <a href="#/tenders/new" class="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">${icon('plus')} New Tender</a>
      </div>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-700/40 text-left">
            <th class="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Title</th>
            <th class="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Status</th>
            <th class="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Deadline</th>
            <th class="px-5 py-3 text-xs font-medium text-slate-400 uppercase tracking-wider">Created By</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    if (tenders?.length > 0) {
      for (const t of tenders) {
        html += `<tr class="hover:bg-slate-700/10 transition cursor-pointer" onclick="location.hash='#/tenders/${t.id}'">
          <td class="px-5 py-3"><p class="text-white font-medium">${t.title}</p><p class="text-xs text-slate-500">${t.reference_number || 'No ref'}</p></td>
          <td class="px-5 py-3">${statusBadge(t.status)}</td>
          <td class="px-5 py-3 text-slate-400">${t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}</td>
          <td class="px-5 py-3 text-slate-400">${t.profiles?.full_name || '—'}</td>
        </tr>`;
      }
    } else {
      html += `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-500">No tenders found.</td></tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
  },

  async 'tender-create'() {
    return `<div class="view-enter max-w-2xl space-y-6">
      <h1 class="text-xl font-bold text-white">Create New Tender</h1>
      <div id="tender-form-error" class="hidden p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
      <form id="create-tender-form" class="space-y-5">
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Tender Title *</label>
          <input id="tf-title" type="text" required class="w-full px-4 py-2.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition" placeholder="e.g. Municipal Infrastructure Development 2026" />
        </div>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Reference Number</label>
            <input id="tf-ref" type="text" class="w-full px-4 py-2.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition" placeholder="RFQ-2026-001" />
          </div>
          <div>
            <label class="block text-sm font-medium text-slate-300 mb-1.5">Deadline</label>
            <input id="tf-deadline" type="datetime-local" class="w-full px-4 py-2.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition" />
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Issuing Authority</label>
          <input id="tf-authority" type="text" class="w-full px-4 py-2.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition" placeholder="Department of Public Works" />
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Description</label>
          <textarea id="tf-desc" rows="3" class="w-full px-4 py-2.5 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition resize-none" placeholder="Brief description of the tender scope..."></textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-300 mb-1.5">Upload RFQ Document</label>
          <div id="rfq-dropzone" class="border-2 border-dashed border-slate-600/50 rounded-lg p-8 text-center hover:border-brand-500/40 transition cursor-pointer">
            <div class="text-slate-400">${icon('upload')}</div>
            <p class="text-sm text-slate-400 mt-2">Drag & drop or click to upload PDF/DOCX</p>
            <input id="tf-rfq-file" type="file" accept=".pdf,.doc,.docx" class="hidden" />
          </div>
          <p id="rfq-file-name" class="text-xs text-brand-400 mt-1 hidden"></p>
        </div>
        <div class="flex gap-3">
          <button type="submit" class="px-6 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-medium rounded-lg transition">Create Tender</button>
          <a href="#/tenders" class="px-6 py-2.5 border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700/20 transition">Cancel</a>
        </div>
      </form>
    </div>`;
  },

  async 'tender-detail'() {
    const { id } = getRouteParams();
    const { data: tender } = await supabase.from('tenders').select('*, profiles!tenders_created_by_fkey(full_name)').eq('id', id).single();
    if (!tender) return '<div class="p-8 text-center text-slate-500">Tender not found.</div>';
    const { data: tasks } = await supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name)').eq('tender_id', id).order('priority', { ascending: false });
    const isLocked = ['submitted', 'archived'].includes(tender.status);

    let html = `<div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <div>
          <p class="text-xs text-slate-500 mb-1">${tender.reference_number || 'No reference'}</p>
          <h1 class="text-xl font-bold text-white">${tender.title}</h1>
          <div class="flex items-center gap-3 mt-2">
            ${statusBadge(tender.status)}
            ${isLocked ? '<span class="text-xs text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">🔒 Read-Only</span>' : ''}
            ${tender.deadline ? `<span class="text-xs text-slate-500">Due: ${new Date(tender.deadline).toLocaleDateString()}</span>` : ''}
          </div>
        </div>
        <div class="flex gap-2">
          ${!isLocked && hasRoleLevel('it_admin') ? `
            <button onclick="window._editTender('${id}')" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Edit</button>
            <button onclick="window._deleteTender('${id}')" class="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition">Delete</button>
          ` : ''}
          ${!isLocked && hasRoleLevel('bid_manager') ? `<a href="#/tenders/${id}/compile" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition">Compile & Submit</a>` : ''}
        </div>
      </div>
      ${tender.ai_analysis ? `<div class="bg-violet-500/5 border border-violet-500/20 rounded-xl p-5"><h3 class="text-sm font-semibold text-violet-300 mb-2">AI Analysis Summary</h3><p class="text-xs text-slate-400">${tender.ai_analysis.summary || 'Analysis complete.'}</p></div>` : ''}
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <div class="px-5 py-4 border-b border-slate-700/40 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">Tasks (${(tasks || []).length})</h2>
          ${!isLocked && hasRoleLevel('bid_manager') ? `<button class="text-xs text-brand-400 hover:text-brand-300" onclick="window._addTask('${id}')">+ Add Task</button>` : ''}
        </div>
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-700/40">
            <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Section</th>
            <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Assigned To</th>
            <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Status</th>
            <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Priority</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    for (const task of (tasks || [])) {
      const priority = ['Normal', 'High', 'Critical'][task.priority] || 'Normal';
      const prioColor = ['text-slate-400', 'text-amber-400', 'text-red-400'][task.priority] || 'text-slate-400';
      html += `<tr class="hover:bg-slate-700/10 cursor-pointer" onclick="location.hash='#/tasks/${task.id}'">
        <td class="px-5 py-3"><p class="text-white">${task.title}</p><p class="text-xs text-slate-500">${task.section_type || '—'}</p></td>
        <td class="px-5 py-3 text-slate-400">${task.profiles?.full_name || '<span class="text-slate-600">Unassigned</span>'}</td>
        <td class="px-5 py-3">${statusBadge(task.status)}</td>
        <td class="px-5 py-3 ${prioColor} text-xs font-medium">${priority}</td>
      </tr>`;
    }
    if (!tasks?.length) html += `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-500">No tasks yet. Upload an RFQ for AI analysis or add manually.</td></tr>`;
    html += `</tbody></table></div></div>`;
    return html;
  },

  async tasks() {
    const profile = getProfile();
    let query = supabase.from('tasks').select('*, tenders(title, deadline), profiles!tasks_assigned_to_fkey(full_name)').order('priority', { ascending: false });
    if (!isSuperAdmin()) query = query.eq('assigned_to', profile.id);
    const { data: tasks } = await query.limit(50);

    let html = `<div class="view-enter space-y-6">
      <h1 class="text-xl font-bold text-white">${isSuperAdmin() ? 'All Tasks' : 'My Tasks'}</h1>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-700/40">
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Task</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Tender</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Due</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    for (const t of (tasks || [])) {
      html += `<tr class="hover:bg-slate-700/10 cursor-pointer" onclick="location.hash='#/tasks/${t.id}'">
        <td class="px-5 py-3"><p class="text-white">${t.title}</p></td>
        <td class="px-5 py-3 text-slate-400">${t.tenders?.title || '—'}</td>
        <td class="px-5 py-3">${statusBadge(t.status)}</td>
        <td class="px-5 py-3 text-slate-400 text-xs">${t.due_date ? new Date(t.due_date).toLocaleDateString() : '—'}</td>
      </tr>`;
    }
    if (!tasks?.length) html += `<tr><td colspan="4" class="px-5 py-8 text-center text-slate-500">No tasks assigned.</td></tr>`;
    html += `</tbody></table></div></div>`;
    return html;
  },

  async 'task-detail'() {
    const { id } = getRouteParams();
    const { data: task } = await supabase.from('tasks')
  .select('id, title, content, description, status, is_mandatory, review_notes, tender_id, assigned_to, priority, due_date')
  .eq('id', id).single();
const { data: taskTender } = await supabase.from('tenders').select('title, status').eq('id', task?.tender_id).maybeSingle();
if (task) task.tenders = taskTender;
    if (!task) return '<div class="p-8 text-center text-slate-500">Task not found.</div>';
    const isLocked = ['submitted', 'archived'].includes(task.tenders?.status);
    const canEdit = !isLocked && (task.assigned_to === getProfile().id || hasRoleLevel('bid_manager'));
    const draft = getDraftOffline(id);

    return `<div class="view-enter max-w-3xl space-y-6">
      <div>
        <a href="#/tenders/${task.tender_id}" class="text-xs text-brand-400 hover:text-brand-300">← ${task.tenders?.title || 'Back'}</a>
        <h1 class="text-xl font-bold text-white mt-2">${task.title}</h1>
        <div class="flex items-center gap-3 mt-2">
          ${statusBadge(task.status)}
          ${task.is_mandatory ? '<span class="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">Mandatory</span>' : ''}
          ${isLocked ? '<span class="text-xs bg-amber-500/10 text-amber-400 px-2 py-0.5 rounded">🔒 Locked</span>' : ''}
        </div>
      </div>
      ${task.description ? `<p class="text-sm text-slate-400">${task.description}</p>` : ''}
      ${hasRoleLevel('bid_manager') && !isLocked ? `<div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5">
        <h2 class="text-sm font-semibold text-white mb-4">Assignment & Settings</h2>
        <div id="task-assign-error" class="hidden mb-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm"></div>
        <div id="task-assign-fields" class="space-y-3">
          <div class="shimmer h-8 rounded"></div>
        </div>
      </div>` : ''}
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">Section Content</h2>
          ${draft && !draft.synced ? '<span class="text-xs text-amber-400">Unsaved draft</span>' : ''}
        </div>
        <div class="p-5">
          <textarea id="task-content-editor" rows="14" ${canEdit ? '' : 'disabled'}
            class="w-full px-4 py-3 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm leading-relaxed focus:ring-2 focus:ring-brand-500/40 focus:border-brand-500 transition resize-none disabled:opacity-50 font-mono"
            placeholder="Write your section content here...">${draft?.content || task.content || ''}</textarea>
          ${canEdit ? `<div class="flex items-center justify-between mt-3">
            <p id="save-status" class="text-xs text-slate-500">Auto-saves offline</p>
            <div class="flex gap-2">
              ${task.status === 'assigned' ? `<button onclick="window._startTask('${id}')" class="px-4 py-2 bg-violet-500 hover:bg-violet-600 text-white text-xs font-medium rounded-lg transition">Start Working</button>` : ''}
              <button onclick="window._saveTaskContent('${id}')" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-xs font-medium rounded-lg transition">Save to Server</button>
              ${task.status === 'in_progress' ? `<button onclick="window._submitTask('${id}')" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition">Submit for Review</button>` : ''}
              ${task.status === 'submitted' && hasRoleLevel('bid_manager') ? `
                <button onclick="window._approveTask('${id}')" class="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-lg transition">Approve</button>
                <button onclick="window._requestRevision('${id}')" class="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded-lg transition">Request Revision</button>` : ''}
            </div>
          </div>` : ''}
          ${task.review_notes ? `<p class="text-xs text-amber-400 mt-2">📝 Revision notes: ${task.review_notes}</p>` : ''}
        </div>
      </div>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <div class="px-5 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h2 class="text-sm font-semibold text-white">Attachments</h2>
          ${canEdit ? `<button onclick="document.getElementById('task-file-input').click()" class="text-xs text-brand-400 hover:text-brand-300">${icon('upload')} Upload</button>` : ''}
        </div>
        <div id="task-documents-list" class="p-5 text-sm text-slate-500">Loading...</div>
        <input id="task-file-input" type="file" class="hidden" onchange="window._uploadTaskDoc('${id}', this)" />
      </div>
    </div>`;
  },

  async documents() {
    const profile = getProfile();
    const { data: docs } = await supabase.from('documents')
      .select('*, profiles!documents_uploaded_by_fkey(full_name), tenders(title)')
      .eq('company_id', _selectedCompanyId || profile.company_id)
      .order('created_at', { ascending: false }).limit(50);

    let html = `<div class="view-enter space-y-6">
      <h1 class="text-xl font-bold text-white">Document Vault</h1>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-700/40">
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">File</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Type</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Tender</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Uploaded By</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Date</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    for (const d of (docs || [])) {
      html += `<tr class="hover:bg-slate-700/10">
        <td class="px-5 py-3 text-white">${d.file_name} ${d.is_locked ? '🔒' : ''}</td>
        <td class="px-5 py-3 text-slate-400 text-xs">${(d.doc_type || '').replace(/_/g, ' ')}</td>
        <td class="px-5 py-3 text-slate-400">${d.tenders?.title || '—'}</td>
        <td class="px-5 py-3 text-slate-400">${d.profiles?.full_name || '—'}</td>
        <td class="px-5 py-3 text-slate-400 text-xs">${new Date(d.created_at).toLocaleDateString()}</td>
      </tr>`;
    }
    if (!docs?.length) html += `<tr><td colspan="5" class="px-5 py-8 text-center text-slate-500">No documents.</td></tr>`;
    html += `</tbody></table></div></div>`;
    return html;
  },

  async leaderboard() {
    const profile = getProfile();
    const cid = _selectedCompanyId || profile.company_id;
    const { data } = await supabase.rpc('calculate_department_scores', { p_company_id: cid });

    let html = `<div class="view-enter space-y-6"><h1 class="text-xl font-bold text-white">Department Leaderboard</h1><div class="grid gap-4">`;
    if (data?.length > 0) {
      let rank = 0;
      for (const dept of data) {
        rank++;
        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
        html += `<div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5 flex items-center gap-5">
          <span class="text-2xl w-10 text-center shrink-0">${medal}</span>
          <div class="flex-1 min-w-0">
            <p class="text-white font-semibold">${dept.department}</p>
            <div class="flex gap-6 mt-1 text-xs text-slate-400">
              <span>${dept.completed_tasks}/${dept.total_tasks} completed</span>
              <span>${dept.on_time_rate || 0}% on-time</span>
              <span>Avg ${dept.avg_completion_hrs || '—'}h</span>
            </div>
          </div>
          <div class="text-right shrink-0">
            <p class="text-2xl font-bold text-brand-400">${dept.performance_score || 0}</p>
            <p class="text-xs text-slate-500">score</p>
          </div>
        </div>`;
      }
    } else {
      html += `<div class="p-8 text-center text-slate-500">No completed tasks yet to score.</div>`;
    }
    html += `</div></div>`;
    return html;
  },

  async users() {
    const profile = getProfile();
    const query = supabase.from('profiles').select('*, companies(name)').order('created_at', { ascending: false });
    if (!isSuperAdmin()) query.eq('company_id', profile.company_id);
    const { data: users } = await query;
    const departments = await getDepartments();

    let html = `<div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-white">User Management</h1>
        <div class="flex gap-2">
          <button onclick="window._manageDepartments()" class="inline-flex items-center gap-2 px-4 py-2 border border-slate-600/50 text-slate-300 text-sm font-medium rounded-lg transition hover:bg-slate-700/20">Departments</button>
          <button onclick="window._createUser()" class="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">${icon('plus')} Add User</button>
        </div>
      </div>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
        <table class="w-full text-sm">
          <thead><tr class="border-b border-slate-700/40">
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">User</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Role</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Department</th>
            ${isSuperAdmin() ? '<th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Company</th>' : ''}
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Status</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Actions</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    for (const u of (users || [])) {
      html += `<tr class="hover:bg-slate-700/10">
        <td class="px-5 py-3"><p class="text-white">${u.full_name}</p><p class="text-xs text-slate-500">${u.email}</p></td>
        <td class="px-5 py-3">${statusBadge(u.role)}</td>
        <td class="px-5 py-3 text-slate-400">${u.department || '—'}</td>
        ${isSuperAdmin() ? `<td class="px-5 py-3 text-slate-400">${u.companies?.name || 'Global'}</td>` : ''}
        <td class="px-5 py-3">
          <span class="inline-flex h-2 w-2 rounded-full ${u.is_active ? 'bg-emerald-400' : 'bg-red-400'}"></span>
          <span class="text-xs ${u.is_active ? 'text-emerald-400' : 'text-red-400'} ml-1">${u.is_active ? 'Active' : 'Suspended'}</span>
        </td>
        <td class="px-5 py-3 flex gap-2">
          <button onclick="window._editUser('${u.id}')" class="text-xs text-brand-400 hover:text-brand-300">Edit</button>
          <button onclick="window._toggleUser('${u.id}', ${!u.is_active})" class="text-xs ${u.is_active ? 'text-red-400 hover:text-red-300' : 'text-emerald-400 hover:text-emerald-300'}">${u.is_active ? 'Suspend' : 'Activate'}</button>
        </td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
  },

  async audit() {
    const profile = getProfile();
    const query = supabase.from('system_audit').select('*, profiles!system_audit_user_id_fkey(full_name)').order('created_at', { ascending: false }).limit(100);
    if (!isSuperAdmin()) query.eq('company_id', profile.company_id);
    const { data: logs } = await query;

    let html = `<div class="view-enter space-y-6">
      <h1 class="text-xl font-bold text-white">Audit Log</h1>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden max-h-[70vh] overflow-y-auto">
        <table class="w-full text-sm">
          <thead class="sticky top-0 bg-surface-800"><tr class="border-b border-slate-700/40">
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Time</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">User</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Action</th>
            <th class="px-5 py-3 text-left text-xs text-slate-400 uppercase">Description</th>
          </tr></thead>
          <tbody class="divide-y divide-slate-700/30">`;

    for (const log of (logs || [])) {
      html += `<tr class="hover:bg-slate-700/10">
        <td class="px-5 py-2 text-slate-500 text-xs whitespace-nowrap">${new Date(log.created_at).toLocaleString()}</td>
        <td class="px-5 py-2 text-slate-400 text-xs">${log.profiles?.full_name || 'System'}</td>
        <td class="px-5 py-2">${statusBadge(log.action)}</td>
        <td class="px-5 py-2 text-slate-400 text-xs truncate max-w-xs">${log.description || '—'}</td>
      </tr>`;
    }
    html += `</tbody></table></div></div>`;
    return html;
  },

  async 'admin-companies'() {
    const { data: companies } = await supabase.from('companies').select('*').order('created_at', { ascending: false });

    let html = `<div class="view-enter space-y-6">
      <div class="flex items-center justify-between">
        <h1 class="text-xl font-bold text-white">Companies</h1>
        <button onclick="window._createCompany()" class="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">${icon('plus')} Add Company</button>
      </div>
      <div class="grid gap-4">`;

    for (const c of (companies || [])) {
      html += `<div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5 flex items-center justify-between">
        <div><p class="text-white font-semibold">${c.name}</p><p class="text-xs text-slate-500 font-mono">${c.slug}</p></div>
        <div class="flex items-center gap-4">
          <span class="text-xs ${c.ai_enabled ? 'text-emerald-400' : 'text-slate-500'}">AI: ${c.ai_enabled ? 'ON' : 'OFF'}</span>
          <span class="inline-flex h-2 w-2 rounded-full ${c.is_active ? 'bg-emerald-400' : 'bg-red-400'}"></span>
          <button onclick="window._toggleCompany('${c.id}', ${!c.is_active})" class="text-xs px-3 py-1 rounded border ${c.is_active ? 'border-red-500/30 text-red-400 hover:bg-red-500/10' : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'} transition">${c.is_active ? 'Suspend' : 'Activate'}</button>
          <button onclick="window._toggleAI('${c.id}', ${!c.ai_enabled})" class="text-xs px-3 py-1 rounded border border-violet-500/30 text-violet-400 hover:bg-violet-500/10 transition">${c.ai_enabled ? 'Disable AI' : 'Enable AI'}</button>
        </div>
      </div>`;
    }
    html += `</div></div>`;
    return html;
  },

  async 'admin-analytics'() {
    const [companies, profiles, tenders, tasks] = await Promise.all([
      supabase.from('companies').select('id', { count: 'exact' }),
      supabase.from('profiles').select('id', { count: 'exact' }),
      supabase.from('tenders').select('id, status', { count: 'exact' }),
      supabase.from('tasks').select('id, status', { count: 'exact' }),
    ]);
    return `<div class="view-enter space-y-6">
      <h1 class="text-xl font-bold text-white">Global Analytics</h1>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        ${statCard('Companies', companies.count || 0, '', 'brand')}
        ${statCard('Total Users', profiles.count || 0, '', 'violet')}
        ${statCard('Total Tenders', tenders.count || 0, '', 'emerald')}
        ${statCard('Total Tasks', tasks.count || 0, '', 'amber')}
      </div>
      <div class="grid grid-cols-2 gap-4">
        ${statCard('Submitted Tenders', (tenders.data || []).filter(t => t.status === 'submitted').length, '', 'emerald')}
        ${statCard('Approved Tasks', (tasks.data || []).filter(t => t.status === 'approved').length, '', 'emerald')}
      </div>
    </div>`;
  },

  async 'admin-settings'() {
    return `<div class="view-enter"><h1 class="text-xl font-bold text-white mb-4">System Settings</h1><p class="text-slate-400">Global configuration will be available here.</p></div>`;
  },

  async 'tender-compile'() {
    const { id } = getRouteParams();
    return `<div class="view-enter"><h1 class="text-xl font-bold text-white mb-4">Compile Tender</h1><p class="text-slate-400">Loading compiler for tender ${id}...</p></div>`;
  },

  async profile() {
    const p = getProfile();
    return `<div class="view-enter max-w-lg space-y-6">
      <h1 class="text-xl font-bold text-white">My Profile</h1>
      <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6 space-y-4">
        <div><p class="text-xs text-slate-500">Name</p><p class="text-white">${p.full_name}</p></div>
        <div><p class="text-xs text-slate-500">Email</p><p class="text-white">${p.email}</p></div>
        <div><p class="text-xs text-slate-500">Role</p><p class="text-white capitalize">${(p.role || '').replace(/_/g, ' ')}</p></div>
        <div><p class="text-xs text-slate-500">Department</p><p class="text-white">${p.department || '—'}</p></div>
        <div><p class="text-xs text-slate-500">Company</p><p class="text-white">${p.companies?.name || 'Global Admin'}</p></div>
      </div>
    </div>`;
  },

  async unauthorized() {
    return `<div class="flex items-center justify-center h-full"><div class="text-center"><p class="text-4xl mb-4">🚫</p><h1 class="text-xl font-bold text-white mb-2">Unauthorized</h1><p class="text-slate-400">You don't have permission to access this page.</p><a href="#/dashboard" class="inline-block mt-4 text-brand-400 hover:text-brand-300 text-sm">← Back to Dashboard</a></div></div>`;
  },

  async '404'() {
    return `<div class="flex items-center justify-center h-full"><div class="text-center"><p class="text-4xl mb-4">🔍</p><h1 class="text-xl font-bold text-white mb-2">Page Not Found</h1><a href="#/dashboard" class="inline-block mt-4 text-brand-400 hover:text-brand-300 text-sm">← Back to Dashboard</a></div></div>`;
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

window._toggleCompany = async (id, active) => {
  await supabase.from('companies').update({ is_active: active }).eq('id', id);
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._toggleAI = async (id, enabled) => {
  await supabase.from('companies').update({ ai_enabled: enabled }).eq('id', id);
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._saveTaskContent = async (taskId) => {
  const content = document.getElementById('task-content-editor')?.value;
  if (content === undefined) return;
  saveDraftOffline(taskId, content);
  const { error } = await supabase.from('tasks').update({ content }).eq('id', taskId);
  const statusEl = document.getElementById('save-status');
  if (statusEl) { statusEl.textContent = error ? 'Save failed — saved offline' : 'Saved ✓'; statusEl.className = `text-xs ${error ? 'text-amber-400' : 'text-emerald-400'}`; }
};

window._submitTask = async (taskId) => {
  await window._saveTaskContent(taskId);
  await supabase.from('tasks').update({ status: 'submitted', completed_at: new Date().toISOString() }).eq('id', taskId);
  const route = getCurrentRoute(); if (route) renderView(route);
};

let _autoSaveTimer = null;
document.addEventListener('input', (e) => {
  if (e.target.id === 'task-content-editor') {
    clearTimeout(_autoSaveTimer);
    const taskId = getRouteParams().id;
    _autoSaveTimer = setTimeout(() => {
      saveDraftOffline(taskId, e.target.value);
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
    }).eq('id', tenderId);
    if (error) { errEl.textContent = error.message; errEl.classList.remove('hidden'); return; }
    modal.remove(); window.TF?.toast?.('Tender updated', 'success');
    const route = getCurrentRoute(); if (route) renderView(route);
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

// ── User Management ──────────────────────────────────────────────────────────
window._toggleUser = async (userId, active) => {
  await supabase.from('profiles').update({ is_active: active }).eq('id', userId);
  window.TF?.toast?.(active ? 'User activated' : 'User suspended', 'success');
  const route = getCurrentRoute(); if (route) renderView(route);
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
    const route = getCurrentRoute(); if (route) renderView(route);
  });
};

window._manageDepartments = async () => {
  const departments = await getDepartments();
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm';
  modal.innerHTML = `<div class="bg-surface-800 border border-slate-700/50 rounded-2xl p-6 w-full max-w-md shadow-2xl">
    <h3 class="text-lg font-semibold text-white mb-4">Manage Departments</h3>
    <div id="dept-list" class="space-y-2 mb-4 max-h-64 overflow-y-auto">
      ${departments.length > 0 ? departments.map(d => `
        <div class="flex items-center justify-between px-3 py-2 bg-surface-900/60 rounded-lg">
          <span class="text-sm text-white">${d}</span>
          <button onclick="window._renameDepartment('${d}')" class="text-xs text-brand-400 hover:text-brand-300">Rename</button>
        </div>`).join('') : '<p class="text-sm text-slate-500 px-3">No departments yet.</p>'}
    </div>
    <div class="flex gap-2 mb-4">
      <input id="new-dept-input" type="text" placeholder="New department name" class="flex-1 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
      <button id="add-dept-btn" class="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg">Add</button>
    </div>
    <button id="dept-close" class="w-full py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20">Close</button>
  </div>`;
  document.body.appendChild(modal);
  modal.querySelector('#dept-close').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  modal.querySelector('#add-dept-btn').addEventListener('click', () => {
    const name = modal.querySelector('#new-dept-input').value.trim();
    if (!name) return;
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between px-3 py-2 bg-surface-900/60 rounded-lg';
    item.innerHTML = `<span class="text-sm text-white">${name}</span><button onclick="window._renameDepartment('${name}')" class="text-xs text-brand-400 hover:text-brand-300">Rename</button>`;
    modal.querySelector('#dept-list').appendChild(item);
    modal.querySelector('#new-dept-input').value = '';
    window.TF?.toast?.(`Department "${name}" added — assign it to users to activate`, 'info');
  });
};

window._renameDepartment = async (oldName) => {
  const newName = prompt(`Rename "${oldName}" to:`, oldName);
  if (!newName || newName === oldName) return;
  const profile = getProfile();
  await supabase.from('profiles').update({ department: newName }).eq('department', oldName).eq('company_id', _selectedCompanyId || profile.company_id);
  window.TF?.toast?.(`Department renamed to "${newName}"`, 'success');
  const route = getCurrentRoute(); if (route) renderView(route);
};

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
    setTimeout(() => { modal.remove(); const route = getCurrentRoute(); if (route) renderView(route); }, 2000);
  });
};

// ── Task Actions ─────────────────────────────────────────────────────────────
window._approveTask = async (taskId) => {
  await supabase.from('tasks').update({ status: 'approved' }).eq('id', taskId);
  window.TF?.toast?.('Task approved', 'success');
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._requestRevision = async (taskId) => {
  const notes = prompt('Revision notes (optional):');
  await supabase.from('tasks').update({ status: 'revision_needed', review_notes: notes || null }).eq('id', taskId);
  window.TF?.toast?.('Revision requested', 'success');
  const route = getCurrentRoute(); if (route) renderView(route);
};

window._startTask = async (taskId) => {
  await supabase.from('tasks').update({ status: 'in_progress', started_at: new Date().toISOString() }).eq('id', taskId);
  window.TF?.toast?.('Task started', 'success');
  const route = getCurrentRoute(); if (route) renderView(route);
};
window._loadTaskAssignFields = async (taskId) => {
  const container = document.getElementById('task-assign-fields');
  if (!container) return;
  const profile = getProfile();
  // Get company_id from the task itself, not from view scope
  const { data: taskRow } = await supabase.from('tasks').select('company_id').eq('id', taskId).maybeSingle();
  const companyId = taskRow?.company_id || _selectedCompanyId || profile.company_id;
  const { data: users } = await supabase.from('profiles')
    .select('id, full_name, department')
    .eq('company_id', companyId)
    .eq('is_active', true).order('full_name');
  const { data: task, error: taskErr } = await supabase.from('tasks')
    .select('assigned_to, due_date, priority, is_mandatory')
    .eq('id', taskId)
    .maybeSingle();
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
  const route = getCurrentRoute(); if (route) renderView(route);
};