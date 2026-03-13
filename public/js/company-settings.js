// ============================================================================
// TenderFlow Pro — Batch 2: Company Settings
// ============================================================================
// Renders the admin-settings view with: branding config, logo upload,
// SMTP email config, subscription/billing overview.
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, isSuperAdmin, hasRoleLevel } from './auth.js';
import { getRouteParams, getCurrentRoute, navigate } from './router.js';
import { renderView } from './app-shell.js';

// ── Render Settings View ────────────────────────────────────────────────────

export async function renderSettingsView() {
  const profile = getProfile();
  const isSA = isSuperAdmin();

  // Get all companies for Super Admin, or just current company for IT Admin
  let companies = [];
  if (isSA) {
    const { data } = await supabase.from('companies').select('id, name, slug').eq('is_active', true).order('name');
    companies = data || [];
  } else {
    companies = [{ id: profile.company_id, name: profile.companies?.name, slug: profile.companies?.slug }];
  }

  const firstCompanyId = companies[0]?.id;

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

    <!-- Tabs -->
    <div class="flex gap-1 border-b border-slate-700/40">
      <button class="settings-tab active px-4 py-2 text-sm font-medium text-brand-400 border-b-2 border-brand-500" data-tab="branding" onclick="window._switchSettingsTab('branding')">Branding</button>
      <button class="settings-tab px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent" data-tab="email" onclick="window._switchSettingsTab('email')">Email / SMTP</button>
      <button class="settings-tab px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-300 border-b-2 border-transparent" data-tab="subscription" onclick="window._switchSettingsTab('subscription')">Subscription</button>
    </div>

    <!-- Tab Content -->
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

  if (companyId) {
    await loadCompanySettings(companyId);
  }
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
    case 'branding': await renderBrandingTab(cid); break;
    case 'email': await renderEmailTab(cid); break;
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
        <option value="default" ${b.cover_template === 'default' ? 'selected' : ''}>Default</option>
        <option value="minimal" ${b.cover_template === 'minimal' ? 'selected' : ''}>Minimal</option>
        <option value="corporate" ${b.cover_template === 'corporate' ? 'selected' : ''}>Corporate</option>
      </select>
    </div>

    <button onclick="window._saveBranding('${companyId}')" class="px-5 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition">Save Branding</button>
  </div>`;

  // Logo file upload handler
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
    company_id: companyId,
    logo_url: document.getElementById('br-logo')?.value || null,
    primary_color: document.getElementById('br-primary')?.value,
    secondary_color: document.getElementById('br-secondary')?.value,
    accent_color: document.getElementById('br-accent')?.value,
    tagline: document.getElementById('br-tagline')?.value || null,
    proposal_header: document.getElementById('br-header')?.value || null,
    proposal_footer: document.getElementById('br-footer')?.value || null,
    cover_template: document.getElementById('br-cover')?.value || 'default',
  };

  const { error } = await supabase.from('company_branding')
    .upsert(updates, { onConflict: 'company_id' });

  // Also update logo_url on companies table
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
    company_id: companyId,
    smtp_host: document.getElementById('em-host')?.value || null,
    smtp_port: parseInt(document.getElementById('em-port')?.value) || 587,
    smtp_user: document.getElementById('em-user')?.value || null,
    from_name: document.getElementById('em-from-name')?.value || null,
    from_email: document.getElementById('em-from-email')?.value || null,
    reply_to: document.getElementById('em-reply')?.value || null,
    is_enabled: document.getElementById('em-enabled')?.checked || false,
  };

  // Only update password if user entered a new one
  if (password && password.length > 0) {
    updates.smtp_pass_encrypted = btoa(password); // Basic encoding — use proper encryption in production
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

  // Mark as tested
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
    free: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
    starter: 'text-brand-400 bg-brand-500/10 border-brand-500/20',
    professional: 'text-violet-400 bg-violet-500/10 border-violet-500/20',
    enterprise: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  };

  const tierBenefits = {
    free: { users: 5, tenders: 10, storage: '500 MB', ai: 50 },
    starter: { users: 15, tenders: 50, storage: '2 GB', ai: 200 },
    professional: { users: 50, tenders: 200, storage: '10 GB', ai: 1000 },
    enterprise: { users: 'Unlimited', tenders: 'Unlimited', storage: '50 GB', ai: 'Unlimited' },
  };

  const benefits = tierBenefits[s.tier] || tierBenefits.free;
  const aiUsed = s.ai_credits_used || 0;
  const aiTotal = s.ai_credits || 50;

  container.innerHTML = `
  <div class="space-y-5">
    <!-- Current Plan -->
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

      <!-- Usage Bars -->
      <div class="grid grid-cols-2 gap-4 mt-4">
        <div>
          <div class="flex justify-between text-xs text-slate-400 mb-1">
            <span>AI Credits</span>
            <span>${aiUsed}/${aiTotal}</span>
          </div>
          <div class="h-2 bg-surface-900 rounded-full overflow-hidden">
            <div class="h-full bg-violet-500 rounded-full transition-all" style="width: ${Math.min(100, (aiUsed / aiTotal) * 100)}%"></div>
          </div>
        </div>
        <div>
          <div class="flex justify-between text-xs text-slate-400 mb-1">
            <span>Storage</span>
            <span>${benefits.storage}</span>
          </div>
          <div class="h-2 bg-surface-900 rounded-full overflow-hidden">
            <div class="h-full bg-brand-500 rounded-full" style="width: 15%"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- Plan Limits -->
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6">
      <h3 class="text-sm font-semibold text-white mb-4">Plan Limits</h3>
      <div class="grid grid-cols-4 gap-4 text-center">
        <div class="p-3 bg-surface-900/40 rounded-lg">
          <p class="text-lg font-bold text-white">${benefits.users}</p>
          <p class="text-xs text-slate-500">Users</p>
        </div>
        <div class="p-3 bg-surface-900/40 rounded-lg">
          <p class="text-lg font-bold text-white">${benefits.tenders}</p>
          <p class="text-xs text-slate-500">Tenders</p>
        </div>
        <div class="p-3 bg-surface-900/40 rounded-lg">
          <p class="text-lg font-bold text-white">${benefits.storage}</p>
          <p class="text-xs text-slate-500">Storage</p>
        </div>
        <div class="p-3 bg-surface-900/40 rounded-lg">
          <p class="text-lg font-bold text-white">${benefits.ai}</p>
          <p class="text-xs text-slate-500">AI Credits</p>
        </div>
      </div>
    </div>

    ${isSuperAdmin() ? `
    <!-- Admin: Change Tier -->
    <div class="bg-surface-800/40 border border-slate-700/40 rounded-xl p-6">
      <h3 class="text-sm font-semibold text-white mb-3">Change Plan (Super Admin)</h3>
      <div class="flex gap-3 items-end">
        <div>
          <label class="block text-xs text-slate-400 mb-1">Tier</label>
          <select id="sub-tier" class="px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="free" ${s.tier === 'free' ? 'selected' : ''}>Free</option>
            <option value="starter" ${s.tier === 'starter' ? 'selected' : ''}>Starter</option>
            <option value="professional" ${s.tier === 'professional' ? 'selected' : ''}>Professional</option>
            <option value="enterprise" ${s.tier === 'enterprise' ? 'selected' : ''}>Enterprise</option>
          </select>
        </div>
        <div>
          <label class="block text-xs text-slate-400 mb-1">Status</label>
          <select id="sub-status" class="px-3 py-2 bg-surface-900/60 border border-slate-600/50 rounded-lg text-white text-sm">
            <option value="active" ${s.status === 'active' ? 'selected' : ''}>Active</option>
            <option value="trial" ${s.status === 'trial' ? 'selected' : ''}>Trial</option>
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
  const tier = document.getElementById('sub-tier')?.value;
  const status = document.getElementById('sub-status')?.value;
  const aiCredits = parseInt(document.getElementById('sub-ai')?.value) || 50;

  const tierDefaults = {
    free: { max_users: 5, max_tenders: 10, max_storage_mb: 500 },
    starter: { max_users: 15, max_tenders: 50, max_storage_mb: 2048 },
    professional: { max_users: 50, max_tenders: 200, max_storage_mb: 10240 },
    enterprise: { max_users: 999, max_tenders: 9999, max_storage_mb: 51200 },
  };
  const defaults = tierDefaults[tier] || tierDefaults.free;

  const { error } = await supabase.from('subscriptions').update({
    tier,
    status,
    ai_credits: aiCredits,
    ...defaults,
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

console.log('[TenderFlow] Company settings module loaded');
