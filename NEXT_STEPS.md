# Siguientes pasos — PIT WALL

Hola Nico. La migración del monolito ya está hecha. Ya tenés `pitwall/` con la estructura modular y todos los datos partidos correctamente (validado: SEASONS, CAL_DATA, POSITIONS, SPRINTS, TRACKS, FLAGS, FLAG_SVGS, DRIVERS_INFO y TEAMS_INFO están referenciados sin errores por `app.js`, y cada `.js` parsea limpio con `node --check`).

Faltan tres cosas que no pude hacer yo desde el sandbox: **(1)** limpiar una carpeta `.git` rota, **(2)** instalar las herramientas locales, **(3)** publicar en GitHub. Abajo están los comandos exactos.

---

## 0. Limpiar la carpeta `.git` rota

Intenté inicializar git, pero el mount de Windows no le gustó a git (problema de CRLF en el config). Dentro de `pitwall/` quedó una carpeta `.git` incompleta que tenés que borrar antes de seguir:

- Abrí `C:\Users\usuario\Desktop\proyecto f1\pitwall\` en el Explorador.
- Activá "Ver → Elementos ocultos" si hace falta (la carpeta `.git` está oculta).
- Click derecho sobre `.git` → Eliminar.

---

## 1. Instalar las herramientas (una sola vez)

1. **Git** → https://git-scm.com/download/win — instalador para Windows. Next, Next, Next con los defaults.
2. **Node.js LTS** → https://nodejs.org — bajá la versión LTS e instalala.
3. **Visual Studio Code** → https://code.visualstudio.com
4. **Claude Code CLI** → abrí una terminal (PowerShell o CMD) y corré:
   ```powershell
   npm install -g @anthropic-ai/claude-code
   ```

### Extensiones recomendadas de VS Code

Desde VS Code → Extensions (Ctrl+Shift+X), buscá e instalá:
- `ritwickdey.LiveServer` — preview local con auto-refresh
- `esbenp.prettier-vscode` — formateo automático
- `eamodio.gitlens` — historial visual

---

## 2. Inicializar git y primer commit

Abrí una terminal (PowerShell) **dentro de `C:\Users\usuario\Desktop\proyecto f1\pitwall`** (click derecho en la carpeta con Shift → "Abrir ventana de PowerShell aquí", o `cd` desde la terminal):

```powershell
cd "C:\Users\usuario\Desktop\proyecto f1\pitwall"

git init -b main
git config user.name "Nicolas"
git config user.email "nicolasdomsch@gmail.com"

git add .
git commit -m "migracion a estructura modular"
```

---

## 3. Subirlo a GitHub

### 3.1. Crear el repo en github.com

1. Entrá a https://github.com (registrate si todavía no tenés cuenta).
2. Click en "New repository" (botón verde arriba a la derecha).
3. Nombre: `pitwall`. Descripción (opcional): "F1 2021-2026 — progresión de pilotos y constructores".
4. Dejalo **Público** (necesario para GitHub Pages gratis).
5. **NO** tildes "Add README", "Add .gitignore" ni licencia (ya los tenemos).
6. Click en "Create repository".

### 3.2. Conectar el repo local con GitHub

GitHub te va a mostrar un bloque que dice "…or push an existing repository from the command line". Copiá esos comandos (o usá estos, reemplazando `TU_USUARIO` por tu usuario de GitHub):

```powershell
git remote add origin https://github.com/TU_USUARIO/pitwall.git
git push -u origin main
```

La primera vez te va a pedir que te autentiques. Si te abre el navegador, autorizá; si no, usá un Personal Access Token (Settings → Developer settings → Personal access tokens → Fine-grained tokens → crear uno con permisos "Contents: read and write" sobre el repo `pitwall`).

### 3.3. Activar GitHub Pages

1. En tu repo de GitHub → **Settings** (engranaje arriba).
2. En el menú lateral → **Pages**.
3. En "Build and deployment" → Source: **Deploy from a branch**.
4. Branch: **main** / folder: **/ (root)** → Save.
5. Esperá ~1-2 minutos. Arriba va a aparecer: *"Your site is live at `https://TU_USUARIO.github.io/pitwall/`"*.

Listo, esa URL es tu PIT WALL en vivo.

---

## 4. Preview local (antes de pushear)

Abrí la carpeta `pitwall/` en VS Code. Click derecho sobre `index.html` → **Open with Live Server**. Se abre en el navegador con auto-refresh cada vez que guardás.

---

## 5. Workflow post-carrera (lo más importante)

Este es el workflow que te ahorra tokens. Después de cada GP:

```powershell
cd "C:\Users\usuario\Desktop\proyecto f1\pitwall"
claude
```

Se abre Claude Code. Le decís algo como:

> Agregá los resultados del GP de Miami 2026:
> P1 ANT, P2 RUS, P3 NOR, P4 PIA, ...
> Actualizá SEASONS['2026'].drivers (puntos + cum) y POSITIONS['2026'] (posiciones).
> Si el fin de semana tiene sprint, también SPRINTS['2026'].

Claude Code va a editar **solo `js/data.js`** con un diff quirúrgico. Vas a ver el diff antes de aceptar. Después:

```powershell
git add .
git commit -m "R6 Miami results"
git push
```

GitHub Pages se actualiza solo en 1-2 minutos.

---

## 6. Ahorro real de tokens

| Acción                       | Antes (monolito) | Ahora (modular)    |
|------------------------------|------------------|--------------------|
| Sumar resultados de un GP    | 385 KB           | 68 KB (data.js)    |
| Feature nueva en la UI       | 385 KB           | 37 KB (app.js)     |
| Fix de CSS                   | 385 KB           | 3 KB (styles.css)  |
| Nuevo piloto/equipo          | 385 KB           | 12 KB (drivers-info.js) |

**Ahorro promedio: ~90% por interacción.**

---

## 7. Bonus — borrar el archivo monolítico original

Cuando confirmes que todo funciona (preview local + GitHub Pages OK), podés borrar `f1_pitwall_2021_2026.html` del escritorio. El nuevo `pitwall/index.html` lo reemplaza y es mucho más fácil de mantener.

---

## Si algo falla

- **La página carga pero sin datos / charts vacíos**: abrí las DevTools del navegador (F12) → tab Console. Si ves `ReferenceError: SEASONS is not defined`, es que los `<script>` se están cargando en el orden equivocado. El orden en `index.html` tiene que ser: `data.js` → `assets.js` → `drivers-info.js` → `app.js`.
- **GitHub Pages muestra 404**: esperá un par de minutos más, a veces tarda. Si sigue, verificá en Settings → Pages que el branch sea `main` y el path `/`.
- **`git push` rechaza porque "main" ya existe en remoto**: hacé `git pull origin main --allow-unrelated-histories` primero, después `git push`.
