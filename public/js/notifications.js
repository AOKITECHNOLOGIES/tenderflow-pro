// ============================================================================
// TenderFlow Pro — Batch 2: Real-Time Notifications
// ============================================================================
// Provides: notification bell with unread count, dropdown panel,
// Supabase Realtime subscription for instant updates, mark-as-read.
// ============================================================================

import { supabase } from './supabase-client.js';
import { getProfile } from './auth.js';

let _notifications = [];
let _unreadCount = 0;
let _realtimeChannel = null;
let _isOpen = false;

// ── Bell Icon SVG ───────────────────────────────────────────────────────────

const BELL_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';

// ── Init Notification System ────────────────────────────────────────────────

export async function initNotifications() {
  const profile = getProfile();
  if (!profile) return;

  // Fetch existing unread
  await fetchNotifications();

  // Subscribe to realtime inserts
  _realtimeChannel = supabase
    .channel('notifications-' + profile.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `user_id=eq.${profile.id}`,
    }, (payload) => {
      _notifications.unshift(payload.new);
      _unreadCount++;
      updateBellBadge();

      // Show toast for new notification
      if (window.TF?.toast) {
        window.TF.toast(payload.new.title, 'info');
      }

      // If panel is open, re-render it
      if (_isOpen) {
        renderNotificationPanel();
      }
    })
    .subscribe();

  // Inject the bell into the top bar
  injectBellUI();
}

export function destroyNotifications() {
  if (_realtimeChannel) {
    supabase.removeChannel(_realtimeChannel);
    _realtimeChannel = null;
  }
}

// ── Fetch Notifications ─────────────────────────────────────────────────────

async function fetchNotifications() {
  const profile = getProfile();
  if (!profile) return;

  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!error && data) {
    _notifications = data;
    _unreadCount = data.filter(n => !n.is_read).length;
    updateBellBadge();
  }
}

// ── Mark as Read ────────────────────────────────────────────────────────────

async function markAsRead(notificationId) {
  await supabase.from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);

  const n = _notifications.find(x => x.id === notificationId);
  if (n) {
    n.is_read = true;
    _unreadCount = Math.max(0, _unreadCount - 1);
    updateBellBadge();
  }
}

async function markAllRead() {
  const profile = getProfile();
  if (!profile) return;

  await supabase.from('notifications')
    .update({ is_read: true })
    .eq('user_id', profile.id)
    .eq('is_read', false);

  _notifications.forEach(n => n.is_read = true);
  _unreadCount = 0;
  updateBellBadge();
  renderNotificationPanel();
}

// ── UI: Inject Bell ─────────────────────────────────────────────────────────

function injectBellUI() {
  // Find the main content area's top — inject before it
  const mainContent = document.getElementById('main-content');
  if (!mainContent) return;

  // Create top bar if not exists
  let topBar = document.getElementById('tf-topbar');
  if (!topBar) {
    topBar = document.createElement('div');
    topBar.id = 'tf-topbar';
    topBar.className = 'flex items-center justify-end gap-3 px-6 lg:px-8 pt-4 pb-0';

    // Insert at start of main content
    mainContent.insertBefore(topBar, mainContent.firstChild);
  }

  topBar.innerHTML = `
    <div class="relative">
      <button id="notification-bell" class="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/30 transition" onclick="window._toggleNotifications()">
        ${BELL_SVG}
        <span id="notification-badge" class="${_unreadCount > 0 ? '' : 'hidden'} absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">${_unreadCount}</span>
      </button>
      <div id="notification-panel" class="hidden absolute right-0 top-12 w-80 max-h-96 bg-surface-800 border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden z-50">
        <div class="px-4 py-3 border-b border-slate-700/40 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-white">Notifications</h3>
          <button onclick="window._markAllNotificationsRead()" class="text-xs text-brand-400 hover:text-brand-300">Mark all read</button>
        </div>
        <div id="notification-list" class="overflow-y-auto max-h-72"></div>
      </div>
    </div>`;

  renderNotificationPanel();
}

function updateBellBadge() {
  const badge = document.getElementById('notification-badge');
  if (!badge) return;
  badge.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
  badge.classList.toggle('hidden', _unreadCount === 0);
}

function renderNotificationPanel() {
  const list = document.getElementById('notification-list');
  if (!list) return;

  if (_notifications.length === 0) {
    list.innerHTML = '<div class="px-4 py-8 text-center text-sm text-slate-500">No notifications yet</div>';
    return;
  }

  list.innerHTML = _notifications.map(n => {
    const timeAgo = getTimeAgo(n.created_at);
    const typeIcon = {
      task_assigned: '📋', task_submitted: '📤', task_approved: '✅',
      task_revision: '🔄', tender_created: '📄', tender_submitted: '🔒',
      tender_deadline: '⏰', user_invited: '👤', system_alert: '⚠️', ai_complete: '🤖',
    }[n.type] || '📌';

    return `
      <div class="px-4 py-3 border-b border-slate-700/20 hover:bg-slate-700/10 transition cursor-pointer ${n.is_read ? 'opacity-60' : ''}"
           onclick="window._clickNotification('${n.id}', '${n.link || ''}')">
        <div class="flex gap-3">
          <span class="text-base shrink-0 mt-0.5">${typeIcon}</span>
          <div class="min-w-0 flex-1">
            <p class="text-sm ${n.is_read ? 'text-slate-400' : 'text-white font-medium'} truncate">${n.title}</p>
            ${n.message ? `<p class="text-xs text-slate-500 truncate mt-0.5">${n.message}</p>` : ''}
            <p class="text-[10px] text-slate-600 mt-1">${timeAgo}</p>
          </div>
          ${!n.is_read ? '<span class="w-2 h-2 bg-brand-400 rounded-full shrink-0 mt-2"></span>' : ''}
        </div>
      </div>`;
  }).join('');
}

function getTimeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Global Handlers ─────────────────────────────────────────────────────────

window._toggleNotifications = () => {
  const panel = document.getElementById('notification-panel');
  if (!panel) return;
  _isOpen = !_isOpen;
  panel.classList.toggle('hidden', !_isOpen);

  // Close when clicking outside
  if (_isOpen) {
    setTimeout(() => {
      document.addEventListener('click', _closeOnOutsideClick, { once: true });
    }, 0);
  }
};

function _closeOnOutsideClick(e) {
  const panel = document.getElementById('notification-panel');
  const bell = document.getElementById('notification-bell');
  if (panel && bell && !panel.contains(e.target) && !bell.contains(e.target)) {
    _isOpen = false;
    panel.classList.add('hidden');
  }
}

window._clickNotification = async (id, link) => {
  await markAsRead(id);
  _isOpen = false;
  document.getElementById('notification-panel')?.classList.add('hidden');
  renderNotificationPanel();
  if (link) {
    window.location.hash = link;
  }
};

window._markAllNotificationsRead = () => {
  markAllRead();
};

console.log('[TenderFlow] Notifications module loaded');
