// ════════════════════════════════════════════════════
//  db.js — Supabase persistence layer v2
//  · Multi-usuario: nombre + PIN → userId deterministico
//  · Carga inmediata al login desde Supabase
//  · Autosave debounce 800ms
//  · Fallback localStorage si offline
// ════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://kjvftqsscttnghmlfncj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';

const SESSION_KEY = 'negocios_session';
const STORE_KEY   = 'ops_v4';

// ── Sesión ─────────────────────────────────────────
let _session = null;

function getSession() {
  if (_session) return _session;
  try { const s = localStorage.getItem(SESSION_KEY); if (s) _session = JSON.parse(s); } catch(e) {}
  return _session;
}
function saveSession(userId, username) {
  _session = { userId, username };
  localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
}
function clearSession() {
  _session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STORE_KEY);
}

// ── Hash username+pin → userId ─────────────────────
async function makeUserId(username, pin) {
  const raw = username.trim().toLowerCase() + ':' + pin.trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
  return 'u_' + hex.slice(0, 32);
}

// ── Sync status ────────────────────────────────────
let _saveTimer = null;
let _lastSaved = null;
let _isOnline  = navigator.onLine;

window.addEventListener('online',  () => { _isOnline = true;  setSyncStatus('idle'); scheduleSync(); });
window.addEventListener('offline', () => { _isOnline = false; setSyncStatus('offline'); });

function setSyncStatus(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const cfg = {
    idle:    ['', 'var(--text3)', ''],
    saving:  ['⟳', 'var(--gold)', 'Guardando…'],
    saved:   ['✓', 'var(--green)', 'Guardado ' + (_lastSaved ? _lastSaved.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : '')],
    error:   ['⚠', 'var(--red)', msg || 'Error al guardar'],
    offline: ['◌', 'var(--text3)', 'Sin conexión · local'],
  };
  const [icon, color, label] = cfg[status] || cfg.idle;
  el.innerHTML = `<span style="color:${color};font-size:10px;font-family:'IBM Plex Mono',monospace;">${icon} ${label}</span>`;
}

// ── Supabase fetch ─────────────────────────────────
function _hdrs(extra) {
  return { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/json', ...extra };
}
async function sbGet(userId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data?user_id=eq.${userId}&select=payload`, { headers: _hdrs() });
  if (!res.ok) throw new Error(`GET ${res.status}: ${await res.text()}`);
  const rows = await res.json();
  return rows.length ? rows[0].payload : null;
}
async function sbUpsert(userId, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/user_data`, {
    method: 'POST',
    headers: _hdrs({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify({ user_id: userId, payload: data, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) throw new Error(`UPSERT ${res.status}: ${await res.text()}`);
}

// ── Autosave ───────────────────────────────────────
function scheduleSync() {
  if (_saveTimer) clearTimeout(_saveTimer);
  setSyncStatus('saving');
  _saveTimer = setTimeout(async () => {
    try {
      if (!window.S) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(window.S));
      const sess = getSession();
      if (_isOnline && sess) await sbUpsert(sess.userId, window.S);
      _lastSaved = new Date();
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch(e) {
      console.warn('Sync error:', e);
      setSyncStatus('error', e.message.slice(0, 40));
    }
  }, 800);
}

// ── Login: hash credenciales, cargar datos ─────────
async function dbLogin(username, pin) {
  const userId = await makeUserId(username, pin);
  let data = null;
  if (_isOnline) {
    try { data = await sbGet(userId); } catch(e) { console.warn('Remote load error:', e); }
  }
  if (!data) {
    try { const l = localStorage.getItem(STORE_KEY); if(l) data = JSON.parse(l); } catch(e) {}
  }
  saveSession(userId, username.trim());
  localStorage.setItem(STORE_KEY, data ? JSON.stringify(data) : '{}');
  return data;
}

// ── Carga al reabrir (sesión persistente) ──────────
async function dbLoad() {
  const sess = getSession();
  if (!sess) return null;
  let data = null;
  if (_isOnline) {
    try { data = await sbGet(sess.userId); } catch(e) { console.warn('Remote load error:', e); }
  }
  if (!data) {
    try { const l = localStorage.getItem(STORE_KEY); if(l) data = JSON.parse(l); } catch(e) {}
  }
  return data;
}

// ── Logout ─────────────────────────────────────────
function dbLogout() {
  if (_saveTimer) clearTimeout(_saveTimer);
  clearSession();
  location.reload();
}

window.DB = { scheduleSync, dbLoad, dbLogin, dbLogout, getSession, setSyncStatus };
