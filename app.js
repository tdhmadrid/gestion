

// ════════════════════════════════════════════════════
//  LOGIN UI
// ════════════════════════════════════════════════════
let _authTab = 'login';  // 'login' | 'register'

function switchAuthTab(tab) {
  _authTab = tab;
  const isLogin = tab === 'login';
  document.getElementById('tabLogin').style.background    = isLogin ? 'var(--s1)' : 'transparent';
  document.getElementById('tabLogin').style.color         = isLogin ? 'var(--text)' : 'var(--text2)';
  document.getElementById('tabRegister').style.background = !isLogin ? 'var(--s1)' : 'transparent';
  document.getElementById('tabRegister').style.color      = !isLogin ? 'var(--text)' : 'var(--text2)';
  document.getElementById('loginBtn').textContent         = isLogin ? 'Iniciar sesión' : 'Crear cuenta';
  document.getElementById('loginHint').textContent        = isLogin
    ? 'Tus datos se sincronizan automáticamente entre dispositivos.'
    : 'Recibirás un correo de confirmación. Después ya puedes iniciar sesión.';
  document.getElementById('loginError').textContent = '';
  document.getElementById('loginPassword').autocomplete = isLogin ? 'current-password' : 'new-password';
}

function showLoginScreen() {
  const el = document.getElementById('loginScreen');
  if (el) el.classList.remove('hidden');
}

function hideLoginScreen(email) {
  const el = document.getElementById('loginScreen');
  if (el) el.classList.add('hidden');
  const badge = document.getElementById('userBadge');
  if (badge && email) badge.textContent = '● ' + email;
}

async function doLogin() {
  const btn   = document.getElementById('loginBtn');
  const errEl = document.getElementById('loginError');
  const email = document.getElementById('loginEmail').value.trim();
  const pass  = document.getElementById('loginPassword').value;

  errEl.textContent = '';
  errEl.style.color = 'var(--red)';
  if (!email) { errEl.textContent = 'Escribe tu correo'; return; }
  if (!pass)  { errEl.textContent = 'Escribe tu contraseña'; return; }
  if (_authTab === 'register' && pass.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; return; }

  btn.disabled = true;
  btn.textContent = _authTab === 'login' ? 'Entrando…' : 'Creando cuenta…';
  errEl.style.color = 'var(--gold)';
  errEl.textContent = 'Conectando con Supabase…';

  try {
    let data = null;
    if (_authTab === 'register') {
      const result = await window.DB.dbSignUp(email, pass);
      if (result.needsConfirmation) {
        errEl.style.color = 'var(--green)';
        errEl.textContent = '✓ Cuenta creada. Revisa tu correo para confirmar, luego inicia sesión.';
        switchAuthTab('login');
        btn.disabled = false;
        btn.textContent = 'Iniciar sesión';
        return;
      }
      data = null; // cuenta nueva, sin datos
    } else {
      data = await window.DB.dbLogin(email, pass);
    }
    applyLoaded(data);
    hideLoginScreen(email);
    currentDate = new Date(); showingAllMonths = true;
    buildNav(); buildBizViews(); populateResMonth(); buildMpicker(); renderAll();
    updateMonthLabel(); renderYearSummary();
    (S.customOpTypes||[]).forEach(t=>ensureCustomBadgeCSS(t.id,t.color));
    window.DB.setSyncStatus('idle');
    showToast(!data ? '¡Bienvenido! Cuenta nueva.' : 'Bienvenido, ' + email.split('@')[0], 'ok');
  } catch(e) {
    errEl.style.color = 'var(--red)';
    // Traducir errores comunes de Supabase Auth
    const msg = e.message;
    if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials'))
      errEl.textContent = 'Correo o contraseña incorrectos';
    else if (msg.includes('Email not confirmed'))
      errEl.textContent = 'Confirma tu correo antes de entrar';
    else if (msg.includes('User already registered'))
      errEl.textContent = 'Ya existe una cuenta con ese correo';
    else if (msg.includes('Password should be'))
      errEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
    else
      errEl.textContent = msg;
    console.error('[doLogin]', e);
  } finally {
    btn.disabled = false;
    btn.textContent = _authTab === 'login' ? 'Iniciar sesión' : 'Crear cuenta';
  }
}

// ════════════════════════════════════════════════════
//  STATE & STORAGE
// ════════════════════════════════════════════════════
const STORE = 'ops_v4';
window.S = { businesses:[], ops:[] };
let S = window.S;
let selColor = '#f0c040';
let curBizId = null;
let curOpType = 'envio';
let pdfPeriod = 'semana';
let cmpSelected = [];
let curClientId = null;

const COLORS = ['#f0c040','#4debb0','#5ba3ff','#ff6b6b','#a78bfa','#fb923c','#22d3ee','#f472b6','#a3e635','#e879f9'];
const OP_TYPES = [
  {id:'envio',    label:'Envío',          badge:'badge-envio'},
  {id:'cambio',   label:'Cambio divisas', badge:'badge-cambio'},
  {id:'comision', label:'Comisión',       badge:'badge-comision'},
  {id:'deposito', label:'Depósito',       badge:'badge-deposito'},
  {id:'gasto',    label:'Gasto',          badge:'badge-gasto'},
  {id:'misc',          label:'Misceláneo',     badge:'badge-misc'},
  {id:'transferencia',  label:'Transferencia',  badge:'badge-transferencia'},
  {id:'cripto',         label:'Cripto (USDT/BTC)', badge:'badge-cripto'},
];

function applyLoaded(data) {
  if (data) S = data;
  window.S = S;   // keep window.S in sync for db.js
  if(!S.businesses) S.businesses=[];
  if(!S.ops) S.ops=[];
  if(!S.clients) S.clients=[];
  if(!S.customOpTypes) S.customOpTypes=[];
  if(!S.opTypeOverrides) S.opTypeOverrides={};
  if(!S.statOrder) S.statOrder=['vol','com','gan','gast','neta'];
  if(!S.bizCardOrder) S.bizCardOrder=[];
  if(!S.clientCardOrder) S.clientCardOrder=[];
  S.clients.forEach(cl=>{
    if(!cl.bizIds) cl.bizIds = cl.bizId ? [cl.bizId] : [];
  });
  // Restore custom badge CSS
  (S.customOpTypes||[]).forEach(t => ensureCustomBadgeCSS(t.id, t.color));
}

function load() {
  try{ const r=localStorage.getItem(STORE); if(r) S=JSON.parse(r); }catch(e){}
  window.S = S;   // sync
  applyLoaded(S);
}

async function loadAsync() {
  if (window.DB) {
    const data = await window.DB.dbLoad();
    applyLoaded(data);
  } else {
    load();
  }
}
function save() {
  localStorage.setItem(STORE, JSON.stringify(S));
  if (window.DB) window.DB.scheduleSync();
}

// ════════════════════════════════════════════════════
//  DATA MANAGEMENT
// ════════════════════════════════════════════════════

// ──── NUEVA FUNCIONALIDAD: EXPORTAR / IMPORTAR ────

const APP_NAME = 'operaciones-panel';   // Nombre del archivo de backup

/**
 * Muestra un toast de notificación en pantalla.
 * @param {string} msg   - Texto a mostrar
 * @param {'ok'|'error'} tipo - Tipo de mensaje
 */
function showToast(msg, tipo) {
  const toast = document.getElementById('toastMsg');
  const icon  = document.getElementById('toastIcon');
  const text  = document.getElementById('toastText');
  icon.textContent  = tipo === 'ok' ? '✓' : '✕';
  icon.style.color  = tipo === 'ok' ? 'var(--green)' : 'var(--red)';
  text.textContent  = msg;
  toast.style.display = 'flex';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 320);
  }, 3500);
}

/**
 * EXPORTAR — recorre todo el localStorage y genera un .json descargable.
 * El archivo incluye TODAS las claves (datos de la app + tema), no sólo
 * la clave principal, para que la migración sea completa.
 */
function exportarDatos() {
  // Exportar S (estado actual en memoria) — siempre tiene los datos más recientes
  if (!S || (!S.businesses?.length && !S.ops?.length && !S.clients?.length)) {
    showToast('No hay datos para exportar.', 'error');
    return;
  }
  const now     = new Date();
  const fecha   = now.toISOString().slice(0, 10);
  const hora    = now.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }).replace(':', '-');
  const sess    = window.DB ? window.DB.getSession() : null;
  const userTag = sess ? '-' + sess.email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') : '';
  const nombre  = `backup-${APP_NAME}${userTag}-${fecha}-${hora}.json`;
  // El backup contiene solo S — los datos de negocio, sin tokens ni claves de sesión
  const blob = new Blob([JSON.stringify({ version: 2, exported: now.toISOString(), data: S }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(a.href);
  showToast(`Backup guardado: ${nombre}`, 'ok');
}

/**
 * IMPORTAR — lee el .json, limpia el localStorage y restaura cada clave,
 * luego recarga la página para que la app arranque con los datos nuevos.
 * @param {Event} event - Evento change del <input type="file">
 */
function importarDatos(event) {
  const input = event.target;
  const file  = input.files[0];

  // Error: no se seleccionó archivo
  if (!file) {
    showToast('No se seleccionó ningún archivo.', 'error');
    return;
  }

  // Error: no es .json
  if (!file.name.toLowerCase().endsWith('.json')) {
    showToast('El archivo debe tener extensión .json', 'error');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onerror = () => {
    showToast('No se pudo leer el archivo. Inténtalo de nuevo.', 'error');
    input.value = '';
  };
  reader.onload = async (e) => {
    let parsed;
    try { parsed = JSON.parse(e.target.result); }
    catch (err) { showToast('Archivo JSON inválido: ' + err.message, 'error'); input.value=''; return; }

    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      showToast('Formato de backup inválido.', 'error'); input.value=''; return;
    }

    // Detectar formato: v2 ({ version:2, data:{...} }) o v1 (snapshot localStorage)
    let newS = null;
    if (parsed.version === 2 && parsed.data) {
      // Formato nuevo — solo contiene los datos de negocio
      newS = parsed.data;
    } else if (parsed.ops_v4 || parsed['ops_v4']) {
      // Formato v1 — snapshot de localStorage, extraer la clave de datos
      const raw = parsed.ops_v4 || parsed['ops_v4'];
      try { newS = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(e) {}
    } else {
      // Intentar usar el objeto directamente si tiene la estructura de S
      if (parsed.businesses !== undefined && parsed.ops !== undefined) newS = parsed;
    }

    if (!newS || (!newS.businesses && !newS.ops)) {
      showToast('No se encontraron datos válidos en el backup.', 'error');
      input.value=''; return;
    }

    const nBiz = newS.businesses?.length ?? 0;
    const nOps = newS.ops?.length ?? 0;
    const nCli = newS.clients?.length ?? 0;
    if (!confirm(`¿Restaurar backup?\n\n• ${file.name}\n• ${nBiz} negocios · ${nOps} operaciones · ${nCli} clientes\n\nEsto reemplazará TODOS los datos actuales.`)) {
      input.value=''; return;
    }

    // Aplicar en memoria
    applyLoaded(newS);
    // Guardar en localStorage
    localStorage.setItem(STORE, JSON.stringify(newS));
    // Subir a Supabase inmediatamente
    showToast('Restaurando y sincronizando…', 'ok');
    if (window.DB) window.DB.scheduleSync();
    // Reconstruir UI
    buildNav(); buildBizViews(); buildMpicker(); renderAll();
    input.value='';
    showToast(`✓ Backup restaurado: ${nBiz} negocios, ${nOps} ops, ${nCli} clientes`, 'ok');
  };

  reader.readAsText(file);
}

// ──── FIN NUEVA FUNCIONALIDAD: EXPORTAR / IMPORTAR ────
function resetData() {
  if(!confirm('⚠️ ¿Reiniciar TODOS los datos? Esta acción no se puede deshacer.')) return;
  if(!confirm('¿Confirmas que deseas borrar todos los negocios y operaciones?')) return;
  S = { businesses:[], ops:[] };
  window.S = S;
  save();
  rebuildAll();
}

// ════════════════════════════════════════════════════
//  THEME
// ════════════════════════════════════════════════════
function toggleTheme() {
  const html = document.documentElement;
  const next = html.getAttribute('data-theme')==='dark' ? 'light' : 'dark';
  html.setAttribute('data-theme', next);
  localStorage.setItem('ops_theme', next);
}
function loadTheme() {
  const t = localStorage.getItem('ops_theme');
  if(t) document.documentElement.setAttribute('data-theme', t);
}

// ════════════════════════════════════════════════════
//  NAV
// ════════════════════════════════════════════════════
function showView(id, el) {
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const v=document.getElementById('view-'+id);
  if(v) v.classList.add('active');
  if(el) el.classList.add('active');
  if(id==='comparativa') renderComparativa();
}
function buildNav() {
  const c=document.getElementById('navBizItems'); c.innerHTML='';
  S.businesses.forEach(biz=>{
    const el=document.createElement('div');
    el.className='nav-item'+(biz.hidden?' biz-hidden':''); el.dataset.view='biz_'+biz.id;
    el.innerHTML=`
      <span class="nav-dot" style="background:${biz.color}"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${biz.name}</span>
      <span class="nav-item-actions">
        <button class="nav-act edit-act" title="Editar" onclick="openEditBiz(event,'${biz.id}')">✎</button>
        <button class="nav-act hide-act" title="${biz.hidden?'Mostrar':'Ocultar'}" onclick="toggleHideBiz(event,'${biz.id}')">${biz.hidden?'👁':'◯'}</button>
      </span>`;
    el.addEventListener('click', function(e){
      if(e.target.closest('.nav-item-actions')) return;
      showView('biz_'+biz.id, this);
    });
    c.appendChild(el);
  });
  buildClientNav();
}
function buildBizViews() {
  const c=document.getElementById('bizViewsContainer'); c.innerHTML='';
  S.businesses.forEach(biz=>{
    // Init selection state for this biz if not present
    if(!bizSelectedMonths.has(biz.id)) bizSelectedMonths.set(biz.id, new Set());
    const div=document.createElement('div');
    div.className='view'; div.id='view-biz_'+biz.id;
    div.innerHTML=`
      <div class="ph">
        <div>
          <h1 style="color:${biz.color}">${biz.name}</h1>
          <p id="bizSubtitle_${biz.id}">${bizTypeLabel(biz.type)} · ${biz.currency}${biz.desc?' · '+biz.desc.slice(0,45):''}…</p>
        </div>
        <div class="ph-right">
          <select class="sel" id="bf_t_${biz.id}" onchange="renderBiz('${biz.id}')">
            <option value="">Todos los tipos</option>
            <option value="envio">Envío</option><option value="cambio">Cambio</option>
            <option value="comision">Comisión</option><option value="deposito">Depósito</option>
            <option value="gasto">Gasto</option><option value="misc">Misc.</option>
            <option value="transferencia">Transferencia</option><option value="cripto">Cripto</option>
          </select>
          <button class="btn" onclick="openOpModal('${biz.id}')">＋ Operación</button>
        </div>
      </div>
      <!-- Period filter bar -->
      <div class="biz-mpicker" id="bmp_${biz.id}" style="gap:6px;flex-wrap:wrap;">
        <!-- Mode pills -->
        <div style="display:flex;gap:3px;flex-shrink:0;" id="bizPeriodPills_${biz.id}">
          <button class="bmpick-btn bpill-active" id="bpp_all_${biz.id}"  onclick="setBizPeriod('${biz.id}','all')">Todo</button>
          <button class="bmpick-btn" id="bpp_day_${biz.id}"   onclick="setBizPeriod('${biz.id}','day')">Día</button>
          <button class="bmpick-btn" id="bpp_week_${biz.id}"  onclick="setBizPeriod('${biz.id}','week')">Semana</button>
          <button class="bmpick-btn" id="bpp_month_${biz.id}" onclick="setBizPeriod('${biz.id}','month')">Mes</button>
        </div>
        <!-- Nav arrows (shown when not 'all') -->
        <div id="bizPeriodNav_${biz.id}" style="display:none;align-items:center;gap:4px;">
          <button class="month-btn" onclick="setBizPeriod('${biz.id}',getBizPeriod('${biz.id}').mode,-1)">‹</button>
          <span id="bizPeriodLabel_${biz.id}" style="font-size:11px;color:var(--gold);font-family:'IBM Plex Mono',monospace;white-space:nowrap;min-width:180px;text-align:center;"></span>
          <button class="month-btn" onclick="setBizPeriod('${biz.id}',getBizPeriod('${biz.id}').mode,1)">›</button>
          <button class="bmpick-btn" onclick="setBizPeriod('${biz.id}',getBizPeriod('${biz.id}').mode)" style="font-size:9px;padding:2px 7px;">Hoy</button>
        </div>
        <!-- Month chips (shown only in 'all' mode) -->
        <div id="bizChipsWrap_${biz.id}" style="display:flex;align-items:center;gap:4px;flex:1;flex-wrap:wrap;">
          <div class="biz-mpicker-chips" id="bmchips_${biz.id}"></div>
          <div class="biz-mpicker-actions">
            <button class="bmpick-btn" onclick="bmPickYear('${biz.id}')">Año actual</button>
            <button class="bmpick-btn" onclick="bmPickNone('${biz.id}')">Todos</button>
          </div>
          <span class="biz-mpicker-label" id="bmLabel_${biz.id}"></span>
        </div>
      </div>
      <div class="stats" id="bs_${biz.id}"></div>
      <div class="card">
        <div class="card-head">
          <span class="card-title" id="biz_ops_title_${biz.id}">Operaciones</span>
        </div>
        <table><thead id="bth_${biz.id}"></thead><tbody id="btb_${biz.id}"></tbody></table>
      </div>
      <div class="card" id="biz_monthly_card_${biz.id}">
        <div id="biz_monthly_${biz.id}"></div>
      </div>`;
    c.appendChild(div);
    buildBizMpicker(biz.id);
  });
}
function populateBizMonth(bizId) {
  buildBizMpicker(bizId);  // now uses chip picker instead of select
}
// ════════════════════════════════════════════════════
//  NAVEGACIÓN POR MES (mismo patrón que finanzas-personales)
// ════════════════════════════════════════════════════
let currentDate = new Date();   // fecha activa para filtrar
let showingAllMonths = true;    // true = sin filtro de mes

const MONTH_NAMES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

// Avanza o retrocede un mes. Llamado por las flechas ‹ ›
function changeMonth(d) {
  showingAllMonths = false;
  currentDate.setMonth(currentDate.getMonth() + d);
  updateMonthLabel();
  applyMonth();
}

// Muestra "todos los meses" (quita el filtro)
function setAllMonths() {
  showingAllMonths = true;
  updateMonthLabel();
  applyMonth();
}

// Actualiza el texto del label en el sidebar
function updateMonthLabel() {
  const lbl = document.getElementById('monthLabel');
  const btn = document.getElementById('monthAllBtn');
  if(!lbl) return;
  if(showingAllMonths) {
    lbl.textContent = 'Todos';
    if(btn) btn.classList.add('dim');
  } else {
    lbl.textContent = MONTH_NAMES[currentDate.getMonth()] + ' ' + currentDate.getFullYear();
    if(btn) btn.classList.remove('dim');
  }
  renderYearSummary();
}

// Renders the year summary panel below the month nav
function renderYearSummary() {
  const panel = document.getElementById('yearSummaryPanel');
  if(!panel) return;
  if(showingAllMonths){ panel.style.display='none'; return; }
  const year = currentDate.getFullYear();
  // check if there's any data for this year
  const yearOps = S.ops.filter(o=>o.date&&o.date.startsWith(String(year))&&!S.businesses.find(b=>b.id===o.bizId&&b.hidden));
  if(yearOps.length===0){ panel.style.display='none'; return; }
  const vol  = yearOps.reduce((s,o)=>s+opCobrado(o),0);
  const gan  = yearOps.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
  const gast = yearOps.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
  const neta = gan-gast;
  panel.style.display='block';
  panel.innerHTML=`
    <div class="year-summary-row">
      <div class="year-summary-label">Año ${year}</div>
      <div class="year-summary-stats">
        <div class="year-summary-stat"><span class="lbl">Volumen</span><span class="val">${fmt(vol)}</span></div>
        <div class="year-summary-stat"><span class="lbl">Ganancias</span><span class="val pos">${fmt(gan)}</span></div>
        <div class="year-summary-stat"><span class="lbl">Gastos</span><span class="val neg">${fmt(gast)}</span></div>
        <div class="year-summary-stat"><span class="lbl">Neta</span><span class="val ${neta>=0?'pos':'neg'}">${fmt(neta)}</span></div>
        <div class="year-summary-stat"><span class="lbl">Ops</span><span class="val">${yearOps.length}</span></div>
      </div>
    </div>`;
}

// Devuelve el string "YYYY-MM" del mes activo, o "" si es todos
function activeMonthKey() {
  if(showingAllMonths) return '';
  const y = currentDate.getFullYear();
  const m = String(currentDate.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

// Propaga el filtro de mes a todas las vistas (General + cada negocio)
function applyMonth() {
  buildMpicker();
  renderResumen();
  renderYearSummary();
  // Note: per-biz views have independent pickers; renderBiz is called from buildBizMpicker
}

// Rellena los <select> de mes (Vista General + Comparativa) —
// los selects quedan como mecanismo de filtro interno pero el
// usuario los controla desde el sidebar con las flechas.
function populateResMonth() {
  const months = [...new Set(S.ops.filter(o=>o.date).map(o=>o.date.slice(0,7)))].sort().reverse();

  const csel = document.getElementById('cmpMonth');
  if(csel) {
    csel.innerHTML = '<option value="">Todos los meses</option>';
    months.forEach(m => {
      const[y,mo] = m.split('-');
      csel.innerHTML += `<option value="${m}">${new Date(+y,+mo-1).toLocaleDateString('es',{month:'long',year:'numeric'})}</option>`;
    });
  }

  buildMpicker();
  applyMonth();
}

// ════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════
function bizTypeLabel(t){return{envio:'Envío de dinero',cambio:'Cambio de divisas',comision:'Comisiones',comercio:'Comercio',misc:'Misceláneo',transferencia:'Transferencias',cripto:'Cripto / Digital',renta:'Renta de propiedades',marketing:'Marketing digital',webdev:'Desarrollo web'}[t]||t;}
function fmt(n){return(+n||0).toLocaleString('es-MX',{minimumFractionDigits:2,maximumFractionDigits:2});}
function typeBadge(tipo){const t=OP_TYPES.find(x=>x.id===tipo);return t?`<span class="badge ${t.badge}">${t.label}</span>`:tipo;}
function opGanancia(op){
  if(op.tipo==='envio')          return op.ganancia||0;
  if(op.tipo==='cambio')         return op.utilidad||0;
  if(op.tipo==='comision')       return op.monto||0;
  if(op.tipo==='deposito')       return op.monto||op.depMto||0;
  if(op.tipo==='gasto')          return -(op.gastoMto||0);
  if(op.tipo==='misc')           return op.jt||op.comision||0;
  if(op.tipo==='transferencia')  return op.ganancia||0;
  if(op.tipo==='cripto')          return op.crpGanancia||0;
  return 0;
}
function opCobrado(op){
  // Gastos NO suman al volumen — son salidas de dinero
  if(op.tipo==='gasto')          return 0;
  if(op.tipo==='comision')       return op.monto||0;
  if(op.tipo==='deposito')       return op.monto||op.depMto||0;
  return op.cobrado||0;
}

// ════════════════════════════════════════════════════
//  DONUT CHART
// ════════════════════════════════════════════════════
function drawDonut(canvasId, segments, centerVal, centerLabel) {
  const wrap = document.getElementById(canvasId);
  if(!wrap) return;
  // Use container size — CSS controls width/height via .donut-wrap
  const size=120, r=46, cx=60, cy=60, strokeW=14;
  const total=segments.reduce((s,g)=>s+g.val,0);
  // SVG uses viewBox only — width/height 100% to fill .donut-wrap
  const svgAttrs = `viewBox="0 0 ${size} ${size}" style="width:100%;height:100%;transform:rotate(-90deg)"`;
  if(total===0){
    wrap.innerHTML=`<svg ${svgAttrs}><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${strokeW}"/></svg>`;
    return;
  }
  let parts=''; let offset=0;
  const circ=2*Math.PI*r;
  segments.forEach(seg=>{
    const pct=seg.val/total;
    const dash=pct*circ;
    parts+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${strokeW}" stroke-dasharray="${dash} ${circ}" stroke-dashoffset="${-offset}" stroke-linecap="butt"/>`;
    offset+=dash;
  });
  wrap.innerHTML=`<svg ${svgAttrs}>${parts}</svg>`;
}


// ════════════════════════════════════════════════════
//  MONTH MULTI-PICKER (Vista General)
// ════════════════════════════════════════════════════
let selectedMonths = new Set(); // empty = all months
const bizSelectedMonths = new Map(); // bizId → Set<"YYYY-MM">, empty = all

// Track which years are expanded in each picker
const mpickExpanded = new Set(); // for Vista General
function buildMpicker() {
  const allMonths = [...new Set(S.ops.filter(o=>o.date).map(o=>o.date.slice(0,7)))].sort();
  const chips = document.getElementById('mpickerChips');
  if(!chips) return;
  chips.innerHTML = '';
  if(allMonths.length === 0) { updateMpickLabel(); return; }
  const years = [...new Set(allMonths.map(m=>m.slice(0,4)))];
  const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  // Auto-expand latest year if nothing expanded yet
  if(mpickExpanded.size === 0 && years.length) mpickExpanded.add(years[years.length-1]);

  years.forEach((y, yi) => {
    const yMonths = allMonths.filter(m=>m.startsWith(y));
    const yAll  = yMonths.length > 0 && yMonths.every(m=>selectedMonths.has(m));
    const ySome = yMonths.some(m=>selectedMonths.has(m));
    const isOpen = mpickExpanded.has(y);

    // Year pill button
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-right:6px;';

    const yBtn = document.createElement('button');
    yBtn.className = 'mchip-year' + (isOpen?' open':'') + (yAll?' active':ySome?' partial':'');
    yBtn.innerHTML = y + ' <span class="yr-arrow">›</span>';
    yBtn.title = 'Click para expandir · Seleccionar todo ' + y;
    yBtn.onclick = (e) => {
      e.stopPropagation();
      if(mpickExpanded.has(y)) mpickExpanded.delete(y);
      else mpickExpanded.add(y);
      buildMpicker();
    };
    // Long-press / dblclick = select all year
    yBtn.ondblclick = (e) => {
      e.stopPropagation();
      if(yAll) yMonths.forEach(m=>selectedMonths.delete(m));
      else yMonths.forEach(m=>selectedMonths.add(m));
      buildMpicker(); renderResumen();
    };
    wrap.appendChild(yBtn);

    // Month chips group (collapsible)
    const grp = document.createElement('span');
    grp.className = 'mchip-months-group' + (isOpen?' open':'');
    yMonths.forEach(m => {
      const [, mo] = m.split('-');
      const chip = document.createElement('button');
      chip.className = 'mchip' + (selectedMonths.has(m) ? ' active' : '');
      chip.textContent = MN[+mo-1];
      chip.dataset.month = m;
      chip.onclick = () => {
        if(selectedMonths.has(m)) selectedMonths.delete(m);
        else selectedMonths.add(m);
        buildMpicker(); renderResumen();
      };
      grp.appendChild(chip);
    });
    wrap.appendChild(grp);
    chips.appendChild(wrap);
  });
  updateMpickLabel();
}

function toggleMpick(m) {
  if(selectedMonths.has(m)) selectedMonths.delete(m);
  else selectedMonths.add(m);
  buildMpicker(); renderResumen();
}

function mpickAll() {
  const allMonths = [...new Set(S.ops.filter(o=>o.date).map(o=>o.date.slice(0,7)))];
  const curYear = String(new Date().getFullYear());
  const yearMonths = allMonths.filter(m=>m.startsWith(curYear));
  const toSelect = yearMonths.length > 0 ? yearMonths : allMonths;
  toSelect.forEach(m=>selectedMonths.add(m));
  buildMpicker();
  renderResumen();
}

function mpickNone() {
  selectedMonths.clear();
  buildMpicker();
  renderResumen();
}

function updateMpickLabel() {
  const lbl = document.getElementById('mpickLabel');
  if(!lbl) return;
  const MNAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  if(selectedMonths.size === 0) {
    lbl.textContent = 'Todos los meses'; lbl.style.color = 'var(--text3)';
  } else if(selectedMonths.size === 1) {
    const m = [...selectedMonths][0];
    const [y, mo] = m.split('-');
    lbl.textContent = MNAMES[+mo-1] + ' ' + y; lbl.style.color = 'var(--gold)';
  } else {
    const years = [...new Set([...selectedMonths].map(m=>m.slice(0,4)))];
    lbl.textContent = years.length === 1
      ? selectedMonths.size + ' meses · ' + years[0]
      : selectedMonths.size + ' meses seleccionados';
    lbl.style.color = 'var(--gold)';
  }
}

function filterOpsBySelectedMonths(ops) {
  if(selectedMonths.size === 0) return ops;
  return ops.filter(o => o.date && selectedMonths.has(o.date.slice(0,7)));
}

// ════════════════════════════════════════════════════
//  RENDER RESUMEN
// ════════════════════════════════════════════════════
function renderResumen() {
  const tipoF=document.getElementById('resTipoFilter').value;
  const visBizList=S.businesses.filter(b=>!b.hidden);
  const visibleBizIds=new Set(visBizList.map(b=>b.id));
  let ops=filterOpsBySelectedMonths(S.ops.filter(o=>visibleBizIds.has(o.bizId)));

  // Update subtitle
  const sub = document.getElementById('resSubtitle');
  if(sub) {
    const MNAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if(selectedMonths.size === 0) sub.textContent = 'Todos los meses · todos los negocios';
    else if(selectedMonths.size === 1) {
      const [y,mo]=[...selectedMonths][0].split('-');
      sub.textContent = MNAMES[+mo-1]+' '+y+' · todos los negocios';
    } else {
      const years=[...new Set([...selectedMonths].map(m=>m.slice(0,4)))];
      sub.textContent = years.length===1 ? selectedMonths.size+' meses de '+years[0] : selectedMonths.size+' meses seleccionados';
    }
  }

  const vol   = ops.reduce((s,o)=>s+opCobrado(o),0);
  const gan   = ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
  const gast  = ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
  const neta  = gan-gast;
  const comTot= ops.reduce((s,o)=>s+(o.comision||0),0);

  const statDefs={
    vol:  `<div class="stat b draggable" draggable="true" data-key="vol"><span class="drag-handle">⠿</span><div class="stat-lbl">Volumen</div><div class="stat-val" style="color:var(--blue)">${fmt(vol)}</div><div class="stat-sub">Total cobrado/operado</div></div>`,
    com:  `<div class="stat o draggable" draggable="true" data-key="com"><span class="drag-handle">⠿</span><div class="stat-lbl">Comisiones</div><div class="stat-val" style="color:var(--gold)">${fmt(comTot)}</div></div>`,
    gan:  `<div class="stat g draggable" draggable="true" data-key="gan"><span class="drag-handle">⠿</span><div class="stat-lbl">Ganancias</div><div class="stat-val" style="color:var(--green)">${fmt(gan)}</div></div>`,
    gast: `<div class="stat r draggable" draggable="true" data-key="gast"><span class="drag-handle">⠿</span><div class="stat-lbl">Gastos</div><div class="stat-val" style="color:var(--red)">${fmt(gast)}</div></div>`,
    neta: `<div class="stat p draggable" draggable="true" data-key="neta"><span class="drag-handle">⠿</span><div class="stat-lbl">Neta</div><div class="stat-val" style="color:${neta>=0?'var(--green)':'var(--red)'}">${fmt(neta)}</div></div>`,
  };
  const order=S.statOrder||['vol','com','gan','gast','neta'];
  document.getElementById('resStats').innerHTML=order.map(k=>statDefs[k]||'').join('');
  initDragContainer('resStats','statOrder');

  // DONUT CHARTS
  const chartsEl=document.getElementById('resCharts');
  if(S.businesses.length>0){
    // Donut 1: ganancia por negocio
    const bizSegs=visBizList.map(b=>({
      name:b.name, color:b.color,
      val:Math.max(0,filterOpsBySelectedMonths(S.ops.filter(o=>o.bizId===b.id)).reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0))
    })).filter(s=>s.val>0);
    // Donut 2: tipo de operación
    const tipoSegs=[
      {name:'Envío',   color:'var(--blue)',   val:ops.filter(o=>o.tipo==='envio').reduce((s,o)=>s+(o.comision||o.ganancia||0),0)},
      {name:'Cambio',  color:'var(--purple)', val:ops.filter(o=>o.tipo==='cambio').reduce((s,o)=>s+(o.utilidad||0),0)},
      {name:'Comisión',color:'var(--gold)',   val:ops.filter(o=>o.tipo==='comision').reduce((s,o)=>s+(o.monto||0),0)},
      {name:'Misc',    color:'var(--orange)', val:ops.filter(o=>o.tipo==='misc').reduce((s,o)=>s+(o.jt||0),0)},
    ].filter(s=>s.val>0);
    // Donut 3: ganancia vs gasto
    const balSegs=[{name:'Ganancia',color:'var(--green)',val:gan},{name:'Gastos',color:'var(--red)',val:gast}].filter(s=>s.val>0);

    chartsEl.innerHTML=`
      <div class="donut-card">
        <div class="donut-title">Ganancia por Negocio</div>
        <div class="donut-wrap" id="dn1"></div>
        <div class="donut-legend">${bizSegs.slice(0,5).map(s=>`<div class="dl-item"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-name">${s.name}</span><span class="dl-val">${fmt(s.val)}</span></div>`).join('')}</div>
      </div>
      <div class="donut-card">
        <div class="donut-title">Por Tipo de Operación</div>
        <div class="donut-wrap" id="dn2"></div>
        <div class="donut-legend">${tipoSegs.map(s=>`<div class="dl-item"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-name">${s.name}</span><span class="dl-val">${fmt(s.val)}</span></div>`).join('')}</div>
      </div>
      <div class="donut-card">
        <div class="donut-title">Balance General</div>
        <div class="donut-wrap" id="dn3"></div>
        <div class="donut-legend">
          <div class="dl-item"><span class="dl-dot" style="background:var(--green)"></span><span class="dl-name">Ganancias</span><span class="dl-val">${fmt(gan)}</span></div>
          <div class="dl-item"><span class="dl-dot" style="background:var(--red)"></span><span class="dl-name">Gastos</span><span class="dl-val">${fmt(gast)}</span></div>
          <div class="dl-item" style="padding-top:4px;border-top:1px solid var(--border);margin-top:3px"><span class="dl-name" style="font-weight:600">Neta</span><span class="dl-val" style="color:${neta>=0?'var(--green)':'var(--red)'};">${fmt(neta)}</span></div>
        </div>
      </div>`;
    setTimeout(()=>{ drawDonut('dn1',bizSegs); drawDonut('dn2',tipoSegs); drawDonut('dn3',balSegs); },10);
  } else { chartsEl.innerHTML=''; }

  // Biz overview cards
  const maxG=Math.max(...visBizList.map(b=>Math.max(0,ops.filter(o=>o.bizId===b.id).reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0))),1);
  // Apply saved order to biz cards
  const savedBizOrder=S.bizCardOrder||[];
  const sortedBizList=[...visBizList].sort((a2,b2)=>{
    const ai=savedBizOrder.indexOf(a2.id), bi=savedBizOrder.indexOf(b2.id);
    if(ai===-1&&bi===-1) return 0;
    if(ai===-1) return 1; if(bi===-1) return -1;
    return ai-bi;
  });
  const bizCardMap={};
  sortedBizList.forEach(b=>{
    const bo=ops.filter(o=>o.bizId===b.id);
    const bv=bo.reduce((s,o)=>s+opCobrado(o),0);
    const bg=bo.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
    const be=bo.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
    bizCardMap[b.id]=`<div class="biz-card draggable" draggable="true" data-key="${b.id}" style="border-top-color:${b.color}" onclick="if(!window._dragMoved)navToBiz('${b.id}')">
      <span class="drag-handle">⠿</span>
      <div class="bc-name" style="color:${b.color}">${b.name}</div>
      <div class="bc-type">${bizTypeLabel(b.type)}</div>
      <div class="bc-row"><span class="bc-key">Volumen</span><span class="bc-val c-blue">${fmt(bv)}</span></div>
      <div class="bc-row"><span class="bc-key">Ganancia</span><span class="bc-val c-green">${fmt(bg)}</span></div>
      <div class="bc-row"><span class="bc-key">Gastos</span><span class="bc-val c-red">${fmt(be)}</span></div>
      <div class="bc-row"><span class="bc-key">Neta</span><span class="bc-val" style="color:${bg-be>=0?'var(--green)':'var(--red)'}">${fmt(bg-be)}</span></div>
    </div>`;
  });
  document.getElementById('resBizCards').innerHTML=sortedBizList.map(b=>bizCardMap[b.id]).join('');
  initDragContainer('resBizCards','bizCardOrder');

  // Bar chart
  const barCard=document.getElementById('resBarCard');
  if(visBizList.length>0){
    const bars=visBizList.map(b=>{
      const bo=ops.filter(o=>o.bizId===b.id);
      const bg=bo.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
      const be=bo.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
      const pct=Math.round((bg/maxG)*100);
      return`<div class="bc-bar-row"><div class="bc-bar-label">${b.name}</div>
        <div class="bc-bar-track"><div class="bc-bar-fill" style="width:${pct}%;background:${b.color}"><span>${fmt(bg)}</span></div></div>
        <div style="font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--red);width:72px;text-align:right;flex-shrink:0">-${fmt(be)}</div></div>`;
    }).join('');
    barCard.innerHTML=`<div class="card-head"><span class="card-title">Ganancia por Negocio</span></div><div style="padding:14px 16px">${bars}</div>`;
  } else { barCard.innerHTML=''; }
  // Donuts also use visBizList — already filtered via ops above

  // Year summary card (always shows current year totals regardless of month filter)
  renderYearCard(visBizList);

  // All ops
  let filtOps=[...ops];
  if(tipoF) filtOps=filtOps.filter(o=>o.tipo===tipoF);
  filtOps.sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  const tbody=document.getElementById('resAllOps');
  if(filtOps.length===0){tbody.innerHTML='<tr class="empty"><td colspan="7">Sin operaciones registradas</td></tr>';return;}
  tbody.innerHTML=filtOps.map(op=>{
    const biz=S.businesses.find(b=>b.id===op.bizId);
    const g=opGanancia(op);
    return`<tr>
      <td class="mono c-dim">${op.date||''}</td>
      <td><span style="display:inline-flex;align-items:center;gap:5px;font-size:11px">
        <span style="width:6px;height:6px;border-radius:50%;background:${biz?.color||'#888'};display:inline-block"></span>${biz?.name||'—'}
      </span></td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${op.desc||''}</td>
      <td>${typeBadge(op.tipo)}</td>
      <td class="mono c-blue">${fmt(opCobrado(op))}</td>
      <td class="mono c-gold">${op.comision?fmt(op.comision):'—'}</td>
      <td class="mono ${g>=0?'c-green':'c-red'}">${g>=0?'+':''}${fmt(g)}</td>
    </tr>`;
  }).join('');
}

// ════════════════════════════════════════════════════
//  YEAR SUMMARY CARD
// ════════════════════════════════════════════════════
function renderYearCard(visBizList) {
  const card = document.getElementById('resYearCard');
  if(!card) return;
  const year = new Date().getFullYear();
  const prefix = String(year) + '-';

  // All ops for this year, visible businesses only
  const vizIds = new Set((visBizList||S.businesses.filter(b=>!b.hidden)).map(b=>b.id));
  const yOps = S.ops.filter(o=>o.date&&o.date.startsWith(prefix)&&vizIds.has(o.bizId));

  if(yOps.length===0){ card.innerHTML=''; return; }

  // Totals
  const yVol  = yOps.reduce((s,o)=>s+opCobrado(o),0);
  const yGan  = yOps.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
  const yGast = yOps.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
  const yNeta = yGan-yGast;
  const yCom  = yOps.reduce((s,o)=>s+(o.comision||0),0);

  // Per-business breakdown
  const bizRows = (visBizList||S.businesses.filter(b=>!b.hidden)).map(b=>{
    const bo = yOps.filter(o=>o.bizId===b.id);
    if(bo.length===0) return '';
    const bv = bo.reduce((s,o)=>s+opCobrado(o),0);
    const bg = bo.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
    const be = bo.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
    const bn = bg-be;
    return `<div class="year-biz-item" style="border-left-color:${b.color}">
      <div class="year-biz-name" style="color:${b.color}">${b.name}</div>
      <div class="year-biz-row"><span class="year-biz-lbl">Volumen</span><span class="year-biz-val" style="color:var(--blue)">${fmt(bv)}</span></div>
      <div class="year-biz-row"><span class="year-biz-lbl">Ganancia</span><span class="year-biz-val" style="color:var(--green)">${fmt(bg)}</span></div>
      <div class="year-biz-row"><span class="year-biz-lbl">Gastos</span><span class="year-biz-val" style="color:var(--red)">${fmt(be)}</span></div>
      <div class="year-biz-row"><span class="year-biz-lbl">Neta</span><span class="year-biz-val" style="color:${bn>=0?'var(--green)':'var(--red)'};font-weight:600">${fmt(bn)}</span></div>
      <div class="year-biz-row"><span class="year-biz-lbl">Ops</span><span class="year-biz-val">${bo.length}</span></div>
    </div>`;
  }).join('');

  card.innerHTML=`<div class="year-card">
    <div class="year-card-header">
      <span class="year-card-title">Resumen Año ${year}</span>
      <span class="year-card-sub">${yOps.length} operaciones · todos los negocios</span>
    </div>
    <div class="year-totals">
      <div class="year-total-item"><div class="year-total-lbl">Volumen</div><div class="year-total-val" style="color:var(--blue)">${fmt(yVol)}</div></div>
      <div class="year-total-item"><div class="year-total-lbl">Comisiones</div><div class="year-total-val" style="color:var(--gold)">${fmt(yCom)}</div></div>
      <div class="year-total-item"><div class="year-total-lbl">Ganancias</div><div class="year-total-val" style="color:var(--green)">${fmt(yGan)}</div></div>
      <div class="year-total-item"><div class="year-total-lbl">Gastos</div><div class="year-total-val" style="color:var(--red)">${fmt(yGast)}</div></div>
      <div class="year-total-item"><div class="year-total-lbl">Neta</div><div class="year-total-val" style="color:${yNeta>=0?'var(--green)':'var(--red)'}"><strong>${fmt(yNeta)}</strong></div></div>
    </div>
    <div class="year-biz-grid">${bizRows}</div>
  </div>`;
}


// ════════════════════════════════════════════════════
//  BIZ MONTH PICKER  (per-negocio, independent state)
// ════════════════════════════════════════════════════
function getBizMonths(bizId) {
  return [...new Set(S.ops.filter(o=>o.bizId===bizId&&o.date).map(o=>o.date.slice(0,7)))].sort();
}

// Per-biz expanded years state
const bizMpickExpanded = new Map(); // bizId → Set<year>
const bizPeriodFilter  = new Map(); // bizId → { mode: 'all'|'day'|'week'|'month', date: Date }
function buildBizMpicker(bizId) {
  const chips = document.getElementById('bmchips_'+bizId);
  if(!chips) return;
  chips.innerHTML = '';
  const allMonths = getBizMonths(bizId);
  if(allMonths.length === 0) { updateBmLabel(bizId); return; }
  if(!bizSelectedMonths.has(bizId)) bizSelectedMonths.set(bizId, new Set());
  if(!bizMpickExpanded.has(bizId)) bizMpickExpanded.set(bizId, new Set());
  const sel = bizSelectedMonths.get(bizId);
  const expanded = bizMpickExpanded.get(bizId);
  const years = [...new Set(allMonths.map(m=>m.slice(0,4)))];
  const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  // Auto-expand latest year
  if(expanded.size === 0 && years.length) expanded.add(years[years.length-1]);

  years.forEach((y) => {
    const yMonths = allMonths.filter(m=>m.startsWith(y));
    const yAll  = yMonths.length > 0 && yMonths.every(m=>sel.has(m));
    const ySome = yMonths.some(m=>sel.has(m));
    const isOpen = expanded.has(y);

    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-right:5px;';

    // Year pill
    const yBtn = document.createElement('button');
    yBtn.className = 'mchip-year' + (isOpen?' open':'') + (yAll?' active':ySome?' partial':'');
    yBtn.innerHTML = y + ' <span class="yr-arrow">›</span>';
    yBtn.onclick = () => {
      if(expanded.has(y)) expanded.delete(y); else expanded.add(y);
      buildBizMpicker(bizId);
    };
    yBtn.ondblclick = (e) => {
      e.stopPropagation();
      const s2 = bizSelectedMonths.get(bizId);
      if(yAll) yMonths.forEach(m=>s2.delete(m));
      else yMonths.forEach(m=>s2.add(m));
      buildBizMpicker(bizId); renderBiz(bizId);
    };
    wrap.appendChild(yBtn);

    // Month chips (collapsible)
    const grp = document.createElement('span');
    grp.className = 'mchip-months-group' + (isOpen?' open':'');
    yMonths.forEach(m => {
      const [, mo] = m.split('-');
      const chip = document.createElement('button');
      chip.className = 'bmchip' + (sel.has(m) ? ' active' : '');
      chip.textContent = MN[+mo-1];
      chip.title = m;
      chip.onclick = () => {
        const s2 = bizSelectedMonths.get(bizId);
        if(s2.has(m)) s2.delete(m); else s2.add(m);
        buildBizMpicker(bizId); renderBiz(bizId);
      };
      grp.appendChild(chip);
    });
    wrap.appendChild(grp);
    chips.appendChild(wrap);
  });
  updateBmLabel(bizId);
}

function updateBmLabel(bizId) {
  const lbl = document.getElementById('bmLabel_'+bizId);
  const sub = document.getElementById('bizSubtitle_'+bizId);
  const biz = S.businesses.find(b=>b.id===bizId);
  if(!bizSelectedMonths.has(bizId)) bizSelectedMonths.set(bizId, new Set());
  const sel = bizSelectedMonths.get(bizId);
  const MNAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  let labelText = '';
  if(sel.size === 0) {
    labelText = 'Todos los meses';
    if(lbl) { lbl.textContent=''; }
  } else if(sel.size === 1) {
    const [y,mo] = [...sel][0].split('-');
    labelText = MNAMES[+mo-1]+' '+y;
    if(lbl) { lbl.textContent = labelText; }
  } else {
    const years = [...new Set([...sel].map(m=>m.slice(0,4)))];
    labelText = years.length===1 ? sel.size+' meses · '+years[0] : sel.size+' meses';
    if(lbl) { lbl.textContent = labelText; }
  }
  if(sub&&biz) {
    const base = bizTypeLabel(biz.type)+' · '+biz.currency+(biz.desc?' · '+biz.desc.slice(0,30)+'…':'');
    sub.textContent = sel.size>0 ? base+' · '+labelText : base;
  }
}


// ════════════════════════════════════════════════════
//  BIZ PERIOD FILTER (día / semana L-D / mes / todo)
// ════════════════════════════════════════════════════
function getBizPeriod(bizId) {
  if (!bizPeriodFilter.has(bizId)) bizPeriodFilter.set(bizId, { mode: 'all', date: new Date() });
  return bizPeriodFilter.get(bizId);
}

function setBizPeriod(bizId, mode, offsetDelta) {
  const pf = getBizPeriod(bizId);
  pf.mode = mode;
  if (offsetDelta !== undefined) {
    const d = new Date(pf.date);
    if (mode === 'day')   d.setDate(d.getDate() + offsetDelta);
    if (mode === 'week')  d.setDate(d.getDate() + offsetDelta * 7);
    if (mode === 'month') d.setMonth(d.getMonth() + offsetDelta);
    pf.date = d;
  } else {
    pf.date = new Date(); // reset to today
  }
  bizPeriodFilter.set(bizId, pf);
  renderBiz(bizId);
}

// Returns [fromDateStr, toDateStr] for the current period
function getBizPeriodRange(bizId) {
  const pf = getBizPeriod(bizId);
  const d  = new Date(pf.date);
  if (pf.mode === 'day') {
    const s = d.toISOString().slice(0, 10);
    return [s, s];
  }
  if (pf.mode === 'week') {
    // Monday of the week
    const dow = d.getDay(); // 0=Sun
    const monday = new Date(d);
    monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return [monday.toISOString().slice(0, 10), sunday.toISOString().slice(0, 10)];
  }
  if (pf.mode === 'month') {
    const y = d.getFullYear(), m = d.getMonth();
    const from = new Date(y, m, 1).toISOString().slice(0, 10);
    const to   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    return [from, to];
  }
  return [null, null]; // all
}

function getBizPeriodLabel(bizId) {
  const pf = getBizPeriod(bizId);
  const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const d  = new Date(pf.date);
  if (pf.mode === 'day') {
    const today = new Date().toISOString().slice(0,10);
    const ds    = d.toISOString().slice(0,10);
    if (ds === today) return 'Hoy · ' + d.toLocaleDateString('es',{weekday:'long'});
    return d.toLocaleDateString('es',{weekday:'short',day:'numeric',month:'short',year:'numeric'});
  }
  if (pf.mode === 'week') {
    const [from, to] = getBizPeriodRange(bizId);
    const [fy,fm,fd] = from.split('-');
    const [ty,tm,td] = to.split('-');
    return `Semana · ${+fd} ${MN[+fm-1]} – ${+td} ${MN[+tm-1]} ${ty}`;
  }
  if (pf.mode === 'month') {
    return MN[d.getMonth()] + ' ' + d.getFullYear();
  }
  return 'Todos los períodos';
}

function applyBizPeriodToOps(bizId, ops) {
  const [from, to] = getBizPeriodRange(bizId);
  if (!from) return ops;
  return ops.filter(o => o.date && o.date >= from && o.date <= to);
}

function filterBizOps(bizId, ops) {
  // Apply month-chip filter
  let filtered = ops;
  if(bizSelectedMonths.has(bizId)) {
    const sel = bizSelectedMonths.get(bizId);
    if(sel.size > 0) filtered = filtered.filter(o => o.date && sel.has(o.date.slice(0,7)));
  }
  // Apply day/week/month period filter (overrides month chips when active)
  const pf = getBizPeriod(bizId);
  if (pf.mode !== 'all') filtered = applyBizPeriodToOps(bizId, ops); // period filter replaces chip filter
  return filtered;
}

function bmPickYear(bizId) {
  if(!bizSelectedMonths.has(bizId)) bizSelectedMonths.set(bizId, new Set());
  const sel = bizSelectedMonths.get(bizId);
  const allMonths = getBizMonths(bizId);
  const curYear = String(new Date().getFullYear());
  const yearMonths = allMonths.filter(m=>m.startsWith(curYear));
  const toSelect = yearMonths.length > 0 ? yearMonths : allMonths;
  toSelect.forEach(m=>sel.add(m));
  buildBizMpicker(bizId); renderBiz(bizId);
}

function bmPickNone(bizId) {
  if(!bizSelectedMonths.has(bizId)) bizSelectedMonths.set(bizId, new Set());
  bizSelectedMonths.get(bizId).clear();
  buildBizMpicker(bizId); renderBiz(bizId);
}

// ════════════════════════════════════════════════════
//  RENDER BIZ
// ════════════════════════════════════════════════════
function _updateBizPeriodUI(bizId) {
  const pf   = getBizPeriod(bizId);
  const modes = ['all','day','week','month'];
  modes.forEach(m => {
    const btn = document.getElementById('bpp_'+m+'_'+bizId);
    if (btn) {
      btn.style.background = pf.mode===m ? 'var(--gold)' : '';
      btn.style.color      = pf.mode===m ? '#0c0e11'    : '';
      btn.style.fontWeight = pf.mode===m ? '700'         : '';
    }
  });
  const nav   = document.getElementById('bizPeriodNav_'+bizId);
  const chips = document.getElementById('bizChipsWrap_'+bizId);
  const lbl   = document.getElementById('bizPeriodLabel_'+bizId);
  if (nav)   nav.style.display   = pf.mode !== 'all' ? 'flex' : 'none';
  if (chips) chips.style.display = pf.mode === 'all' ? 'flex' : 'none';
  if (lbl)   lbl.textContent     = getBizPeriodLabel(bizId);
}

function renderBiz(bizId) {
  const biz=S.businesses.find(b=>b.id===bizId); if(!biz) return;
  _updateBizPeriodUI(bizId);
  const tipoF=document.getElementById('bf_t_'+bizId)?.value||'';
  let ops=filterBizOps(bizId, S.ops.filter(o=>o.bizId===bizId));
  if(tipoF) ops=ops.filter(o=>o.tipo===tipoF);

  const vol =ops.reduce((s,o)=>s+opCobrado(o),0);
  const gan =ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
  const gast=ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
  const com =ops.reduce((s,o)=>s+(o.comision||0),0);

  const statsEl=document.getElementById('bs_'+bizId);
  // update ops card title with count
  const opsTitleEl=document.getElementById('biz_ops_title_'+bizId);
  if(opsTitleEl){
    const sel2=bizSelectedMonths.get(bizId);
    const MNAMES2=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    if(!sel2||sel2.size===0) opsTitleEl.textContent=`Operaciones (${ops.length})`;
    else if(sel2.size===1){ const[y,mo]=[...sel2][0].split('-'); opsTitleEl.textContent=`Operaciones · ${MNAMES2[+mo-1]} ${y} (${ops.length})`; }
    else { const yrs=[...new Set([...sel2].map(m=>m.slice(0,4)))]; opsTitleEl.textContent=`Operaciones · ${sel2.size} meses${yrs.length===1?' de '+yrs[0]:''} (${ops.length})`; }
  }
  if(statsEl) statsEl.innerHTML=`
    <div class="stat b"><div class="stat-lbl">Volumen</div><div class="stat-val" style="color:var(--blue)">${fmt(vol)}</div></div>
    <div class="stat o"><div class="stat-lbl">Comisiones</div><div class="stat-val" style="color:var(--gold)">${fmt(com)}</div></div>
    <div class="stat g"><div class="stat-lbl">Ganancia</div><div class="stat-val" style="color:var(--green)">${fmt(gan)}</div></div>
    <div class="stat r"><div class="stat-lbl">Gastos</div><div class="stat-val" style="color:var(--red)">${fmt(gast)}</div></div>
    <div class="stat p"><div class="stat-lbl">Neta</div><div class="stat-val" style="color:${gan-gast>=0?'var(--green)':'var(--red)'}">${fmt(gan-gast)}</div></div>`;

  const th=document.getElementById('bth_'+bizId);
  const tb=document.getElementById('btb_'+bizId);
  if(!th||!tb) return;
  const sorted=[...ops].sort((a,b)=>(b.date||'').localeCompare(a.date||''));
  if(sorted.length===0){th.innerHTML='';tb.innerHTML='<tr class="empty"><td colspan="10">Sin operaciones. Registra la primera.</td></tr>';return;}

  if(biz.type==='envio'){
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Ref</th><th>Tipo</th><th>Cobrado</th><th>Com%</th><th>Comisión $</th><th>Retorno</th><th>Enviado</th><th>Falta/Sobra</th><th>Ganancia</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>{
      if(op.tipo==='gasto') return`<tr><td class="mono c-dim">${op.date}</td><td colspan="9">${op.desc||''} — <span class="c-dim">${op.gastoCat||''}</span></td><td class="mono c-red">-${fmt(op.gastoMto)}</td><td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td></tr>`;
      const fs=op.faltaSobra||0;
      return`<tr>
        <td class="mono c-dim">${op.date||''}</td>
        <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${op.desc||''}</td>
        <td class="c-dim" style="font-size:10px">${op.ref||''}</td>
        <td>${typeBadge(op.tipo)}</td>
        <td class="mono c-blue">${fmt(op.cobrado)}<span class="c-dim"> ${op.moneda||''}</span></td>
        <td class="mono c-dim">${op.comPct||0}%</td>
        <td class="mono c-gold">${fmt(op.comision)}</td>
        <td class="mono">${fmt(op.retorno)}</td>
        <td class="mono">${fmt(op.enviado)}</td>
        <td class="mono ${fs>=0?'c-green':'c-red'}">${fs>=0?'+':''}${fmt(fs)}</td>
        <td class="mono c-green">+${fmt(op.ganancia)}</td>
        <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
      </tr>`;
    }).join('');
  } else if(biz.type==='cambio'){
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Cobrado</th><th>Depositado</th><th>Costo%</th><th>Com.Total%</th><th>Comisión $</th><th>Utilidad</th><th>Banco</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>{
      const cst=op.cobrado&&op.depositado?((1-op.depositado/op.cobrado)*100).toFixed(2)+'%':'—';
      return`<tr>
        <td class="mono c-dim">${op.date||''}</td><td>${op.desc||''}</td>
        <td>${typeBadge(op.tipo)}</td>
        <td class="mono c-blue">${fmt(op.cobrado)}</td><td class="mono">${fmt(op.depositado)}</td>
        <td class="mono c-red">${cst}</td><td class="mono c-dim">${op.camCT||0}%</td>
        <td class="mono c-gold">${fmt(op.comision)}</td><td class="mono c-green">+${fmt(op.utilidad)}</td>
        <td class="c-dim" style="font-size:10px">${op.banco||''}</td>
        <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
      </tr>`;
    }).join('');
  } else if(biz.type==='comision'){
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Período</th><th>Monto</th><th>Moneda</th><th>F. Pago</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>`<tr>
      <td class="mono c-dim">${op.date||''}</td><td>${op.desc||''}</td>
      <td class="c-dim" style="font-size:10px">${op.periodo||''}</td>
      <td class="mono c-green">+${fmt(op.monto)}</td>
      <td class="c-dim">${op.moneda||''}</td>
      <td class="mono c-dim">${op.fechaPago||''}</td>
      <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
    </tr>`).join('');
  } else if(biz.type==='transferencia'){
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Depositado</th><th>Com.Cliente %</th><th>Com.Cliente $</th><th>Mi parte %</th><th>Mi ganancia</th><th>Monto neto</th><th>Canal</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>`<tr>
      <td class="mono c-dim">${op.date||''}</td>
      <td style="max-width:130px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${op.desc||''}</td>
      <td>${typeBadge(op.tipo)}</td>
      <td class="mono c-blue">${fmt(op.cobrado)}<span class="c-dim"> ${op.moneda||''}</span></td>
      <td class="mono c-dim">${op.trfComPct||0}%</td>
      <td class="mono c-gold">${fmt(op.comision)}</td>
      <td class="mono c-dim">${op.trfMioPct||0}%</td>
      <td class="mono c-green">+${fmt(op.ganancia)}</td>
      <td class="mono">${fmt(op.trfNeto)}</td>
      <td class="c-dim" style="font-size:10px">${op.canal||''}</td>
      <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
    </tr>`).join('');
  } else if(biz.type==='cripto'){
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Coin</th><th>Cantidad</th><th>Tasa</th><th>Cliente paga</th><th>Com%</th><th>Comisión</th><th>Pago proveedor</th><th>Ganancia</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>`<tr>
      <td class="mono c-dim">${op.date||''}</td>
      <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${op.desc||''}</td>
      <td><span class="badge badge-cripto">${op.crpCoin||'USDT'}</span></td>
      <td class="mono c-dim">${(+op.crpCantidad||0).toFixed(6)}</td>
      <td class="mono c-dim">${fmt(op.crpTasa||0)}</td>
      <td class="mono c-blue">${fmt(op.cobrado)}<span class="c-dim"> ${op.monedaRecib||'MXN'}</span></td>
      <td class="mono c-dim">${op.crpComPct||0}%</td>
      <td class="mono c-gold">${fmt(op.comision)}</td>
      <td class="mono c-red">-${fmt(op.crpPagoProv||0)}</td>
      <td class="mono c-green">+${fmt(op.crpGanancia||0)}</td>
      <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
    </tr>`).join('');
  } else {
    th.innerHTML='<tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Cobrado</th><th>Com%</th><th>Comisión $</th><th>Tu parte</th><th>Socio/Tipo</th><th></th></tr>';
    tb.innerHTML=sorted.map(op=>`<tr>
      <td class="mono c-dim">${op.date||''}</td><td>${op.desc||''}</td>
      <td>${typeBadge(op.tipo)}</td>
      <td class="mono c-blue">${fmt(op.cobrado||op.monto||op.gastoMto)}</td>
      <td class="mono c-dim">${op.misComPct||op.comPct||0}%</td>
      <td class="mono c-gold">${fmt(op.comision||0)}</td>
      <td class="mono c-green">+${fmt(op.jt||op.ganancia||op.monto||0)}</td>
      <td class="c-dim" style="font-size:10px">${op.misTipo||op.gastoCat||''} ${op.misSocio?'· '+op.misSocio:''}</td>
      <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${bizId}')">×</button></td>
    </tr>`).join('');
  }
  // Monthly chart at bottom of biz view
  renderBizMonthlyChart(bizId);
}


// ════════════════════════════════════════════════════
//  CLIENTS MODULE
// ════════════════════════════════════════════════════

// ── Helpers ────────────────────────────────────────
function clientInitials(name) {
  return (name||'?').split(' ').slice(0,2).map(w=>w[0]?.toUpperCase()||'').join('');
}
function clientColor(clientId) {
  const palette=['#5ba3ff','#4debb0','#f0c040','#a78bfa','#fb923c','#f7931a','#f472b6','#22d3ee','#a3e635','#ff6b6b'];
  const idx = Math.abs([...clientId].reduce((h,ch)=>((h<<5)-h+ch.charCodeAt(0))|0,0)) % palette.length;
  return palette[idx];
}

// ── Build sidebar nav for clients ──────────────────
function buildClientNav() {
  const container = document.getElementById('navClientItems');
  if(!container) return;
  container.innerHTML = '';
  // Populate clientBizFilter select in vista clientes
  const cbf = document.getElementById('clientBizFilter');
  if(cbf) {
    const cur = cbf.value;
    cbf.innerHTML = '<option value="">Todos los negocios</option>';
    S.businesses.forEach(b => { cbf.innerHTML += `<option value="${b.id}">${b.name}</option>`; });
    cbf.value = cur;
  }
  S.clients.forEach(cl => {
    const biz = S.businesses.find(b=>b.id===cl.bizId);
    const el = document.createElement('div');
    el.className = 'nav-sub-item'; el.dataset.view = 'client_detail';
    el.innerHTML = `<span class="nav-sub-dot" style="background:${clientColor(cl.id)}"></span>
      <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${cl.name}</span>`;
    el.addEventListener('click', () => openClientDetail(cl.id));
    container.appendChild(el);
  });
}

// getClientPeriodFilter removed — replaced by unified picker

function rebuildClientGridPicker() {
  const allOps = S.ops.filter(o=>o.clientId);
  const allMonths = getMonthsFromOps(allOps);
  buildPeriodPicker('clientGridPeriodChips', allMonths, clientGridPeriod.sel, clientGridPeriod.exp, ()=>renderClientes());
  // update label
  const lbl = document.getElementById('clientGridPeriodLabel');
  if(lbl) lbl.textContent = clientGridPeriod.sel.size ? clientGridPeriod.sel.size+' mes'+(clientGridPeriod.sel.size>1?'es':'') : 'Todos los meses';
}

function renderClientes() {
  const bizFilter = document.getElementById('clientBizFilter')?.value||'';
  let clients = S.clients.filter(cl => !bizFilter || (cl.bizIds||[cl.bizId]).includes(bizFilter));
  // Unified period filter
  const pfActive = clientGridPeriod.sel.size > 0 ? true : false;
  const pfMonths = clientGridPeriod.sel;
  const grid = document.getElementById('clientGrid');
  const noData = document.getElementById('clientNoData');
  if(!grid) return;
  if(clients.length === 0) {
    grid.innerHTML=''; if(noData) noData.style.display='block'; return;
  }
  if(noData) noData.style.display='none';
  // Apply saved order to client cards
  if(S.clientCardOrder && S.clientCardOrder.length) {
    clients.sort((a,b)=>{
      const ai=S.clientCardOrder.indexOf(a.id), bi=S.clientCardOrder.indexOf(b.id);
      if(ai===-1&&bi===-1) return 0; if(ai===-1) return 1; if(bi===-1) return -1;
      return ai-bi;
    });
  }
  grid.innerHTML = clients.map(cl => {
    const biz = S.businesses.find(b=>b.id===cl.bizId);
    const clOps = filterOpsByPeriod(S.ops.filter(o=>o.clientId===cl.id), clientGridPeriod);
    const vol = clOps.reduce((s,o)=>s+opCobrado(o),0);
    const gan = clOps.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
    const neta = gan - clOps.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
    const color = clientColor(cl.id);
    // Build condition tags
    const tags = [];
    if(cl.conds?.envio?.comPct) tags.push(`Env ${cl.conds.envio.comPct}%`);
    if(cl.conds?.cripto?.comPct) tags.push(`Crp ${cl.conds.cripto.comPct}%`);
    if(cl.conds?.transferencia?.comPct) tags.push(`Trf ${cl.conds.transferencia.comPct}%`);
    if(cl.conds?.cambio?.comPct) tags.push(`Cam ${cl.conds.cambio.comPct}%`);
    return `<div class="client-card draggable" draggable="true" data-key="${cl.id}" onclick="if(!window._dragMoved)openClientDetail('${cl.id}')">
      <div class="client-card-actions">
        <button class="del" style="color:var(--blue)" onclick="event.stopPropagation();openEditClient('${cl.id}')">✎</button>
        <button class="del" onclick="event.stopPropagation();deleteClientConfirm('${cl.id}')">×</button>
      </div>
      <div class="client-card-header">
        <div style="display:flex;align-items:center;gap:10px;">
          <div class="client-avatar" style="background:${color}22;color:${color}">${clientInitials(cl.name)}</div>
          <div>
            <div class="client-name">${cl.name}</div>
            <div class="client-biz">${(cl.bizIds||[cl.bizId]).map(id=>{ const b2=S.businesses.find(x=>x.id===id); return b2?`<span style="display:inline-flex;align-items:center;gap:3px"><span style="width:5px;height:5px;border-radius:50%;background:${b2.color};display:inline-block"></span>${b2.name}</span>`:''; }).filter(Boolean).join(' · ')||'—'} ${cl.phone?'· '+cl.phone:''}</div>
          </div>
        </div>
      </div>
      <div class="client-conds">${tags.map(t=>`<span class="cond-tag">${t}</span>`).join('')||'<span class="cond-tag" style="color:var(--text3)">Sin condiciones</span>'}</div>
      <div class="client-stats">
        <div class="cstat"><div class="cstat-lbl">Ops</div><div class="cstat-val">${clOps.length}</div></div>
        <div class="cstat"><div class="cstat-lbl">Volumen</div><div class="cstat-val" style="color:var(--blue)">${fmt(vol)}</div></div>
        <div class="cstat"><div class="cstat-lbl">Ganancia</div><div class="cstat-val" style="color:${neta>=0?'var(--green)':'var(--red)'}">${fmt(neta)}</div></div>
      </div>
    </div>`;
  }).join('');
  initDragContainer('clientGrid', 'clientCardOrder');
  rebuildClientGridPicker();
}

// ── Open client detail view ─────────────────────────
function openClientDetail(clientId) {
  curClientId = clientId;
  const navEl = document.querySelector('[data-view="clientes"]');
  showView('client_detail', null);
  // Deactivate all nav items, no specific highlight for detail
  document.querySelectorAll('.nav-item,.nav-sub-item').forEach(el=>el.classList.remove('active'));
  renderClientDetail();
}

function renderClientDetail() {
  const cl = S.clients.find(c=>c.id===curClientId); if(!cl) return;
  const bizIds_det = cl.bizIds||[cl.bizId];
  const color = clientColor(cl.id);
  document.getElementById('clientDetailName').textContent = cl.name;
  document.getElementById('clientDetailName').style.color = color;
  const bizNamesStr = bizIds_det.map(id=>S.businesses.find(b=>b.id===id)?.name||'').filter(Boolean).join(' · ');
  document.getElementById('clientDetailSub').textContent =
    (bizNamesStr||'—') + (cl.phone?' · '+cl.phone:'') + (cl.ref?' · Ref: '+cl.ref:'');
  document.getElementById('clientDetailOpBtn').dataset.bizids = JSON.stringify(bizIds_det);

  // Conditions panel
  const conds = cl.conds||{};
  const condEl = document.getElementById('clientDetailConds');
  const condRows = [
    ['Envío',         conds.envio,         'comPct','miPct','nota'],
    ['Cambio',        conds.cambio,        'comPct','miPct','banco'],
    ['Cripto',        conds.cripto,        'comPct','coin', 'nota'],
    ['Transferencia', conds.transferencia, 'comPct','miPct','canal'],
    ['General',       conds.misc,          'comPct','miPct','moneda'],
  ].filter(([,d])=>d&&Object.values(d).some(v=>v));
  condEl.innerHTML = condRows.length ? `
    <div class="cond-section-title" style="font-size:9px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--text3);margin-bottom:10px;">Condiciones pactadas</div>
    <div style="display:flex;gap:8px;flex-wrap:wrap;">
      ${condRows.map(([label,d,k1,k2,k3])=>`
        <div style="background:var(--bg);border:1px solid var(--border);border-radius:8px;padding:10px 14px;min-width:150px;">
          <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);margin-bottom:6px;">${label}</div>
          ${d[k1]?`<div style="font-size:11px">Com.cliente: <strong style="color:var(--gold)">${d[k1]}%</strong></div>`:''}
          ${d[k2]&&k2==='miPct'?`<div style="font-size:11px">Mi parte: <strong style="color:var(--green)">${d[k2]}%</strong></div>`:''}
          ${d[k2]&&k2!=='miPct'?`<div style="font-size:10px;color:var(--text3)">${d[k2]}</div>`:''}
          ${d[k3]?`<div style="font-size:10px;color:var(--text3)">${d[k3]}</div>`:''}
        </div>`).join('')}
    </div>` : '<span style="font-size:11px;color:var(--text3)">Sin condiciones especiales registradas.</span>';

  // Ops history
  const tipoF = document.getElementById('clientHistTipo')?.value||'';
  let ops = filterOpsByPeriod(S.ops.filter(o=>o.clientId===cl.id), clientDetailPeriod);
  if(tipoF) ops = ops.filter(o=>o.tipo===tipoF);
  // Build period picker for this client's ops
  const detailMonths = getMonthsFromOps(S.ops.filter(o=>o.clientId===cl.id));
  buildPeriodPicker('clientDetailPeriodChips', detailMonths, clientDetailPeriod.sel, clientDetailPeriod.exp, ()=>renderClientDetail());
  ops.sort((a,b)=>(b.date||'').localeCompare(a.date||''));

  const vol  = ops.reduce((s,o)=>s+opCobrado(o),0);
  const gan  = ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
  const gast = ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
  const com  = ops.reduce((s,o)=>s+(o.comision||0),0);
  document.getElementById('clientDetailStats').innerHTML=`
    <div class="stat b"><div class="stat-lbl">Operaciones</div><div class="stat-val" style="color:var(--blue)">${ops.length}</div></div>
    <div class="stat o"><div class="stat-lbl">Volumen</div><div class="stat-val" style="color:var(--blue)">${fmt(vol)}</div></div>
    <div class="stat g"><div class="stat-lbl">Comisiones</div><div class="stat-val" style="color:var(--gold)">${fmt(com)}</div></div>
    <div class="stat p"><div class="stat-lbl">Ganancia</div><div class="stat-val" style="color:var(--green)">${fmt(gan)}</div></div>
    <div class="stat r"><div class="stat-lbl">Neta</div><div class="stat-val" style="color:${gan-gast>=0?'var(--green)':'var(--red)'}">${fmt(gan-gast)}</div></div>`;

  // period picker is rebuilt above

  const th = document.getElementById('clientHistHead');
  const tb = document.getElementById('clientHistBody');
  th.innerHTML = '<tr><th>Fecha</th><th>Negocio</th><th>Descripción</th><th>Tipo</th><th>Cobrado</th><th>Comisión</th><th>Ganancia</th><th>Com.% usada</th><th></th></tr>';
  if(ops.length===0){ tb.innerHTML='<tr class="empty"><td colspan="9">Sin operaciones para este cliente.</td></tr>'; return; }
  tb.innerHTML = ops.map(op=>{
    const bizN = S.businesses.find(b=>b.id===op.bizId)?.name||'—';
    const g = opGanancia(op);
    const comPctUsed = op.comPct||op.crpComPct||op.trfComPct||op.camCT||op.misComPct||'';
    return`<tr>
      <td class="mono c-dim">${op.date||''}</td>
      <td style="font-size:11px">${bizN}</td>
      <td style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${op.desc||''}</td>
      <td>${typeBadge(op.tipo)}</td>
      <td class="mono c-blue">${fmt(opCobrado(op))}</td>
      <td class="mono c-gold">${op.comision?fmt(op.comision):'—'}</td>
      <td class="mono ${g>=0?'c-green':'c-red'}">${g>=0?'+':''}${fmt(g)}</td>
      <td class="mono c-dim">${comPctUsed?comPctUsed+'%':'—'}</td>
      <td style="white-space:nowrap"><button class="del" style="color:var(--blue);margin-right:3px" onclick="editOp('${op.id}')">✎</button><button class="del" onclick="delOp('${op.id}','${op.bizId}')">×</button></td>
    </tr>`;
  }).join('');
}

function openOpModalForClient(forceBizId) {
  const cl = S.clients.find(c=>c.id===curClientId); if(!cl) return;
  const bizIds_op = cl.bizIds||[cl.bizId];
  const targetBizId = forceBizId || (bizIds_op.length===1 ? bizIds_op[0] : null);
  if(!targetBizId && bizIds_op.length>1) {
    const existing = document.getElementById('clientBizPickerModal');
    if(existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'clientBizPickerModal';
    modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9000;display:flex;align-items:center;justify-content:center;';
    modal.innerHTML=`<div style="background:var(--s1);border:1px solid var(--border2);border-radius:14px;padding:22px 24px;min-width:260px;max-width:340px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:14px;color:var(--text)">¿En cuál negocio registrar la operación?</div>
      ${bizIds_op.map(id=>{ const b=S.businesses.find(x=>x.id===id); return b?`<button onclick="document.getElementById('clientBizPickerModal').remove();openOpModalForClient('${id}')"
        style="display:flex;align-items:center;gap:10px;width:100%;padding:10px 14px;margin-bottom:8px;background:var(--s2);border:1px solid var(--border);border-radius:10px;cursor:pointer;font-size:12px;font-weight:600;color:var(--text);">
        <span style="width:9px;height:9px;border-radius:50%;background:${b.color};flex-shrink:0"></span>${b.name}</button>`:'';}).join('')}
      <button onclick="document.getElementById('clientBizPickerModal').remove()" style="width:100%;padding:8px;background:none;border:none;cursor:pointer;font-size:11px;color:var(--text3);margin-top:4px;">Cancelar</button>
    </div>`;
    document.body.appendChild(modal);
    return;
  }
  openOpModal(targetBizId||bizIds_op[0]);
  setTimeout(()=>{
    const sel = document.getElementById('opClientSel');
    if(sel) {
      sel.value = cl.id;
      const badge=document.getElementById('opClientBadge');
      if(badge) badge.textContent=cl.phone||'';
      applyClientConds();
    }
  }, 40);
}

// ── Client Modal (Create/Edit) ──────────────────────
function buildClientBizChips(selectedIds=[]) {
  const container = document.getElementById('clientBizChips');
  if(!container) return;
  container.innerHTML = S.businesses.map(b => {
    const active = selectedIds.includes(b.id);
    return `<button type="button"
      class="scope-chip ${active?'active':''}"
      data-id="${b.id}"
      style="${active?'border-color:'+b.color+';color:'+b.color+';background:'+b.color+'18':''}"
      onclick="toggleClientBizChip(this,'${b.id}','${b.color}')">${b.name}</button>`;
  }).join('');
}

function toggleClientBizChip(el, bizId, color) {
  const active = el.classList.toggle('active');
  el.style.borderColor = active ? color : '';
  el.style.color       = active ? color : '';
  el.style.background  = active ? color+'18' : '';
}

function getSelectedClientBizIds() {
  return [...document.querySelectorAll('#clientBizChips .scope-chip.active')].map(el=>el.dataset.id);
}

function openAddClient(bizId) {
  ['clientName','clientPhone','clientRef','clientNotes',
   'ccEnvComPct','ccEnvMiPct','ccEnvNota',
   'ccCamComPct','ccCamMiPct','ccCamBanco',
   'ccCrpComPct','ccCrpNota',
   'ccTrfComPct','ccTrfMiPct','ccTrfCanal',
   'ccMisComPct','ccMisMiPct'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('clientEditId').value='';
  document.getElementById('clientModalTitle').textContent='Nuevo Cliente';
  document.getElementById('clientDeleteBtn').style.display='none';
  buildClientBizChips(bizId ? [bizId] : []);
  document.getElementById('clientModal').classList.add('open');
}

function openEditClient(clientId) {
  const cl = S.clients.find(c=>c.id===clientId); if(!cl) return;
  openAddClient(null);
  buildClientBizChips(cl.bizIds||[]);
  document.getElementById('clientEditId').value=clientId;
  document.getElementById('clientModalTitle').textContent='Editar Cliente';
  document.getElementById('clientDeleteBtn').style.display='inline-flex';
  document.getElementById('clientName').value=cl.name||'';
  document.getElementById('clientPhone').value=cl.phone||'';
  document.getElementById('clientRef').value=cl.ref||'';
  document.getElementById('clientNotes').value=cl.notes||'';
  const co=cl.conds||{};
  if(co.envio){
    document.getElementById('ccEnvComPct').value=co.envio.comPct||'';
    document.getElementById('ccEnvMiPct').value=co.envio.miPct||'';
    document.getElementById('ccEnvNota').value=co.envio.nota||'';
  }
  if(co.cambio){
    document.getElementById('ccCamComPct').value=co.cambio.comPct||'';
    document.getElementById('ccCamMiPct').value=co.cambio.miPct||'';
    document.getElementById('ccCamBanco').value=co.cambio.banco||'';
  }
  if(co.cripto){
    document.getElementById('ccCrpComPct').value=co.cripto.comPct||'';
    document.getElementById('ccCrpCoin').value=co.cripto.coin||'USDT';
    document.getElementById('ccCrpNota').value=co.cripto.nota||'';
  }
  if(co.transferencia){
    document.getElementById('ccTrfComPct').value=co.transferencia.comPct||'';
    document.getElementById('ccTrfMiPct').value=co.transferencia.miPct||'';
    document.getElementById('ccTrfCanal').value=co.transferencia.canal||'';
  }
  if(co.misc){
    document.getElementById('ccMisComPct').value=co.misc.comPct||'';
    document.getElementById('ccMisMiPct').value=co.misc.miPct||'';
    document.getElementById('ccMisMon').value=co.misc.moneda||'MXN';
  }
}

function editCurrentClient() { if(curClientId) openEditClient(curClientId); }

function saveClient() {
  const name=document.getElementById('clientName').value.trim();
  if(!name){alert('Escribe el nombre del cliente.');return;}
  const bizIds=getSelectedClientBizIds();
  if(!bizIds.length){alert('Selecciona al menos un negocio.');return;}
  const conds={
    envio:{comPct:+document.getElementById('ccEnvComPct').value||0,miPct:+document.getElementById('ccEnvMiPct').value||0,nota:document.getElementById('ccEnvNota').value.trim()},
    cambio:{comPct:+document.getElementById('ccCamComPct').value||0,miPct:+document.getElementById('ccCamMiPct').value||0,banco:document.getElementById('ccCamBanco').value.trim()},
    cripto:{comPct:+document.getElementById('ccCrpComPct').value||0,coin:document.getElementById('ccCrpCoin').value,nota:document.getElementById('ccCrpNota').value.trim()},
    transferencia:{comPct:+document.getElementById('ccTrfComPct').value||0,miPct:+document.getElementById('ccTrfMiPct').value||0,canal:document.getElementById('ccTrfCanal').value.trim()},
    misc:{comPct:+document.getElementById('ccMisComPct').value||0,miPct:+document.getElementById('ccMisMiPct').value||0,moneda:document.getElementById('ccMisMon').value},
  };
  const editId=document.getElementById('clientEditId').value;
  const base={name,bizIds,bizId:bizIds[0]||'',phone:document.getElementById('clientPhone').value.trim(),ref:document.getElementById('clientRef').value.trim(),notes:document.getElementById('clientNotes').value.trim(),conds};
  if(editId){
    const cl=S.clients.find(c=>c.id===editId); if(!cl) return;
    Object.assign(cl,base);
    save(); closeClientModal(); buildNav(); renderClientes();
    if(curClientId===editId) renderClientDetail();
    showToast(name+' actualizado','ok');
  } else {
    const cl={id:'cl'+Date.now()+'_'+Math.random().toString(36).slice(2),...base,createdAt:new Date().toISOString()};
    S.clients.push(cl); save(); closeClientModal(); buildNav(); renderClientes();
    showToast(name+' creado','ok');
  }
}

function deleteClientConfirm(clientId) {
  const cl=S.clients.find(c=>c.id===clientId); if(!cl) return;
  const n=S.ops.filter(o=>o.clientId===clientId).length;
  if(!confirm(`¿Eliminar "${cl.name}"? Sus ${n} operaciones quedarán sin cliente asignado.`)) return;
  S.clients=S.clients.filter(c=>c.id!==clientId);
  S.ops.forEach(o=>{ if(o.clientId===clientId) o.clientId=''; });
  save(); buildNav(); renderClientes();
  showToast(cl.name+' eliminado','ok');
}

function deleteClient() { const id=document.getElementById('clientEditId').value; if(id) deleteClientConfirm(id); closeClientModal(); }
function closeClientModal(){ document.getElementById('clientModal').classList.remove('open'); }

// ── Client selector in op modal ─────────────────────
function populateOpClientSel(bizId) {
  const sel=document.getElementById('opClientSel'); if(!sel) return;
  const cur=sel.value;
  sel.innerHTML='<option value="">Sin cliente / Ocasional</option>';
  S.clients.filter(cl=>(cl.bizIds||[cl.bizId]).includes(bizId)).forEach(cl=>{
    sel.innerHTML+=`<option value="${cl.id}">${cl.name}</option>`;
  });
  if(cur) sel.value=cur;
}

function applyClientConds() {
  const selEl=document.getElementById('opClientSel'); if(!selEl) return;
  const clientId=selEl.value;
  const badge=document.getElementById('opClientBadge');
  if(!clientId){ if(badge) badge.textContent=''; return; }
  const cl=S.clients.find(c=>c.id===clientId); if(!cl) return;
  if(badge) badge.textContent=cl.phone||'';
  const tipo=curOpType;
  const co=cl.conds||{};
  const set=(id,v)=>{ if(v!==undefined&&v!==null&&v!=='') { const el=document.getElementById(id); if(el) el.value=v; } };
  if(tipo==='envio'&&co.envio){
    set('envPct',   co.envio.comPct);
    set('envDest',  co.envio.nota);   // use value, not placeholder
    calcEnvio();
  } else if(tipo==='cambio'&&co.cambio){
    set('camCT',    co.cambio.comPct);
    set('camCU',    co.cambio.miPct);
    set('camBanco', co.cambio.banco);
    calcCambio();
  } else if(tipo==='cripto'&&co.cripto){
    set('crpComPct',co.cripto.comPct);
    set('crpCoin',  co.cripto.coin);
    calcCripto();
  } else if(tipo==='transferencia'&&co.transferencia){
    set('trfComPct',  co.transferencia.comPct);
    set('trfMioPct',  co.transferencia.miPct);
    set('trfCanal',   co.transferencia.canal);
    calcTransferencia();
  } else if((tipo==='misc'||tipo==='deposito')&&co.misc){
    set('misPct', co.misc.comPct);
    calcMisc();
  }
  // Show visual indicator that client conds were applied
  const row=document.getElementById('opClientRow');
  if(row){ row.style.borderColor='var(--gold)'; setTimeout(()=>row.style.borderColor='',1200); }
}


// ════════════════════════════════════════════════════
//  OP TYPES CONFIG MODULE
// ════════════════════════════════════════════════════

// Returns the full merged list: builtins + custom, filtered by override flags
function getEffectiveOpTypes(bizId, clientId) {
  const builtins = [
    {id:'envio',    label:'Envío',             badge:'badge-envio',    color:'#5ba3ff', builtin:true},
    {id:'cambio',   label:'Cambio divisas',    badge:'badge-cambio',   color:'#a78bfa', builtin:true},
    {id:'comision', label:'Comisión',          badge:'badge-comision', color:'#f0c040', builtin:true},
    {id:'deposito', label:'Depósito',          badge:'badge-deposito', color:'#4debb0', builtin:true},
    {id:'gasto',    label:'Gasto',             badge:'badge-gasto',    color:'#ff6b6b', builtin:true},
    {id:'misc',     label:'Misceláneo',        badge:'badge-misc',     color:'#fb923c', builtin:true},
    {id:'transferencia', label:'Transferencia',badge:'badge-transferencia', color:'#22d3ee', builtin:true},
    {id:'cripto',   label:'Cripto (USDT/BTC)', badge:'badge-cripto',   color:'#f7931a', builtin:true},
  ];
  const all = [...builtins, ...(S.customOpTypes||[])];

  return all.filter(ot => {
    const ov = (S.opTypeOverrides||{})[ot.id];
    // If override exists and is explicitly disabled, hide
    if(ov && ov.enabled === false) return false;
    // If bizId restriction set and this biz not in list, hide
    if(ov && ov.bizIds && ov.bizIds.length > 0 && bizId && !ov.bizIds.includes(bizId)) return false;
    // If clientId restriction set and this client not in list, hide
    if(ov && ov.clientIds && ov.clientIds.length > 0 && clientId && !ov.clientIds.includes(clientId)) return false;
    return true;
  });
}

// Populate the opTypeSelect in the op modal based on active biz/client
function populateOpTypeSelect(bizId) {
  const clientId = document.getElementById('opClientSel')?.value||'';
  const types = getEffectiveOpTypes(bizId, clientId||null);
  const sel = document.getElementById('opTypeSelect');
  if(!sel) return;
  const cur = sel.value || curOpType;
  sel.innerHTML = types.map(ot=>`<option value="${ot.id}">${ot.label}</option>`).join('');
  // Restore selection if still available, else first
  if(types.find(t=>t.id===cur)) sel.value=cur;
  else if(types.length) { sel.value=types[0].id; setOpType(types[0].id); }
}

// ── Config view renderer ──────────────────────────────────────
function renderOpTypesConfig() {
  const builtins = [
    {id:'envio',    label:'Envío',             color:'#5ba3ff', builtin:true},
    {id:'cambio',   label:'Cambio divisas',    color:'#a78bfa', builtin:true},
    {id:'comision', label:'Comisión',          color:'#f0c040', builtin:true},
    {id:'deposito', label:'Depósito',          color:'#4debb0', builtin:true},
    {id:'gasto',    label:'Gasto',             color:'#ff6b6b', builtin:true},
    {id:'misc',     label:'Misceláneo',        color:'#fb923c', builtin:true},
    {id:'transferencia', label:'Transferencia',color:'#22d3ee', builtin:true},
    {id:'cripto',   label:'Cripto (USDT/BTC)', color:'#f7931a', builtin:true},
  ];
  const all = [...builtins, ...(S.customOpTypes||[])];
  const overrides = S.opTypeOverrides||{};
  const active   = all.filter(ot=>!(overrides[ot.id]&&overrides[ot.id].enabled===false));
  const disabled = all.filter(ot=> overrides[ot.id]&&overrides[ot.id].enabled===false);

  const renderRow = (ot, isActive) => {
    const ov = overrides[ot.id]||{};
    const bizNames = (ov.bizIds||[]).map(id=>S.businesses.find(b=>b.id===id)?.name||'?').join(', ');
    const clientNames = (ov.clientIds||[]).map(id=>S.clients.find(cl=>cl.id===id)?.name||'?').join(', ');
    const scopeText = [
      bizNames   ? '📦 '+bizNames    : '',
      clientNames? '👤 '+clientNames : '',
    ].filter(Boolean).join(' · ') || 'Todos';
    return `<div class="optype-row">
      <span class="optype-drag" title="Tipo ${ot.builtin?'integrado':'personalizado'}">⠿</span>
      <span class="optype-badge-preview" style="background:${ot.color}22;color:${ot.color};border:1px solid ${ot.color}44">${ot.label}</span>
      <span class="optype-label">${ot.label}${ot.desc?' <span style="color:var(--text3);font-weight:400">— '+ot.desc+'</span>':''}</span>
      <span class="optype-scope" title="Habilitado en">${scopeText}</span>
      <div class="optype-actions">
        <button class="del" style="color:var(--blue)" onclick="openEditOpType('${ot.id}')">✎</button>
        ${!ot.builtin?`<button class="del" onclick="confirmDeleteOpType('${ot.id}')">×</button>`:''}
        <button class="optype-toggle ${isActive?'on':''}" title="${isActive?'Deshabilitar':'Habilitar'}" onclick="toggleOpTypeEnabled('${ot.id}',this)"></button>
      </div>
    </div>`;
  };

  document.getElementById('opTypesList').innerHTML = active.map(ot=>renderRow(ot,true)).join('') || '<p style="color:var(--text3);font-size:12px">Sin tipos activos.</p>';
  const disEl = document.getElementById('opTypesDisabledList');
  const secEl = document.getElementById('cfgDisabledSection');
  if(disabled.length>0){
    secEl.style.display='';
    disEl.innerHTML = disabled.map(ot=>renderRow(ot,false)).join('');
  } else {
    secEl.style.display='none';
  }
}

function toggleOpTypeEnabled(id, btn) {
  if(!S.opTypeOverrides) S.opTypeOverrides={};
  if(!S.opTypeOverrides[id]) S.opTypeOverrides[id]={};
  const isOn = btn.classList.contains('on');
  S.opTypeOverrides[id].enabled = !isOn; // toggling
  // if turning off, set explicitly false; if on, remove flag (undefined = enabled)
  if(isOn) S.opTypeOverrides[id].enabled = false;
  else delete S.opTypeOverrides[id].enabled;
  save(); renderOpTypesConfig();
}

// ── Add / Edit modal ──────────────────────────────────────────
function openAddOpType() {
  document.getElementById('otEditId').value='';
  document.getElementById('otLabel').value='';
  document.getElementById('otDesc').value='';
  document.getElementById('otColor').value='#f0c040';
  document.getElementById('otDeleteBtn').style.display='none';
  document.getElementById('opTypeModalTitle').textContent='Nuevo Tipo de Operación';
  const tog=document.getElementById('otEnabledToggle'); if(tog) tog.classList.add('on');
  buildOtChips('','');
  document.getElementById('opTypeModal').classList.add('open');
}

function openEditOpType(id) {
  // Could be builtin or custom
  const builtins={envio:'Envío',cambio:'Cambio divisas',comision:'Comisión',deposito:'Depósito',gasto:'Gasto',misc:'Misceláneo',transferencia:'Transferencia',cripto:'Cripto (USDT/BTC)'};
  const custom = (S.customOpTypes||[]).find(t=>t.id===id);
  const label = custom?.label || builtins[id] || id;
  const color = custom?.color || '#f0c040';
  const desc  = custom?.desc  || '';
  document.getElementById('otEditId').value=id;
  document.getElementById('otLabel').value=label;
  document.getElementById('otDesc').value=desc;
  document.getElementById('otColor').value=color;
  document.getElementById('opTypeModalTitle').textContent='Editar — '+label;
  document.getElementById('otDeleteBtn').style.display=custom?'inline-flex':'none';
  const ov=(S.opTypeOverrides||{})[id]||{};
  const tog=document.getElementById('otEnabledToggle');
  if(tog){ tog.classList.toggle('on', ov.enabled!==false); }
  buildOtChips(ov.bizIds||[], ov.clientIds||[]);
  document.getElementById('opTypeModal').classList.add('open');
}

function buildOtChips(selBizIds, selClientIds) {
  const bc=document.getElementById('otBizChips');
  const cc=document.getElementById('otClientChips');
  if(bc) bc.innerHTML=S.businesses.map(b=>`
    <button class="scope-chip ${selBizIds.includes?.(b.id)||selBizIds===b.id?' active':''}"
      data-id="${b.id}" onclick="this.classList.toggle('active')">${b.name}</button>`).join('');
  if(cc) cc.innerHTML=S.clients.map(cl=>`
    <button class="scope-chip ${selClientIds.includes?.(cl.id)||selClientIds===cl.id?' active':''}"
      data-id="${cl.id}" onclick="this.classList.toggle('active')">${cl.name}</button>`).join('');
}

function saveOpType() {
  const label=document.getElementById('otLabel').value.trim();
  if(!label){alert('Escribe un nombre para el tipo.');return;}
  const color=document.getElementById('otColor').value;
  const desc=document.getElementById('otDesc').value.trim();
  const editId=document.getElementById('otEditId').value;
  const enabled=document.getElementById('otEnabledToggle').classList.contains('on');
  const bizIds=[...document.querySelectorAll('#otBizChips .scope-chip.active')].map(el=>el.dataset.id);
  const clientIds=[...document.querySelectorAll('#otClientChips .scope-chip.active')].map(el=>el.dataset.id);

  if(!S.opTypeOverrides) S.opTypeOverrides={};
  if(!S.customOpTypes) S.customOpTypes=[];

  // Save override (scope + enabled flag)
  const id = editId || 'ct_'+Date.now();
  S.opTypeOverrides[id]={enabled:enabled?undefined:false, bizIds, clientIds};
  if(!enabled) S.opTypeOverrides[id].enabled=false;

  // If custom (non-builtin), save or update in customOpTypes
  const builtinIds=['envio','cambio','comision','deposito','gasto','misc','transferencia','cripto'];
  if(!builtinIds.includes(id)){
    const existing=S.customOpTypes.find(t=>t.id===id);
    if(existing) Object.assign(existing,{label,color,desc});
    else S.customOpTypes.push({id,label,color,desc,badge:'badge-custom'});
    // Ensure the badge CSS exists for this color
    ensureCustomBadgeCSS(id,color);
  } else {
    // Builtin: just update label/color in override metadata (not in OP_TYPES arr)
    S.opTypeOverrides[id].label=label; S.opTypeOverrides[id].color=color;
  }

  save(); closeOpTypeModal(); renderOpTypesConfig();
  showToast(label+' guardado','ok');
}

function ensureCustomBadgeCSS(id, color) {
  const styleId='css-badge-'+id;
  if(document.getElementById(styleId)) return;
  const style=document.createElement('style');
  style.id=styleId;
  style.textContent=`.badge-custom-${id}{background:${color}22;color:${color};}`;
  document.head.appendChild(style);
}

function confirmDeleteOpType(id) {
  const t=(S.customOpTypes||[]).find(x=>x.id===id);
  if(!t) return;
  if(!confirm(`¿Eliminar el tipo "${t.label}"? Las operaciones existentes conservarán su tipo.`)) return;
  S.customOpTypes=(S.customOpTypes||[]).filter(x=>x.id!==id);
  if(S.opTypeOverrides) delete S.opTypeOverrides[id];
  save(); closeOpTypeModal(); renderOpTypesConfig();
  showToast(t.label+' eliminado','ok');
}

function deleteOpType() {
  const id=document.getElementById('otEditId').value;
  if(id) confirmDeleteOpType(id);
}

function closeOpTypeModal(){document.getElementById('opTypeModal').classList.remove('open');}


// ════════════════════════════════════════════════════
//  DRAG & DROP ENGINE  (Vista General)
// ════════════════════════════════════════════════════
window._dragMoved = false;

function initDragContainer(containerId, orderKey) {
  const container = document.getElementById(containerId);
  if(!container) return;

  let dragEl = null;
  let placeholder = null;

  container.querySelectorAll('.draggable').forEach(el => {
    el.addEventListener('dragstart', e => {
      dragEl = el;
      window._dragMoved = false;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', el.dataset.key||'');
      // Delay class add so screenshot isn't affected
      requestAnimationFrame(() => el.classList.add('dragging'));

      // Create placeholder same size
      placeholder = document.createElement('div');
      placeholder.className = 'drag-placeholder';
      placeholder.style.cssText = `
        width:${el.offsetWidth}px;
        height:${el.offsetHeight}px;
        border:2px dashed var(--gold);
        border-radius:12px;
        background:var(--gold)08;
        flex-shrink:0;
        pointer-events:none;
        transition:all .1s;
      `;
    });

    el.addEventListener('dragend', () => {
      el.classList.remove('dragging');
      container.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));
      if(placeholder && placeholder.parentNode) placeholder.parentNode.removeChild(placeholder);
      placeholder = null;
      // Persist new order
      const keys=[...container.querySelectorAll('.draggable[data-key]')].map(x=>x.dataset.key);
      if(orderKey==='statOrder') S.statOrder=keys;
      else if(orderKey==='bizCardOrder') S.bizCardOrder=keys;
      save();
      // Brief flag so click doesn't fire after drag
      window._dragMoved = true;
      setTimeout(()=>{ window._dragMoved=false; }, 200);
    });

    el.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if(!dragEl || el === dragEl || el === placeholder) return;
      const rect = el.getBoundingClientRect();
      const midX = rect.left + rect.width / 2;
      const midY = rect.top + rect.height / 2;
      // Determine if grid is horizontal (stats) or grid (biz cards)
      const isHoriz = container.id === 'resStats';
      const insertBefore = isHoriz ? e.clientX < midX : e.clientY < midY;
      if(placeholder) {
        if(insertBefore) container.insertBefore(placeholder, el);
        else container.insertBefore(placeholder, el.nextSibling);
      }
    });

    el.addEventListener('drop', e => {
      e.preventDefault();
      if(!dragEl || !placeholder) return;
      container.insertBefore(dragEl, placeholder);
    });

    // Touch: subtle hover hint on mobile
    el.addEventListener('touchstart', ()=>{ el.classList.add('drag-over'); }, {passive:true});
    el.addEventListener('touchend', ()=>{ el.classList.remove('drag-over'); }, {passive:true});
  });

  // Container needs dragover too for edge cases
  container.addEventListener('dragover', e => {
    e.preventDefault();
    if(placeholder && !placeholder.parentNode) {
      container.appendChild(placeholder);
    }
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    if(dragEl && placeholder) container.insertBefore(dragEl, placeholder);
  });
}


// ════════════════════════════════════════════════════
//  CLIENTES — FILTRO POR PERÍODO
// ════════════════════════════════════════════════════
// onClientPeriodMode removed — replaced by unified picker

// populateClientMonthFilter removed — replaced by unified picker

// populateClientYearFilter removed — replaced by unified picker

function buildPeriodPicker(containerId, allMonths, selectedSet, expandedSet, onChangeFn) {
  const wrap = document.getElementById(containerId);
  if (!wrap) return;
  wrap.innerHTML = '';
  if (!allMonths.length) return;
  const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  const years = [...new Set(allMonths.map(m=>m.slice(0,4)))];
  // Auto-expand latest year if nothing expanded
  if (expandedSet.size === 0 && years.length) expandedSet.add(years[years.length-1]);

  years.forEach(y => {
    const yMonths = allMonths.filter(m=>m.startsWith(y));
    const yAll    = yMonths.length > 0 && yMonths.every(m=>selectedSet.has(m));
    const ySome   = yMonths.some(m=>selectedSet.has(m));
    const isOpen  = expandedSet.has(y);

    const group = document.createElement('span');
    group.style.cssText = 'display:inline-flex;align-items:center;gap:3px;margin-right:6px;margin-bottom:4px;';

    // Year pill
    const yBtn = document.createElement('button');
    yBtn.className = 'mchip-year' + (isOpen?' open':'') + (yAll?' active':ySome?' partial':'');
    yBtn.innerHTML = y + ' <span class="yr-arrow">›</span>';
    yBtn.title = 'Click: expandir · Doble click: seleccionar todo ' + y;
    yBtn.onclick = () => {
      if (expandedSet.has(y)) expandedSet.delete(y); else expandedSet.add(y);
      buildPeriodPicker(containerId, allMonths, selectedSet, expandedSet, onChangeFn);
    };
    yBtn.ondblclick = e => {
      e.stopPropagation();
      if (yAll) yMonths.forEach(m=>selectedSet.delete(m));
      else yMonths.forEach(m=>selectedSet.add(m));
      buildPeriodPicker(containerId, allMonths, selectedSet, expandedSet, onChangeFn);
      onChangeFn();
    };
    group.appendChild(yBtn);

    // Month chips
    const mGrp = document.createElement('span');
    mGrp.className = 'mchip-months-group' + (isOpen?' open':'');
    yMonths.forEach(m => {
      const [, mo] = m.split('-');
      const chip = document.createElement('button');
      chip.className = 'bmchip' + (selectedSet.has(m)?' active':'');
      chip.textContent = MN[+mo-1];
      chip.title = m;
      chip.onclick = () => {
        if (selectedSet.has(m)) selectedSet.delete(m); else selectedSet.add(m);
        buildPeriodPicker(containerId, allMonths, selectedSet, expandedSet, onChangeFn);
        onChangeFn();
      };
      mGrp.appendChild(chip);
    });
    group.appendChild(mGrp);
    wrap.appendChild(group);
  });

  // "Todos" clear button
  if (selectedSet.size > 0) {
    const clearBtn = document.createElement('button');
    clearBtn.className = 'bmchip';
    clearBtn.style.cssText = 'color:var(--text3);margin-left:4px;font-size:9px;';
    clearBtn.textContent = '× limpiar';
    clearBtn.onclick = () => { selectedSet.clear(); buildPeriodPicker(containerId, allMonths, selectedSet, expandedSet, onChangeFn); onChangeFn(); };
    wrap.appendChild(clearBtn);
  }
}

// Per-view state for unified pickers
const clientGridPeriod   = { sel: new Set(), exp: new Set() };
const clientDetailPeriod = { sel: new Set(), exp: new Set() };
const cmpPeriod          = { sel: new Set(), exp: new Set() };

function getMonthsFromOps(ops) {
  return [...new Set(ops.filter(o=>o.date).map(o=>o.date.slice(0,7)))].sort();
}

function filterOpsByPeriod(ops, periodState) {
  if (!periodState.sel.size) return ops;
  return ops.filter(o => o.date && periodState.sel.has(o.date.slice(0,7)));
}

// ════════════════════════════════════════════════════
//  COMPARATIVA — TABS
// ════════════════════════════════════════════════════
let cmpTab = 'resumen';

function setCmpTab(tab, btn) {
  cmpTab = tab;
  document.querySelectorAll('.cmp-nav-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('cmpTabResumen').style.display = tab==='resumen' ? '' : 'none';
  document.getElementById('cmpTabMes').style.display      = tab==='mes'     ? '' : 'none';
  document.getElementById('cmpTabAño').style.display      = tab==='año'     ? '' : 'none';
  renderComparativa();
}

function growthBadge(cur, prev) {
  if(!prev || prev===0) return '<span class="growth-badge growth-eq">Nuevo</span>';
  const pct = ((cur-prev)/Math.abs(prev)*100);
  if(Math.abs(pct)<0.1) return '<span class="growth-badge growth-eq">= 0%</span>';
  const sign = pct>0?'▲':'▼';
  const cls  = pct>0?'growth-up':'growth-dn';
  return `<span class="growth-badge ${cls}">${sign} ${Math.abs(pct).toFixed(1)}%</span>`;
}

function renderCmpMes() {
  const selBizs = S.businesses.filter(b=>cmpSelected.includes(b.id));
  if(!selBizs.length){ document.getElementById('cmpMesContent').innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:12px;">Selecciona al menos un negocio arriba</div>'; return; }

  const allMonths = [...new Set(
    S.ops.filter(o=>cmpSelected.includes(o.bizId)&&o.date).map(o=>o.date.slice(0,7))
  )].sort();

  const MN=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

  function bizMonthNeta(biz, month) {
    const ops = filterOpsByPeriod(S.ops.filter(o=>o.bizId===biz.id), cmpPeriod);
    const g = ops.reduce((s,o)=>{const x=opGanancia(o);return x>0?s+x:s;},0);
    const gs= ops.reduce((s,o)=>{const x=opGanancia(o);return x<0?s+Math.abs(x):s;},0);
    return g-gs;
  }

  // One table: months as rows, bizs as columns
  const maxAbs = Math.max(...allMonths.flatMap(m=>selBizs.map(b=>Math.abs(bizMonthNeta(b,m)))),1);

  let tableRows = allMonths.slice().reverse().map((m,ri)=>{
    const [y,mo]=m.split('-');
    const prev = allMonths[allMonths.length-2-ri]; // prev month in sorted list
    const cells = selBizs.map(biz=>{
      const cur  = bizMonthNeta(biz,m);
      const prv  = prev ? bizMonthNeta(biz,prev) : null;
      const pct  = Math.max(4,Math.round(Math.abs(cur)/maxAbs*100));
      const isPos= cur>=0;
      const col  = isPos?biz.color:'#ff6b6b';
      let delta='';
      if(prv!==null && prv!==0){
        const dp=((cur-prv)/Math.abs(prv)*100);
        const up=dp>=0;
        delta=`<span class="growth-badge ${up?'growth-up':'growth-dn'}" style="margin-left:4px">${up?'▲':'▼'}${Math.abs(dp).toFixed(0)}%</span>`;
      }
      return `<td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;">
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
          <div style="width:60px;height:6px;background:var(--s3);border-radius:3px;overflow:hidden;">
            <div style="width:${pct}%;height:100%;background:${col};border-radius:3px;opacity:.8;"></div>
          </div>
          <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:${col};white-space:nowrap;">${isPos?'+':''}${fmt(cur)}</span>
          ${delta}
        </div>
      </td>`;
    }).join('');
    return `<tr>
      <td style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;white-space:nowrap;color:var(--text2);">${MN[+mo-1]} ${y}</td>
      ${cells}
    </tr>`;
  }).join('');

  const thead = `<tr style="background:var(--s2);">
    <th style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);text-align:left;">Mes</th>
    ${selBizs.map(b=>`<th style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;text-align:right;">
      <span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:8px;height:8px;border-radius:2px;background:${b.color};display:inline-block"></span>${b.name}</span>
    </th>`).join('')}
  </tr>`;

  let html = `<div class="card" style="overflow-x:auto;">
    <div class="card-head"><span class="card-title">Utilidad neta por mes</span>
      <span style="font-size:10px;color:var(--text3)">% vs mes anterior · clic doble en año para seleccionar</span>
    </div>
    <table style="width:100%;border-collapse:collapse;"><thead>${thead}</thead><tbody>${tableRows}</tbody></table>
  </div>`;

  document.getElementById('cmpMesContent').innerHTML = html;
}

function renderCmpAño() {
  const selBizs = S.businesses.filter(b=>cmpSelected.includes(b.id));
  if(!selBizs.length){ document.getElementById('cmpAñoContent').innerHTML='<div style="padding:40px;text-align:center;color:var(--text3);font-size:12px;">Selecciona al menos un negocio arriba</div>'; return; }

  const allYears = [...new Set(
    S.ops.filter(o=>cmpSelected.includes(o.bizId)&&o.date).map(o=>o.date.slice(0,4))
  )].sort();

  const METRICS = [
    {key:'vol', label:'Volumen', color:'var(--blue)', fn:(ops)=>ops.reduce((s,o)=>s+opCobrado(o),0)},
    {key:'gan', label:'Ganancia', color:'var(--green)', fn:(ops)=>ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0)},
    {key:'gast',label:'Gastos', color:'var(--red)', fn:(ops)=>ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0)},
    {key:'neta',label:'Neta', color:'var(--gold)', fn:(ops)=>{const g=ops.reduce((s,o)=>{const x=opGanancia(o);return x>0?s+x:s;},0);const gs=ops.reduce((s,o)=>{const x=opGanancia(o);return x<0?s+Math.abs(x):s;},0);return g-gs;}},
  ];

  function bizYearOps(biz,year){ return S.ops.filter(o=>o.bizId===biz.id&&o.date?.startsWith(year)); }

  let html = '';
  METRICS.forEach(met=>{
    const maxVal = Math.max(...allYears.flatMap(y=>selBizs.map(b=>Math.abs(met.fn(bizYearOps(b,y))))),1);
    const theadCells = selBizs.map(b=>`<th style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;text-align:right;">
      <span style="display:inline-flex;align-items:center;gap:5px;justify-content:flex-end;"><span style="width:8px;height:8px;border-radius:2px;background:${b.color};display:inline-block"></span>${b.name}</span>
    </th>`).join('');

    const rows = allYears.slice().reverse().map((y,ri)=>{
      const prev = allYears[allYears.length-2-ri];
      const cells = selBizs.map(biz=>{
        const ops = bizYearOps(biz,y);
        const val = met.fn(ops);
        const prv = prev ? met.fn(bizYearOps(biz,prev)) : null;
        const pct = Math.max(4,Math.round(Math.abs(val)/maxVal*100));
        const isPos = val>=0;
        const col = isPos?met.color:'#ff6b6b';
        let delta='';
        if(prv!==null && prv!==0){
          const dp=((val-prv)/Math.abs(prv)*100);
          const up=dp>=0;
          delta=`<span class="growth-badge ${up?'growth-up':'growth-dn'}" style="margin-left:4px">${up?'▲':'▼'}${Math.abs(dp).toFixed(0)}%</span>`;
        }
        return `<td style="padding:8px 12px;border-bottom:1px solid var(--border);text-align:right;">
          <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
            <div style="width:60px;height:6px;background:var(--s3);border-radius:3px;overflow:hidden;">
              <div style="width:${pct}%;height:100%;background:${col};border-radius:3px;opacity:.8;"></div>
            </div>
            <span style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:${col};white-space:nowrap;">${isPos?'+':''}${fmt(val)}</span>
            ${delta}
          </div>
        </td>`;
      }).join('');
      return `<tr><td style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:11px;font-weight:600;color:var(--text2);">${y}</td>${cells}</tr>`;
    }).join('');

    html += `<div class="card" style="overflow-x:auto;margin-bottom:14px;">
      <div class="card-head"><span class="card-title" style="color:${met.color}">${met.label}</span>
        <span style="font-size:10px;color:var(--text3)">% vs año anterior</span>
      </div>
      <table style="width:100%;border-collapse:collapse;">
        <thead><tr style="background:var(--s2);">
          <th style="padding:10px 12px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--text3);text-align:left;">Año</th>
          ${theadCells}
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  });

  document.getElementById('cmpAñoContent').innerHTML = html;
}

// ════════════════════════════════════════════════════
//  BIZ VIEW — MONTHLY CHART (ganancia mes a mes)
// ════════════════════════════════════════════════════
function renderBizMonthlyChart(bizId) {
  const biz = S.businesses.find(b=>b.id===bizId); if(!biz) return;
  const container = document.getElementById('biz_monthly_'+bizId);
  if(!container) return;

  const allMonths = [...new Set(
    S.ops.filter(o=>o.bizId===bizId&&o.date).map(o=>o.date.slice(0,7))
  )].sort();

  if(!allMonths.length){ container.innerHTML=''; return; }

  const MN = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  // Una paleta de 12 colores distintos, uno por mes del año
  const MC = ['#f87171','#fb923c','#fbbf24','#84cc16',
               '#34d399','#22d3ee','#60a5fa','#818cf8',
               '#c084fc','#f472b6','#e879f9','#94a3b8'];

  // Calcular datos y delta vs mes anterior en la lista
  const rows = allMonths.map((m, i) => {
    const ops  = S.ops.filter(o=>o.bizId===bizId&&o.date?.startsWith(m));
    const gan  = ops.reduce((s,o)=>{ const g=opGanancia(o); return g>0?s+g:s; }, 0);
    const gast = ops.reduce((s,o)=>{ const g=opGanancia(o); return g<0?s+Math.abs(g):s; }, 0);
    const neta = gan - gast;
    const [y, mo] = m.split('-');
    const moIdx = +mo - 1;
    return { m, y, moIdx, neta, gan, gast, color: MC[moIdx], label: MN[moIdx] };
  });

  rows.forEach((d, i) => {
    if(i === 0) { d.delta = null; return; }
    const prev = rows[i-1];
    d.delta = (prev.neta === 0) ? null : ((d.neta - prev.neta) / Math.abs(prev.neta) * 100);
  });

  const maxAbs = Math.max(...rows.map(d=>Math.abs(d.neta)), 1);

  // Agrupar por año
  const byYear = {};
  rows.forEach(d => { (byYear[d.y] = byYear[d.y]||[]).push(d); });

  let html = `<div class="mu-wrap">
    <div class="mu-header">
      <div>
        <div class="mu-title">Utilidad mensual</div>
        <div class="mu-sub">${allMonths.length} mes${allMonths.length!==1?'es':''} con datos · comparativa vs mes anterior</div>
      </div>
    </div>`;

  Object.entries(byYear).sort().forEach(([yr, months]) => {
    html += `<div class="mu-year-sep">${yr}</div><div class="mu-grid">`;

    months.forEach(d => {
      const isPos   = d.neta >= 0;
      const barColor = isPos ? d.color : '#ff6b6b';
      const pct      = Math.max(3, Math.round(Math.abs(d.neta) / maxAbs * 100));
      const sign     = isPos ? '+' : '-';
      const valTxt   = sign + fmt(Math.abs(d.neta));

      // Badge de variación vs mes anterior
      let deltaBadge;
      if(d.delta === null) {
        deltaBadge = `<span class="mu-delta mu-delta-neutral">primer mes</span>`;
      } else {
        const abs = Math.abs(d.delta);
        const up  = d.delta >= 0;
        const cls = up ? 'mu-delta-up' : 'mu-delta-dn';
        const arrow = up ? '▲' : '▼';
        deltaBadge = `<span class="mu-delta ${cls}">${arrow} ${abs.toFixed(1)}%</span>`;
      }

      html += `<div class="mu-row">
        <div class="mu-label" style="color:${barColor}">${d.label}</div>
        <div class="mu-track">
          <div class="mu-bar" style="width:${pct}%;background:${barColor};opacity:${isPos?.9:.65}"></div>
        </div>
        <div class="mu-amount" style="color:${barColor}">${valTxt}</div>
        <div style="text-align:right">${deltaBadge}</div>
      </div>`;
    });

    html += `</div>`;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ════════════════════════════════════════════════════
//  COMPARATIVA
// ════════════════════════════════════════════════════
function buildCmpButtons() {
  const c=document.getElementById('cmpBizButtons'); c.innerHTML='';
  if(S.businesses.length===0){ c.innerHTML='<span style="font-size:11px;color:var(--text3)">Agrega negocios primero</span>'; return; }
  if(cmpSelected.length===0) cmpSelected=S.businesses.slice(0,Math.min(3,S.businesses.length)).map(b=>b.id);
  S.businesses.forEach(b=>{
    const btn=document.createElement('button');
    const isSel=cmpSelected.includes(b.id);
    btn.className='period-btn'+(isSel?' active':'');
    btn.style.borderColor=isSel?b.color:'';
    btn.style.color=isSel?b.color:'';
    btn.style.background=isSel?b.color+'22':'';
    btn.textContent=b.name;
    btn.onclick=()=>{
      if(cmpSelected.includes(b.id)) cmpSelected=cmpSelected.filter(x=>x!==b.id);
      else cmpSelected.push(b.id);
      buildCmpButtons(); renderComparativa();
    };
    c.appendChild(btn);
  });
}
function renderComparativa() {
  buildCmpButtons();
  if(cmpTab==='mes') { renderCmpMes(); return; }
  if(cmpTab==='año') { renderCmpAño(); return; }
  // Build comparativa period picker
  const cmpAllMonths = getMonthsFromOps(S.ops.filter(o=>cmpSelected.includes(o.bizId)));
  buildPeriodPicker('cmpPeriodChips', cmpAllMonths, cmpPeriod.sel, cmpPeriod.exp, ()=>renderComparativa());
  const selBizs=S.businesses.filter(b=>cmpSelected.includes(b.id));
  if(selBizs.length===0){ document.getElementById('cmpCards').innerHTML='<p style="color:var(--text3);font-size:12px;padding:8px">Selecciona al menos un negocio</p>'; return; }

  const bizData=selBizs.map(b=>{
    const ops=filterOpsByPeriod(S.ops.filter(o=>o.bizId===b.id), cmpPeriod);
    const vol =ops.reduce((s,o)=>s+opCobrado(o),0);
    const gan =ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
    const gast=ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
    const com =ops.reduce((s,o)=>s+(o.comision||0),0);
    const neta=gan-gast;
    const margen=vol>0?((neta/vol)*100).toFixed(1)+'%':'—';
    return{biz:b,vol,gan,gast,com,neta,margen,cnt:ops.length};
  });

  // Cards
  document.getElementById('cmpCards').innerHTML=bizData.map(d=>`
    <div class="cmp-card" style="border-top-color:${d.biz.color}">
      <div class="cmp-name" style="color:${d.biz.color}">${d.biz.name}</div>
      <div class="cmp-metric"><span class="lbl">Volumen</span><span class="val c-blue">${fmt(d.vol)}</span></div>
      <div class="cmp-metric"><span class="lbl">Comisiones</span><span class="val c-gold">${fmt(d.com)}</span></div>
      <div class="cmp-metric"><span class="lbl">Ganancias</span><span class="val c-green">${fmt(d.gan)}</span></div>
      <div class="cmp-metric"><span class="lbl">Gastos</span><span class="val c-red">${fmt(d.gast)}</span></div>
      <div class="cmp-metric"><span class="lbl">Neta</span><span class="val" style="color:${d.neta>=0?'var(--green)':'var(--red)'}">${fmt(d.neta)}</span></div>
      <div class="cmp-metric"><span class="lbl">Margen neto</span><span class="val">${d.margen}</span></div>
      <div class="cmp-metric"><span class="lbl">Operaciones</span><span class="val">${d.cnt}</span></div>
    </div>`).join('');

  // Bar comparativa
  const metrics=[
    {key:'vol',   label:'Volumen',    fn:d=>d.vol,   color:'var(--blue)'},
    {key:'gan',   label:'Ganancia',   fn:d=>d.gan,   color:'var(--green)'},
    {key:'gast',  label:'Gastos',     fn:d=>d.gast,  color:'var(--red)'},
    {key:'neta',  label:'Neta',       fn:d=>Math.abs(d.neta), color:'var(--gold)'},
  ];
  let barHTML='';
  metrics.forEach(m=>{
    const vals=bizData.map(d=>m.fn(d));
    const maxV=Math.max(...vals,1);
    barHTML+=`<div style="margin-bottom:14px"><div style="font-size:10px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:6px">${m.label}</div>`;
    bizData.forEach((d,i)=>{
      const pct=Math.round((vals[i]/maxV)*100);
      barHTML+=`<div class="bc-bar-row"><div class="bc-bar-label">${d.biz.name}</div>
        <div class="bc-bar-track"><div class="bc-bar-fill" style="width:${pct}%;background:${d.biz.color}"><span>${fmt(vals[i])}</span></div></div>
      </div>`;
    });
    barHTML+='</div>';
  });
  document.getElementById('cmpBarSection').innerHTML=`<div class="card-head"><span class="card-title">Comparativa Visual</span></div><div style="padding:14px 16px">${barHTML}</div>`;

  // Ranking table
  const sorted=[...bizData].sort((a,b)=>b.neta-a.neta);
  document.getElementById('cmpTableSection').innerHTML=`
    <div class="card-head"><span class="card-title">Ranking por Utilidad Neta</span></div>
    <table><thead><tr><th>#</th><th>Negocio</th><th>Volumen</th><th>Comisiones</th><th>Ganancia</th><th>Gastos</th><th>Neta</th><th>Margen</th><th>Ops</th></tr></thead>
    <tbody>${sorted.map((d,i)=>`<tr>
      <td style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:var(--text3)">${i+1}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${d.biz.color};display:inline-block"></span><strong>${d.biz.name}</strong></span></td>
      <td class="mono c-blue">${fmt(d.vol)}</td>
      <td class="mono c-gold">${fmt(d.com)}</td>
      <td class="mono c-green">${fmt(d.gan)}</td>
      <td class="mono c-red">${fmt(d.gast)}</td>
      <td class="mono" style="color:${d.neta>=0?'var(--green)':'var(--red)'}"><strong>${fmt(d.neta)}</strong></td>
      <td class="mono">${d.margen}</td>
      <td class="mono c-dim">${d.cnt}</td>
    </tr>`).join('')}</tbody></table>`;
}

// ════════════════════════════════════════════════════
//  OP MODAL
// ════════════════════════════════════════════════════
function openOpModal(bizId) {
  curBizId=bizId;
  const biz=S.businesses.find(b=>b.id===bizId);
  document.getElementById('opModalTitle').textContent='+ Operación — '+biz.name;
  document.getElementById('opDate').value=new Date().toISOString().split('T')[0];
  ['opDesc','opRef','opNotes','envCob','envPct','envEnv','envDest','envSoc',
   'camCob','camDep','camCT','camCU','camBanco','comMto','comPer','depMto','depOrig',
   'gastoMto','misCob','misPct','misSocio','trfMonto','trfComPct','trfMioPct','trfCanal',
   'crpCantidad','crpTasa','crpComPct','crpTasaProv'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  ['cpEnvC','cpEnvR','cpEnvG','cpCamCst','cpCamC','cpCamU','cpMisC','cpMisJT','cpMisR','cpTrfCC','cpTrfMia','cpTrfNeto','cpTrfDif','cpCrpPaga','cpCrpCom','cpCrpProv','cpCrpGan','cpCrpTotal'].forEach(id=>{ const el=document.getElementById(id); if(el) el.textContent='—'; });
  const defType={envio:'envio',cambio:'cambio',comision:'comision',misc:'misc',comercio:'deposito',transferencia:'transferencia',cripto:'cripto'}[biz.type]||'deposito';
  const sel=document.getElementById('opTypeSelect');
  if(sel){ sel.value=defType; }
  setOpType(defType);
  document.getElementById('opEditId').value='';
  document.getElementById('opDeleteBtn').style.display='none';
  populateOpClientSel(bizId);
  document.getElementById('opClientSel').value='';
  document.getElementById('opClientBadge').textContent='';
  populateOpTypeSelect(bizId);
  document.getElementById('opModal').classList.add('open');
}
function setOpType(t){
  curOpType=t;
  document.querySelectorAll('.cond-fields').forEach(el=>el.classList.remove('visible'));
  const el=document.getElementById('cf-'+t); if(el) el.classList.add('visible');
  // Re-apply client conditions whenever op type changes
  const clientId=document.getElementById('opClientSel')?.value;
  if(clientId) applyClientConds();
}
function closeOpModal(){ document.getElementById('opModal').classList.remove('open'); }

function calcEnvio(){
  const c=+document.getElementById('envCob').value||0;
  const p=+document.getElementById('envPct').value||0;
  const com=c*(p/100), ret=c-com;
  const env=+document.getElementById('envEnv').value||ret;
  const sp=+document.getElementById('envSoc').value||0;
  const gan=com*(1-sp/100);
  document.getElementById('cpEnvC').textContent=fmt(com);
  document.getElementById('cpEnvR').textContent=fmt(ret);
  document.getElementById('cpEnvG').textContent=fmt(gan);
  document.getElementById('envEnv').placeholder=fmt(ret);
}
function calcCambio(){
  const c=+document.getElementById('camCob').value||0;
  const d=+document.getElementById('camDep').value||0;
  const ct=+document.getElementById('camCT').value||0;
  const cu=+document.getElementById('camCU').value||0;
  const cst=(c>0&&d>0)?((1-d/c)*100):0;
  document.getElementById('cpCamCst').textContent=cst.toFixed(2)+'%';
  document.getElementById('cpCamC').textContent=fmt(c*(ct/100));
  document.getElementById('cpCamU').textContent=fmt(c*(cu/100));
}
function calcTransferencia(){
  const m=+document.getElementById('trfMonto').value||0;
  const cp=+document.getElementById('trfComPct').value||0;
  const mp=+document.getElementById('trfMioPct').value||0;
  const comCliente=m*(cp/100);
  const miGanancia=m*(mp/100);
  const neto=m-comCliente;
  const dif=comCliente-miGanancia;
  document.getElementById('cpTrfCC').textContent=fmt(comCliente);
  document.getElementById('cpTrfMia').textContent=fmt(miGanancia);
  document.getElementById('cpTrfNeto').textContent=fmt(neto);
  document.getElementById('cpTrfDif').textContent=fmt(dif);
}
function calcMisc(){
  const c=+document.getElementById('misCob').value||0;
  const p=+document.getElementById('misPct').value||0;
  const com=c*(p/100);
  document.getElementById('cpMisC').textContent=fmt(com);
  document.getElementById('cpMisJT').textContent=fmt(com*0.6);
  document.getElementById('cpMisR').textContent=fmt(c-com);
}


function calcCripto(){
  const cant  = +document.getElementById('crpCantidad').value||0;
  const tasa  = +document.getElementById('crpTasa').value||0;       // MXN/cripto que cobra al cliente
  const pct   = +document.getElementById('crpComPct').value||0;     // % comision
  const tasaP = +document.getElementById('crpTasaProv').value||tasa; // MXN/cripto del proveedor
  // Cliente paga: cant * tasa * (1 + pct/100)
  const clientePaga = cant * tasa * (1 + pct/100);
  const comision    = cant * tasa * (pct/100);
  // Proveedor: compro toda la crypto (cant) al precio del proveedor
  const pagoProv = cant * tasaP;
  const ganancia = clientePaga - pagoProv;
  document.getElementById('cpCrpPaga').textContent  = fmt(clientePaga);
  document.getElementById('cpCrpCom').textContent   = fmt(comision);
  document.getElementById('cpCrpProv').textContent  = fmt(pagoProv);
  document.getElementById('cpCrpGan').textContent   = fmt(ganancia);
  const coin = document.getElementById('crpCoin').value;
  document.getElementById('cpCrpTotal').textContent = cant ? cant.toFixed(6)+' '+coin : '—';
}
function saveOp(){
  const date=document.getElementById('opDate').value;
  const desc=document.getElementById('opDesc').value.trim();
  if(!date||!desc){alert('Fecha y descripción son requeridas.');return;}
  const ref=document.getElementById('opRef').value.trim();
  const notes=document.getElementById('opNotes').value.trim();
  const clientId=document.getElementById('opClientSel')?.value||'';
  let op={bizId:curBizId,date,tipo:curOpType,desc,ref,notes,clientId};

  if(curOpType==='envio'){
    const c=+document.getElementById('envCob').value||0; if(!c){alert('Ingresa el monto cobrado.');return;}
    const p=+document.getElementById('envPct').value||0;
    const com=c*(p/100),ret=c-com,env=+document.getElementById('envEnv').value||ret,sp=+document.getElementById('envSoc').value||0;
    Object.assign(op,{cobrado:c,comPct:p,comision:com,retorno:ret,enviado:env,faltaSobra:ret-env,ganancia:com*(1-sp/100),moneda:document.getElementById('envMon').value,destino:document.getElementById('envDest').value,socio:sp});
  } else if(curOpType==='cambio'){
    const c=+document.getElementById('camCob').value||0; if(!c){alert('Ingresa el monto cobrado.');return;}
    const d=+document.getElementById('camDep').value||0,ct=+document.getElementById('camCT').value||0,cu=+document.getElementById('camCU').value||0;
    Object.assign(op,{cobrado:c,depositado:d,camCT:ct,camCU:cu,comision:c*(ct/100),utilidad:c*(cu/100),banco:document.getElementById('camBanco').value,moneda:document.getElementById('camMon').value});
  } else if(curOpType==='comision'){
    const m=+document.getElementById('comMto').value||0; if(!m){alert('Ingresa el monto.');return;}
    Object.assign(op,{monto:m,moneda:document.getElementById('comMon').value,periodo:document.getElementById('comPer').value,fechaPago:document.getElementById('comFP').value});
  } else if(curOpType==='deposito'){
    const m=+document.getElementById('depMto').value||0; if(!m){alert('Ingresa el monto.');return;}
    Object.assign(op,{monto:m,moneda:document.getElementById('depMon').value,depOrigen:document.getElementById('depOrig').value});
  } else if(curOpType==='gasto'){
    const m=+document.getElementById('gastoMto').value||0; if(!m){alert('Ingresa el monto.');return;}
    Object.assign(op,{gastoMto:m,gastoMon:document.getElementById('gastoMon').value,gastoCat:document.getElementById('gastoCat').value});
  } else if(curOpType==='misc'){
    const c=+document.getElementById('misCob').value||0; if(!c){alert('Ingresa el monto.');return;}
    const p=+document.getElementById('misPct').value||0,com=c*(p/100);
    Object.assign(op,{cobrado:c,misComPct:p,comision:com,jt:com*0.6,retorno:c-com,misTipo:document.getElementById('misTipo').value,misSocio:document.getElementById('misSocio').value,moneda:document.getElementById('misMon').value});
  }

  if(curOpType==='transferencia'){
    const m=+document.getElementById('trfMonto').value||0; if(!m){alert('Ingresa el monto.');return;}
    const cp=+document.getElementById('trfComPct').value||0;
    const mp=+document.getElementById('trfMioPct').value||0;
    const comCliente=m*(cp/100), miGanancia=m*(mp/100);
    Object.assign(op,{cobrado:m,trfComPct:cp,trfMioPct:mp,comision:comCliente,ganancia:miGanancia,trfNeto:m-comCliente,trfDif:comCliente-miGanancia,canal:document.getElementById('trfCanal').value,moneda:document.getElementById('trfMon').value});
  } else if(curOpType==='cripto'){
    const cant=+document.getElementById('crpCantidad').value||0; if(!cant){alert('Ingresa la cantidad de crypto.');return;}
    const tasa=+document.getElementById('crpTasa').value||0; if(!tasa){alert('Ingresa el tipo de cambio.');return;}
    const pct=+document.getElementById('crpComPct').value||0;
    const tasaP=+document.getElementById('crpTasaProv').value||tasa;
    const clientePaga=cant*tasa*(1+pct/100);
    const comision=cant*tasa*(pct/100);
    const pagoProv=cant*tasaP;
    const crpGanancia=clientePaga-pagoProv;
    const coin=document.getElementById('crpCoin').value;
    Object.assign(op,{cobrado:clientePaga,crpCantidad:cant,crpCoin:coin,crpTasa:tasa,crpComPct:pct,crpTasaProv:tasaP,comision:comision,crpGanancia:crpGanancia,crpPagoProv:pagoProv,monedaRecib:document.getElementById('crpMonRecib').value});
  }

  const editId=document.getElementById('opEditId').value;
  if(editId){
    // Edit mode — replace op in array
    const idx=S.ops.findIndex(o=>o.id===editId);
    if(idx>=0) S.ops[idx]={...S.ops[idx],...op,id:editId};
  } else {
    S.ops.push({id:'o'+Date.now()+'_'+Math.random().toString(36).slice(2),...op});
  }
  save(); closeOpModal();
  populateResMonth();
  buildBizMpicker(curBizId);
  renderBiz(curBizId);
  renderResumen();
  const navEl=document.querySelector(`[data-view="biz_${curBizId}"]`);
  showView('biz_'+curBizId, navEl);
}

function editOp(opId){
  const op=S.ops.find(o=>o.id===opId); if(!op) return;
  curBizId=op.bizId;
  const biz=S.businesses.find(b=>b.id===op.bizId); if(!biz) return;
  // Reset all fields first
  ['opDesc','opRef','opNotes','envCob','envPct','envEnv','envDest','envSoc',
   'camCob','camDep','camCT','camCU','camBanco','comMto','comPer','depMto','depOrig',
   'gastoMto','misCob','misPct','misSocio','trfMonto','trfComPct','trfMioPct','trfCanal',
   'crpCantidad','crpTasa','crpComPct','crpTasaProv'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  // Set common fields
  document.getElementById('opModalTitle').textContent='✎ Editar — '+biz.name;
  document.getElementById('opDate').value=op.date||'';
  document.getElementById('opRef').value=op.ref||'';
  document.getElementById('opDesc').value=op.desc||'';
  document.getElementById('opNotes').value=op.notes||'';
  document.getElementById('opEditId').value=opId;
  document.getElementById('opDeleteBtn').style.display='inline-flex';
  // Set type
  const sel=document.getElementById('opTypeSelect');
  if(sel) sel.value=op.tipo;
  setOpType(op.tipo);
  // Load type-specific fields
  if(op.tipo==='envio'){
    document.getElementById('envCob').value=op.cobrado||'';
    document.getElementById('envPct').value=op.comPct||'';
    document.getElementById('envEnv').value=op.enviado||'';
    document.getElementById('envDest').value=op.destino||'';
    document.getElementById('envSoc').value=op.socio||'';
    document.getElementById('envMon').value=op.moneda||'MXN';
    calcEnvio();
  } else if(op.tipo==='cambio'){
    document.getElementById('camCob').value=op.cobrado||'';
    document.getElementById('camDep').value=op.depositado||'';
    document.getElementById('camCT').value=op.camCT||'';
    document.getElementById('camCU').value=op.camCU||'';
    document.getElementById('camBanco').value=op.banco||'';
    document.getElementById('camMon').value=op.moneda||'MXN';
    calcCambio();
  } else if(op.tipo==='comision'){
    document.getElementById('comMto').value=op.monto||'';
    document.getElementById('comMon').value=op.moneda||'MXN';
    document.getElementById('comPer').value=op.periodo||'';
    document.getElementById('comFP').value=op.fechaPago||'';
  } else if(op.tipo==='deposito'){
    document.getElementById('depMto').value=op.monto||'';
    document.getElementById('depMon').value=op.moneda||'MXN';
    document.getElementById('depOrig').value=op.depOrigen||'';
  } else if(op.tipo==='gasto'){
    document.getElementById('gastoMto').value=op.gastoMto||'';
    document.getElementById('gastoMon').value=op.gastoMon||'MXN';
    document.getElementById('gastoCat').value=op.gastoCat||'Otro';
  } else if(op.tipo==='misc'){
    document.getElementById('misCob').value=op.cobrado||'';
    document.getElementById('misPct').value=op.misComPct||'';
    document.getElementById('misTipo').value=op.misTipo||'Otro';
    document.getElementById('misSocio').value=op.misSocio||'';
    document.getElementById('misMon').value=op.moneda||'MXN';
    calcMisc();
  } else if(op.tipo==='transferencia'){
    document.getElementById('trfMonto').value=op.cobrado||'';
    document.getElementById('trfComPct').value=op.trfComPct||'';
    document.getElementById('trfMioPct').value=op.trfMioPct||'';
    document.getElementById('trfCanal').value=op.canal||'';
    document.getElementById('trfMon').value=op.moneda||'MXN';
    calcTransferencia();
  } else if(op.tipo==='cripto'){
    document.getElementById('crpCantidad').value=op.crpCantidad||'';
    document.getElementById('crpTasa').value=op.crpTasa||'';
    document.getElementById('crpComPct').value=op.crpComPct||'';
    document.getElementById('crpTasaProv').value=op.crpTasaProv||'';
    document.getElementById('crpCoin').value=op.crpCoin||'USDT';
    document.getElementById('crpMonRecib').value=op.monedaRecib||'MXN';
    calcCripto();
  }
  populateOpClientSel(op.bizId);
  if(op.clientId) document.getElementById('opClientSel').value=op.clientId;
  const badge=document.getElementById('opClientBadge');
  if(badge) {
    const cl=S.clients.find(c=>c.id===op.clientId);
    badge.textContent=cl?.phone||'';
  }
  document.getElementById('opModal').classList.add('open');
}
function deleteOpFromModal(){
  const opId=document.getElementById('opEditId').value; if(!opId) return;
  if(!confirm('¿Eliminar esta operación?')) return;
  S.ops=S.ops.filter(o=>o.id!==opId); save();
  closeOpModal();
  populateResMonth(); renderBiz(curBizId); renderResumen();
  const navEl=document.querySelector(`[data-view="biz_${curBizId}"]`);
  showView('biz_'+curBizId, navEl);
}
function delOp(opId,bizId){
  if(!confirm('¿Eliminar esta operación?'))return;
  S.ops=S.ops.filter(o=>o.id!==opId); save();
  populateResMonth();
  buildBizMpicker(bizId);
  renderBiz(bizId);
  renderResumen();
  renderClientes();
  if(curClientId) renderClientDetail();
  const navEl=document.querySelector(`[data-view="biz_${bizId}"]`);
  showView('biz_'+bizId, navEl);
}
function navToBiz(bizId){
  const navEl=document.querySelector(`[data-view="biz_${bizId}"]`);
  showView('biz_'+bizId, navEl);
}

// ════════════════════════════════════════════════════
//  BIZ MODAL
// ════════════════════════════════════════════════════
function buildColorPicker(){
  const c=document.getElementById('colorPicker'); c.innerHTML='';
  COLORS.forEach(col=>{
    const s=document.createElement('div');
    s.className='cswatch'+(col===selColor?' sel':''); s.style.background=col;
    s.onclick=()=>{ selColor=col; document.querySelectorAll('.cswatch').forEach(x=>x.classList.remove('sel')); s.classList.add('sel'); };
    c.appendChild(s);
  });
}
function openAddBiz(){
  selColor=COLORS[S.businesses.length%COLORS.length];
  buildColorPicker();
  ['bizName','bizDesc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('bizType').value='envio';
  document.getElementById('bizCurrency').value='MXN';
  document.getElementById('bizEditId').value='';
  document.getElementById('bizModalTitle').textContent='Nuevo Negocio';
  document.getElementById('bizDeleteBtn').style.display='none';
  document.getElementById('bizModal').classList.add('open');
}
function openEditBiz(e, bizId){
  e.stopPropagation();
  const biz=S.businesses.find(b=>b.id===bizId); if(!biz) return;
  selColor=biz.color;
  buildColorPicker();
  document.getElementById('bizName').value=biz.name;
  document.getElementById('bizDesc').value=biz.desc||'';
  document.getElementById('bizType').value=biz.type;
  document.getElementById('bizCurrency').value=biz.currency||'MXN';
  document.getElementById('bizEditId').value=bizId;
  document.getElementById('bizModalTitle').textContent='Editar Negocio';
  document.getElementById('bizDeleteBtn').style.display='inline-flex';
  document.getElementById('bizModal').classList.add('open');
}
function toggleHideBiz(e, bizId){
  e.stopPropagation();
  const biz=S.businesses.find(b=>b.id===bizId); if(!biz) return;
  biz.hidden=!biz.hidden;
  save(); buildNav(); buildBizViews(); renderAll();
  showToast(biz.hidden?`${biz.name} ocultado`:`${biz.name} visible`, 'ok');
}
function deleteBiz(){
  const bizId=document.getElementById('bizEditId').value; if(!bizId) return;
  const biz=S.businesses.find(b=>b.id===bizId); if(!biz) return;
  if(!confirm(`¿Eliminar "${biz.name}"? También se eliminarán sus ${S.ops.filter(o=>o.bizId===bizId).length} operaciones.`)) return;
  S.businesses=S.businesses.filter(b=>b.id!==bizId);
  S.ops=S.ops.filter(o=>o.bizId!==bizId);
  save(); closeBizModal(); rebuildAll();
  showToast(`${biz.name} eliminado`, 'ok');
}
function closeBizModal(){ document.getElementById('bizModal').classList.remove('open'); }
function saveBiz(){
  const name=document.getElementById('bizName').value.trim();
  if(!name){alert('Escribe un nombre.');return;}
  const editId=document.getElementById('bizEditId').value;
  if(editId){
    // Edit mode
    const biz=S.businesses.find(b=>b.id===editId); if(!biz) return;
    biz.name=name;
    biz.type=document.getElementById('bizType').value;
    biz.currency=document.getElementById('bizCurrency').value;
    biz.color=selColor;
    biz.desc=document.getElementById('bizDesc').value.trim();
    save(); closeBizModal();
    buildNav(); buildBizViews(); populateResMonth(); renderAll();
    showToast(`${name} actualizado`, 'ok');
  } else {
    // Create mode
    const biz={id:'b'+Date.now()+'_'+Math.random().toString(36).slice(2),name,type:document.getElementById('bizType').value,currency:document.getElementById('bizCurrency').value,color:selColor,desc:document.getElementById('bizDesc').value.trim(),hidden:false,createdAt:new Date().toISOString()};
    S.businesses.push(biz); save(); closeBizModal();
    buildNav(); buildBizViews(); populateResMonth(); renderAll();
    const navEl=document.querySelector(`[data-view="biz_${biz.id}"]`);
    setTimeout(()=>showView('biz_'+biz.id, navEl),30);
  }
}

// ════════════════════════════════════════════════════
//  PDF REPORT
// ════════════════════════════════════════════════════
function openPdfModal(){
  const grid=document.getElementById('pdfBizChecks'); grid.innerHTML='';
  S.businesses.forEach(b=>{
    const lbl=document.createElement('label');
    lbl.className='biz-check sel';
    lbl.innerHTML=`<input type="checkbox" value="${b.id}" checked><span style="width:8px;height:8px;border-radius:50%;background:${b.color};display:inline-block"></span>${b.name}`;
    lbl.querySelector('input').onchange=(e)=>lbl.classList.toggle('sel',e.target.checked);
    grid.appendChild(lbl);
  });
  document.getElementById('pdfModal').classList.add('open');
}
function closePdfModal(){ document.getElementById('pdfModal').classList.remove('open'); }
function setPeriod(btn,p){
  pdfPeriod=p;
  document.querySelectorAll('.period-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('customDateRange').style.display=p==='custom'?'block':'none';
}
function checkAllBiz(v){
  document.querySelectorAll('#pdfBizChecks input').forEach(cb=>{cb.checked=v;cb.closest('.biz-check').classList.toggle('sel',v);});
}
function getDateRange(){
  const today=new Date(); const todayStr=today.toISOString().split('T')[0];
  if(pdfPeriod==='semana'){
    const start=new Date(today); start.setDate(today.getDate()-today.getDay());
    return{from:start.toISOString().split('T')[0],to:todayStr,label:'Semana actual'};
  } else if(pdfPeriod==='mes'){
    const start=new Date(today.getFullYear(),today.getMonth(),1);
    return{from:start.toISOString().split('T')[0],to:todayStr,label:today.toLocaleDateString('es',{month:'long',year:'numeric'})};
  } else if(pdfPeriod==='año'){
    return{from:today.getFullYear()+'-01-01',to:todayStr,label:'Año '+today.getFullYear()};
  } else {
    return{from:document.getElementById('pdfFrom').value||'2024-01-01',to:document.getElementById('pdfTo').value||todayStr,label:'Personalizado'};
  }
}

// ── SVG chart helpers ───────────────────────────────
function svgDonut(segs, size=90) {
  if(!segs.length) return `<svg width="${size}" height="${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2-8}" fill="none" stroke="#e8ecf5" stroke-width="12"/></svg>`;
  const r=size/2-8, cx=size/2, cy=size/2, circ=2*Math.PI*r;
  const total=segs.reduce((s,g)=>s+g.val,0); if(!total) return '';
  let parts='', offset=0;
  segs.forEach(seg=>{
    const dash=(seg.val/total)*circ;
    parts+=`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="12" stroke-dasharray="${dash.toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" stroke-linecap="butt"/>`;
    offset+=dash;
  });
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform:rotate(-90deg)">${parts}</svg>`;
}

function svgBarChart(months, values, color, w=220, h=60) {
  if(!values.length) return '';
  const max=Math.max(...values,1);
  const bw=Math.floor((w-10)/values.length)-3;
  const bars=values.map((v,i)=>{
    const bh=Math.round((v/max)*(h-16));
    const x=5+i*(bw+3), y=h-bh-4;
    const lbl=months[i]||'';
    return `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="2" fill="${color}" opacity="${bh>0?'1':'.2'}"/>
    <text x="${x+bw/2}" y="${h}" text-anchor="middle" font-size="7" fill="#9aa0b8">${lbl}</text>`;
  }).join('');
  return `<svg width="${w}" height="${h+6}" viewBox="0 0 ${w} ${h+6}" style="overflow:visible">${bars}</svg>`;
}

function svgHorizBar(val, max, color, w=140, h=10) {
  const fill=max>0?Math.max(4,(val/max)*w):0;
  return `<svg width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${h/2}" fill="#f0f2f8"/><rect width="${fill.toFixed(1)}" height="${h}" rx="${h/2}" fill="${color}"/></svg>`;
}

function opTypeBadgeHtml(tipo) {
  const MAP={envio:['#2a6fcc','#dbeafe','Envío'],cambio:['#7c5cbf','#ede9fe','Cambio'],comision:['#d4952a','#fef3c7','Comisión'],deposito:['#1a9e6e','#d1fae5','Depósito'],gasto:['#d94040','#fee2e2','Gasto'],misc:['#c8620a','#ffedd5','Misc'],transferencia:['#0e7490','#cffafe','Transfer.'],cripto:['#c2600a','#ffedd5','Cripto']};
  const [fg,bg,label]=MAP[tipo]||['#5a6480','#e8ecf5',tipo];
  return `<span class="pr-badge" style="background:${bg};color:${fg}">${label}</span>`;
}

function generatePDF(){
  const selectedBizIds=[...document.querySelectorAll('#pdfBizChecks input:checked')].map(cb=>cb.value);
  if(selectedBizIds.length===0){alert('Selecciona al menos un negocio.');return;}
  const{from,to,label}=getDateRange();
  const incStats=document.getElementById('pdfIncStats').checked;
  const incOps=document.getElementById('pdfIncOps').checked;
  const incCmp=document.getElementById('pdfIncCmp').checked;
  const selBizs=S.businesses.filter(b=>selectedBizIds.includes(b.id));
  const genDate=new Date().toLocaleDateString('es',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  // ── Totals ────────────────────────────────────────
  let totVol=0,totGan=0,totGast=0,totCom=0,totOps=0;
  const bizData=selBizs.map(b=>{
    const ops=S.ops.filter(o=>o.bizId===b.id&&o.date>=from&&o.date<=to);
    const vol=ops.reduce((s,o)=>s+opCobrado(o),0);
    const gan=ops.reduce((s,o)=>{const g=opGanancia(o);return g>0?s+g:s;},0);
    const gast=ops.reduce((s,o)=>{const g=opGanancia(o);return g<0?s+Math.abs(g):s;},0);
    const com=ops.reduce((s,o)=>s+(o.comision||0),0);
    totVol+=vol; totGan+=gan; totGast+=gast; totCom+=com; totOps+=ops.length;
    return{b,ops,vol,gan,gast,com,neta:gan-gast};
  });
  const totNeta=totGan-totGast;

  // ── Cover ─────────────────────────────────────────
  let html=`
  <div class="rpt-cover">
    <div>
      <div class="rpt-cover-title">Reporte de Operaciones</div>
      <div class="rpt-cover-sub">${selBizs.map(b=>`<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${b.color};margin-right:4px;vertical-align:middle"></span>${b.name}`).join(' &nbsp;')}</div>
    </div>
    <div class="rpt-cover-period">
      <div class="rpt-cover-period-label">Período</div>
      <div class="rpt-cover-period-val">${label}</div>
      <div style="font-size:9px;color:rgba(255,255,255,.4);margin-top:3px">${from} → ${to}</div>
      <div style="font-size:9px;color:rgba(255,255,255,.3);margin-top:8px">Generado ${genDate}</div>
    </div>
  </div>`;

  // ── KPI cards ────────────────────────────────────
  if(incStats){
    const kpis=[
      {lbl:'Volumen Total', val:fmt(totVol), sub:totOps+' operaciones', bg:'#dbeafe', bc:'#2a6fcc', vc:'#1e3a8a'},
      {lbl:'Comisiones',    val:fmt(totCom), sub:'cobradas al cliente', bg:'#fef3c7', bc:'#d4952a', vc:'#78350f'},
      {lbl:'Ganancias',     val:fmt(totGan), sub:'ingresos positivos',  bg:'#d1fae5', bc:'#1a9e6e', vc:'#064e3b'},
      {lbl:'Gastos',        val:fmt(totGast),sub:'salidas de efectivo', bg:'#fee2e2', bc:'#d94040', vc:'#7f1d1d'},
      {lbl:'Utilidad Neta', val:fmt(totNeta),sub:totNeta>=0?'resultado positivo':'resultado negativo', bg:totNeta>=0?'#d1fae5':'#fee2e2', bc:totNeta>=0?'#1a9e6e':'#d94040', vc:totNeta>=0?'#064e3b':'#7f1d1d'},
    ];
    html+=`<div class="pr-kpis">${kpis.map(k=>`
      <div class="pr-kpi" style="background:${k.bg};border-left-color:${k.bc}">
        <div class="pr-kpi-lbl" style="color:${k.vc}">${k.lbl}</div>
        <div class="pr-kpi-val" style="color:${k.vc}">${k.val}</div>
        <div class="pr-kpi-sub" style="color:${k.vc}">${k.sub}</div>
      </div>`).join('')}</div>`;

    // ── Charts row ─────────────────────────────────
    // Donut: ganancia por negocio
    const bizSegs=bizData.filter(d=>d.gan>0).map(d=>({val:d.gan,color:d.b.color,name:d.b.name}));
    const donutBiz=svgDonut(bizSegs,90);
    const legendBiz=bizSegs.slice(0,5).map(s=>`<div class="dl-row"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-name">${s.name}</span><span class="dl-val">${fmt(s.val)}</span></div>`).join('');

    // Donut: ganancia vs gasto
    const balSegs=[{val:totGan,color:'#1a9e6e',name:'Ganancias'},{val:totGast,color:'#d94040',name:'Gastos'}].filter(s=>s.val>0);
    const donutBal=svgDonut(balSegs,90);
    const legendBal=balSegs.map(s=>`<div class="dl-row"><span class="dl-dot" style="background:${s.color}"></span><span class="dl-name">${s.name}</span><span class="dl-val">${fmt(s.val)}</span></div>`).join('');

    // Bar chart: ganancia mensual (last 6 months in range or all)
    const allOpsInRange=S.ops.filter(o=>selectedBizIds.includes(o.bizId)&&o.date>=from&&o.date<=to);
    const monthMap={};
    allOpsInRange.forEach(o=>{
      const mk=o.date.slice(0,7);
      if(!monthMap[mk]) monthMap[mk]={gan:0,gast:0};
      const g=opGanancia(o);
      if(g>0) monthMap[mk].gan+=g; else monthMap[mk].gast+=Math.abs(g);
    });
    const sortedMonths=Object.keys(monthMap).sort();
    const MNAMES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const barMonths=sortedMonths.map(m=>MNAMES[+m.split('-')[1]-1]);
    const barValsGan=sortedMonths.map(m=>monthMap[m].gan);
    const barValsGast=sortedMonths.map(m=>monthMap[m].gast);
    const barSvgGan=svgBarChart(barMonths,barValsGan,'#1a9e6e',260,60);
    const barSvgGast=svgBarChart(barMonths,barValsGast,'#d94040',260,60);

    html+=`<div class="rpt-section-title">Análisis Visual del Período</div>
    <div class="rpt-charts-row">
      <div class="rpt-chart-card" style="flex:1.1">
        <div class="rpt-chart-title">Ganancias por Negocio</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${donutBiz}
          <div style="flex:1">${legendBiz||'<span style="font-size:9px;color:#9aa0b8">Sin datos</span>'}</div>
        </div>
      </div>
      <div class="rpt-chart-card" style="flex:.8">
        <div class="rpt-chart-title">Balance General</div>
        <div style="display:flex;align-items:center;gap:12px">
          ${donutBal}
          <div style="flex:1">${legendBal}</div>
        </div>
      </div>
      <div class="rpt-chart-card" style="flex:1.4">
        <div class="rpt-chart-title">Ganancias por Mes</div>
        ${barSvgGan}
        <div class="rpt-chart-title" style="margin-top:8px">Gastos por Mes</div>
        ${barSvgGast}
      </div>
    </div>`;

    // ── Biz comparison bars ─────────────────────────
    if(selBizs.length>1){
      const maxBizGan=Math.max(...bizData.map(d=>d.gan),1);
      html+=`<div class="rpt-section-title">Comparativa de Negocios</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:20px;">
        ${bizData.map(d=>`
          <div style="border:1px solid #e8ecf5;border-radius:10px;padding:12px;border-top:3px solid ${d.b.color}">
            <div style="font-size:11px;font-weight:700;color:${d.b.color};margin-bottom:8px">${d.b.name}</div>
            <div style="font-size:9px;color:#9aa0b8;margin-bottom:2px">Ganancia</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              ${svgHorizBar(d.gan,maxBizGan,d.b.color,120,8)}
              <span style="font-size:9px;font-family:'IBM Plex Mono';color:#2a3050;font-weight:600">${fmt(d.gan)}</span>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:9px">
              <div><span style="color:#9aa0b8">Volumen</span><br><strong>${fmt(d.vol)}</strong></div>
              <div><span style="color:#9aa0b8">Neta</span><br><strong style="color:${d.neta>=0?'#1a9e6e':'#d94040'}">${fmt(d.neta)}</strong></div>
              <div><span style="color:#9aa0b8">Comisiones</span><br><strong>${fmt(d.com)}</strong></div>
              <div><span style="color:#9aa0b8">Ops</span><br><strong>${d.ops.length}</strong></div>
            </div>
          </div>`).join('')}
      </div>`;
    }
  }

  // ── Per-biz sections ─────────────────────────────
  html+=`<div class="rpt-section-title">Detalle por Negocio</div>`;
  bizData.forEach(({b,ops,vol,gan,gast,com,neta})=>{
    // Per-biz month chart
    const bizMonthMap={};
    ops.forEach(o=>{
      const mk=o.date?.slice(0,7)||'';
      if(!mk) return;
      if(!bizMonthMap[mk]) bizMonthMap[mk]={gan:0};
      const g=opGanancia(o); if(g>0) bizMonthMap[mk].gan+=g;
    });
    const bMonths=Object.keys(bizMonthMap).sort();
    const MNAMES=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const bBarSvg=bMonths.length>1?svgBarChart(bMonths.map(m=>MNAMES[+m.split('-')[1]-1]),bMonths.map(m=>bizMonthMap[m].gan),b.color,160,40):'';

    html+=`<div class="pr-biz-section">
      <div class="pr-biz-header" style="background:${b.color}0d">
        <div>
          <div class="pr-biz-name" style="color:${b.color}">${b.name}</div>
          <div class="pr-biz-type">${bizTypeLabel(b.type)} · ${b.currency||''}</div>
        </div>
        ${bBarSvg?`<div>${bBarSvg}</div>`:''}
      </div>
      <div class="pr-biz-kpis">
        <div class="pr-biz-kpi"><div class="pr-biz-kpi-lbl">Volumen</div><div class="pr-biz-kpi-val" style="color:#2a6fcc">${fmt(vol)}</div></div>
        <div class="pr-biz-kpi"><div class="pr-biz-kpi-lbl">Comisiones</div><div class="pr-biz-kpi-val" style="color:#d4952a">${fmt(com)}</div></div>
        <div class="pr-biz-kpi"><div class="pr-biz-kpi-lbl">Ganancias</div><div class="pr-biz-kpi-val" style="color:#1a9e6e">${fmt(gan)}</div></div>
        <div class="pr-biz-kpi"><div class="pr-biz-kpi-lbl">Utilidad Neta</div><div class="pr-biz-kpi-val" style="color:${neta>=0?'#1a9e6e':'#d94040'}">${fmt(neta)}</div></div>
      </div>`;

    if(incOps&&ops.length>0){
      const sorted=[...ops].sort((a,b)=>a.date.localeCompare(b.date));
      html+=`<table><thead><tr>
        <th>Fecha</th><th>Descripción</th><th>Tipo</th><th>Cobrado</th><th>Comisión</th><th>Ganancia</th>
      </tr></thead><tbody>`;
      sorted.forEach((op,i)=>{
        const g=opGanancia(op);
        const rowBg=i%2===0?'':'background:#fafbff';
        html+=`<tr style="${rowBg}">
          <td style="color:#7a86a8;font-family:'IBM Plex Mono'">${op.date||''}</td>
          <td>${op.desc||''}</td>
          <td>${opTypeBadgeHtml(op.tipo)}</td>
          <td style="font-family:'IBM Plex Mono';color:#2a6fcc">${fmt(opCobrado(op))}</td>
          <td style="font-family:'IBM Plex Mono';color:#d4952a">${fmt(op.comision||0)}</td>
          <td style="font-family:'IBM Plex Mono';color:${g>=0?'#1a9e6e':'#d94040'};font-weight:600">${g>=0?'+':''}${fmt(g)}</td>
        </tr>`;
      });
      html+=`</tbody></table>`;
    } else if(!incOps){
      html+=`<div style="padding:10px 16px;font-size:9px;color:#9aa0b8">${ops.length} operaciones en el período.</div>`;
    }
    html+=`</div>`;
  });

  // ── Comparativa table ────────────────────────────
  if(incCmp&&selBizs.length>1){
    html+=`<div class="rpt-section-title">Tabla Comparativa</div>
    <div class="pr-biz-section">
      <table><thead><tr>
        <th>Negocio</th><th>Tipo</th><th>Volumen</th><th>Comisiones</th><th>Ganancias</th><th>Gastos</th><th>Neta</th><th>Ops</th>
      </tr></thead><tbody>`;
    bizData.forEach(({b,vol,gan,gast,com,neta,ops},i)=>{
      html+=`<tr style="${i%2===0?'':'background:#fafbff'}">
        <td><span class="cmp-badge" style="background:${b.color}"></span>${b.name}</td>
        <td style="color:#9aa0b8;font-size:9px">${bizTypeLabel(b.type)}</td>
        <td style="font-family:'IBM Plex Mono';color:#2a6fcc">${fmt(vol)}</td>
        <td style="font-family:'IBM Plex Mono';color:#d4952a">${fmt(com)}</td>
        <td style="font-family:'IBM Plex Mono';color:#1a9e6e">${fmt(gan)}</td>
        <td style="font-family:'IBM Plex Mono';color:#d94040">${fmt(gast)}</td>
        <td style="font-family:'IBM Plex Mono';color:${neta>=0?'#1a9e6e':'#d94040'};font-weight:700">${fmt(neta)}</td>
        <td style="font-family:'IBM Plex Mono'">${ops.length}</td>
      </tr>`;
    });
    html+=`</tbody></table></div>`;
  }

  html+=`<div class="pr-footer">
    <strong>Operaciones — Panel de Negocios</strong> &nbsp;·&nbsp; ${new Date().toLocaleString('es')}
    &nbsp;·&nbsp; ${totOps} operaciones · ${selBizs.length} negocio${selBizs.length!==1?'s':''}
  </div>`;

  document.getElementById('printArea').innerHTML=html;
  closePdfModal();
  setTimeout(()=>window.print(),120);
}

// ════════════════════════════════════════════════════
//  MODAL CLOSE ON BACKDROP
// ════════════════════════════════════════════════════
['opModal','bizModal','pdfModal'].forEach(id=>{
  document.getElementById(id).addEventListener('click',e=>{ if(e.target===e.currentTarget) document.getElementById(id).classList.remove('open'); });
});

// ════════════════════════════════════════════════════
//  FULL REBUILD
// ════════════════════════════════════════════════════
function rebuildAll(){
  buildNav(); buildBizViews(); populateResMonth(); cmpSelected=[];
  renderAll();
  showView('resumen', document.querySelector('[data-view="resumen"]'));
}
function renderAll(){
  renderResumen();
  S.businesses.forEach(b=>{ buildBizMpicker(b.id); renderBiz(b.id); });
  renderClientes();
}

// ════════════════════════════════════════════════════
//  INIT
// ════════════════════════════════════════════════════

// ════════════════════════════════════════════════════
//  MOBILE DRAWER
// ════════════════════════════════════════════════════
function toggleMobileDrawer() {
  const d = document.getElementById('mobileDrawer');
  if (!d) return;
  const opening = !d.classList.contains('open');
  d.classList.toggle('open');
  // Prevent body scroll when drawer is open
  document.body.style.overflow = opening ? 'hidden' : '';
  if (opening) _syncMobileDrawerNav();
}

function _syncMobileDrawerNav() {
  const target = document.getElementById('mobileDrawerNav');
  if (!target) return;

  // Clone sidebar nav groups
  const groups = document.querySelectorAll('aside .nav-group');
  target.innerHTML = '';
  groups.forEach(g => {
    const clone = g.cloneNode(true);
    // Ensure nav labels show
    clone.querySelectorAll('.nav-label').forEach(l => l.style.display = '');
    // Hide action buttons that don't work well in drawer
    clone.querySelectorAll('.nav-item-actions').forEach(a => a.remove());
    // Close drawer on nav click
    clone.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
      item.addEventListener('click', () => {
        document.body.style.overflow = '';
        document.getElementById('mobileDrawer').classList.remove('open');
      });
    });
    target.appendChild(clone);
  });

  // Sync user badge
  const badge = document.getElementById('userBadge');
  const mobileBadge = document.getElementById('mobileUserBadge');
  if (badge && mobileBadge) mobileBadge.textContent = badge.textContent;

  // Sync month label
  const ml = document.getElementById('monthLabel');
  const mlm = document.getElementById('monthLabelMobile');
  if (ml && mlm) mlm.textContent = ml.textContent;
}

function _checkMobileBtn() {
  // FAB visibility handled by CSS media query
}

async function init(){
  loadTheme();

  // ── Auth gate ──────────────────────────────────
  if (window.DB) {
    const sess = window.DB.getSession();
    if (!sess) {
      showLoginScreen();
      return;
    }
    // Session exists → load data
    let data = null;
    try { data = await window.DB.dbLoad(); }
    catch(e) {
      console.warn('[init] dbLoad error:', e.message);
      // Token inválido → forzar re-login
      showLoginScreen();
      return;
    }
    applyLoaded(data);
    hideLoginScreen(sess.email);
  } else {
    load();
  }
  currentDate = new Date();
  showingAllMonths = true;
  buildNav(); buildBizViews(); populateResMonth(); buildMpicker(); renderAll();
  updateMonthLabel();
  renderYearSummary();
  // Restore custom type badge CSS
  (S.customOpTypes||[]).forEach(t=>ensureCustomBadgeCSS(t.id,t.color));
  _checkMobileBtn();
}
// init() called from index.html
