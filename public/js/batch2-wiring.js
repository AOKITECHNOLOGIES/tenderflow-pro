// ============================================================================
// TenderFlow Pro — Batch 2 Wiring
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile, onAuthChange, isSuperAdmin, hasRoleLevel } from './auth.js';
import { getCurrentRoute } from './router.js';
import { renderView } from './app-shell.js';
import { initNotifications, destroyNotifications } from './notifications.js';
import { renderSettingsView, initSettingsView } from './company-settings.js';
import { renderReportsView } from './reports.js';
import './user-import.js';

// ── Connect Notifications to Auth Lifecycle ─────────────────────────────────

let _notificationsInitialized = false;

onAuthChange((event) => {
  if (event === 'SIGNED_IN' && !_notificationsInitialized) {
    setTimeout(() => {
      initNotifications();
      _notificationsInitialized = true;
    }, 500);
  } else if (event === 'SIGNED_OUT') {
    destroyNotifications();
    _notificationsInitialized = false;
  }
});

// ── Re-inject notification bell after each view render ──────────────────────

const _origRenderView = renderView;
const _enhancedRenderView = async (route) => {
  await _origRenderView(route);

  if (_notificationsInitialized) {
    setTimeout(() => initNotifications(), 100);
  }

  requestAnimationFrame(() => {
    const view = route?.view;
    if (view === 'admin-settings') {
      initSettingsView();
    }
    if (view === 'users') {
      injectBulkImportButton();
    }
  });
};

window.addEventListener('hashchange', () => {
  const route = getCurrentRoute();
  if (route && !['login', 'signup', 'forgot-password', 'reset-password'].includes(route.view)) {
    setTimeout(() => {
      if (_notificationsInitialized) initNotifications();
      if (route.view === 'admin-settings') initSettingsView();
      if (route.view === 'users') injectBulkImportButton();
    }, 200);
  }
});

// ── Override admin-settings view ────────────────────────────────────────────

const _checkAndOverrideSettings = () => {
  const route = getCurrentRoute();
  if (route?.view === 'admin-settings') {
    const container = document.getElementById('view-container');
    if (container && container.textContent.includes('Global configuration will be available here')) {
      renderSettingsView().then(html => {
        container.innerHTML = html;
        initSettingsView();
      });
    }
  }
};

window.addEventListener('hashchange', () => setTimeout(_checkAndOverrideSettings, 300));
setTimeout(_checkAndOverrideSettings, 1000);

// ── Override admin-analytics with enhanced version ───────────────────────────

const _checkAndEnhanceAnalytics = () => {
  const route = getCurrentRoute();
  if (route?.view === 'admin-analytics') {
    const container = document.getElementById('view-container');
    if (container) {
      const h1 = container.querySelector('h1');
      if (h1 && !container.querySelector('#reports-link')) {
        const link = document.createElement('a');
        link.id = 'reports-link';
        link.href = '#/reports';
        link.className = 'inline-flex items-center gap-2 px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition ml-4';
        link.textContent = '📊 Detailed Reports';
        h1.parentElement.appendChild(link);
      }
    }
  }
};

window.addEventListener('hashchange', () => setTimeout(_checkAndEnhanceAnalytics, 300));

// ── Handle /reports route ───────────────────────────────────────────────────

window.addEventListener('hashchange', async () => {
  const hash = window.location.hash.replace('#', '') || '/dashboard';
  if (hash === '/reports') {
    if (!hasRoleLevel('bid_manager')) {
      window.location.hash = '#/unauthorized';
      return;
    }
    const container = document.getElementById('view-container');
    if (container) {
      container.innerHTML = '<div class="shimmer h-8 w-48 rounded mb-4"></div>';
      try {
        container.innerHTML = await renderReportsView();
      } catch (err) {
        container.innerHTML = `<div class="p-8 text-center text-red-400">Error: ${err.message}</div>`;
      }
    }
  }
});

// ── Inject Bulk Import Button into Users View ───────────────────────────────

function injectBulkImportButton() {
  const container = document.getElementById('view-container');
  if (!container) return;

  const h1 = container.querySelector('h1');
  if (!h1 || container.querySelector('#bulk-import-btn')) return;

  const actionArea = h1.parentElement;
  if (!actionArea) return;

  const profile = getProfile();
  const companyId = profile.company_id;

  const btn = document.createElement('button');
  btn.id = 'bulk-import-btn';
  btn.className = 'inline-flex items-center gap-2 px-4 py-2 border border-slate-600/50 text-slate-300 text-sm rounded-lg hover:bg-slate-700/20 transition ml-2';
  btn.textContent = '📄 Bulk Import CSV';
  btn.onclick = () => window._showBulkImport(companyId);

  const existingBtn = actionArea.querySelector('button');
  if (existingBtn) {
    existingBtn.parentElement.insertBefore(btn, existingBtn.nextSibling);
  } else {
    actionArea.appendChild(btn);
  }
}

// ── Add Reports to Sidebar ──────────────────────────────────────────────────

const _injectReportsSidebarItem = () => {
  const sidebar = document.getElementById('sidebar');
  if (!sidebar) return;
  if (!hasRoleLevel('bid_manager')) return;
  if (sidebar.querySelector('[href="#/reports"]')) return;

  const leaderboardLink = sidebar.querySelector('[href="#/leaderboard"]');
  if (leaderboardLink) {
    const reportLink = document.createElement('a');
    reportLink.href = '#/reports';
    const isActive = window.location.hash === '#/reports';
    reportLink.className = `sidebar-item flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${isActive ? 'active text-brand-400' : 'text-slate-400 hover:text-slate-200'}`;
    reportLink.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><span>Reports</span>`;
    leaderboardLink.parentElement.insertBefore(reportLink, leaderboardLink.nextSibling);
  }
};

window.addEventListener('hashchange', () => setTimeout(_injectReportsSidebarItem, 300));
setTimeout(_injectReportsSidebarItem, 1500);

import './batch3-wiring.js';
