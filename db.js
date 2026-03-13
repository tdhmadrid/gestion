// ════════════════════════════════════════════════════
//  db.js — Supabase persistence layer v3
//  · Multi-usuario: nombre + PIN → userId SHA-256
//  · Supabase REST API directa (sin SDK)
//  · Autosave 800ms debounce
//  · Fallback completo a localStorage
// ════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://kjvftqsscttnghmlfncj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';
const TABLE             = 'user_data';

const SESSION_KEY = 'negocios_session';
const STORE_KEY   = 'ops_v4';

// ── Sesión ─────────────────────────────────────────
let _session = null;

function getSession() {
  if (_session) return _session;
  try {
    const s = localStorage.getItem(SESSION_KEY);
    if (s) _session = JSON.parse(s);
  } catch(e) {}
  return _session;
}

function _saveSession(userId, username) {
  _session = { userId, username };
  localStorage.setItem(SESSION_KEY, JSON.stringify(_session));
}

function clearSession() {
  _session = null;
  localStorage.removeItem(SESSION_KEY);
  localStorage.removeItem(STORE_KEY);
}

// ── Hash username+pin → userId determinístico ──────
// Usa djb2 + sdbm combinados — funciona en HTTP y HTTPS, sin crypto.subtle
function makeUserId(username, pin) {
  const raw = username.trim().toLowerCase() + ':' + String(pin).trim();
  let h1 = 5381, h2 = 0;
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    h1 = Math.imul(h1, 33) ^ c;
    h2 = c + Math.imul(h2, 65599);
  }
  // Convertir a hex sin signo y rellenar
  const p1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const p2 = (h2 >>> 0).toString(16).padStart(8, '0');
  // Añadir más entropía con otro pase sobre la cadena al revés
  let h3 = 0x811c9dc5, h4 = 0;
  for (let i = raw.length - 1; i >= 0; i--) {
    const c = raw.charCodeAt(i);
    h3 = Math.imul(h3 ^ c, 0x01000193);
    h4 = Math.imul(h4 + c, 0x9e3779b9);
  }
  const p3 = (h3 >>> 0).toString(16).padStart(8, '0');
  const p4 = (h4 >>> 0).toString(16).padStart(8, '0');
  return 'u_' + p1 + p2 + p3 + p4;  // 34 chars total, determinístico
}

// ── Sync status indicator ──────────────────────────
let _saveTimer = null;
let _lastSaved = null;
let _isOnline  = navigator.onLine;

window.addEventListener('online',  () => { _isOnline = true;  _updateStatus('idle'); _flushPending(); });
window.addEventListener('offline', () => { _isOnline = false; _updateStatus('offline'); });

function _updateStatus(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    idle:    { icon: '',  col: 'var(--text3)',  txt: '' },
    saving:  { icon: '⟳', col: 'var(--gold)',   txt: 'Guardando…' },
    saved:   { icon: '✓', col: 'var(--green)',  txt: 'Guardado ' + (_lastSaved ? _lastSaved.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : '') },
    error:   { icon: '⚠', col: 'var(--red)',    txt: msg || 'Error — guardado local' },
    offline: { icon: '◌', col: 'var(--text3)',  txt: 'Sin conexión · local' },
  };
  const s = map[status] || map.idle;
  el.innerHTML = `<span style="color:${s.col};font-size:10px;font-family:'IBM Plex Mono',monospace;line-height:1.4">${s.icon} ${s.txt}</span>`;
}

function setSyncStatus(status, msg) { _updateStatus(status, msg); }

// ── Headers Supabase ───────────────────────────────
function _h(extra) {
  return Object.assign({
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type':  'application/json',
  }, extra || {});
}

// ── Leer fila de Supabase ──────────────────────────
async function _sbRead(userId) {
  const url = `${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=payload`;
  const r   = await fetch(url, { method: 'GET', headers: _h() });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Leer datos: HTTP ${r.status} — ${txt.slice(0,120)}`);
  }
  const rows = await r.json();
  return rows.length > 0 ? rows[0].payload : null;
}

// ── Escribir/actualizar fila en Supabase ───────────
async function _sbWrite(userId, data) {
  const url  = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  const body = JSON.stringify({ user_id: userId, payload: data, updated_at: new Date().toISOString() });
  const r    = await fetch(url, {
    method:  'POST',
    headers: _h({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body,
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`Guardar datos: HTTP ${r.status} — ${txt.slice(0,120)}`);
  }
}

// ── Test de conectividad con Supabase ──────────────
async function _testConnection() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=user_id&limit=0`;
    const r   = await fetch(url, { method: 'GET', headers: _h() });
    return { ok: r.ok, status: r.status, msg: r.ok ? 'OK' : await r.text() };
  } catch(e) {
    return { ok: false, status: 0, msg: e.message };
  }
}

// ── Flush datos pendientes al recuperar conexión ───
let _pendingFlush = false;
function _flushPending() {
  if (!_pendingFlush || !window.S) return;
  _pendingFlush = false;
  scheduleSync();
}

// ── Autosave con debounce ──────────────────────────
function scheduleSync() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _updateStatus('saving');
  _saveTimer = setTimeout(_doSync, 800);
}

async function _doSync() {
  const data = window.S;
  if (!data) { _updateStatus('idle'); return; }

  // 1. Guardar local siempre (nunca se pierde nada)
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch(e) {}

  // 2. Intentar Supabase
  const sess = getSession();
  if (!sess) { _updateStatus('idle'); return; }

  if (!_isOnline) {
    _pendingFlush = true;
    _updateStatus('offline');
    return;
  }

  try {
    await _sbWrite(sess.userId, data);
    _lastSaved = new Date();
    _updateStatus('saved');
    setTimeout(() => _updateStatus('idle'), 3000);
  } catch(e) {
    console.error('[db] sync error:', e.message);
    _pendingFlush = true;
    _updateStatus('error', e.message.slice(0, 60));
  }
}

// ── Login ──────────────────────────────────────────
// Retorna: { data, isNewUser, error }
async function dbLogin(username, pin) {
  const userId = makeUserId(username, pin);

  // Test de conectividad
  const conn = await _testConnection();
  _isOnline = conn.ok;

  if (!conn.ok) {
    // Sin Supabase: usar localStorage local (mismo dispositivo)
    let localData = null;
    try { const l = localStorage.getItem(STORE_KEY); if(l) localData = JSON.parse(l); } catch(e) {}
    _saveSession(userId, username.trim());
    localStorage.setItem(STORE_KEY, JSON.stringify(localData || {}));
    return localData; // null = usuario nuevo local
  }

  // Buscar datos en Supabase
  let remoteData = null;
  try {
    remoteData = await _sbRead(userId);
  } catch(e) {
    throw new Error(e.message);
  }

  _saveSession(userId, username.trim());
  localStorage.setItem(STORE_KEY, JSON.stringify(remoteData || {}));
  return remoteData; // null = usuario nuevo, objeto = datos existentes
}

// ── Carga al reabrir (sesión ya guardada en este dispositivo) ──
async function dbLoad() {
  const sess = getSession();
  if (!sess) return null;

  const conn = await _testConnection();
  _isOnline = conn.ok;

  if (!conn.ok) {
    // Offline: usar datos locales
    try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e) {}
    return null;
  }

  // Online: cargar desde Supabase
  let remote = null;
  try {
    remote = await _sbRead(sess.userId);
  } catch(e) {
    console.warn('[db] load error, using local:', e.message);
    try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e2) {}
    return null;
  }

  if (remote) {
    localStorage.setItem(STORE_KEY, JSON.stringify(remote));
    return remote;
  }

  // No hay datos remotos — usar local si existe
  try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e) {}
  return null;
}

// ── Logout ─────────────────────────────────────────
function dbLogout() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  clearSession();
  location.reload();
}

// ── Diagnóstico (llamar desde consola: DB.diagnose()) ──
async function _diagnose() {
  console.group('[DB Diagnóstico]');
  console.log('URL:', SUPABASE_URL);
  console.log('Key prefix:', SUPABASE_ANON_KEY.slice(0,20) + '...');
  const conn = await _testConnection();
  console.log('Conectividad:', conn);
  const sess = getSession();
  console.log('Sesión:', sess);
  if (sess) {
    try {
      const d = await _sbRead(sess.userId);
      console.log('Datos remotos:', d ? 'encontrados' : 'vacío (usuario nuevo)');
    } catch(e) {
      console.error('Error al leer:', e.message);
    }
  }
  console.groupEnd();
}

window.DB = {
  scheduleSync,
  dbLoad,
  dbLogin,
  dbLogout,
  getSession,
  setSyncStatus,
  diagnose: _diagnose,
};
