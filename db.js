// ════════════════════════════════════════════════════
//  db.js  v6  —  Sin CDN externo, fetch directo
//  Supabase Auth v1 API + REST v1
//  Compatible con sb_publishable key
// ════════════════════════════════════════════════════
'use strict';

const _URL   = 'https://kjvftqsscttnghmlfncj.supabase.co';
const _KEY   = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';
const _TABLE = 'user_data';
const _STORE = 'ops_v4';
const _SESS  = 'nb_session_v6';   // { access_token, refresh_token, user }

// ════════════════════════════════════════════
//  ESTADO INTERNO
// ════════════════════════════════════════════
let _tok  = null;   // access_token JWT
let _rtok = null;   // refresh_token
let _uid  = null;   // user id
let _email = null;

function _loadStoredSession() {
  try {
    const raw = localStorage.getItem(_SESS);
    if (!raw) return;
    const s = JSON.parse(raw);
    _tok   = s.access_token  || null;
    _rtok  = s.refresh_token || null;
    _uid   = s.user?.id      || null;
    _email = s.user?.email   || null;
  } catch(e) {}
}
function _saveStoredSession(access, refresh, user) {
  _tok   = access;
  _rtok  = refresh;
  _uid   = user?.id    || null;
  _email = user?.email || null;
  localStorage.setItem(_SESS, JSON.stringify({ access_token: access, refresh_token: refresh, user }));
}
function _clearStoredSession() {
  _tok = _rtok = _uid = _email = null;
  localStorage.removeItem(_SESS);
  localStorage.removeItem(_STORE);
}
_loadStoredSession();

// ════════════════════════════════════════════
//  UI STATUS  (seguro: espera el DOM)
// ════════════════════════════════════════════
let _lastSaved = null;

function _ui(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const M = {
    idle:    ['',  '#404a65', ''],
    saving:  ['⟳', '#f0c040', 'Guardando…'],
    saved:   ['✓', '#4debb0', 'Guardado ' + (_lastSaved
               ? _lastSaved.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : '')],
    error:   ['⚠', '#ff6b6b', msg || 'Error — guardado local'],
    offline: ['◌', '#404a65', 'Sin conexión · local'],
  };
  const [icon, col, txt] = M[status] || M.idle;
  el.innerHTML =
    `<span style="color:${col};font-size:10px;font-family:'IBM Plex Mono',monospace;line-height:1.6">`
    + icon + (txt ? ' ' + txt : '') + '</span>';
}
function setSyncStatus(s, m) { _ui(s, m); }

// ════════════════════════════════════════════
//  FETCH HELPERS
// ════════════════════════════════════════════
function _h(tok, extra) {
  return Object.assign({
    'apikey':        _KEY,
    'Authorization': 'Bearer ' + (tok || _KEY),
    'Content-Type':  'application/json',
  }, extra || {});
}

async function _post(path, body, tok) {
  const r = await fetch(_URL + path, {
    method: 'POST',
    headers: _h(tok),
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = d.error_description || d.msg || d.message || d.error || ('HTTP ' + r.status);
    throw new Error(msg);
  }
  return d;
}

async function _get(path, tok) {
  const r = await fetch(_URL + path, { method: 'GET', headers: _h(tok) });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error('HTTP ' + r.status + ': ' + txt.slice(0, 100));
  }
  return r.json();
}

// ════════════════════════════════════════════
//  TOKEN REFRESH
// ════════════════════════════════════════════
async function _refresh() {
  if (!_rtok) throw new Error('Sin refresh token');
  const d = await _post('/auth/v1/token?grant_type=refresh_token',
                        { refresh_token: _rtok });
  _saveStoredSession(d.access_token, d.refresh_token, d.user);
  return d.access_token;
}

// Token válido: si falla con 401 refresca una vez
async function _validToken() {
  if (!_tok) throw new Error('No autenticado');
  return _tok;
}

// ════════════════════════════════════════════
//  DATA READ / WRITE
// ════════════════════════════════════════════
async function _read(uid) {
  const tok = await _validToken();
  const doRead = async (t) => {
    const rows = await _get(
      `/rest/v1/${_TABLE}?user_id=eq.${encodeURIComponent(uid)}&select=payload`,
      t
    );
    return Array.isArray(rows) && rows.length ? rows[0].payload : null;
  };
  try {
    return await doRead(tok);
  } catch(e) {
    if (e.message.startsWith('HTTP 401')) {
      const newTok = await _refresh();
      return await doRead(newTok);
    }
    throw e;
  }
}

async function _write(uid, payload) {
  const tok = await _validToken();
  const body = JSON.stringify({
    user_id:    uid,
    payload:    payload,
    updated_at: new Date().toISOString(),
  });
  const doWrite = async (t) => {
    const r = await fetch(_URL + '/rest/v1/' + _TABLE, {
      method:  'POST',
      headers: _h(t, { 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
      body,
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      throw new Error('HTTP ' + r.status + ': ' + txt.slice(0, 120));
    }
  };
  try {
    await doWrite(tok);
  } catch(e) {
    if (e.message.startsWith('HTTP 401')) {
      const newTok = await _refresh();
      await doWrite(newTok);
    } else throw e;
  }
}

// ════════════════════════════════════════════
//  AUTOSAVE  (debounce 800ms)
// ════════════════════════════════════════════
let _timer   = null;
let _pending = false;

window.addEventListener('online', () => { if (_pending && _uid) scheduleSync(); });

function scheduleSync() {
  if (_timer) clearTimeout(_timer);
  _ui('saving');
  _timer = setTimeout(_doSync, 800);
}

async function _doSync() {
  const data = window.S;
  if (!data || typeof data !== 'object') {
    console.warn('[db] _doSync: window.S not available');
    _ui('idle');
    return;
  }

  // 1. Guardar local siempre
  try { localStorage.setItem(_STORE, JSON.stringify(data)); } catch(e) {}

  // 2. Sin uid o sin conexión → marcar pendiente
  if (!_uid) { _ui('idle'); return; }
  if (!navigator.onLine) { _pending = true; _ui('offline'); return; }

  // 3. Subir a Supabase
  console.log('[db] writing to Supabase, uid:', _uid, 'ops:', data.ops?.length);
  try {
    await _write(_uid, data);
    _pending   = false;
    _lastSaved = new Date();
    console.log('[db] ✓ saved to Supabase');
    _ui('saved');
    setTimeout(() => _ui('idle'), 3000);
  } catch(e) {
    console.error('[db] ✗ sync error:', e.message);
    _pending = true;
    _ui('error', e.message.slice(0, 60));
  }
}

// ════════════════════════════════════════════
//  AUTH
// ════════════════════════════════════════════
async function dbSignUp(email, password) {
  const d = await _post('/auth/v1/signup', { email, password });
  if (d.access_token) {
    _saveStoredSession(d.access_token, d.refresh_token, d.user);
    return { needsConfirmation: false };
  }
  return { needsConfirmation: true };
}

async function dbLogin(email, password) {
  const d = await _post('/auth/v1/token?grant_type=password', { email, password });
  _saveStoredSession(d.access_token, d.refresh_token, d.user);
  // Cargar datos remotos
  let remote = null;
  try { remote = await _read(d.user.id); } catch(e) {
    console.warn('[db] post-login read failed:', e.message);
  }
  if (remote) localStorage.setItem(_STORE, JSON.stringify(remote));
  return remote;
}

async function dbLoad() {
  if (!_tok || !_uid) return null;
  let remote = null;
  try {
    remote = await _read(_uid);
  } catch(e) {
    // Token inválido → intentar refresh
    try {
      await _refresh();
      remote = await _read(_uid);
    } catch(e2) {
      console.warn('[db] dbLoad failed after refresh:', e2.message);
      _clearStoredSession();
      return null;   // forzar re-login
    }
  }
  if (remote) { localStorage.setItem(_STORE, JSON.stringify(remote)); return remote; }
  // Sin datos remotos → usar local
  try { const l = localStorage.getItem(_STORE); if(l) return JSON.parse(l); } catch(e) {}
  return null;
}

async function dbLogout() {
  if (_timer) clearTimeout(_timer);
  try {
    if (_tok) await _post('/auth/v1/logout', {}, _tok).catch(() => {});
  } catch(e) {}
  _clearStoredSession();
  location.reload();
}

function getSession() {
  if (!_uid || !_email) return null;
  return { userId: _uid, email: _email };
}

function dbInit() { /* sin SDK, no necesita init */ }

// ════════════════════════════════════════════
//  DIAGNÓSTICO  (DB.diagnose() en consola)
// ════════════════════════════════════════════
async function _diagnose() {
  console.group('[DB v6]');
  console.log('uid:', _uid);
  console.log('email:', _email);
  console.log('token:', _tok ? _tok.slice(0,30)+'…' : 'none');
  console.log('online:', navigator.onLine);
  if (_uid && _tok) {
    try {
      const d = await _read(_uid);
      console.log('remote data:', d ? '✓ ' + (d.ops?.length||0) + ' ops' : 'vacío');
    } catch(e) { console.error('read error:', e.message); }
    // Test write
    try {
      await _write(_uid, window.S || {});
      console.log('write test: ✓');
    } catch(e) { console.error('write error:', e.message); }
  }
  console.groupEnd();
}

// ════════════════════════════════════════════
//  API PÚBLICA
// ════════════════════════════════════════════
window.DB = {
  dbInit, scheduleSync, dbLoad, dbLogin, dbSignUp, dbLogout,
  getSession, setSyncStatus, diagnose: _diagnose,
};
