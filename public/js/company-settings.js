// ============================================================================
// TenderFlow Pro — Batch 2: Company Settings
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, isSuperAdmin, hasRoleLevel } from './auth.js';
import { getRouteParams, getCurrentRoute, navigate } from './router.js';
import { renderView } from './app-shell.js';

// ── Render Settings View ────────────────────────────────────────────────────

export async function renderSettingsView() {
  const profile = getProfile();
  const isSA = isSuperAdmin();

  let companies = [];
  if (isSA) {
    const { data } = await supabase.from('companies').select('id, name, slug').eq('is_active', true).order('name');
    companies = data || [];
  } else {
    companies = [{ id: profile.company_id, name: profile.companies?.name, slug: profile.companies?.slug }];
  }

  return `
  <div class="view-enter space-y-6">
    <h1 class="text-xl font-bold text-white">System Settings</h1>

    ${isSA && companies.length > 1 ? `
    <div>
      <label class="text-xs text-slate-400 uppercase tracking-wider">Configure Company</label>
      <select id="settings-company-select" class="mt-1 w-full max-w-xs px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" onchange="window._loadCompanySettings(this.value)">
        ${companies.map(c => `<option value="${c.id}">${c.name} (${c.slug})</option>`).join('')}
      </select>
    </div>` : ''}

    <div class="flex gap-1 border-b border-slate-700/40">
      <button class="settings-tab active px-4 py-2 text-sm font-medium text-brand-400 border-b-2 border-brand-500" data-tab="branding" onclick="window._switchSettingsTab('branding')">Branding</button>
      <button class="settings-tab px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent" data-tab="email" onclick="window._switchSettingsTab('email')">Email / SMTP</button>
      <button class="settings-tab px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent" data-tab="subscription" onclick="window._switchSettingsTab('subscription')">Subscription</button>
    </div>

    <div id="settings-tab-content">
      <div class="shimmer h-32 rounded-xl"></div>
    </div>
  </div>`;
}

// ── After render, load initial company settings ─────────────────────────────

export async function initSettingsView() {
  const profile = getProfile();
  const companyId = isSuperAdmin()
    ? (document.getElementById('settings-company-select')?.value || profile.company_id)
    : profile.company_id;
  if (companyId) await loadCompanySettings(companyId);
}

async function loadCompanySettings(companyId) {
  window._currentSettingsCompanyId = companyId;
  await renderBrandingTab(companyId);
}

// ── Tab Switching ───────────────────────────────────────────────────────────

window._switchSettingsTab = async (tab) => {
  document.querySelectorAll('.settings-tab').forEach(t => {
    t.classList.remove('active', 'text-brand-400', 'border-brand-500');
    t.classList.add('text-slate-400', 'border-transparent');
  });
  const activeTab = document.querySelector(`.settings-tab[data-tab="${tab}"]`);
  if (activeTab) {
    activeTab.classList.add('active', 'text-brand-400', 'border-brand-500');
    activeTab.classList.remove('text-slate-400', 'border-transparent');
  }
  const cid = window._currentSettingsCompanyId;
  if (!cid) return;
  switch (tab) {
    case 'branding':     await renderBrandingTab(cid);     break;
    case 'email':        await renderEmailTab(cid);        break;
    case 'subscription': await renderSubscriptionTab(cid); break;
  }
};

window._loadCompanySettings = (companyId) => loadCompanySettings(companyId);

// ── BRANDING TAB ────────────────────────────────────────────────────────────

async function renderBrandingTab(companyId) {
  const container = document.getElementById('settings-tab-content');
  if (!container) return;

  const { data: branding } = await supabase.from('company_branding')
    .select('*').eq('company_id', companyId).single();

  const b = branding || {};

  container.innerHTML = `
  <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6 space-y-5">
    <h3 class="text-sm font-semibold text-white">Company Branding</h3>
    <div id="branding-msg" class="hidden p-2 rounded-lg text-sm"></div>

    <div class="grid grid-cols-2 gap-5">
      <div>
        <label class="block text-sm text-slate-300 mb-1">Logo URL</label>
        <input id="br-logo" type="url" value="${b.logo_url || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="https://..." />
        <p class="text-xs text-slate-500 mt-1">Or upload below</p>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Upload Logo</label>
        <input id="br-logo-file" type="file" accept="image/*" class="w-full text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-brand-500/20 file:text-brand-400 hover:file:bg-brand-500/30" />
      </div>
    </div>

    <div class="grid grid-cols-3 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">Primary Color</label>
        <div class="flex gap-2 items-center">
          <input id="br-primary" type="color" value="${b.primary_color || '#0ea5e9'}" class="w-10 h-10 rounded border border-slate-600 cursor-pointer" />
          <input type="text" value="${b.primary_color || '#0ea5e9'}" class="flex-1 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" oninput="document.getElementById('br-primary').value=this.value" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Secondary Color</label>
        <div class="flex gap-2 items-center">
          <input id="br-secondary" type="color" value="${b.secondary_color || '#0f172a'}" class="w-10 h-10 rounded border border-slate-600 cursor-pointer" />
          <input type="text" value="${b.secondary_color || '#0f172a'}" class="flex-1 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" oninput="document.getElementById('br-secondary').value=this.value" />
        </div>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Accent Color</label>
        <div class="flex gap-2 items-center">
          <input id="br-accent" type="color" value="${b.accent_color || '#38bdf8'}" class="w-10 h-10 rounded border border-slate-600 cursor-pointer" />
          <input type="text" value="${b.accent_color || '#38bdf8'}" class="flex-1 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm font-mono" oninput="document.getElementById('br-accent').value=this.value" />
        </div>
      </div>
    </div>

    <div>
      <label class="block text-sm text-slate-300 mb-1">Tagline</label>
      <input id="br-tagline" type="text" value="${b.tagline || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="Building the future, one tender at a time" />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">Document Font</label>
        <select id="br-font" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="Calibri"       ${(b.document_font || 'Calibri') === 'Calibri'       ? 'selected' : ''}>Calibri (Default)</option>
          <option value="Arial"         ${b.document_font === 'Arial'         ? 'selected' : ''}>Arial</option>
          <option value="Times New Roman" ${b.document_font === 'Times New Roman' ? 'selected' : ''}>Times New Roman</option>
          <option value="Georgia"       ${b.document_font === 'Georgia'       ? 'selected' : ''}>Georgia</option>
          <option value="Montserrat"    ${b.document_font === 'Montserrat'    ? 'selected' : ''}>Montserrat</option>
          <option value="Helvetica"     ${b.document_font === 'Helvetica'     ? 'selected' : ''}>Helvetica</option>
          <option value="Garamond"      ${b.document_font === 'Garamond'      ? 'selected' : ''}>Garamond</option>
          <option value="Trebuchet MS"  ${b.document_font === 'Trebuchet MS'  ? 'selected' : ''}>Trebuchet MS</option>
        </select>
        <p class="text-xs text-slate-500 mt-1">Applied to all compiled tender documents</p>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Font Size (body)</label>
        <select id="br-fontsize" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
          <option value="20" ${(b.document_font_size || '20') === '20' ? 'selected' : ''}>10pt (Default)</option>
          <option value="22" ${b.document_font_size === '22' ? 'selected' : ''}>11pt</option>
          <option value="24" ${b.document_font_size === '24' ? 'selected' : ''}>12pt</option>
        </select>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">Proposal Header Text</label>
        <textarea id="br-header" rows="2" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none">${b.proposal_header || ''}</textarea>
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Proposal Footer Text</label>
        <textarea id="br-footer" rows="2" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm resize-none">${b.proposal_footer || ''}</textarea>
      </div>
    </div>

    <div>
      <label class="block text-sm text-slate-300 mb-1">Cover Template</label>
      <select id="br-cover" class="w-full max-w-xs px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
        <option value="default"   ${b.cover_template === 'default'   ? 'selected' : ''}>Default</option>
        <option value="minimal"   ${b.cover_template === 'minimal'   ? 'selected' : ''}>Minimal</option>
        <option value="corporate" ${b.cover_template === 'corporate' ? 'selected' : ''}>Corporate</option>
      </select>
    </div>

    <div class="border-t border-slate-700/40 pt-4">
      <h4 class="text-sm font-medium text-white mb-2">Auto-extract from CI Kit</h4>
      <p class="text-xs text-slate-500 mb-3">Upload a PDF brand guidelines document and we'll extract colours, fonts, logo and tagline automatically. You can review and adjust before saving.</p>
      <div class="flex gap-3 items-center flex-wrap">
        <input id="br-ci-file" type="file" accept=".pdf" class="text-sm text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-violet-500/20 file:text-violet-400 hover:file:bg-violet-500/30" />
        <button onclick="window._extractCIKit('${companyId}')" class="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/></svg>
          Extract from CI Kit
        </button>
      </div>
      <div id="ci-extract-status" class="hidden mt-3 p-3 rounded-lg text-sm"></div>
    </div>

    <button onclick="window._saveBranding('${companyId}')" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Save Branding</button>
  </div>`;

  document.getElementById('br-logo-file')?.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const path = `${companyId}/branding/logo_${Date.now()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('tender-documents').upload(path, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('tender-documents').getPublicUrl(path);
      document.getElementById('br-logo').value = publicUrl;
      window.TF?.toast?.('Logo uploaded', 'success');
    }
  });
}

window._saveBranding = async (companyId) => {
  const msgEl = document.getElementById('branding-msg');
  const updates = {
    company_id:         companyId,
    logo_url:           document.getElementById('br-logo')?.value || null,
    primary_color:      document.getElementById('br-primary')?.value,
    secondary_color:    document.getElementById('br-secondary')?.value,
    accent_color:       document.getElementById('br-accent')?.value,
    tagline:            document.getElementById('br-tagline')?.value || null,
    proposal_header:    document.getElementById('br-header')?.value || null,
    proposal_footer:    document.getElementById('br-footer')?.value || null,
    cover_template:     document.getElementById('br-cover')?.value || 'default',
    document_font:      document.getElementById('br-font')?.value || 'Calibri',
    document_font_size: document.getElementById('br-fontsize')?.value || '20',
  };

  const { error } = await supabase.from('company_branding')
    .upsert(updates, { onConflict: 'company_id' });

  if (updates.logo_url) {
    await supabase.from('companies').update({ logo_url: updates.logo_url }).eq('id', companyId);
  }

  if (msgEl) {
    msgEl.className = error
      ? 'p-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400'
      : 'p-2 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    msgEl.textContent = error ? error.message : 'Branding saved ✓';
    msgEl.classList.remove('hidden');
  }
};

// ── EMAIL / SMTP TAB ────────────────────────────────────────────────────────

async function renderEmailTab(companyId) {
  const container = document.getElementById('settings-tab-content');
  if (!container) return;

  const { data: config } = await supabase.from('email_config')
    .select('*').eq('company_id', companyId).single();

  const c = config || {};

  container.innerHTML = `
  <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6 space-y-5">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-white">SMTP Email Configuration</h3>
      <label class="flex items-center gap-2 text-sm text-slate-300">
        <input id="em-enabled" type="checkbox" ${c.is_enabled ? 'checked' : ''} class="rounded border-slate-600 bg-surface-900" />
        Enable email notifications
      </label>
    </div>
    <div id="email-msg" class="hidden p-2 rounded-lg text-sm"></div>
    <p class="text-xs text-slate-500">When enabled, notifications will be sent via your company's SMTP server instead of just in-app.</p>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">SMTP Host</label>
        <input id="em-host" type="text" value="${c.smtp_host || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="smtp.gmail.com" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">SMTP Port</label>
        <input id="em-port" type="number" value="${c.smtp_port || 587}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
      </div>
    </div>
    <div class="grid grid-cols-2 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">SMTP Username</label>
        <input id="em-user" type="text" value="${c.smtp_user || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="noreply@company.com" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">SMTP Password</label>
        <input id="em-pass" type="password" value="" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="${c.smtp_pass_encrypted ? '••••••• (saved)' : 'Enter password'}" />
      </div>
    </div>
    <div class="grid grid-cols-3 gap-4">
      <div>
        <label class="block text-sm text-slate-300 mb-1">From Name</label>
        <input id="em-from-name" type="text" value="${c.from_name || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="TenderFlow" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">From Email</label>
        <input id="em-from-email" type="email" value="${c.from_email || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="noreply@company.com" />
      </div>
      <div>
        <label class="block text-sm text-slate-300 mb-1">Reply-To</label>
        <input id="em-reply" type="email" value="${c.reply_to || ''}" class="w-full px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" placeholder="support@company.com" />
      </div>
    </div>
    ${c.last_tested_at ? `
    <p class="text-xs ${c.test_status === 'success' ? 'text-emerald-400' : 'text-red-400'}">
      Last test: ${new Date(c.last_tested_at).toLocaleString()} — ${c.test_status}
    </p>` : ''}
    <div class="flex gap-3">
      <button onclick="window._saveEmailConfig('${companyId}')" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Save Config</button>
      <button onclick="window._testEmailConfig('${companyId}')" class="px-5 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition">Send Test Email</button>
    </div>
  </div>`;
}

window._saveEmailConfig = async (companyId) => {
  const msgEl = document.getElementById('email-msg');
  const password = document.getElementById('em-pass')?.value;
  const updates = {
    company_id:  companyId,
    smtp_host:   document.getElementById('em-host')?.value || null,
    smtp_port:   parseInt(document.getElementById('em-port')?.value) || 587,
    smtp_user:   document.getElementById('em-user')?.value || null,
    from_name:   document.getElementById('em-from-name')?.value || null,
    from_email:  document.getElementById('em-from-email')?.value || null,
    reply_to:    document.getElementById('em-reply')?.value || null,
    is_enabled:  document.getElementById('em-enabled')?.checked || false,
  };
  if (password && password.length > 0) {
    updates.smtp_pass_encrypted = btoa(password);
  }
  const { error } = await supabase.from('email_config')
    .upsert(updates, { onConflict: 'company_id' });
  if (msgEl) {
    msgEl.className = error
      ? 'p-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400'
      : 'p-2 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    msgEl.textContent = error ? error.message : 'Email config saved ✓';
    msgEl.classList.remove('hidden');
  }
};

window._testEmailConfig = async (companyId) => {
  const msgEl = document.getElementById('email-msg');
  if (msgEl) {
    msgEl.className = 'p-2 rounded-lg text-sm bg-brand-500/10 border border-brand-500/20 text-brand-400';
    msgEl.textContent = 'Test email would be sent via your SMTP server. (Edge Function required for actual sending.)';
    msgEl.classList.remove('hidden');
  }
  await supabase.from('email_config').update({
    last_tested_at: new Date().toISOString(),
    test_status: 'pending_edge_function',
  }).eq('company_id', companyId);
};

// ── SUBSCRIPTION TAB ────────────────────────────────────────────────────────

async function renderSubscriptionTab(companyId) {
  const container = document.getElementById('settings-tab-content');
  if (!container) return;

  const { data: sub } = await supabase.from('subscriptions')
    .select('*').eq('company_id', companyId).single();

  const s = sub || {};
  const daysLeft = s.current_period_end
    ? Math.max(0, Math.floor((new Date(s.current_period_end) - Date.now()) / 86400000))
    : 0;

  const tierColors = {
    free:         'text-slate-400 bg-slate-500/10 border-slate-500/20',
    starter:      'text-brand-400 bg-brand-500/10 border-brand-500/20',
    professional: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    enterprise:   'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  const tierBenefits = {
    free:         { users: 5,         tenders: 10,        storage: '500 MB', ai: 50 },
    starter:      { users: 15,        tenders: 50,        storage: '2 GB',   ai: 200 },
    professional: { users: 50,        tenders: 200,       storage: '10 GB',  ai: 1000 },
    enterprise:   { users: 'Unlimited', tenders: 'Unlimited', storage: '50 GB', ai: 'Unlimited' },
  };

  const benefits = tierBenefits[s.tier] || tierBenefits.free;
  const aiUsed  = s.ai_credits_used || 0;
  const aiTotal = s.ai_credits || 50;

  container.innerHTML = `
  <div class="space-y-5">
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6">
      <div class="flex items-center justify-between mb-4">
        <div>
          <h3 class="text-sm font-semibold text-white">Current Plan</h3>
          <div class="flex items-center gap-3 mt-2">
            <span class="inline-flex px-3 py-1 rounded-full text-sm font-semibold capitalize ${tierColors[s.tier] || tierColors.free} border">${s.tier || 'free'}</span>
            <span class="inline-flex px-2 py-0.5 rounded text-xs capitalize ${s.status === 'active' ? 'text-emerald-400 bg-emerald-500/10' : s.status === 'trial' ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10'}">${s.status || 'trial'}</span>
          </div>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold text-white">${daysLeft}</p>
          <p class="text-xs text-slate-500">${s.status === 'trial' ? 'trial days left' : 'days until renewal'}</p>
        </div>
      </div>
      <div class="grid grid-cols-2 gap-4 mt-4">
        <div>
          <div class="flex justify-between text-xs text-slate-400 mb-1"><span>AI Credits</span><span>${aiUsed}/${aiTotal}</span></div>
          <div class="h-2 bg-surface-900 rounded-full overflow-hidden">
            <div class="h-full bg-violet-500 rounded-full transition-all" style="width: ${Math.min(100, (aiUsed / aiTotal) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs text-slate-400 mb-1"><span>Storage</span><span>${benefits.storage}</span></div>
          <div class="h-2 bg-surface-900 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500 rounded-full" style="width: 15%"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6">
      <h3 class="text-sm font-semibold text-white mb-4">Plan Limits</h3>
      <div class="grid grid-cols-4 gap-4 text-center">
        <div class="p-3 bg-surface-900/40 rounded-lg"><p class="text-lg font-bold text-white">${benefits.users}</p><p class="text-xs text-slate-500">Users</p></div>
        <div class="p-3 bg-surface-900/40 rounded-lg"><p class="text-lg font-bold text-white">${benefits.tenders}</p><p class="text-xs text-slate-500">Tenders</p></div>
        <div class="p-3 bg-surface-900/40 rounded-lg"><p class="text-lg font-bold text-white">${benefits.storage}</p><p class="text-xs text-slate-500">Storage</p></div>
        <div class="p-3 bg-surface-900/40 rounded-lg"><p class="text-lg font-bold text-white">${benefits.ai}</p><p class="text-xs text-slate-500">AI Credits</p></div>
      </div>
    </div>

    ${isSuperAdmin() ? `
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6">
      <h3 class="text-sm font-semibold text-white mb-3">Change Plan (Super Admin)</h3>
      <div class="flex gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-400 mb-1">Tier</label>
          <select id="sub-tier" class="px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="free"         ${s.tier === 'free'         ? 'selected' : ''}>Free</option>
            <option value="starter"      ${s.tier === 'starter'      ? 'selected' : ''}>Starter</option>
            <option value="professional" ${s.tier === 'professional' ? 'selected' : ''}>Professional</option>
            <option value="enterprise"   ${s.tier === 'enterprise'   ? 'selected' : ''}>Enterprise</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Status</label>
          <select id="sub-status" class="px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="active"    ${s.status === 'active'    ? 'selected' : ''}>Active</option>
            <option value="trial"     ${s.status === 'trial'     ? 'selected' : ''}>Trial</option>
            <option value="suspended" ${s.status === 'suspended' ? 'selected' : ''}>Suspended</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">AI Credits</label>
          <input id="sub-ai" type="number" value="${aiTotal}" class="w-24 px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm" />
        </div>
        <button onclick="window._updateSubscription('${companyId}')" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Update</button>
      </div>
      <div id="sub-msg" class="hidden mt-3 p-2 rounded-lg text-sm"></div>
    </div>` : ''}
  </div>`;
}

window._updateSubscription = async (companyId) => {
  const msgEl = document.getElementById('sub-msg');
  const tier      = document.getElementById('sub-tier')?.value;
  const status    = document.getElementById('sub-status')?.value;
  const aiCredits = parseInt(document.getElementById('sub-ai')?.value) || 50;

  const tierDefaults = {
    free:         { max_users: 5,   max_tenders: 10,   max_storage_mb: 500 },
    starter:      { max_users: 15,  max_tenders: 50,   max_storage_mb: 2048 },
    professional: { max_users: 50,  max_tenders: 200,  max_storage_mb: 10240 },
    enterprise:   { max_users: 999, max_tenders: 9999, max_storage_mb: 51200 },
  };
  const defaults = tierDefaults[tier] || tierDefaults.free;

  const { error } = await supabase.from('subscriptions').update({
    tier, status, ai_credits: aiCredits, ...defaults,
    current_period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
  }).eq('company_id', companyId);

  if (msgEl) {
    msgEl.className = error
      ? 'p-2 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400'
      : 'p-2 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    msgEl.textContent = error ? error.message : 'Subscription updated ✓';
    msgEl.classList.remove('hidden');
  }
};

// ── CI Kit Extraction ────────────────────────────────────────────────────────

window._extractCIKit = async (companyId) => {
  const fileInput = document.getElementById('br-ci-file');
  const statusEl  = document.getElementById('ci-extract-status');
  const file      = fileInput?.files?.[0];

  if (!file) {
    statusEl.className = 'mt-3 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400';
    statusEl.textContent = 'Please select a PDF file first.';
    statusEl.classList.remove('hidden');
    return;
  }

  statusEl.className = 'mt-3 p-3 rounded-lg text-sm bg-violet-500/10 border border-violet-500/20 text-violet-400';
  statusEl.innerHTML = `
    <div class="flex items-center gap-2 mb-2">
      <svg class="animate-spin" xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
      <span id="ci-step">Reading PDF...</span>
    </div>
    <div class="w-full bg-violet-900/30 rounded-full h-1.5">
      <div id="ci-progress" class="bg-violet-400 h-1.5 rounded-full transition-all duration-500" style="width:10%"></div>
    </div>`;
  statusEl.classList.remove('hidden');

  function setStep(msg, pct) {
    const stepEl = document.getElementById('ci-step');
    const progEl = document.getElementById('ci-progress');
    if (stepEl) stepEl.textContent = msg;
    if (progEl) progEl.style.width = pct + '%';
  }

  try {
    const pdfjs = window.pdfjsLib;
    if (!pdfjs) throw new Error('PDF.js not loaded');
    if (!pdfjs.GlobalWorkerOptions.workerSrc) {
      pdfjs.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
    setStep(`PDF loaded — ${pdf.numPages} pages. Extracting text...`, 20);

    let fullText = '';
    const pagesToScan = Math.min(pdf.numPages, 5);
    for (let i = 1; i <= pagesToScan; i++) {
      const page    = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n\n';
    }
    setStep('Text extracted. Sampling colours...', 40);

    const extractedColors = await extractColorsFromPDF(pdf, Math.min(pdf.numPages, 3));
    setStep('Colours sampled. Uploading logo...', 60);

    let logoUrl = null;
    try { logoUrl = await extractLogoFromPDF(pdf, companyId); } catch (_) {}
    setStep('Analysing with AI...', 75);

    const { data: aiResult, error: aiErr } = await supabase.functions.invoke('ai-chat', {
      body: {
        system: `You are a brand analyst. Extract brand information from the provided CI/brand guidelines document text.
Return ONLY a valid JSON object with these exact keys (use null for anything not found):
{
  "company_name": "string or null",
  "tagline": "string or null",
  "primary_color": "hex color like #0ea5e9 or null",
  "secondary_color": "hex color like #0f172a or null",
  "accent_color": "hex color like #38bdf8 or null",
  "font_primary": "font name string or null",
  "proposal_header": "any header/intro text for documents or null",
  "proposal_footer": "any footer/confidentiality text or null"
}
Look for hex codes (#xxxxxx), RGB values, Pantone references (convert to approximate hex), font names, taglines, and document header/footer templates.`,
        messages: [{ role: 'user', content: `Extract brand information from this CI kit text:\n\n${fullText.substring(0, 8000)}` }],
        max_tokens: 800,
      },
    });

    setStep('Processing results...', 90);

    let brandInfo = {};
    if (!aiErr && aiResult?.content?.[0]?.text) {
      try {
        const jsonMatch = aiResult.content[0].text.match(/\{[\s\S]*\}/);
        if (jsonMatch) brandInfo = JSON.parse(jsonMatch[0]);
      } catch (_) {}
    }

    const finalColors = {
      primary:   brandInfo.primary_color   || extractedColors[0] || null,
      secondary: brandInfo.secondary_color || extractedColors[1] || null,
      accent:    brandInfo.accent_color    || extractedColors[2] || null,
    };

    if (brandInfo.tagline)         { const el = document.getElementById('br-tagline'); if (el) el.value = brandInfo.tagline; }
    if (brandInfo.proposal_header) { const el = document.getElementById('br-header');  if (el) el.value = brandInfo.proposal_header; }
    if (brandInfo.proposal_footer) { const el = document.getElementById('br-footer');  if (el) el.value = brandInfo.proposal_footer; }

    if (finalColors.primary)   { const el = document.getElementById('br-primary');   if (el) { el.value = finalColors.primary;   el.nextElementSibling.value = finalColors.primary; } }
    if (finalColors.secondary) { const el = document.getElementById('br-secondary'); if (el) { el.value = finalColors.secondary; el.nextElementSibling.value = finalColors.secondary; } }
    if (finalColors.accent)    { const el = document.getElementById('br-accent');    if (el) { el.value = finalColors.accent;    el.nextElementSibling.value = finalColors.accent; } }

    if (brandInfo.font_primary) {
      const fontEl = document.getElementById('br-font');
      if (fontEl) {
        const options = [...fontEl.options].map(o => o.value.toLowerCase());
        const match = options.findIndex(o => o.includes(brandInfo.font_primary.toLowerCase().split(' ')[0]));
        if (match >= 0) fontEl.selectedIndex = match;
      }
    }

    if (logoUrl) { const el = document.getElementById('br-logo'); if (el) el.value = logoUrl; }

    const found = [
      finalColors.primary   && 'primary colour',
      finalColors.secondary && 'secondary colour',
      finalColors.accent    && 'accent colour',
      brandInfo.font_primary && `font (${brandInfo.font_primary})`,
      brandInfo.tagline      && 'tagline',
      logoUrl                && 'logo',
      brandInfo.proposal_header && 'header text',
      brandInfo.proposal_footer && 'footer text',
    ].filter(Boolean);

    statusEl.className = 'mt-3 p-3 rounded-lg text-sm bg-emerald-500/10 border border-emerald-500/20 text-emerald-400';
    statusEl.innerHTML = `
      <p class="font-medium mb-1">✓ Extraction complete!</p>
      <p>Found: ${found.length > 0 ? found.join(', ') : 'limited data — manual entry recommended'}</p>
      ${brandInfo.company_name ? `<p class="mt-1 text-xs text-emerald-300">Detected company: ${brandInfo.company_name}</p>` : ''}
      <p class="mt-2 text-xs text-emerald-300/70">Review the populated fields above and click Save Branding when ready.</p>`;

  } catch (err) {
    statusEl.className = 'mt-3 p-3 rounded-lg text-sm bg-red-500/10 border border-red-500/20 text-red-400';
    statusEl.textContent = `Extraction failed: ${err.message}`;
  }
};

// ── Extract dominant colours from PDF pages via canvas ───────────────────────

async function extractColorsFromPDF(pdf, numPages) {
  const colorCounts = {};

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    try {
      const page     = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 0.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      const ctx      = canvas.getContext('2d');

      await page.render({ canvasContext: ctx, viewport }).promise;

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const step = 8;

      for (let i = 0; i < imageData.length; i += 4 * step) {
        const r = imageData[i], g = imageData[i+1], b = imageData[i+2], a = imageData[i+3];
        if (a < 128) continue;
        if (r > 240 && g > 240 && b > 240) continue;
        if (r < 15  && g < 15  && b < 15)  continue;
        const qr  = Math.round(r / 16) * 16;
        const qg  = Math.round(g / 16) * 16;
        const qb  = Math.round(b / 16) * 16;
        const hex = '#' + [qr, qg, qb].map(v => v.toString(16).padStart(2, '0')).join('');
        colorCounts[hex] = (colorCounts[hex] || 0) + 1;
      }
    } catch (_) {}
  }

  const sorted = Object.entries(colorCounts).sort(([, a], [, b]) => b - a).map(([hex]) => hex);
  const distinct = [];
  for (const color of sorted) {
    if (distinct.length >= 3) break;
    if (!distinct.some(e => colorDistance(color, e) < 60)) distinct.push(color);
  }
  return distinct;
}

// ── Colour distance ──────────────────────────────────────────────────────────

function colorDistance(hex1, hex2) {
  const parse = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const [r1,g1,b1] = parse(hex1);
  const [r2,g2,b2] = parse(hex2);
  return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2);
}

// ── Extract logo from first page ─────────────────────────────────────────────

async function extractLogoFromPDF(pdf, companyId) {
  const page         = await pdf.getPage(1);
  const fullViewport = page.getViewport({ scale: 2 });
  const canvas       = document.createElement('canvas');
  canvas.width       = fullViewport.width;
  canvas.height      = Math.round(fullViewport.height * 0.25);
  const ctx          = canvas.getContext('2d');

  await page.render({ canvasContext: ctx, viewport: fullViewport }).promise;

  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  if (!blob || blob.size < 1000) return null;

  const path    = `${companyId}/branding/ci_logo_${Date.now()}.png`;
  const { error } = await supabase.storage
    .from('tender-documents')
    .upload(path, blob, { contentType: 'image/png', upsert: true });

  if (error) return null;

  const { data: { publicUrl } } = supabase.storage.from('tender-documents').getPublicUrl(path);
  return publicUrl;
}
