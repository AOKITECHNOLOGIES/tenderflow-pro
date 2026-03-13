// ============================================================================
// TenderFlow Pro — Authentication Module
// Handles: Login, Signup, Logout, Password Reset, Session Guards, Role Gating
// ============================================================================

import { supabase, getCurrentUser, getCurrentProfile } from './supabase-client.js';

// ── State ────────────────────────────────────────────────────────────────────
let _currentProfile = null;
let _authListeners = [];
let _sessionInitialized = false; // Prevent double-fire on init

export function getProfile() {
  return _currentProfile;
}

export function onAuthChange(callback) {
  _authListeners.push(callback);
  return () => {
    _authListeners = _authListeners.filter((cb) => cb !== callback);
  };
}

function _notifyListeners(event, profile) {
  _authListeners.forEach((cb) => cb(event, profile));
}

// ── Initialize Auth Listener ─────────────────────────────────────────────────
export function initAuth() {
  supabase.auth.onAuthStateChange(async (event, session) => {
    console.log('[Auth] State change:', event);

    if (event === 'SIGNED_IN') {
      // Prevent double-fire: skip if we already have the same session loaded
      if (_sessionInitialized && _currentProfile) return;

      _currentProfile = await getCurrentProfile();
      _sessionInitialized = true;

      // Check if company is active (non-super-admins)
      if (_currentProfile && _currentProfile.company_id) {
        const company = _currentProfile.companies;
        if (company && !company.is_active) {
          await logout();
          _notifyListeners('COMPANY_SUSPENDED', null);
          return;
        }
      }

      // Check if user is active
      if (_currentProfile && !_currentProfile.is_active) {
        await logout();
        _notifyListeners('USER_SUSPENDED', null);
        return;
      }

      // Update last_seen
      if (_currentProfile) {
        supabase
          .from('profiles')
          .update({ last_seen_at: new Date().toISOString() })
          .eq('id', _currentProfile.id)
          .then(() => {});
      }

      _notifyListeners('SIGNED_IN', _currentProfile);

    } else if (event === 'TOKEN_REFRESHED') {
      // Just update the profile silently — don't re-trigger full SIGNED_IN
      _currentProfile = await getCurrentProfile();

    } else if (event === 'INITIAL_SESSION') {
      // Session restored from storage on page load
      if (session) {
        _currentProfile = await getCurrentProfile();
        _sessionInitialized = true;

        if (_currentProfile && _currentProfile.company_id) {
          const company = _currentProfile.companies;
          if (company && !company.is_active) {
            await logout();
            _notifyListeners('COMPANY_SUSPENDED', null);
            return;
          }
        }

        if (_currentProfile && !_currentProfile.is_active) {
          await logout();
          _notifyListeners('USER_SUSPENDED', null);
          return;
        }

        _notifyListeners('SIGNED_IN', _currentProfile);
      } else {
        _notifyListeners('SIGNED_OUT', null);
      }

    } else if (event === 'SIGNED_OUT') {
      _currentProfile = null;
      _sessionInitialized = false;
      _notifyListeners('SIGNED_OUT', null);
    }
  });
}

// ── Login ────────────────────────────────────────────────────────────────────
export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  // Log audit event
  const profile = await getCurrentProfile();
  if (profile) {
    await supabase.from('system_audit').insert({
      company_id: profile.company_id,
      user_id: profile.id,
      action: 'login',
      table_name: 'auth',
      description: `User logged in: ${profile.email}`,
    });
  }

  return { success: true, user: data.user };
}

// ── Signup ───────────────────────────────────────────────────────────────────
export async function signup(email, password, fullName, companySlug = null) {
  let companyId = null;
  if (companySlug) {
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, is_active')
      .eq('slug', companySlug.trim().toLowerCase())
      .single();

    if (companyError || !company) {
      return { success: false, error: 'Invalid company code. Contact your IT administrator.' };
    }
    if (!company.is_active) {
      return { success: false, error: 'This company account has been suspended.' };
    }
    companyId = company.id;
  }

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        full_name: fullName.trim(),
        role: 'dept_user',
      },
    },
  });

  if (error) {
    return { success: false, error: error.message };
  }

  if (companyId && data.user) {
    await new Promise((r) => setTimeout(r, 500));
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ company_id: companyId })
      .eq('id', data.user.id);

    if (updateError) {
      console.error('[Auth] Company assignment failed:', updateError.message);
    }
  }

  return {
    success: true,
    user: data.user,
    needsConfirmation: !data.session,
  };
}

// ── Logout ───────────────────────────────────────────────────────────────────
export async function logout() {
  const { error } = await supabase.auth.signOut();
  _currentProfile = null;
  _sessionInitialized = false;
  if (error) console.error('[Auth] Logout error:', error.message);
  return !error;
}

// ── Password Reset ───────────────────────────────────────────────────────────
export async function requestPasswordReset(email) {
  const redirectUrl = `${window.location.origin}/#/reset-password`;
  const { error } = await supabase.auth.resetPasswordForEmail(
    email.trim().toLowerCase(),
    { redirectTo: redirectUrl }
  );
  if (error) return { success: false, error: error.message };
  return { success: true };
}

export async function updatePassword(newPassword) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ── Role Guards ──────────────────────────────────────────────────────────────
const ROLE_LEVELS = {
  super_admin: 4,
  it_admin: 3,
  bid_manager: 2,
  dept_user: 1,
};

export function hasRoleLevel(requiredRole) {
  if (!_currentProfile) return false;
  return (ROLE_LEVELS[_currentProfile.role] || 0) >= (ROLE_LEVELS[requiredRole] || 99);
}

export function requireRole(requiredRole) {
  if (!hasRoleLevel(requiredRole)) {
    window.location.hash = '#/unauthorized';
    return false;
  }
  return true;
}

export function isSuperAdmin() {
  return _currentProfile?.role === 'super_admin';
}

export function isITAdmin() {
  return hasRoleLevel('it_admin');
}

export function isBidManager() {
  return hasRoleLevel('bid_manager');
}

// ── Offline Draft Sync ───────────────────────────────────────────────────────
const DRAFT_KEY = 'tenderflow_drafts';

export function saveDraftOffline(taskId, content) {
  const drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  drafts[taskId] = {
    content,
    savedAt: new Date().toISOString(),
    synced: false,
  };
  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

export function getDraftOffline(taskId) {
  const drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  return drafts[taskId] || null;
}

export async function syncDraftsToServer() {
  const drafts = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
  const unsynced = Object.entries(drafts).filter(([_, d]) => !d.synced);
  if (unsynced.length === 0) return;

  console.log(`[Sync] Syncing ${unsynced.length} drafts...`);

  for (const [taskId, draft] of unsynced) {
    const { error } = await supabase
      .from('tasks')
      .update({ content: draft.content, updated_at: draft.savedAt })
      .eq('id', taskId)
      .eq('assigned_to', _currentProfile?.id);

    if (!error) {
      drafts[taskId].synced = true;
    } else {
      console.error(`[Sync] Failed: ${taskId}`, error.message);
    }
  }

  localStorage.setItem(DRAFT_KEY, JSON.stringify(drafts));
}

// Listen for SW sync trigger
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_DRAFT_SYNC') {
      syncDraftsToServer();
    }
  });
}

// ── PWA Install Prompt ───────────────────────────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  window.dispatchEvent(new CustomEvent('pwa-install-available'));
});

export async function promptPWAInstall() {
  if (!_deferredInstallPrompt) return false;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  return outcome === 'accepted';
}

export function canInstallPWA() {
  return !!_deferredInstallPrompt;
}