// ============================================================================
// TenderFlow Pro — Batch 2: Reports & Export
// ============================================================================
// Provides: Tender status report, task analytics, CSV/HTML export,
// company performance summary.
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, isSuperAdmin, hasRoleLevel } from './auth.js';

// ── Export Helpers ───────────────────────────────────────────────────────────

function downloadCSV(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const csv = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      let val = row[h] ?? '';
      if (typeof val === 'object') val = JSON.stringify(val);
      val = String(val).replace(/"/g, '""');
      return val.includes(',') || val.includes('"') || val.includes('\n') ? `"${val}"` : val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'export.csv';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

function downloadHTMLReport(html, filename) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename || 'report.html';
  document.body.appendChild(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}

// ── Render Reports View ─────────────────────────────────────────────────────

export async function renderReportsView() {
  const profile = getProfile();
  const companyId = profile.company_id;

  // Fetch data
  const [tendersRes, tasksRes, usersRes] = await Promise.all([
    supabase.from('tenders').select('id, title, status, deadline, created_at, submitted_at, reference_number')
      .eq('company_id', companyId).order('created_at', { ascending: false }),
    supabase.from('tasks').select('id, title, status, priority, assigned_to, created_at, completed_at, is_mandatory, section_type, profiles!tasks_assigned_to_fkey(full_name, department)')
      .eq('company_id', companyId),
    supabase.from('profiles').select('id, full_name, department, role')
      .eq('company_id', companyId).eq('is_active', true),
  ]);

  const tenders = tendersRes.data || [];
  const tasks = tasksRes.data || [];
  const users = usersRes.data || [];

  // Compute stats
  const totalTenders = tenders.length;
  const submittedTenders = tenders.filter(t => t.status === 'submitted').length;
  const activeTenders = tenders.filter(t => !['submitted', 'archived'].includes(t.status)).length;

  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => ['approved', 'submitted'].includes(t.status)).length;
  const mandatoryTasks = tasks.filter(t => t.is_mandatory).length;
  const mandatoryComplete = tasks.filter(t => t.is_mandatory && t.status === 'approved').length;

  const avgCompletionHrs = tasks.filter(t => t.completed_at && t.created_at).reduce((sum, t) => {
    return sum + (new Date(t.completed_at) - new Date(t.created_at)) / 3600000;
  }, 0) / (completedTasks || 1);

  // Dept breakdown
  const deptMap = {};
  tasks.forEach(t => {
    const dept = t.profiles?.department || 'Unassigned';
    if (!deptMap[dept]) deptMap[dept] = { total: 0, completed: 0, overdue: 0 };
    deptMap[dept].total++;
    if (['approved', 'submitted'].includes(t.status)) deptMap[dept].completed++;
  });

  // Status distribution
  const statusDist = {};
  tasks.forEach(t => {
    statusDist[t.status] = (statusDist[t.status] || 0) + 1;
  });

  const statusColors = {
    unassigned: '#64748b', assigned: '#38bdf8', in_progress: '#0ea5e9',
    submitted: '#f59e0b', approved: '#10b981', revision_needed: '#ef4444',
  };

  return `
  <div class="view-enter space-y-6">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-white">Reports & Analytics</h1>
      <div class="flex gap-2">
        <button onclick="window._exportTendersCSV()" class="px-3 py-1.5 text-xs border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700/20 transition">Export Tenders CSV</button>
        <button onclick="window._exportTasksCSV()" class="px-3 py-1.5 text-xs border border-slate-600/50 text-slate-300 rounded-lg hover:bg-slate-700/20 transition">Export Tasks CSV</button>
        <button onclick="window._generateFullReport()" class="px-3 py-1.5 text-xs bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition">Full Report ↗</button>
      </div>
    </div>

    <!-- Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <div class="bg-gradient-to-br from-brand-500/10 to-brand-500/5 border border-brand-500/20 rounded-xl p-4">
        <p class="text-xs text-slate-400 uppercase">Total Tenders</p>
        <p class="text-2xl font-bold text-white">${totalTenders}</p>
        <p class="text-xs text-slate-500">${submittedTenders} submitted</p>
      </div>
      <div class="bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
        <p class="text-xs text-slate-400 uppercase">Tasks Completed</p>
        <p class="text-2xl font-bold text-white">${completedTasks}/${totalTasks}</p>
        <p class="text-xs text-slate-500">${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}% rate</p>
      </div>
      <div class="bg-gradient-to-br from-violet-500/10 to-violet-500/5 border border-violet-500/20 rounded-xl p-4">
        <p class="text-xs text-slate-400 uppercase">Mandatory</p>
        <p class="text-2xl font-bold text-white">${mandatoryComplete}/${mandatoryTasks}</p>
        <p class="text-xs text-slate-500">mandatory done</p>
      </div>
      <div class="bg-gradient-to-br from-amber-500/10 to-amber-500/5 border border-amber-500/20 rounded-xl p-4">
        <p class="text-xs text-slate-400 uppercase">Avg Completion</p>
        <p class="text-2xl font-bold text-white">${avgCompletionHrs.toFixed(1)}h</p>
        <p class="text-xs text-slate-500">per task</p>
      </div>
      <div class="bg-gradient-to-br from-red-500/10 to-red-500/5 border border-red-500/20 rounded-xl p-4">
        <p class="text-xs text-slate-400 uppercase">Active Now</p>
        <p class="text-2xl font-bold text-white">${activeTenders}</p>
        <p class="text-xs text-slate-500">in progress</p>
      </div>
    </div>

    <!-- Task Status Distribution -->
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-white mb-4">Task Status Distribution</h3>
      <div class="flex gap-2 items-end h-32">
        ${Object.entries(statusDist).sort((a, b) => b[1] - a[1]).map(([status, count]) => {
    const pct = totalTasks > 0 ? (count / totalTasks) * 100 : 0;
    const color = statusColors[status] || '#64748b';
    return `
          <div class="flex flex-col items-center flex-1">
            <span class="text-xs text-white font-medium mb-1">${count}</span>
            <div class="w-full rounded-t" style="height: ${Math.max(8, pct * 1.2)}px; background: ${color}"></div>
            <span class="text-[10px] text-slate-500 mt-1 capitalize truncate w-full text-center">${status.replace(/_/g, ' ')}</span>
          </div>`;
  }).join('')}
      </div>
    </div>

    <!-- Department Breakdown -->
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-5">
      <h3 class="text-sm font-semibold text-white mb-4">Department Performance</h3>
      <div class="space-y-3">
        ${Object.entries(deptMap).sort((a, b) => b[1].completed - a[1].completed).map(([dept, stats]) => {
    const pct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
    return `
          <div>
            <div class="flex justify-between text-sm mb-1">
              <span class="text-white">${dept}</span>
              <span class="text-slate-400">${stats.completed}/${stats.total} (${pct}%)</span>
            </div>
            <div class="h-2 bg-surface-900 rounded-full overflow-hidden">
              <div class="h-full rounded-full transition-all ${pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}" style="width: ${pct}%"></div>
            </div>
          </div>`;
  }).join('')}
      </div>
    </div>

    <!-- Recent Tender Activity -->
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl overflow-hidden">
      <div class="px-5 py-4 border-b border-slate-700/40">
        <h3 class="text-sm font-semibold text-white">Recent Tenders</h3>
      </div>
      <table class="w-full text-sm">
        <thead><tr class="border-b border-slate-700/40">
          <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Tender</th>
          <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Status</th>
          <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Deadline</th>
          <th class="px-5 py-2 text-left text-xs text-slate-400 uppercase">Tasks</th>
        </tr></thead>
        <tbody class="divide-y divide-slate-700/20">
          ${tenders.slice(0, 10).map(t => {
    const tenderTasks = tasks.filter(tk => tk.tender_id === t.id);
    const done = tenderTasks.filter(tk => tk.status === 'approved').length;
    return `
            <tr class="hover:bg-slate-700/10">
              <td class="px-5 py-2.5">
                <p class="text-white">${t.title}</p>
                <p class="text-xs text-slate-500">${t.reference_number || ''}</p>
              </td>
              <td class="px-5 py-2.5"><span class="text-xs capitalize px-2 py-0.5 rounded-full ${t.status === 'submitted' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-brand-500/15 text-brand-400'}">${t.status.replace(/_/g, ' ')}</span></td>
              <td class="px-5 py-2.5 text-slate-400 text-xs">${t.deadline ? new Date(t.deadline).toLocaleDateString() : '—'}</td>
              <td class="px-5 py-2.5 text-slate-400 text-xs">${done}/${tenderTasks.length} done</td>
            </tr>`;
  }).join('')}
        </tbody>
      </table>
    </div>
  </div>`;
}

// ── Export Functions ─────────────────────────────────────────────────────────

window._exportTendersCSV = async () => {
  const profile = getProfile();
  const { data } = await supabase.from('tenders')
    .select('title, reference_number, status, deadline, issuing_authority, created_at, submitted_at')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false });

  downloadCSV(data || [], `tenders_export_${new Date().toISOString().slice(0, 10)}.csv`);
  window.TF?.toast?.('Tenders CSV exported', 'success');
};

window._exportTasksCSV = async () => {
  const profile = getProfile();
  const { data } = await supabase.from('tasks')
    .select('title, section_type, status, priority, is_mandatory, created_at, completed_at, due_date, profiles!tasks_assigned_to_fkey(full_name, department), tenders(title)')
    .eq('company_id', profile.company_id)
    .order('created_at', { ascending: false });

  const flat = (data || []).map(t => ({
    title: t.title,
    section_type: t.section_type,
    status: t.status,
    priority: ['Normal', 'High', 'Critical'][t.priority] || 'Normal',
    is_mandatory: t.is_mandatory ? 'Yes' : 'No',
    assigned_to: t.profiles?.full_name || '',
    department: t.profiles?.department || '',
    tender: t.tenders?.title || '',
    created_at: t.created_at,
    completed_at: t.completed_at || '',
    due_date: t.due_date || '',
  }));

  downloadCSV(flat, `tasks_export_${new Date().toISOString().slice(0, 10)}.csv`);
  window.TF?.toast?.('Tasks CSV exported', 'success');
};

window._generateFullReport = async () => {
  const profile = getProfile();
  const companyName = profile.companies?.name || 'Company';

  const [tendersRes, tasksRes] = await Promise.all([
    supabase.from('tenders').select('*').eq('company_id', profile.company_id).order('created_at', { ascending: false }),
    supabase.from('tasks').select('*, profiles!tasks_assigned_to_fkey(full_name, department)').eq('company_id', profile.company_id),
  ]);

  const tenders = tendersRes.data || [];
  const tasks = tasksRes.data || [];
  const totalTasks = tasks.length;
  const completed = tasks.filter(t => ['approved', 'submitted'].includes(t.status)).length;
  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' }) : '—';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${companyName} — Tender Performance Report</title>
<style>
  body { font-family: 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 40px; color: #1e293b; }
  h1 { color: #0f172a; border-bottom: 3px solid #0ea5e9; padding-bottom: 8px; }
  h2 { color: #0ea5e9; margin-top: 30px; }
  table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13px; }
  th { background: #f1f5f9; padding: 8px 12px; text-align: left; border-bottom: 2px solid #e2e8f0; }
  td { padding: 6px 12px; border-bottom: 1px solid #e2e8f0; }
  .stat { display: inline-block; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 20px; margin: 4px; text-align: center; }
  .stat-value { font-size: 24px; font-weight: bold; color: #0f172a; }
  .stat-label { font-size: 11px; color: #64748b; text-transform: uppercase; }
  .no-print { background: #f1f5f9; padding: 12px 20px; border-radius: 8px; margin-bottom: 30px; display: flex; justify-content: space-between; align-items: center; }
  @media print { .no-print { display: none; } }
</style></head><body>
  <div class="no-print">
    <span style="font-size:13px;color:#64748b;">Generated ${formatDate(new Date().toISOString())}</span>
    <button onclick="window.print()" style="background:#0ea5e9;color:white;border:none;padding:8px 20px;border-radius:6px;cursor:pointer;">Print / Save as PDF</button>
  </div>
  <h1>${companyName} — Tender Performance Report</h1>
  <p style="color:#64748b;">Report generated on ${formatDate(new Date().toISOString())}</p>

  <div style="margin:20px 0;">
    <div class="stat"><div class="stat-value">${tenders.length}</div><div class="stat-label">Total Tenders</div></div>
    <div class="stat"><div class="stat-value">${tenders.filter(t=>t.status==='submitted').length}</div><div class="stat-label">Submitted</div></div>
    <div class="stat"><div class="stat-value">${completed}/${totalTasks}</div><div class="stat-label">Tasks Done</div></div>
    <div class="stat"><div class="stat-value">${totalTasks > 0 ? Math.round((completed/totalTasks)*100) : 0}%</div><div class="stat-label">Completion Rate</div></div>
  </div>

  <h2>Tender Summary</h2>
  <table>
    <thead><tr><th>Title</th><th>Ref</th><th>Status</th><th>Deadline</th><th>Submitted</th></tr></thead>
    <tbody>
      ${tenders.map(t => `<tr><td>${t.title}</td><td>${t.reference_number||'—'}</td><td style="text-transform:capitalize">${t.status.replace(/_/g,' ')}</td><td>${formatDate(t.deadline)}</td><td>${formatDate(t.submitted_at)}</td></tr>`).join('')}
    </tbody>
  </table>

  <h2>Task Breakdown</h2>
  <table>
    <thead><tr><th>Task</th><th>Assigned To</th><th>Dept</th><th>Status</th><th>Mandatory</th></tr></thead>
    <tbody>
      ${tasks.slice(0, 100).map(t => `<tr><td>${t.title}</td><td>${t.profiles?.full_name||'—'}</td><td>${t.profiles?.department||'—'}</td><td style="text-transform:capitalize">${(t.status||'').replace(/_/g,' ')}</td><td>${t.is_mandatory?'Yes':'—'}</td></tr>`).join('')}
    </tbody>
  </table>

  <p style="margin-top:40px;color:#94a3b8;font-size:11px;text-align:center;">© ${new Date().getFullYear()} ${companyName} — Generated by TenderFlow Pro</p>
</body></html>`;

  downloadHTMLReport(html, `${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_Report_${new Date().toISOString().slice(0, 10)}.html`);
  window.TF?.toast?.('Full report downloaded', 'success');
};


