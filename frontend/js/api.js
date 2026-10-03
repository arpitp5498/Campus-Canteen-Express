/**
 * Campus Canteen Express — API Client & Auth Manager
 * Shared fetch wrapper with JWT token management and toast notifications.
 */

const API_BASE = '/api';
const TOKEN_KEY = 'cce_token';
const USER_KEY = 'cce_user';

/* ───────── Auth Token Management ───────── */

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

function removeToken() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

function getUser() {
  try {
    const data = localStorage.getItem(USER_KEY);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
}

function setUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

function isLoggedIn() {
  return !!getToken();
}

function isAdmin() {
  const user = getUser();
  return user && (user.role === 'ADMIN' || user.role === 'CANTEEN_STAFF');
}

function logout() {
  removeToken();
  window.location.href = '/login.html';
}

/* ───────── Fetch Wrapper ───────── */

async function apiFetch(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = data.message || data.error?.message || `Request failed (${response.status})`;

      if (response.status === 401) {
        // Token expired or invalid
        removeToken();
        if (!window.location.pathname.includes('login')) {
          showToast('Session expired. Please log in again.', 'warning');
          setTimeout(() => { window.location.href = '/login.html'; }, 1500);
        }
      }

      if (response.status === 429) {
        showToast('Too many requests. Please wait a moment.', 'warning');
      }

      throw new ApiError(message, response.status, data.error?.code);
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // Network error
    throw new ApiError('Network error. Please check your connection.', 0, 'NETWORK_ERROR');
  }
}

class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/* ───────── Convenience API Methods ───────── */

const api = {
  get: (endpoint) => apiFetch(endpoint, { method: 'GET' }),
  post: (endpoint, body) => apiFetch(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => apiFetch(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => apiFetch(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => apiFetch(endpoint, { method: 'DELETE' }),
};
window.api = api;

/* ───────── Toast Notification System ───────── */

let toastContainer = null;

function getToastContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    toastContainer.setAttribute('role', 'alert');
    toastContainer.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

const TOAST_ICONS = {
  success: '✓',
  error: '✕',
  warning: '⚠',
  info: 'ℹ'
};

function showToast(message, type = 'info', duration = 4000) {
  const container = getToastContainer();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${TOAST_ICONS[type] || 'ℹ'}</span>
    <div class="toast-content">
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" aria-label="Close notification">&times;</button>
  `;

  const closeBtn = toast.querySelector('.toast-close');
  closeBtn.addEventListener('click', () => dismissToast(toast));

  container.appendChild(toast);

  // Auto-dismiss
  if (duration > 0) {
    setTimeout(() => dismissToast(toast), duration);
  }

  return toast;
}

function dismissToast(toast) {
  if (!toast || !toast.parentNode) return;
  toast.classList.add('leaving');
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 300);
}

/* ───────── HTML Escape ───────── */

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ───────── Auth Guard ───────── */

function requireAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

function requireAdminAuth() {
  if (!isLoggedIn()) {
    window.location.href = '/login.html';
    return false;
  }
  if (!isAdmin()) {
    showToast('Access denied. Admin privileges required.', 'error');
    window.location.href = '/menu.html';
    return false;
  }
  return true;
}
