// ════════════════════════════════════════════════════
//  db.js — Supabase persistence layer
//  Estrategia: usuario anónimo via UUID local,
//  tabla user_data (user_id TEXT PK, payload JSONB, updated_at TIMESTAMPTZ)
//  Autosave con debounce 1.5s. Fallback a localStorage si offline.
// ════════════════════════════════════════════════════

// ── Configuración — reemplaza con tus valores de Supabase ──
const SUPABASE_URL = 'https://kjvftqsscttnghmlfncj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_iaQ06UGlROdlqqOm-Lo8wg_31AcM2GN';

// ── Usuario anónimo persistente ──
const USER_ID_KEY = 'negocios_user_id';
function getOrCreateUserId() {
  let uid = localStorage.getItem(USER_ID_KEY);
  if (!uid) {
    uid = 'user_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem(USER_ID_KEY, uid);
  }
  return uid;
}
const USER_ID = getOrCreateUserId();

// ── Estado de sync ──
let _syncStatus = 'idle'; // idle | saving | saved | error | offline
let _saveTimer  = null;
let _lastSaved  = null;
let _isOnline   = navigator.onLine;

window.addEventListener('online',  () => { _isOnline = true;  setSyncStatus('idle'); scheduleSync(); });
window.addEventListener('offline', () => { _isOnline = false; setSyncStatus('offline'); });

function setSyncStatus(status, msg) {
  _syncStatus = status;
  const el = document.getElementById('syncStatus');
  if (!el) return;
  const icons = { idle:'', saving:'⟳', saved:'✓', error:'⚠', offline:'◌' };
  const colors = { idle:'var(--text3)', saving:'var(--gold)', saved:'var(--green)', error:'var(--red)', offline:'var(--text3)' };
  const labels = { idle:'', saving:'Guardando…', saved:'Guardado '+ (_lastSaved ? _lastSaved.toLocaleTimeString('es',{hour:'2-digit',minute:'2-digit'}) : ''), error: msg||'Error al guardar', offline:'Sin conexión · guardado local' };
  el.innerHTML = `<span style="color:${colors[status]};font-size:10px;font-family:'IBM Plex Mono',monospace;">${icons[status]} ${labels[status]}</span>`;
}

// ── Supabase fetch helper ──
async function sbFetch(method, body) {
  const url = `${SUPABASE_URL}/rest/v1/user_data`;
  const headers = {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
    'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
  };
  const res = await fetch(method === 'GET' ? url + '?user_id=eq.' + USER_ID + '&select=payload' : url, {
    method, headers, body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`Supabase ${method} ${res.status}: ${await res.text()}`);
  return method === 'GET' ? res.json() : null;
}

// ── Guardar en Supabase ──
async function pushToSupabase(data) {
  await sbFetch('POST', { user_id: USER_ID, payload: data, updated_at: new Date().toISOString() });
}

// ── Cargar desde Supabase ──
async function pullFromSupabase() {
  const rows = await sbFetch('GET');
  if (rows && rows.length > 0) return rows[0].payload;
  return null;
}

// ── Autosave con debounce ──
function scheduleSync() {
  if (_saveTimer) clearTimeout(_saveTimer);
  setSyncStatus('saving');
  _saveTimer = setTimeout(async () => {
    try {
      const data = typeof window.S !== 'undefined' ? window.S : null;
      if (!data) return;
      // Siempre guardar en localStorage como fallback
      localStorage.setItem('ops_v4', JSON.stringify(data));
      if (_isOnline && SUPABASE_URL !== '') {
        await pushToSupabase(data);
      }
      _lastSaved = new Date();
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 3000);
    } catch (e) {
      console.warn('Sync error:', e);
      setSyncStatus('error', e.message.slice(0, 40));
    }
  }, 1500);
}

// ── Carga inicial: Supabase → localStorage → vacío ──
async function dbLoad() {
  // 1. Intentar desde Supabase
  if (_isOnline && SUPABASE_URL !== '') {
    try {
      const remote = await pullFromSupabase();
      if (remote) {
        localStorage.setItem('ops_v4', JSON.stringify(remote));
        setSyncStatus('saved');
        setTimeout(() => setSyncStatus('idle'), 2000);
        return remote;
      }
    } catch (e) {
      console.warn('No se pudo cargar desde Supabase, usando local:', e);
      setSyncStatus('offline');
    }
  }
  // 2. Fallback localStorage
  try {
    const local = localStorage.getItem('ops_v4');
    if (local) return JSON.parse(local);
  } catch (e) {}
  return null;
}

// ── API pública ──
window.DB = { scheduleSync, dbLoad, USER_ID, setSyncStatus };
