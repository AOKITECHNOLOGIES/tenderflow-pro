// ============================================================================
// TenderFlow Pro — Client-Side Router
// Hash-based routing with role guards and dynamic view loading
// ============================================================================

import { getProfile, hasRoleLevel } from './auth.js';

// ── Route Definitions ───────────────────────────────────────────────────────

const routes = {
  // Public (unauthenticated)
  '/login':            { view: 'login',            auth: false },
  '/signup':           { view: 'signup',           auth: false },
  '/forgot-password':  { view: 'forgot-password',  auth: false },
  '/reset-password':   { view: 'reset-password',   auth: false },

  // Shared (all authenticated roles)
  '/':                 { view: 'dashboard',         auth: true,  role: 'dept_user' },
  '/dashboard':        { view: 'dashboard',         auth: true,  role: 'dept_user' },
  '/profile':          { view: 'profile',           auth: true,  role: 'dept_user' },

  // Dept User+
  '/tasks':            { view: 'tasks',             auth: true,  role: 'dept_user' },
  '/tasks/:id':        { view: 'task-detail',       auth: true,  role: 'dept_user' },

  // Bid Manager+
  '/tenders':          { view: 'tenders',           auth: true,  role: 'bid_manager' },
  '/tenders/new':      { view: 'tender-create',     auth: true,  role: 'bid_manager' },
  '/tenders/:id':      { view: 'tender-detail',     auth: true,  role: 'bid_manager' },
  '/tenders/:id/compile': { view: 'tender-compile', auth: true,  role: 'bid_manager' },
  '/documents':        { view: 'documents',         auth: true,  role: 'bid_manager' },
  '/leaderboard':      { view: 'leaderboard',       auth: true,  role: 'bid_manager' },
  '/reports':          { view: 'reports',           auth: true,  role: 'bid_manager' },

  // IT Admin+
  '/users':            { view: 'users',             auth: true,  role: 'it_admin' },
  '/audit':            { view: 'audit',             auth: true,  role: 'it_admin' },

  // Super Admin
  '/admin/companies':  { view: 'admin-companies',   auth: true,  role: 'super_admin' },
  '/admin/analytics':  { view: 'admin-analytics',   auth: true,  role: 'super_admin' },
  '/admin/settings':   { view: 'admin-settings',    auth: true,  role: 'super_admin' },

  // Error
  '/unauthorized':     { view: 'unauthorized',      auth: false },
  '/404':              { view: '404',               auth: false },
};

// ── Router State ────────────────────────────────────────────────────────────

let _currentRoute = null;
let _routeParams = {};
let _onNavigate = null;

export function getRouteParams() {
  return { ..._routeParams };
}

export function getCurrentRoute() {
  return _currentRoute;
}

// ── Route Matching ──────────────────────────────────────────────────────────

function matchRoute(hash) {
  const path = hash.replace('#', '') || '/';

  // Exact match
  if (routes[path]) {
    _routeParams = {};
    return { ...routes[path], path };
  }

  // Parameterized match
  for (const [pattern, config] of Object.entries(routes)) {
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');

    if (patternParts.length !== pathParts.length) continue;

    const params = {};
    let match = true;

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i].startsWith(':')) {
        params[patternParts[i].slice(1)] = pathParts[i];
      } else if (patternParts[i] !== pathParts[i]) {
        match = false;
        break;
      }
    }

    if (match) {
      _routeParams = params;
      return { ...config, path };
    }
  }

  // No match
  _routeParams = {};
  return { ...routes['/404'], path: '/404' };
}

// ── Navigation ──────────────────────────────────────────────────────────────

export function navigate(path) {
  window.location.hash = `#${path}`;
}

function handleRouteChange() {
  const hash = window.location.hash || '#/';
  const route = matchRoute(hash);
  const profile = getProfile();

  // Auth guard
  if (route.auth && !profile) {
    navigate('/login');
    return;
  }

  // Already logged in, don't show login page
  if (!route.auth && profile && ['/login', '/signup'].includes(route.path)) {
    navigate('/dashboard');
    return;
  }

  // Role guard
  if (route.role && !hasRoleLevel(route.role)) {
    navigate('/unauthorized');
    return;
  }

  _currentRoute = route;

  if (_onNavigate) {
    _onNavigate(route, _routeParams);
  }
}

// ── Init ────────────────────────────────────────────────────────────────────

export function initRouter(onNavigate) {
  _onNavigate = onNavigate;
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange(); // Handle initial load
}

export function destroyRouter() {
  window.removeEventListener('hashchange', handleRouteChange);
  _onNavigate = null;
}

// ── Sidebar Config (role-adaptive) ──────────────────────────────────────────

export function getSidebarItems(role) {
  const items = [];

  // Everyone gets dashboard and tasks
  items.push({
    label: 'Dashboard',
    icon: 'grid',
    path: '/dashboard',
    roles: ['dept_user', 'bid_manager', 'it_admin', 'super_admin'],
  });

  items.push({
    label: 'My Tasks',
    icon: 'check-square',
    path: '/tasks',
    roles: ['dept_user', 'bid_manager', 'it_admin', 'super_admin'],
  });

  // Tenders, Documents, Leaderboard, Reports — bid_manager+
  if (hasRoleLevel('bid_manager')) {
    items.push({
      label: 'Tenders',
      icon: 'file-text',
      path: '/tenders',
      roles: ['bid_manager', 'it_admin', 'super_admin'],
    });
    items.push({
      label: 'Documents',
      icon: 'folder',
      path: '/documents',
      roles: ['bid_manager', 'it_admin', 'super_admin'],
    });
    items.push({
      label: 'Leaderboard',
      icon: 'award',
      path: '/leaderboard',
      roles: ['bid_manager', 'it_admin', 'super_admin'],
    });
    items.push({
      label: 'Reports',
      icon: 'bar-chart',
      path: '/reports',
      roles: ['bid_manager', 'it_admin', 'super_admin'],
    });
  }

  // Users & Audit — it_admin+
  if (hasRoleLevel('it_admin')) {
    items.push({ type: 'divider', label: 'Administration' });
    items.push({
      label: 'Users',
      icon: 'users',
      path: '/users',
      roles: ['it_admin', 'super_admin'],
    });
    items.push({
      label: 'Audit Log',
      icon: 'shield',
      path: '/audit',
      roles: ['it_admin', 'super_admin'],
    });
  }

  // Super Admin — global management
  if (hasRoleLevel('super_admin')) {
    items.push({ type: 'divider', label: 'Super Admin' });
    items.push({
      label: 'Companies',
      icon: 'building',
      path: '/admin/companies',
      roles: ['super_admin'],
    });
    items.push({
      label: 'Global Analytics',
      icon: 'bar-chart',
      path: '/admin/analytics',
      roles: ['super_admin'],
    });
    items.push({
      label: 'System Settings',
      icon: 'settings',
      path: '/admin/settings',
      roles: ['super_admin'],
    });
  }

  return items;
}