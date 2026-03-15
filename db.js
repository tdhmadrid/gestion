// ════════════════════════════════════════════════════
//  db.js  v5  —  usa @supabase/supabase-js via CDN
//  Cargado DESPUÉS de que el CDN script lo inyecta
//  como window.supabase
// ════════════════════════════════════════════════════

const _SB_URL  = 'https://kjvftqsscttnghmlfncj.supabase.co';
const _SB_KEY  = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';
const _TABLE   = 'user_data';
const STORE_KEY = 'ops_v4';

// ── Cliente Supabase (se inicializa en dbInit) ─────
let _sb   = null;
let _user = null;

function dbInit() {
  if (_sb) return;
  // El CDN expone createClient en window.supabase
  const { createClient } = window.supabase;
  _sb = createClient(_SB_URL, _SB_KEY, {
    auth: {
      persistSession:    true,   // guarda sesión en localStorage automáticamente
      autoRefreshToken:  true,   // refresca el JWT antes de que expire
      detectSessionInUrl: false,
    },
  });
  // Escuchar cambios de sesión
  _sb.auth.onAuthStateChange((event, session) => {
    _user = session?.user ?? null;
    if (event === 'SIGNED_OUT') { localStorage.removeItem(STORE_KEY); }
  });
}

// ── Sync status ────────────────────────────────────
let _saveTimer    = null;
let _lastSaved    = null;
let _pendingFlush = false;

window.addEventListener('online',  () => { if (_pendingFlush) scheduleSync(); });
window.addEventListener('offline', () => { _updateStatus('offline'); });

function _updateStatus(status, msg) {
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const map = {
    idle:    ['',  'var(--text3)', ''],
    saving:  ['⟳', 'var(--gold)',  'Guardando…'],
    saved:   ['✓', 'var(--green)', 'Guardado ' + (_lastSaved
                ? _lastSaved.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })
                : '')],
    error:   ['⚠', 'var(--red)',   msg || 'Error — datos guardados local'],
    offline: ['◌', 'var(--text3)', 'Sin conexión · guardado local'],
  };
  const [icon, col, txt] = map[status] || map.idle;
  el.innerHTML = `<span style="color:${col};font-size:10px;font-family:'IBM Plex Mono',monospace">${icon} ${txt}</span>`;
}
function setSyncStatus(s, m) { _updateStatus(s, m); }

// ── Leer datos del usuario ─────────────────────────
async function _dataRead(userId) {
  const { data, error } = await _sb
    .from(_TABLE)
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.payload ?? null;
}

// ── Escribir datos del usuario (upsert) ───────────
async function _dataWrite(userId, payload) {
  const { error } = await _sb
    .from(_TABLE)
    .upsert({ user_id: userId, payload, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

// ── Autosave con debounce 800ms ────────────────────
function scheduleSync() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _updateStatus('saving');
  _saveTimer = setTimeout(_doSync, 800);
}

async function _doSync() {
  const data = window.S;
  if (!data) { _updateStatus('idle'); return; }

  // Siempre local primero
  try { localStorage.setItem(STORE_KEY, JSON.stringify(data)); } catch(e) {}

  if (!navigator.onLine) { _pendingFlush = true; _updateStatus('offline'); return; }

  const sess = await _sb.auth.getSession();
  const uid  = sess?.data?.session?.user?.id;
  if (!uid)  { _updateStatus('idle'); return; }

  try {
    await _dataWrite(uid, data);
    _pendingFlush = false;
    _lastSaved = new Date();
    _updateStatus('saved');
    setTimeout(() => _updateStatus('idle'), 3000);
  } catch(e) {
    console.error('[db] sync:', e.message);
    _pendingFlush = true;
    _updateStatus('error', e.message.slice(0, 60));
  }
}

// ── Registro ───────────────────────────────────────
async function dbSignUp(email, password) {
  const { data, error } = await _sb.auth.signUp({ email, password });
  if (error) throw new Error(error.message);
  _user = data.user;
  // Si devuelve sesión inmediata (sin confirmación de email)
  if (data.session) {
    return { user: data.user, needsConfirmation: false };
  }
  return { user: data.user, needsConfirmation: true };
}

// ── Login ──────────────────────────────────────────
async function dbLogin(email, password) {
  const { data, error } = await _sb.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  _user = data.user;
  // Cargar datos remotos
  let remote = null;
  try { remote = await _dataRead(data.user.id); } catch(e) { console.warn('[db] post-login load:', e.message); }
  if (remote) localStorage.setItem(STORE_KEY, JSON.stringify(remote));
  return remote;
}

// ── Carga al reabrir (sesión guardada por el SDK) ──
async function dbLoad() {
  // El SDK de Supabase restaura la sesión automáticamente desde localStorage
  const { data: { session } } = await _sb.auth.getSession();
  if (!session) return null;
  _user = session.user;
  // Cargar datos
  try {
    const remote = await _dataRead(session.user.id);
    if (remote) { localStorage.setItem(STORE_KEY, JSON.stringify(remote)); return remote; }
  } catch(e) {
    console.warn('[db] dbLoad error:', e.message);
    // Fallback local
    try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e2) {}
  }
  // Usuario existe pero sin datos remotos aún — usar local
  try { const l = localStorage.getItem(STORE_KEY); if(l) return JSON.parse(l); } catch(e) {}
  return null;
}

// ── Logout ─────────────────────────────────────────
async function dbLogout() {
  if (_saveTimer) clearTimeout(_saveTimer);
  await _sb.auth.signOut().catch(() => {});
  localStorage.removeItem(STORE_KEY);
  location.reload();
}

// ── Sesión activa ──────────────────────────────────
function getSession() {
  if (!_user) return null;
  return { userId: _user.id, email: _user.email };
}

// ── Diagnóstico ────────────────────────────────────
async function _diagnose() {
  console.group('[DB v5 Diagnóstico]');
  const { data: { session } } = await _sb.auth.getSession();
  console.log('Sesión:', session ? session.user.email : 'ninguna');
  if (session) {
    try {
      const d = await _dataRead(session.user.id);
      console.log('Datos remotos:', d ? 'OK (' + JSON.stringify(d).slice(0,60) + '…)' : 'vacío (usuario nuevo)');
    } catch(e) { console.error('Error lectura:', e.message); }
  }
  console.groupEnd();
}

window.DB = { dbInit, scheduleSync, dbLoad, dbLogin, dbSignUp, dbLogout, getSession, setSyncStatus, diagnose: _diagnose };
