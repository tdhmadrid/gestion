# Negocios Panel

Panel de operaciones multi-negocio · GitHub Pages + Supabase

## Estructura

```
negocios-panel/
├── index.html   — UI completa
├── app.js       — Lógica de la app
├── db.js        — Persistencia (Supabase + localStorage)
├── _headers     — Headers para GitHub Pages
└── README.md
```

---

## 1 · Configurar Supabase

### Crear la tabla (SQL Editor en Supabase)

```sql
CREATE TABLE user_data (
  user_id     TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_own_data" ON user_data
  FOR ALL USING (true) WITH CHECK (true);
```

### Poner tus credenciales en db.js

```js
const SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGci...';
```

Encuéntralas en: **Supabase → Project Settings → API**

---

## 2 · Deploy en GitHub Pages

```bash
git init && git add . && git commit -m "init"
gh repo create negocios-panel --public --push --source=.
# Luego: GitHub → Settings → Pages → Branch: main / root
```

URL final: `https://TU_USUARIO.github.io/negocios-panel/`

---

## 3 · Usuario anónimo

- Al abrir la app por primera vez se genera un UUID único guardado en `localStorage` como `negocios_user_id`
- Ese UUID identifica al usuario en Supabase sin necesidad de cuenta
- Para migrar datos entre dispositivos: usa **Exportar / Importar** en el panel

---

## 4 · Autosave

- Cada cambio guarda automáticamente con **1.5s de debounce**
- Indicador en sidebar: `⟳ Guardando…` → `✓ Guardado HH:MM`
- Offline: guarda solo en localStorage hasta recuperar conexión
- Al reabrir: carga desde Supabase y sincroniza localStorage

---

## 5 · Desarrollo local

```bash
python3 -m http.server 8080
# o: npx serve .
```

No abrir el HTML directamente como `file://` (bloquea fetch a Supabase).
