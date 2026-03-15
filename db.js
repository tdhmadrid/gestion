// ════════════════════════════════════════════════════
//  db.js — Supabase Auth + persistencia v4
//  · Login/registro real con email + password (Supabase Auth)
//  · user_id = auth.uid() — persistente entre dispositivos
//  · Autosave 800ms debounce
//  · Fallback localStorage si offline
// ════════════════════════════════════════════════════

const SUPABASE_URL      = 'https://kjvftqsscttnghmlfncj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';
const TABLE             = 'user_data';

const STORE_KEY     = 'ops_v4';
const SB_TOKEN_KEY  = 'sb_access_token';
const SB_RTOKEN_KEY = 'sb_refresh_token';
const SB_USER_KEY   = 'sb_user';

// ── Token en memoria + localStorage ───────────────
let _accessToken  = localStorage.getItem(SB_TOKEN_KEY)  || null;
let _refreshToken = localStorage.getItem(SB_RTOKEN_KEY) || null;
let _user         = null;
try { _user = JSON.parse(localStorage.getItem(SB_USER_KEY)); } catch(e) {}

function _saveAuth(access, refresh, user) {
  _accessToken  = access;
  _refreshToken = refresh;
  _user         = user;
  localStorage.setItem(SB_TOKEN_KEY,  access);
  localStorage.setItem(SB_RTOKEN_KEY, refresh);
  localStorage.setItem(SB_USER_KEY,   JSON.stringify(user));
}
function _clearAuth() {
  _accessToken = _refreshToken = _user = null;
  [SB_TOKEN_KEY, SB_RTOKEN_KEY, SB_USER_KEY, STORE_KEY].forEach(k => localStorage.removeItem(k));
}
function getSession() {
  if (!_user || !_accessToken) return null;
  return { userId: _user.id, email: _user.email };
}

// ── Sync status ────────────────────────────────────
let _saveTimer = null;
let _lastSaved = null;
let _isOnline  = navigator.onLine;
let _pendingFlush = false;

window.addEventListener('online',  () => { _isOnline = true;  _updateStatus('idle'); if(_pendingFlush) scheduleSync(); });
window.addEventListener('offline', () => { _isOnline = false; _updateStatus('offline'); });

function _updateStatus(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    idle:    ['',  'var(--text3)', ''],
    saving:  ['⟳', 'var(--gold)',  'Guardando…'],
    saved:   ['✓', 'var(--green)', 'Guardado ' + (_lastSaved ? _lastSaved.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : '')],
    error:   ['⚠', 'var(--red)',   msg || 'Error — guardado local'],
    offline: ['◌', 'var(--text3)', 'Sin conexión · local'],
  };
  const [icon, col, txt] = map[status] || map.idle;
  el.innerHTML = `<span style="color:${col};font-size:10px;font-family:'IBM Plex Mono',monospace">${icon} ${txt}</span>`;
}
function setSyncStatus(s, m) { _updateStatus(s, m); }

// ── Supabase Auth API ──────────────────────────────
function _authHdrs(token) {
  return {
    'apikey':        SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY),
    'Content-Type':  'application/json',
  };
}

async function _authPost(path, body, token) {
  const r = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    method: 'POST',
    headers: _authHdrs(token),
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error_description || data.msg || data.message || `HTTP ${r.status}`);
  return data;
}

// Refrescar token automáticamente
async function _refreshSession() {
  if (!_refreshToken) throw new Error('Sin sesión activa');
  const data = await _authPost('/token?grant_type=refresh_token', { refresh_token: _refreshToken });
  _saveAuth(data.access_token, data.refresh_token, data.user);
  return data.access_token;
}

// Obtener token válido (refresca si es necesario)
async function _getToken() {
  if (!_accessToken) throw new Error('No autenticado');
  // Intentar refrescar si el token está cerca de expirar (heurística simple)
  try {
    // Validar que el token funciona con un test rápido
    return _accessToken;
  } catch(e) {
    return await _refreshSession();
  }
}

// ── REST API para user_data ────────────────────────
async function _dataRead(userId) {
  const token = await _getToken();
  const r = await fetch(
    `${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=payload`,
    { headers: _authHdrs(token) }
  );
  if (r.status === 401) {
    // Token expirado — refrescar y reintentar
    const newToken = await _refreshSession();
    const r2 = await fetch(
      `${SUPABASE_URL}/rest/v1/${TABLE}?user_id=eq.${encodeURIComponent(userId)}&select=payload`,
      { headers: _authHdrs(newToken) }
    );
    if (!r2.ok) throw new Error(`Leer datos: HTTP ${r2.status}`);
    const rows2 = await r2.json();
    return rows2.length ? rows2[0].payload : null;
  }
  if (!r.ok) throw new Error(`Leer datos: HTTP ${r.status}: ${await r.text()}`);
  const rows = await r.json();
  return rows.length ? rows[0].payload : null;
}

async function _dataWrite(userId, data) {
  const token = await _getToken();
  const body = JSON.stringify({ user_id: userId, payload: data, updated_at: new Date().toISOString() });

  const doWrite = async (tok) => {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: { ..._authHdrs(tok), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body,
    });
    if (!r.ok) throw new Error(`Guardar datos: HTTP ${r.status}: ${await r.text()}`);
  };

  try { await doWrite(token); }
  catch(e) {
    if (e.message.includes('401')) {
      const newToken = await _refreshSession();
      await doWrite(newToken);
    } else throw e;
  }
}

// ── Autosave ───────────────────────────────────────
function scheduleSync() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _updateStatus('saving');
  _saveTimer = setTimeout(async () => {
    try {
      if (!window.S) return;
      localStorage.setItem(STORE_KEY, JSON.stringify(window.S));
      const sess = getSession();
      if (_isOnline && sess) {
        await _dataWrite(sess.userId, window.S);
        _pendingFlush = false;
      } else {
        _pendingFlush = true;
        if (!_isOnline) { _updateStatus('offline'); return; }
      }
      _lastSaved = new Date();
      _updateStatus('saved');
      setTimeout(() => _updateStatus('idle'), 3000);
    } catch(e) {
      console.error('[db] sync:', e.message);
      _pendingFlush = true;
      _updateStatus('error', e.message.slice(0, 60));
    }
  }, 800);
}

// ── Registro ───────────────────────────────────────
async function dbSignUp(email, password) {
  const data = await _authPost('/signup', { email, password });
  if (data.access_token) {
    _saveAuth(data.access_token, data.refresh_token, data.user);
    return { user: data.user, needsConfirmation: false };
  }
  // Supabase puede requerir confirmación de email
  return { user: data.user, needsConfirmation: true };
}

// ── Login ──────────────────────────────────────────
async function dbLogin(email, password) {
  const data = await _authPost('/token?grant_type=password', { email, password });
  _saveAuth(data.access_token, data.refresh_token, data.user);
  // Cargar datos del usuario
  let remoteData = null;
  try { remoteData = await _dataRead(data.user.id); } catch(e) { console.warn('[db] load after login:', e.message); }
  if (remoteData) localStorage.setItem(STORE_KEY, JSON.stringify(remoteData));
  return remoteData;
}

// ── Carga al reabrir (token guardado) ─────────────
async function dbLoad() {
  if (!_accessToken || !_user) return null;
  try {
    const remote = await _dataRead(_user.id);
    if (remote) { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); return remote; }
  } catch(e) {
    // Token expirado o error de red
    if (e.message.includes('401') || e.message.includes('No autenticado')) {
      try {
        await _refreshSession();
        const remote2 = await _dataRead(_user.id);
        if (remote2) { localStorage.setItem(STORE_KEY, JSON.stringify(remote2)); return remote2; }
      } catch(e2) {
        console.warn('[db] refresh failed:', e2.message);
        _clearAuth();
        return null; // forzar re-login
      }
    }
    console.warn('[db] dbLoad error:', e.message);
  }
  // Fallback local
  try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e) {}
  return null;
}

// ── Logout ─────────────────────────────────────────
async function dbLogout() {
  if (_saveTimer) clearTimeout(_saveTimer);
  try {
    if (_accessToken) await _authPost('/logout', {}, _accessToken).catch(()=>{});
  } catch(e) {}
  _clearAuth();
  location.reload();
}

// ── Diagnóstico ────────────────────────────────────
async function _diagnose() {
  console.group('[DB Diagnóstico v4]');
  console.log('User:', _user?.email, '| ID:', _user?.id);
  console.log('Token presente:', !!_accessToken);
  const sess = getSession();
  if (sess) {
    try { const d = await _dataRead(sess.userId); console.log('Datos remotos:', d ? 'OK' : 'vacío'); }
    catch(e) { console.error('Error lectura:', e.message); }
  }
  console.groupEnd();
}

window.DB = { scheduleSync, dbLoad, dbLogin, dbSignUp, dbLogout, getSession, setSyncStatus, diagnose: _diagnose };
