# PIT WALL — CLAUDE.md

App personal de estadísticas de F1, temporadas 1950–2026. Este archivo es un
registro vivo del proyecto: arquitectura, esquema de datos, cómo correr todo,
convenciones, y un changelog de decisiones. Mantenelo actualizado (ver
instrucción al final).

## 1. Arquitectura

Dos partes que **no corren juntas en producción**:

### Frontend estático (`docs/`) — lo que sirve GitHub Pages

- Vanilla JS, sin build step. Todo el código de la app vive en un único
  archivo: `docs/js/app.js` (navegación, cálculo de stats, charts, render de
  HTML por template strings).
- `docs/js/api.js` **no llama al backend**: hace `fetch()` de JSON estáticos
  en `docs/data/` (`init.json` al arrancar, `data/seasons/{year}.json` on
  demand vía `window.loadYearData(year)`, cacheado en memoria por año).
- Tailwind CSS vía CDN (`cdn.tailwindcss.com`, config inline en
  `docs/index.html`) + Chart.js vía CDN (`cdnjs.cloudflare.com`) +
  `flag-icons` vía CDN. `docs/css/styles.css` para estilos propios.
- `docs/circuits/*.svg` (44 trazados) y assets de circuitos.
- Esto es todo lo que GitHub Pages sirve. No requiere backend ni DB para
  funcionar — es 100% estático una vez exportado el JSON.

### Backend (`backend/`) — SOLO corre local, nunca en producción/CI

- FastAPI + SQLAlchemy + SQLite (`f1.db` en la raíz del repo).
- Su único propósito real es **admin.html**: cargar resultados de un GP a
  mano después de que termina. `docs/admin.html` pega directo a
  `http://localhost:8000/api/admin/...` (ver `backend/routes/admin.py`).
- `backend/routes/data.py` expone endpoints `/api/seasons/{year}`,
  `/api/drivers`, etc. equivalentes a lo que hace `export_static.py`, pero
  **el frontend no los usa** — quedaron del diseño original (antes de que se
  agregara el export estático) y hoy sirven sobre todo para probar `crud.py`
  directamente. `backend/main.py` también monta `docs/` como estático y
  sirve `index.html`/`admin.html` en `/` y `/admin` para desarrollo local,
  pero eso no es cómo se sirve en producción (esos son GitHub Pages).
- Todo el cálculo de standings (puntos acumulados, podios, etc.) vive en
  `backend/crud.py`, corriendo contra la DB — no hay valores pre-calculados
  guardados en las tablas.

### `export_static.py` — el puente entre ambos

Lee `f1.db` (vía los mismos `crud.py` que usa el backend) y escribe:
- `docs/data/init.json`
- `docs/data/seasons/{year}.json` (uno por temporada)

Se corre a mano después de cargar resultados en el admin. El output se
commitea al repo; eso es lo que efectivamente actualiza la app pública.

### `f1.db`

Gitignoreada (ver `.gitignore`). Vive solo en la máquina del dueño. **No
existe en el repo ni en CI** — si falta, el backend la crea vacía al arrancar
(`Base.metadata.create_all` en `main.py`) pero sin datos no sirve para nada
salvo cargar resultados nuevos sobre una DB ya poblada por el dueño.

## 2. Esquema de datos

### Tablas (`backend/models.py`)

| Tabla | PK | Campos relevantes |
|---|---|---|
| `Driver` | `id` (3 letras, ej `VER`) | `name`, `nationality`, `flag` (ISO-2), `number`, `dob`, `debut_year`, `biography` |
| `Team` | `id` (3 letras, ej `MCL`) | `display_name` (ej `MCLAREN`), `full_name`, `base`, `principal`, `founded`, `engine`, `biography` |
| `Circuit` | `id` (3 letras, ej `AUS`) | `name` (nombre del GP), `circuit_name` (nombre del trazado), `city`, `flag`, `length`, `turns`, `laps` |
| `Season` | `year` | `champion_driver_id`, `champion_constructor_id` (FK, nullable) |
| `SeasonTeamColor` | `id` autoincr | `year`, `team_id`, `color` — color de equipo por temporada (único por `year`+`team_id`) |
| `RaceCalendar` | `id` autoincr | `year`, `round`, `circuit_id`, `race_date` (string display, ej `"2 Mar"`), `is_sprint`, `event_description`, `race_hour_utc` — único por `year`+`round` |
| `RaceResult` | `id` autoincr | `race_id`, `driver_id`, `team_id`, `position_text`, `points`, `grid_position`, `quali_position`, `fastest_lap` — único por `race_id`+`driver_id` |
| `SprintResult` | `id` autoincr | igual que `RaceResult` sin `grid_position`/`quali_position`/`fastest_lap` — único por `race_id`+`driver_id` |

Todos los IDs internos (drivers, teams, circuits) son **códigos de 3
letras** (`VER`, `MCL`, `AUS`). Verificado contra la DB: sin excepciones en
293 drivers, 14 teams, 57 circuits.

`RaceResult` tiene tres campos "extendidos" (`grid_position`, `quali_position`,
`fastest_lap`) que **solo se cargan de 2025 en adelante** — el histórico
1980-2024 queda congelado sin ellos. `grid_position` ya existía (vacío en toda
la DB histórica); `quali_position` (clasificación final de quali) y
`fastest_lap` (`1` = hizo la vuelta rápida, `NULL` = sin dato) se agregaron en
la Feature D (ver changelog 2026-07-15) para que la automatización futura
(GitHub Action + API Jolpica) los llene. La carga manual de respaldo vive en el
admin panel (columnas Grid/Quali/VR). El viejo campo `RaceResult.laps` (distinto
de `Circuit.laps`, que sí se usa) se **eliminó** en esa tarea: estaba 100% vacío
y ninguna vista lo consumía. Pit stops quedaron **fuera de alcance** a propósito
(1:N por piloto → tabla entera, sin vista que los muestre).

`Driver.dob` **sí existe** en el esquema (a diferencia de lo que se asumía en
una tarea anterior) y está poblado para 190/293 pilotos — pero de los 18
campeones de mundo en la DB, 5 no tienen `dob` cargado (`MSC`, `HIL`, `VIL`,
`BUT`, `ROS`). Por eso el récord "campeón más joven/más viejo" quedó afuera
de la página de Récords: no es que falte la columna, es que los datos están
incompletos justo donde más importan. Pendiente completarlo (posible fuente:
API de Jolpica, que incluye fecha de nacimiento) antes de agregar ese récord.

`Driver.name` tiene una gap de datos separada y más amplia: **más de 100
pilotos** tienen `name` igual a su `id` (ej. `MSC` en vez de "Michael
Schumacher" — confirmado que es él por sus stats: 91 victorias / 155 podios
coinciden exactamente con su récord real). Esto es preexistente y afecta
toda la app (standings, comparador, récords), no algo introducido en una
tarea puntual — si se corrige, hacerlo en una tarea de datos dedicada, no de
paso.

Counts actuales (referencia, van a crecer): 77 temporadas (1950-2026), 1160
carreras, 26266 resultados de carrera, 562 resultados de sprint, 734 pilotos,
91 circuitos, 139 team_ids distintos en resultados (la tabla `teams` tiene
solo los 14 vigentes con metadata completa; los equipos históricos/desaparecidos
existen únicamente como `team_id` en `race_results`, ver nota sobre nombres de
equipo abajo). Los counts de 1950-1979 vienen del backfill (ver changelog
2026-07-17).

### Shape de los JSON exportados (`docs/data/`)

**`init.json`** (cargado una sola vez al arrancar):
```json
{
  "seasons_list": {
    "2026": {"champion_driver": "", "champion_constructor": "", "races": ["AUS", "CHN", "..."]}
  },
  "circuits": {"AUS": {"name": "...", "circuit": "...", "city": "...", "length": "...", "turns": 14, "laps": 58}},
  "drivers": {"VER": {"name": "...", "nat": "...", "flag": "nl", "num": 1, "dob": "1997-09-30", "debut": 2015, "bio": "..."}},
  "teams": {"MER": {"name": "...", "displayName": "MERCEDES", "base": "...", "principal": "...", "founded": "2010", "engine": "...", "bio": "..."}},
  "flags": {"AUS": "au"}
}
```

**`seasons/{year}.json`** (cargado on-demand por año):
```json
{
  "season": {
    "champion_driver": "NOR",
    "champion_constructor": "",
    "races": ["AUS", "CHN", "..."],
    "drivers": [{"id": "NOR", "name": "L. Norris", "team": "McLAREN", "total": 423.0, "cum": [25.0, 44.0, "..."], "color": "#FF8700"}],
    "constructors": [{"id": "MCL", "name": "McLAREN", "total": 640.0, "cum": ["..."], "color": "#FF8700"}],
    "completed": 9
  },
  "positions": {"ALB": ["5", "7", "R", "..."]},
  "calendar": [{"id": "AUS", "date": "16 Mar", "round": 1, "event": "...", "sprint": true, "hour_utc": 5}],
  "sprints": {"1": {"ALB": "11", "VER": "3", "...": "..."}},
  "race_constructors": {"LAW": {"0": "RBR", "1": "RBR"}},
  "extended": true,
  "grid": {"VER": ["1", "3", "", "..."]},
  "quali": {"VER": ["1", "2", "", "..."]},
  "fastest_laps": {"0": "VER", "3": "HAM"}
}
```

Notas sobre el shape:
- `season.drivers[].cum` es puntaje acumulado carrera a carrera (para el
  chart de trayectoria), calculado en `crud.py`, no almacenado.
- `season.completed` solo aparece si la temporada está en curso (carreras
  con resultados < carreras totales del calendario); en temporadas
  cerradas la clave no está.
- `positions` mapea `driver_id → [posición por ronda]`, en el mismo orden
  que `season.races`/`calendar`.
- `calendar[].sprint` y `.hour_utc` son opcionales (solo si aplica).
- `sprints` mapea `índice_de_ronda (string) → {driver_id: posición}`.
- `race_constructors` solo incluye pilotos/rondas donde el equipo difiere
  del equipo primario de esa temporada (cambios de equipo a mitad de año).
- **`extended`** (bool, siempre presente): `true` si la temporada tiene datos
  de grid/quali/vuelta rápida (2025+), `false` si no (histórico congelado). El
  frontend usa este flag para mostrar u ocultar las vistas de grid/quali/VR. Se
  **deriva de los datos** (¿hay alguna fila con esos campos?), no está
  hardcodeado al año, así que se autocorrige si se backfilleara una temporada.
- **`grid`** / **`quali`** (solo si `extended`): espejo de `positions`
  (`driver_id → [valor por ronda]`, mismo orden, valores string). `""` marca
  una **ausencia puntual** (ese piloto/ronda sin dato) dentro de una temporada
  que sí tiene datos — distinto de `extended: false` (temporada entera sin
  datos). Los pilotos sin ningún dato en la columna se omiten del objeto.
- **`fastest_laps`** (solo si `extended`): `índice_de_ronda (string, 0-based) →
  driver_id` que hizo la vuelta rápida esa ronda (uno por carrera; rondas sin
  dato se omiten). Mismo indexado que `sprints`.
- Cuando `extended` es `false`, las claves `grid`/`quali`/`fastest_laps` **no
  aparecen** (se omiten para no inflar los ~45 JSON históricos).

**`records.json`** (récords históricos, precalculado por era — igual que el
resto de `docs/data/`, el frontend no calcula nada, solo filtra por era y
renderiza):
```json
{
  "eras": [
    {"id": "all", "label": "Todo (1980-2026)"},
    {"id": "1980s", "label": "1980s"},
    {"id": "v10", "label": "V10 (1995-2005)"}
  ],
  "records": {
    "all": {
      "most_wins_drivers": [{"id": "HAM", "name": "L. Hamilton", "wins": 106}],
      "most_wins_teams": [{"id": "MCL", "name": "McLAREN", "wins": 174}],
      "most_podiums_drivers": [{"id": "HAM", "name": "L. Hamilton", "podiums": 207}],
      "most_podiums_teams": [{"id": "FER", "name": "FERRARI", "podiums": 576}],
      "win_streak": {"driver_id": "VER", "driver_name": "M. Verstappen", "streak": 10, "from_year": 2023, "from_round": 5, "to_year": 2023, "to_round": 14},
      "title_margin": {"year": 2023, "champion_id": "VER", "champion_name": "M. Verstappen", "champion_points": 575.0, "runnerup_id": "PER", "runnerup_name": "S. Pérez", "runnerup_points": 285.0, "margin": 290.0}
    }
  }
}
```
Notas:
- Eras: 5 décadas + 4 eras técnicas (V10 1995-2005, V8 2006-2013,
  turbo-híbrida 2014-2025, reglamento 2026+) + `all` (rango completo real de
  la DB, no hardcodeado). Definidas en `ERAS` en `export_static.py` —
  tocar ahí si cambia el reglamento.
- Leaderboards (`most_wins_*`, `most_podiums_*`) truncados a top 10.
- `title_margin` es `null` si la era no tiene ningún título ya decidido
  (`Season.champion_driver_id` vacío) — por ejemplo la temporada en curso.
- Podios calculados con el mismo criterio robusto que
  `get_driver_history` (`position_text` numérico y `<= 3`, nunca un código
  de `NON_FINISH_CODES`).

## 3. Cómo correr todo

Ver `START.md` para el detalle día a día. Resumen:

**Ver la app tal cual la ve un visitante** (sin backend, sin DB):
```bash
# abrir docs/index.html directamente, o
python -m http.server --directory docs
```

**Backend local** (necesario solo para cargar resultados nuevos):
```bash
cd backend
pip install -r requirements.txt   # primera vez
uvicorn main:app --reload
# http://localhost:8000       → app (sirve docs/index.html)
# http://localhost:8000/admin → panel de carga
```

**Flujo después de un GP:**
1. Backend corriendo → `http://localhost:8000/admin`
2. Seleccionar temporada/carrera, cargar posiciones (`P1`-`P20` o código de
   no-clasificación), guardar → escribe en `f1.db`.
3. Exportar a JSON estático y commitear:
   ```bash
   python export_static.py
   git add docs/data
   git commit -m "GP results: <nombre>"
   git push
   ```
4. GitHub Pages sirve los datos nuevos automáticamente — no hay paso de
   deploy aparte.

**Automatización 2025+ (`.github/workflows/sync-results.yml`):** para las
temporadas gestionadas por Jolpica (2025 en adelante), el flujo de arriba es
el respaldo manual — normalmente no hace falta tocarlo. El Action:
- Corre solo (cron `0 6 * * 1`, lunes 06:00 UTC) contra el año actual.
- **Disparo manual**: pestaña *Actions* → *Sync resultados F1 (Jolpica)* →
  *Run workflow* → opcional, el año a sincronizar (vacío = año actual). O
  por CLI: `gh workflow run sync-results.yml -f year=2025`.
- Orquesta `scripts/sync_jolpica.py`, que hace todo el trabajo real
  (validación, mapeo, escritura). El workflow solo interpreta su exit code:
  `0` → comitea `docs/data/` y pushea a `main` (redeploya Pages solo);
  `3` → sin novedades, job termina verde sin comitear nada; cualquier otro
  código (`1` documentado, o inesperado como el `2` de un `--year` mal
  formado) → **el job falla** (notificación por mail de GitHub) y no
  comitea nada.
- **Si falla**: la causa típica es un piloto/equipo/circuito nuevo que
  debutó y todavía no está en `scripts/jolpica_map.json` (ver el log del
  paso *"Correr sync_jolpica.py"* del run que falló para el id exacto que
  falta). Arreglo:
  1. `python scripts/validate_map.py <year>` en local — confirma exactamente
     qué falta.
  2. Agregar la entrada en `scripts/jolpica_map.json` (ver su clave `_doc`
     para el proceso).
  3. Commitear y pushear ese cambio a `main`.
  4. Volver a disparar el workflow a mano (no hace falta esperar al lunes
     que viene).
  Otras causas menos comunes: la carrera recién terminó y Jolpica todavía
  no cargó el resultado completo (no es error real — `sync_jolpica.py` lo
  trata como "pendiente" con un margen de 48h, así que si pasa de eso sí
  falla de verdad); o un desajuste entre los puntos recalculados y los
  standings oficiales de Jolpica (posible bug de mapeo o de la lógica de
  puntos — revisar el mensaje de error, que lista los IDs con diferencia).

## 4. Convenciones

- **`position_text`**: string, o bien un número de posición (`"1"`–`"20"`,
  sin ceros a la izquierda) o un código de no-clasificación. Los códigos
  válidos viven en `NON_FINISH_CODES`, definida en dos lugares que **deben
  mantenerse espejados a mano** (no hay build step que los comparta):
  - `backend/constants.py` (usada por `crud.py` para excluir de cálculos)
  - `docs/js/app.js` (usada por el frontend para DNF/orden/display)

  Cualquier código nuevo que aparezca en datos históricos debe agregarse en
  ambos lados. Los cálculos de podio/posición en `crud.py` y `app.js` están
  escritos para ser robustos por construcción ante códigos no listados
  (filtran por "es numérico" en vez de por membresía negativa en una lista),
  así que un código nuevo no reconocido nunca cuenta como podio — pero sí
  puede quedar mal clasificado en DNF/orden de display hasta que se agregue
  a la constante.
- **Histórico 1980–2024**: cargado a mano desde fuentes externas durante la
  migración inicial y considerado **congelado** — no se vuelve a tocar salvo
  que se encuentre un error puntual de datos. El trabajo activo es cargar
  cada GP de la temporada en curso (2026 en adelante) a través del admin
  panel.
- **Histórico 1950–1979**: cargado por backfill automatizado vía Jolpica-F1
  (changelog 2026-07-17), también **congelado**. Nombres de equipo: los
  equipos desaparecidos usan su nombre completo en MAYÚSCULA como `team_id`
  (`BRABHAM`, `TEAM LOTUS`, `MASERATI`...), sin fila en `teams` — el display
  cae al propio id. Los constructores están unificados por marca de chasis
  (un `team_id` por marca, no por combinación chasis-motor). El Campeonato de
  Constructores de esta era usa reglas propias en `crud.py` (solo mejor auto
  por equipo + descarte), ver changelog.
- IDs internos de driver/team/circuit son siempre 3 letras mayúsculas.
- **Mapeo Jolpica-F1 → IDs internos** (`scripts/jolpica_map.json`, alcance
  SOLO 2025/2026): antes de que la automatización cargue un resultado nuevo,
  correr `python scripts/validate_map.py <year>` — si falta un
  driverId/constructorId/circuitId de Jolpica en el mapeo, el script falla y
  lista exactamente qué falta. Agregar la entrada en `jolpica_map.json`
  (ver la clave `_doc` ahí para el proceso completo) y volver a correr para
  confirmar. Esto pasa cada vez que debuta un piloto/equipo nuevo o llega
  una temporada nueva.

## 5. Changelog de decisiones

- **2026-04-18** — Migración a estructura modular (`9dba97c`).
- **2026-05-14** — Migración completa de archivos JS estáticos a backend
  FastAPI + SQLAlchemy + SQLite con panel de administración (`552da5b`),
  eliminando los scripts de migración one-off (`f51207c`). Motivo: antes
  había que revisar pestaña por pestaña a mano después de cada GP porque los
  datos no estaban conectados entre sí.
- **2026-05-14** — Se agrega export estático (`export_static.py` →
  `docs/data/*.json`) para que la app funcione sin backend, pensado para
  GitHub Pages (`6808c5a`). El backend pasa a ser una herramienta exclusiva
  del dueño para cargar resultados, no parte del serving path público.
- **2026-05-14** — Rename `pitwall/` → `docs/` para que GitHub Pages sirva
  directo desde la carpeta estándar (`97e69cf`).
- **2026-06-02 a 2026-07-06** — Carga incremental de la temporada 2026 GP a
  GP (Canadá, Mónaco, Barcelona, Austria, Silverstone con sprint) vía el
  flujo admin → `export_static.py` → commit de `docs/data/`.
- **2026-07-15** — Auditoría de `backend/crud.py`: se migraron los tres
  lugares que armaban cláusulas SQL `IN (...)` por interpolación de string a
  bind parameters (`bindparam(expanding=True)`) como buena práctica, sin
  cambio de comportamiento (no había inyección real: los `race_id` siempre
  vienen de la propia DB).
- **2026-07-15** — Se encontró y arregló un bug real en
  `get_driver_history` (cálculo de podios): `CAST(position_text AS INTEGER)`
  sobre códigos como `'DSQ'` da `0` en SQLite, y `0 <= 3` es verdadero, así
  que carreras descalificadas contaban como podio (confirmado con HAM 2023:
  contaba 7 podios, el real es 6, por su DSQ en Austin). Se cambió el
  filtro a "es numérico Y <= 3" (`GLOB '[0-9]*'`) para que sea robusto por
  construcción ante cualquier código de no-clasificación, presente o
  futuro. De paso se creó `backend/constants.py` con `NON_FINISH_CODES`
  (códigos reales encontrados en la DB: `R`, `D`, `W`, `DNS`, `DSQ`, `E`,
  `F`, `N`, más `EX` que documenta `admin.html` aunque no aparece aún en los
  datos) y se unificaron 5 listas de códigos dispersas e inconsistentes
  entre sí en `docs/js/app.js` en una sola constante — la inconsistencia
  también era un bug real: dos funciones de stats no contaban `DSQ`/`W`/`D`
  como DNF, y otra no contaba `DSQ`.
- **2026-07-15** — Se agregó la vista "Grilla de Resultados" (pilotos ×
  carreras, celda coloreada por resultado, estilo web oficial de F1),
  accesible con un botón nuevo en la página de Standings
  (`openResultsGrid()` en `docs/js/app.js`, página `pageResultsGrid` en
  `docs/index.html`). Sigue el patrón de navegación de página de detalle ya
  usado por GP/driver/team (`showPage('grid')`, con back button y sin
  header). Filas ordenadas por clasificación final: se extrajo la lógica de
  desempate que antes vivía inline en `buildStandings` a una función
  compartida `standingsOrder(tab)` para no duplicarla. El corte de puntos
  por era vive en la constante `POINTS_CUTOFF_ERAS` (top 6 hasta 2002, top 8
  2003-2009, top 10 desde 2010) — ajustar ahí si cambia el reglamento. Los
  colores de celda reusan `NON_FINISH_CODES` para el caso "no clasificó"
  (rojo) y caen a "sin puntos" (gris) por defecto ante cualquier código no
  reconocido, en vez de romper. Probado con Playwright contra 1988 (35
  pilotos, 16 carreras, corte top 6) y 2025 (21 pilotos, 24 carreras, corte
  top 10, con scroll horizontal confirmado); la columna de piloto queda
  sticky al hacer scroll, verificado también en viewport mobile (390px).
- **2026-07-15** — Se agregó la página "Récords" (más victorias/podios de
  pilotos y equipos, racha de victorias consecutivas, mayor diferencia de
  puntos en un título), filtrable por 10 eras (5 décadas + 4 eras técnicas +
  "Todo"). Como producción no tiene backend, los récords se precalculan en
  `export_static.py` → `docs/data/records.json`; el frontend
  (`buildRecords()`/`renderRecords()` en `docs/js/app.js`) solo filtra por
  era y renderiza, no recalcula nada. Nuevas funciones agregadas en
  `backend/crud.py` (`most_wins_by_driver/team`, `most_podiums_by_driver/team`,
  `best_win_streak`, `biggest_title_margin`, todas con bind parameters), la
  de podios reusa el mismo criterio robusto que `get_driver_history`
  (`position_text` numérico y `<= 3`). Nueva página en la bottom nav
  (`showPage('records')`), tratada como página principal (sin back button)
  pero con el selector de año global oculto porque no aplica. Validado a
  mano contra hechos conocidos: 39 victorias de Prost en los 80s, racha de
  10 victorias de Verstappen 2023 (R5→R14), margen de +290 pts
  Verstappen/Pérez 2023 — todos coinciden con la realidad.
  Se dejó afuera el récord "campeón más joven/viejo" (ver nota en sección 2
  sobre el gap de `Driver.dob` en 5 de los 18 campeones) y se detectó de
  paso que >100 pilotos tienen `Driver.name` sin poblar (igual a su `id`,
  ej. `MSC` = Michael Schumacher) — ninguno de los dos se tocó en esta
  tarea, quedan anotados como deuda de datos preexistente.
- **2026-07-15** — Simulador "¿y si...?" (parte 1 de 2: solo diseño + carga de
  datos; la UI viene después). Se modeló qué sistema de puntos rigió cada año
  1980–2026 en un archivo estático nuevo, `docs/data/points_systems.json`.
  **Dónde vive el dato / por qué:** archivo estático en `docs/data/`, NO tabla
  en `f1.db`. Producción no tiene backend, el dato es inmutable, chico y NO se
  deriva de la DB (es conocimiento de reglamento externo, no resultados), así
  que meterlo en la DB obligaría a plumbing de export por cero beneficio.
  Sigue el patrón de `records.json`: precalculado, el frontend solo lee. Se
  genera con un script reproducible (no se commiteó el script; vive fuera del
  repo) verificado año por año contra Wikipedia (List of F1 WC points scoring
  systems) y formula1points.com.
  **Representación** (ver `meta.description` en el propio archivo):
  - `systems` — catálogo de 4 sistemas de puntos de carrera seleccionables:
    `classic_9` (9-6-4-3-2-1, top 6, 1980–1990), `classic_10` (10-6-4-3-2-1,
    top 6, 1991–2002), `top8_10` (10-8-6-5-4-3-2-1, top 8, 2003–2009),
    `modern_25` (25-18-15-12-10-8-6-4-2-1, top 10, 2010+). OJO: el ganador
    valió **9** (no 10) en 1980–1990 — fuentes automáticas suelen equivocarse
    acá; verificado contra el título real de Senna 1988.
  - `sprint_systems` — `sprint_top3` (3-2-1, solo 2021) y `sprint_top8`
    (8-7-6-5-4-3-2-1, 2022+). Los sprints SÍ entran al cálculo: se suman a la
    ronda correspondiente usando la clave `sprints` de `seasons/{year}.json`
    (keyed por índice de ronda **0-based**, no por número de ronda — verificado:
    en 2021 la clave `"9"` es el GP británico, ronda 10).
  - `years` — un entry por año (1980–2026) con: `system` (ref al catálogo),
    `points` (inline, para consumo directo sin resolver el ref),
    `dropped_scores`, `fastest_lap_point` (bool), `sprint` (ref o null), y
    `special` opcional. Cada año describe el sistema **real** de ese año; el
    simulador aplica el `points`/`sprint`/`dropped_scores` de OTRO año a las
    posiciones ya exportadas (`positions` en `seasons/{year}.json`).
  - **Descartes** (`dropped_scores`) — la trampa central del período. Dos
    modos: `{"mode":"best_n","keep":11}` (1981–1990: mejores 11 resultados) y
    `{"mode":"split","halves":[{"races":7,"keep":5},{"races":7,"keep":5}]}`
    (1980: temporada partida, mejores 5 de las primeras 7 + mejores 5 de las
    últimas 7). `null` desde 1991 (cuentan todas). El split lee las mitades en
    orden de calendario. Solo se modela para el campeonato de **pilotos**; en
    1980–1990 constructores contaba todas las carreras (sin descarte).
    Validado: aplicar el sistema real de 1988 con `keep:11` da Senna 90 /
    Prost 87 (el título real, neto) y sin descartes da Prost 105 / Senna 94
    (el bruto real) — reproduce exactamente el vuelco de título por descartes.
  - **Fidelidad / limitaciones asumidas** (también en `meta.limitations`):
    (1) **Vuelta rápida 2019–2024** (+1 pt top 10): el proyecto NO tiene datos
    de VR, así que no se puede otorgar; `fastest_lap_point` queda informativo.
    Por esto reproducir esas temporadas difiere del real hasta ~1 pt/carrera
    (ej. 2024 recalculado da VER 426 vs 437 real, pero mismo campeón y orden).
    (2) **Medios puntos** por carrera acortada (Mónaco 1984, Australia 1991,
    Bélgica 2021…): las `positions` no marcan qué carrera se acortó, así que
    se otorgan siempre puntos completos. Documentado, no modelado.
    (3) **Puntos dobles GP final 2014**: anotado como
    `special:"double_points_final_round"` en el año 2014 pero NO aplicado al
    recalcular (anomalía de una carrera; no tiene sentido aplicarla a otros
    años). (4) **Desempates** (victorias, luego 2º puestos…): responsabilidad
    del código del simulador, no de este archivo.
  La tarea siguiente (UI del simulador) parte de esta representación: leer
  `points_systems.json`, dejar elegir un `system`/`sprint`/`dropped_scores` y
  reaplicarlo sobre `positions` de la temporada elegida.
- **2026-07-15** — Simulador "¿y si...?" (parte 2 de 2: UI). Nueva vista
  `pageSimulator` (`showPage('sim')`), accesible con un botón en Standings
  junto a "Grilla" (ambos ahora en un grid de 2 columnas). Dos selectores:
  temporada (1980–2026) y sistema de puntos a aplicar (catálogo de 4 de
  `points_systems.json`, default `modern_25`). El sprint NO es elegible por
  el usuario: siempre se usa el sistema de sprint REAL de la temporada
  elegida (`years[year].sprint`), porque es un hecho de esa temporada, no
  del sistema que se está simulando.
  **Descartes**: el catálogo `systems` no trae su propia regla de descarte
  (vive por año en `years`). Se resolvió tomando el descarte del *último*
  año real que usó ese sistema (`referenceDroppedScores()`) — para
  `classic_9` da 1990 (mejores 11), evitando a propósito la anomalía de
  1980 (temporada partida). Es una decisión de diseño no explícitamente
  pedida por la tarea (que solo mencionaba 2 selectores); quedó documentada
  acá por si hace falta revisarla.
  **Comparación real vs. simulada**: una sola tabla ordenada por posición
  simulada (no dos columnas separadas) — cada fila muestra directamente la
  posición real (`P`+número) al lado del delta (▲/▼), más un banner arriba
  si cambia el campeón (comparando contra `champion_driver` si la temporada
  está decidida, o el líder actual si no). Se prefirió este layout sobre
  "lado a lado" literal (dos tablas completas) porque con hasta 35 pilotos
  por temporada, dos columnas no entran en mobile sin ilegible.
  **Hallazgo importante durante la validación**: el campo `champion_driver`
  y los `total`/`cum` que la app ya muestra como "real" para 1980–1990 NO
  tienen aplicado el descarte histórico (son la suma bruta de todas las
  carreras) — confirmado con 1988: la app dice campeón **Prost** (105 pts
  brutos) cuando el campeón real fue **Senna** (90 pts netos, con el
  descarte de mejores 11). Esto es un bug de datos preexistente en
  `f1.db`/`docs/data/seasons/*.json` para los 10 años con descarte
  (1980–1990), NO introducido por esta tarea ni por `points_systems.json` —
  y no se tocó acá porque la tarea pide explícitamente usar `total`/`cum`
  tal cual están cargados para el lado "real" del simulador. Efecto
  práctico: para 1988 con el sistema actual (`modern_25`, sin descarte) el
  simulador da Prost 301 / Senna 275 (Prost gana, sin cambio de campeón vs.
  el "real" ya incorrecto de la app) — pero eligiendo `classic_9` (que sí
  aplica el descarte de referencia) el simulador da Senna 90 / Prost 87,
  dispara el banner "¡Cambia el campeón!" y **reproduce exactamente el
  resultado histórico real** que la app nunca mostró bien. Si se decide
  corregir el campeón/total "real" de 1980–1990, es una tarea de datos
  aparte (recalcular con descarte y re-exportar), no algo para mezclar con
  el simulador.
  **Validado**: 1988 + `modern_25` → Prost 301 / Senna 275 (gana Prost,
  como pide la tarea). 1988 + `classic_9` → Senna 90 / Prost 87 (coincide
  con los números ya documentados arriba para el diseño del dataset). 2016
  (sin sprint, sin vuelta rápida en esa era) + `modern_25` → total simulado
  **idéntico byte a byte** al real para los 24 pilotos, cero cambios de
  posición. 2025 (con sprint `sprint_top8`) + `modern_25` → también
  idéntico al real, confirma que la suma del bonus de sprint reproduce la
  realidad. Las limitaciones de `points_systems.json.meta.limitations` se
  muestran tal cual en la vista (no hardcodeadas), así se mantienen en
  sync si se edita el JSON.
- **2026-07-15** — Feature D: extensión de esquema para grid / quali / vuelta
  rápida (SOLO decisión + esquema + carga manual de respaldo; el GitHub Action
  que lo llena desde Jolpica-F1 viene después y va a leer esta entrada como
  spec). Alcance: histórico 1980–2024 **congelado sin estos datos**; solo se
  cargan de 2025 en adelante.
  **Campos que entran (`RaceResult`):**
  - `grid_position` — ya existía (vacío en toda la DB); se llenará 2025+.
  - `quali_position` (nuevo, `Integer` nullable) — clasificación final de quali.
    Se decidió **columna en `RaceResult`, NO tabla propia**: es 1:1 con
    (carrera, piloto), espeja el patrón de `grid_position`, y una tabla aparte
    agregaría un join sin beneficio para una app personal. El caso raro
    "clasificó pero no largó" se representa con `quali_position` seteado +
    `position_text='DNS'`; "sin quali" es simplemente `NULL`. No se guarda el
    **tiempo** de quali (la app muestra posiciones, no tiempos → sería peso
    muerto).
  - `fastest_lap` (nuevo, `Integer` nullable) — representación elegida:
    **booleano `1`/`NULL`** ("¿hizo la vuelta rápida?"), no tiempo ni rank. Es
    la representación mínima que (a) destraba el punto de VR 2019–2024 que
    `points_systems.json` había dejado como limitación por falta de datos, y
    (b) habilita un futuro récord "más vueltas rápidas". Tiempo/rank no los usa
    ninguna vista → no se guardan.
  **Pit stops: FUERA de alcance** (coincide con la inclinación). Son 1:N por
  piloto (varias paradas, cada una con vuelta y duración) → requerirían una
  tabla entera + export + admin, para una app personal sin ninguna vista de pit
  stops planeada. Si algún día se quiere, Jolpica los tendrá para backfillear.
  **`RaceResult.laps`: ELIMINADO.** Estaba 100% vacío y ninguna vista lo
  consume (ojo: `Circuit.laps`, que sí se usa, es OTRO campo y no se tocó).
  Mantenerlo "porque Jolpica lo devuelve" sería guardar dato sin consumidor —
  se removió del esquema, `crud`, admin y API. `grid_position` se mantiene
  porque grilla-vs-llegada sí es una vista planeada.
  **Shape de export** (ver detalle en sección 2, `seasons/{year}.json`):
  claves nuevas top-level `grid` y `quali` (espejo de `positions`,
  `driver_id → [str por ronda]`, `""` = ausencia puntual) y `fastest_laps`
  (`índice_de_ronda 0-based → driver_id`, como `sprints`). Más un flag
  **`extended`** (bool, siempre presente) que distingue los dos tipos de
  ausencia que pidió la tarea: `extended:false` = temporada entera sin datos
  (pre-2025, el frontend oculta las vistas) vs. `extended:true` + celda `""` =
  hueco puntual dentro de una temporada con datos (la vista se muestra). El
  flag se **deriva de los datos** (`season_has_extended` en `crud.py`: ¿hay
  alguna fila con grid/quali/VR?), no está hardcodeado a 2025, así se
  autocorrige si se backfillea. Cuando `extended:false`, las tres claves se
  omiten para no inflar los ~45 JSON históricos.
  **Implementado:** `backend/models.py` (esquema), `backend/crud.py`
  (`get_grid`/`get_quali`/`get_fastest_laps`/`season_has_extended` +
  `upsert_race_results`), `export_static.py` (emite las claves nuevas),
  `backend/routes/admin.py` (schema `RaceResultIn` + GET) y `docs/admin.html`
  (columnas Grid/Quali/VR; la de VR es un checkbox — carga manual de respaldo).
  Migración: script nuevo en la raíz `migrate_extended_fields.py` (la DB es
  local y única → `ALTER TABLE` directo alcanza, sin Alembic). Idempotente y
  con guardarraíl: solo dropea `laps` si está 100% vacía. El dueño lo corre una
  vez sobre su `f1.db`; si la DB no existe, no hace nada (el backend la crea con
  el esquema nuevo). **Probado** con DBs temporales (no tengo `f1.db`): la
  migración viejo→nuevo agrega quali/fastest_lap, dropea `laps` vacía, es
  idempotente y preserva `laps` si tuviera dato; los helpers de `crud`
  producen el shape esperado (incl. `""` para hueco puntual, `fastest_laps`
  0-based, `extended` true/false correcto). **De paso** se corrigió una
  inexactitud en la entrada anterior del changelog: los índices de `sprints`
  (y ahora `fastest_laps`) son **0-based**, no "número de ronda 1-indexed"
  como decía — verificado (2021 clave `"9"` = GP británico, ronda 10); importa
  porque el simulador los indexa.
- **2026-07-15** — Tabla de mapeo Jolpica-F1 → IDs internos
  (`scripts/jolpica_map.json` + `scripts/validate_map.py`), prerequisito de
  la automatización de resultados que viene después (el GitHub Action de la
  Feature D). Alcance: **solo 2025 y 2026** (el histórico está congelado, no
  se toca vía Jolpica).
  **Bloqueo de red durante la tarea**: no se pudo pegar a la API desde esta
  máquina al principio — Avast (Guardián de la web → "Activar análisis de
  HTTPS") intercepta TODO el tráfico HTTPS con un certificado propio, y ese
  certificado tiene un defecto (`Basic Constraints` no marcado como crítico)
  que curl/Python rechazan en validación estricta. Confirmado que no era el
  sandbox de Claude Code (falló igual con `dangerouslyDisableSandbox`).
  Se resolvió desactivando esa opción puntual en Avast — no hace falta para
  el uso normal de la app (admin → export_static.py es 100% local, y el
  futuro GitHub Action corre en servidores de GitHub, no acá); solo hace
  falta tener internet limpio en esta máquina para correr
  `validate_map.py` a mano de vez en cuando (cuando debuta alguien nuevo).
  **Drivers**: Jolpica trae un campo `code` (código FIA de 3 letras) que
  coincidió EXACTO con el id interno en los 24 pilotos distintos de ambas
  temporadas — cero casos dudosos, match 100% automático. Los pilotos
  reserva/test de Jolpica sin `code` (nunca corrieron) se excluyen a
  propósito: no están en `season.drivers` de los JSON locales.
  **Constructors**: sin código corto en Jolpica, se matcheó por nombre
  contra `displayName` de `TEAMS_INFO`. 11 de 12 son match textual directo;
  el caso dudoso (`rb` → `RBT`/RACING BULLS, porque Jolpica todavía usa el
  `constructorId` heredado de cuando el equipo se llamaba distinto) se
  marcó explícitamente para que el dueño lo confirme antes de darlo por
  bueno — no se asumió sin marcarlo. Confirmado por el dueño (2026-07-15);
  quedó documentado en `_doc.resolved_cases` del JSON.
  **Races**: matching primario por `round` dentro del año (posicional, no
  necesita tabla — Jolpica round N de un año == `calendar[N-1]` del mismo
  año en el JSON local); `races.circuits` (Jolpica `circuitId` → código
  interno) es la verificación cruzada, no el mecanismo principal. Se
  generó cruzando `races.json` de Jolpica contra `calendar` local: los
  24+22 rounds de 2025+2026 coincidieron sin conflictos.
  **`validate_map.py`**: sin dependencias externas (solo stdlib, para que
  corra en un Action sin paso de instalación). Descarga `results.json`
  paginado (Jolpica cappea a 100 resultados por página aunque se pida más)
  y junta los driverId/constructorId/circuitId que aparecen en **resultados
  reales**, no solo en el roster nominal — así detecta también sustitutos
  de mitad de temporada. Bug encontrado y arreglado durante el testeo: una
  carrera puede quedar partida entre dos páginas (el límite de 100 no
  coincide con ~20 resultados por carrera), así que las páginas se mergean
  por `round` en vez de concatenarse tal cual (si no, una carrera partida
  aparecía dos veces con resultados incompletos en cada mitad — no rompía
  la validación en sí, porque los IDs se juntan en sets/dicts que dedupean
  solos, pero inflaba el conteo reportado de carreras: 27 en vez de 24).
  También hace una verificación cruzada round↔circuito contra el
  calendario local (detecta reordenamientos), y falla (exit 1) si algo no
  coincide, no solo si falta un mapeo.
  **Validado**: corrida real contra 2025 (24 carreras, 21 pilotos, 10
  equipos, 24 circuitos — todo mapeado, sin sprints/Audi/Cadillac porque
  no existían) y 2026 (9 carreras corridas hasta ahora, 22 pilotos, 11
  equipos, 9 circuitos — con Audi/Cadillac ya mapeados). Se probó también
  el camino de falla a propósito (se borraron dos entradas del mapa real,
  se corrió el script, confirmó que fallaba con exit code 1 listando
  exactamente `norris` y `ferrari`, y se restauraron las entradas).
- **2026-07-15** — `scripts/sync_jolpica.py`: sincroniza una temporada 2025+
  desde la API Jolpica-F1 directo a `docs/data/seasons/{year}.json` +
  `docs/data/init.json`, SIN pasar por f1.db. Es el corazón de la
  automatización post-GP (el GitHub Action que lo dispara es tarea posterior).
  Solo librería estándar (corre en el Action sin `pip install`), como
  `validate_map.py`.
  **Qué toma de Jolpica (recalculado, autoritativo):** positions, grid, quali,
  vuelta rápida, sprints, y puntos/standings (total + `cum` por ronda).
  **Qué preserva del JSON existente** (metadata que no vive en Jolpica, viene de
  la DB del dueño): `calendar` (fechas display, event, flag sprint, hora UTC),
  nombres de piloto (`L. Norris`) y equipo (`McLAREN`), colores, y `champion_*`
  (decisión del dueño). Por eso el JSON de la temporada DEBE existir ya (el sync
  no lo crea de cero). Semántica replicada de `crud.py`: `cum` = puntos
  acumulados solo sobre las rondas que el piloto corrió; puntos por ronda =
  carrera + sprint (los de sprint van FOLDEADOS en el total, igual que en la DB
  — `_build_driver_standings` no suma `SprintResult.points`); status/positionText
  de Ergast → códigos internos de `constants.py` (`D`→`DSQ`, `E`→`EX`, DNS por
  status, etc.; un código no reconocido hace fallar el sync, nunca se inventa).
  **Validación estricta antes de escribir** (si algo falla: exit `1`, no escribe
  NADA): rondas con fecha pasada (>`GRACE_HOURS`=48h) tienen resultados completos
  en Jolpica (una carrera recién corrida que aún no cargó = "pendiente", no
  error); ≥18 autos por carrera; ningún ID sin mapear (usa `jolpica_map.json`,
  cross-check de circuito por round); y los puntos recalculados **cuadran con los
  standings oficiales de Jolpica** (piloto y constructor). **Exit codes** para el
  Action: `0` escribió (hay algo que comitear), `3` sin novedades (idempotente),
  `1` error. **Idempotente**: corrida real contra 2025 escribió (exit 0) y la
  segunda corrida fue no-op byte-idéntico (exit 3). **Rate limits**: paginación
  de a 100 mergeando por round, pausas de 1.5s. **TLS**: verificación normal por
  defecto (los runners de CI tienen certs OK); `PITWALL_CA_INSECURE=1` es un
  escape SOLO para dev local detrás de un proxy que intercepta TLS, jamás en CI.
  **POLÍTICA DE FUENTE DE VERDAD para 2025+ (la decisión clave del punto 5):**
  el JSON de producción es la fuente de verdad, NO f1.db. El sync lo escribe
  directo; para que un `export_static.py` local no lo pise regenerándolo desde
  una f1.db desactualizada, **`export_static.py` ahora NO reescribe los años
  `>= MANAGED_FROM_YEAR` (2025) por defecto** (los saltea y preserva su entrada
  en `init.json`); `--force` los reescribe igual. Companion nuevo
  `scripts/import_to_db.py --year YYYY`: trae el JSON de producción de vuelta a
  f1.db (para que el admin panel y los exports agregados records/init no queden
  viejos) — REEMPLAZA los resultados del año en la DB. Truco: el JSON no guarda
  puntos por carrera, pero sí `cum`, así que los puntos combinados de cada ronda
  salen de la DIFERENCIA de `cum` entre rondas consecutivas (exacto, sin
  recomputar → reproduce medios puntos / cualquier scoring tal cual). Flujo del
  dueño tras un GP automatizado: el Action commitea el JSON nuevo → `git pull` →
  opcional `python scripts/import_to_db.py --year 2025` para reconciliar la DB.
  **Hallazgos durante la validación (importantes, NO introducidos por esta
  tarea):**
  (1) El `total` de un piloto que **cambia de equipo a mitad de temporada** está
  MAL calculado en `crud._build_driver_standings`: agrupa por piloto+equipo,
  ordena por puntos DESC y se queda con el PRIMER (mayor) stint, así que muestra
  los puntos del equipo donde más sumó en vez de la SUMA de la temporada —
  mientras que `cum` sí es el total completo (por eso `total != cum[-1]`).
  Confirmado con TSU 2025: 30 pts (Red Bull) + 3 (Racing Bulls) = 33 reales
  (coincide con los standings de Jolpica), pero el JSON viejo mostraba 28 (su
  stint mayor con los datos manuales). El sync calcula el 33 correcto → por eso
  su salida DIFIERE de un re-export desde la DB para pilotos que cambiaron de
  equipo. Es un bug preexistente de `crud` (afecta también team-switchers
  históricos); no se tocó acá (histórico congelado, fuera de alcance), queda
  anotado. Refuerza la política: para 2025+ el JSON del sync es más correcto que
  un re-export, y por eso `export_static` no lo pisa.
  (2) `import_to_db` no puede almacenar quali/grid de una ronda donde el piloto
  clasificó pero NO largó (ej. STR, GP de España 2025): en la DB `quali_position`
  es una columna de `RaceResult`, y crear la fila para guardarla contaría esa
  ronda en `cum`/standings. Se prioriza no corromper standings → esa quali
  puntual se pierde en el round-trip DB. Limitación conocida del esquema.
  (3) Al recalcular 2025 desde Jolpica aparecieron diferencias con los datos
  cargados a mano en códigos de no-clasificación (`R`/`18`/`W`/`DNS` — todos 0
  pts, clasificación oficial de Ergast vs. la elección manual) y algún
  desglose por carrera que netea al mismo total (ej. OCO). El sync reemplaza
  todo por el dato autoritativo de Jolpica; correr el sync sobre 2025 aplica
  esas correcciones (no se aplicaron en esta tarea: el 2025.json quedó como
  estaba, el dueño las aplica corriendo el script cuando quiera).
- **2026-07-15** — `.github/workflows/sync-results.yml`: primer workflow del
  repo (no existía `.github/` todavía). Dispara `scripts/sync_jolpica.py`
  los lunes 06:00 UTC (cron `0 6 * * 1`, después del fin de semana de GP) o
  a mano (`workflow_dispatch` con input opcional `year`, default año actual
  UTC resuelto en el propio workflow — los inputs de `workflow_dispatch` no
  soportan defaults dinámicos en el YAML). El workflow **solo orquesta**:
  toda la lógica vive en el script, acá solo se interpreta su exit code (ver
  sección 3 "Automatización 2025+" para el detalle completo del flujo y qué
  hacer si falla).
  **Decisiones de implementación:**
  - Exit code capturado a mano (`set +e` alrededor del `python
    scripts/sync_jolpica.py`, no dejar que el default `set -e` de los steps
    de Actions mate el step) porque hay que distinguir 3 casos (0/3/error),
    no solo éxito/fracaso binario.
  - El job falla ante **cualquier** exit code que no sea `0` o `3` (no solo
    el `1` documentado) — cubre también un exit code inesperado, ej. el `2`
    de `argparse` si alguien dispara el workflow con un `year` no numérico.
    Mejor fallar fuerte que pasar en silencio.
  - Salvaguarda extra pedida por la tarea: aunque el script salga
    `EXIT_WROTE`, el commit solo se hace si `git diff --quiet -- docs/data`
    encuentra un cambio real — defensa en profundidad, no confiar
    ciegamente en el exit code.
  - `concurrency: {group: sync-jolpica-results, cancel-in-progress: false}`
    para que dos corridas no se pisen el commit/push; no se cancela una
    corrida en curso (podría dejar un commit a medio hacer), la siguiente
    espera en cola.
  - `permissions: {contents: write}` únicamente (mínimo necesario para
    pushear).
  - Mensaje de commit (`sync: resultados {GP} {year} via Jolpica`): el `GP`
    sale de leer con `jq` la última ronda completada de
    `docs/data/seasons/{year}.json` recién escrito (`season.completed`, o
    todo el calendario si la clave no está = temporada cerrada). Ojo con
    `jq`: soporta índices negativos (`.calendar[-1]` = último elemento), así
    que si `completed` fuera `0` el índice `-1` sin guard devolvería la
    ÚLTIMA carrera del calendario en vez de "todavía no hay ronda" — se
    agregó un chequeo explícito de índice antes de llamar a `jq` para evitar
    ese caso (improbable en la práctica para 2025+, pero barato de blindar).
  **Bloqueo inicial (resuelto):** nada de esta sesión estaba pusheado
  todavía (`gh` CLI tampoco estaba instalado), así que no había forma de
  disparar un `workflow_dispatch` real. El dueño autorizó pushear todo el
  trabajo acumulado: se armaron 6 commits agrupados por área (ver hashes
  `f40bf12`..`5590d92`) y se pusheó a `main`. `gh` se instaló vía `winget`
  para poder disparar/leer runs, pero autenticarlo (`gh auth login`) se
  frenó a propósito — es un paso de más allá de "pushear lo pendiente" y le
  correspondía al dueño decidirlo. Se usó la API pública de GitHub sin auth
  (vía `WebFetch`, curl local seguía bloqueado por el escaneo HTTPS de
  Avast que el dueño había vuelto a activar) para el testeo en su lugar.
  **Probado en vivo — run real
  ([29417630776](https://github.com/joakinkong/Pitwall-F1/actions/runs/29417630776)),
  disparado por el dueño vía `workflow_dispatch` sin especificar año
  (default = 2026):** terminó en 22s, conclusión `success`. Recorrido el
  camino **EXIT_WROTE con cambios reales** de punta a punta (no el
  "sin novedades" que se esperaba al principio — Jolpica tenía datos más
  nuevos que el `2026.json` local): "Correr sync_jolpica.py" OK, los dos
  steps condicionados a error/sin-novedades quedaron correctamente
  `skipped`, "Verificar cambios reales" y "Armar mensaje de commit"
  corrieron, y el commit `541b7cc` "sync: resultados **GBR 2026** via
  Jolpica" se pusheó solo — el nombre de GP coincide EXACTO con lo que
  había dado la prueba de la lógica `jq` en Python antes de pushear (ronda
  9 = GBR). Confirma que exit-code handling, la salvaguarda de `git diff`,
  y el armado del mensaje de commit funcionan correctos contra la API real,
  no solo en la simulación local.
  **Hallazgo de paso**: el run dejó un aviso de deprecación (Node.js 20 →
  forzado a 24 en el runner) para `actions/checkout@v4` y
  `actions/setup-python@v5`. Se bumpearon a `@v7`/`@v6` (últimas versiones
  estables al momento) en un commit de seguimiento — no rompe nada, la
  interfaz `with:` usada acá (solo `python-version`) es compatible.
  **Pendiente real**: probar el camino de error (año pre-2025, ej. `2020`,
  debería fallar por la propia validación de `sync_jolpica.py`) — no se
  hizo en esta ronda para no gastar más disparos manuales de los
  necesarios; queda para la próxima vez que se toque el workflow.
- **2026-07-15** — Backfill de `grid`/`quali`/`fastest_laps` para 2025 vía
  `scripts/sync_jolpica.py --year 2025` (2026 ya estaba al día por las syncs
  previas del workflow: exit 3 "sin cambios"). Corrido en el local del dueño,
  con el escaneo HTTPS de Avast activo: hubo que usar `PITWALL_CA_INSECURE=1`
  (el escape TLS que el propio script documenta para dev-local detrás de un
  interceptor) y `PYTHONUTF8=1` (la consola cp1252 de Windows no podía imprimir
  el `→` del diff semántico y crasheaba en `print` ANTES de escribir el JSON —
  ninguno de los dos es bug del script). **Hallazgo importante:** el diff de
  2025 NO fue solo aditivo. El script recalcula posiciones y standings desde
  Jolpica (autoritativo por diseño) y los datos manuales de 2025 divergían:
  varias posiciones reclasificadas (placeholders `DNS`/`R` → resultados reales,
  ej. NOR r10/r15 `R → 18`, OCO r8 `12 → 7`), TSU `28 → 33` (+5 pts), Red Bull
  constructor `449 → 451` / Racing Bulls `94 → 92`, y `race_constructors` de
  LAW/TSU recortado de 4 a 2 rondas (refleja el swap de asientos RBR↔Racing
  Bulls de media temporada). El campeón sigue siendo NOR (`champion_driver` se
  preserva, el sync no lo toca). Ante la disyuntiva (viola el "diff solo
  aditivo" pero corrige errores de carga manual), el dueño decidió aceptar
  Jolpica como fuente de verdad y commitear los fixes. **Pendiente:** `f1.db`
  local quedó desincronizado de estas correcciones 2025 — reconciliar con
  `scripts/import_to_db.py` antes de confiar en `records.json` o en un
  `export_static.py --force`.
- **2026-07-15** — Feature D (cierre): vista "Rendimiento" en
  `docs/js/app.js`/`docs/index.html` — puestos ganados/perdidos (grilla vs.
  resultado) y poles + quali vs. carrera, usando el `grid`/`quali` de las
  temporadas 2025+ que recién quedaron pobladas por el backfill de arriba.
  Nuevo botón `#btnPerformance` en Standings (grid de 3 columnas junto a
  "Grilla" y "¿Y si...?"), **oculto por default en el HTML** y solo se
  muestra si `updatePerformanceButtonVisibility()` confirma datos extendidos
  para el año actual — evita el flash de un botón que llevaría a una página
  vacía en 1980-2024.
  **Por qué esta sección hace su propio `fetch()`:** `docs/js/api.js` (fuera
  del alcance de esta tarea) solo extrae `season`/`positions`/`calendar`/
  `sprints`/`race_constructors` de cada `seasons/{year}.json` — nunca guardó
  `extended`/`grid`/`quali`/`fastest_laps` en variables globales. Mismo
  patrón ya usado por Récords/Simulador: `loadExtendedData(year)` pide el
  JSON de temporada de nuevo (el navegador lo sirve de HTTP cache la
  segunda vez) y cachea el resultado — `{grid,quali,fastest_laps}` si
  `extended===true`, `null` si no, así nunca se re-chequea una temporada ya
  resuelta.
  **Cálculo** (`computeDeltaStats`, compartido por ambas secciones ya que
  "grilla vs. carrera" y "quali vs. carrera" son la misma operación con
  distinto array base): por ronda, si la posición base (grid o quali) no es
  numérica se ignora (temporada sin ese dato puntual); si la posición final
  es un código de `NON_FINISH_CODES` no computa delta y queda aparte
  (`nonClassified`, delta `null`, se pinta en rojo sin número al lado — la
  tabla lo muestra pero no lo suma a ganadas/perdidas); si la posición final
  es `""` (carrera todavía no corrida) se ignora directamente — así "solo
  sobre las corridas" sale gratis del mismo chequeo, sin lógica de fecha
  aparte. `delta = base - final` (positivo = ganó posiciones).
  **UI**: tabla ordenable por columna (Neto/Ganadas/Perdidas/Sin Clasificar
  — clic alterna asc/desc, con flecha indicando la columna activa), fila de
  piloto expandible con el detalle carrera por carrera (grilla→resultado,
  reusa el patrón de sticky/expand ya visto en otras vistas). Poles
  reutiliza `recordsLeaderboard()` de la página Récords tal cual (mismo
  shape `{id,name,[unitKey]}`) en vez de duplicar el render de un
  leaderboard top-N. Quali vs. Carrera: promedio de delta + mejor/peor caso
  (con el GP de cada extremo) por piloto, misma tabla ordenable.
  **Validado**: 1988 (`extended` ausente) → botón oculto, página nunca se
  abre, cero errores de consola. 2025 → botón visible; VER Brasil (SAO)
  grilla P19 → carrera P3 (**+16**, un caso real y llamativo) coincide
  exacto entre el cálculo a mano sobre el JSON crudo y lo que renderiza la
  UI (confirmado leyendo el DOM del detalle expandido, no solo mirando un
  screenshot); la ronda de AUT (VER retirado) se confirmó en el DOM sin
  ningún número de delta al lado, solo el código en rojo — el filtro de "no
  clasificados no computan delta" funciona. Ordenamiento por columna
  probado en vivo (clic invierte de descendente a ascendente, cambia el
  piloto en el tope de la tabla). Sin overflow horizontal en 420px.

- **2026-07-16** — Fix del bug de descartes (paso previo al backfill 1950-1979,
  ver entradas siguientes): `_build_driver_standings` en `backend/crud.py`
  calculaba `total` como suma bruta de `RaceResult.points`, sin aplicar el
  descarte real de 1980-1990 (ver `docs/data/points_systems.json.years[year]
  .dropped_scores`, modos `best_n` y `split`). El campeonato de
  CONSTRUCTORES nunca tuvo descarte en esa era, así que
  `_build_constructor_standings` no se tocó. `cum` (el array de progresión
  del gráfico) se deja sin tocar — sigue siendo la suma bruta acumulada, y
  puede diferir de `total` (mismo patrón ya documentado para el caso
  TSU 2025 de cambio de equipo a mitad de temporada, no es una
  inconsistencia nueva). Se agregó `_apply_dropped_scores` (ambos modos) y
  `_load_dropped_scores_rules` (lee `points_systems.json` directamente —
  incluso siendo un archivo "de export", el backend ya lo trata como fuente
  de verdad de un hecho histórico externo, mismo criterio que
  `NON_FINISH_CODES` compartido a mano entre backend/frontend). El mismo
  fix se aplicó a `biggest_title_margin` (usado por la página Récords), que
  tenía SU PROPIA query de puntos brutos independiente y además asumía
  "el de más puntos = campeón" en vez de leer `Season.champion_driver_id` —
  ahora usa el campeón real de la DB y busca el subcampeón entre el resto.
  El simulador JS (`docs/js/app.js`, `computeSimTotals`) tenía el mismo
  hueco pero peor: solo implementaba el modo `best_n`, así que 1980 (único
  año con modo `split`, temporada partida) nunca aplicaba descarte alguno
  en el simulador — se extrajo a una función compartida `applyDroppedScores`
  con ambos modos.
  **Bug de datos encontrado de paso, no el mismo que el de descartes:** al
  diagnosticar contra los campeones reales de 1980-1990 (no solo recalcular
  y comparar contra lo ya cargado) apareció un SEGUNDO campeón mal cargado
  además del 1988 ya documentado: **1984** decía Prost en la DB, el campeón
  real fue **Lauda** (72 vs 71.5, el margen de 0.5 puntos más famoso de la
  historia de la F1). Causa: Mónaco 1984 se acortó por lluvia (regla FIA de
  medios puntos para carreras interrumpidas antes del 75% de distancia,
  documentada como limitación NO modelada en `points_systems.json.meta
  .limitations`), y Prost quedó cargado con los 9 puntos completos por esa
  carrera en vez de 4.5. Se corrigió ese único valor
  (`race_results.points` de PRO en Mónaco 1984: 9.0→4.5) y
  `Season.champion_driver_id` de 1984→LAU y 1988→SEN directo en `f1.db`
  (con backup previo `f1.db.bak-pre-descartes-fix`, no commiteado — está en
  `.gitignore`). Verificado: recalculando 1984 con el fix dio Lauda 72.0 /
  Prost 71.5 exacto. La limitación general de medios puntos (otras carreras
  acortadas: Australia 1991, Bélgica 2021, etc.) sigue sin modelarse — este
  fix fue puntual, solo para el único caso que estaba corrompiendo un
  campeón dentro del rango con descarte que se estaba arreglando, no una
  auditoría completa de carreras acortadas.
  **Prerequisito destrabado de paso:** `export_static.py` fallaba con
  `OperationalError: no such column: race_results.fastest_lap` al
  intentar correr — la migración de esquema de la Feature D
  (`migrate_extended_fields.py`, agrega `quali_position`/`fastest_lap`,
  dropea `laps`) nunca se había corrido de verdad contra el `f1.db` real
  del dueño (el changelog de la Feature D solo la había probado contra DBs
  temporales). Se corrió ahora (idempotente, con guardarraíl ya descrito en
  su propio changelog) — esto no es parte del fix de descartes en sí, pero
  bloqueaba poder re-exportar para verificarlo.
  **Validado**: 1988 recalculado da Senna 90.0 / Prost 87.0 (coincide con
  los números ya documentados en el changelog del simulador). 1985 (mismo
  campeón con o sin descarte) pasa de total bruto 76 a 73 con descarte, sin
  cambiar de campeón. Constructores 1985 sin cambios (sin descarte, como
  corresponde). 2023 (sin descarte, era moderna) exportado byte-idéntico —
  cero regresión fuera del rango 1980-1990. `records.json` recalculado:
  el margen de título más grande de los 80s pasa a ser 1985 (Prost 73 /
  Alboreto 53, margen 20) en vez de un valor inflado por el bug; el margen
  histórico global (2023, Verstappen/Pérez, 290) no cambia.
  **Pendiente real:** la limitación general de medios puntos por carrera
  acortada (fuera de Mónaco 1984) sigue sin modelarse, documentada en
  `points_systems.json.meta.limitations` — no se tocó más allá del caso que
  corrompía un campeón. `f1.db` quedó con `race_results.points` de Mónaco
  1984 corregido pero el resto del histórico 1980-2024 no se auditó
  carrera por carrera contra medios puntos.

- **2026-07-16** — Backfill histórico 1950-1979 (Etapa 2 de 5: sistemas de
  puntos reales, validados). Parte del proyecto más grande "extender la app
  de 1980-2026 a 1950-2026" (decisión del dueño; ejecutado etapa por etapa,
  cada una revisada antes de tocar `f1.db`). Etapa 0 (fix de descartes
  1980-1990) y Etapa 1 (mapeo de IDs Jolpica→internos, `scripts
  /jolpica_map_pre1980.json`) ya están documentadas arriba/en commits
  separados. Esta entrada es la Etapa 2: `docs/data/points_systems.json`
  extendido de 1980-2026 a 1950-2026 (`scripts
  /extend_points_systems_pre1980.py`, corrida única).
  **Escala de puntos por carrera** (verificada cruzando Wikipedia "List of
  Formula One World Championship points scoring systems" +
  formula1points.com — la primera es propensa a error en este rango, ver
  hallazgo abajo):
  - 1950-1959: top 5 puntúan 8-6-4-3-2 + 1 punto de vuelta rápida (a
    CUALQUIER piloto, no solo top 5). Nuevo `systems.pre_1960_top5`.
  - 1960: 8-6-4-3-2-1, top 6, sin vuelta rápida. Nuevo `systems.top6_8pts`.
  - 1961-1979: 9-6-4-3-2-1, top 6 — **la misma escala que ya usaban
    1980-1990** (`classic_9`, confirmado independiente por
    formula1points.com que agrupa 1961-1990 bajo un único "9 points
    system"). Se reusa el catálogo existente en vez de crear uno nuevo;
    se actualizó su label a "(1961–1990)".
  **Descarte de resultados** — la parte que requirió más rigor:
  - 1950-1966: modo `best_n` flat (mejores N de todas las carreras), N
    variable por año (4 en 1950-1953, 5 en 1954-1957 y 1959/1961/1962/1966,
    6 en 1958/1960/1963-1965).
  - 1967-1979: modo `split` (temporada partida en 2 mitades, mejores K de
    cada una) — el MISMO mecanismo que ya modelaba 1980 como caso especial,
    resulta que en realidad se usó 13 años seguidos antes de 1980, no fue
    una anomalía de un solo año. Verificado matemáticamente: la suma de
    carreras de ambas mitades coincide EXACTA con el calendario real de
    Jolpica para los 13 años (ej. 1977: 9+8=17 carreras, calendario real
    tiene 17).
  **Hallazgo importante — la primera pasada de investigación tenía errores
  reales**, encontrados recién al validar contra los totales oficiales de
  cada campeón (no alcanzaba con "verified_against", hubo que recalcular y
  comparar cifra por cifra): la página agregada de Wikipedia sobre sistemas
  de puntos tenía **1954-1958 mal** (decía descarte "mejores 4" para
  1954-1957 y "mejores 5" para 1958; el real es "mejores 5" para 1954-1957
  y "mejores 6" para 1958) — confirmado recalculando el título de Fangio
  1956 (30 pts oficiales) contra los resultados reales de Jolpica-F1. La
  misma página además **mezclaba dos conceptos distintos** en su columna de
  1967-1979: lo que parecía "la escala de puntos cambió cada año" (ej. "9
  total: 5 de las primeras 6, 4 de las últimas 5") en realidad describe el
  descarte de temporada partida, no la escala por carrera (que se mantuvo
  constante en 9-6-4-3-2-1). Metodología de corrección: para cada uno de
  los 30 años se buscó programáticamente qué valor de "mejores N" (o
  reparto de mitades) reproduce EXACTO el total oficial del campeón real
  (fuente: "List of Formula One World Drivers' Champions"), en vez de
  confiar en la fuente secundaria sin verificar. **Validado: los 30 años
  1950-1979 reproducen el total oficial exacto del campeón real**,
  incluyendo dos casos de medio punto (1953 Ascari 34.5, 1975 Lauda 64.5).
  **Autos compartidos entre 2 pilotos** (frecuente 1950-1957, prohibido
  desde 1958): se descubrió la regla exacta al depurar el mismatch de
  Fangio 1956 — Jolpica-F1 representa un relevo de auto como una fila de
  resultado SEPARADA por (carrera, piloto) para cada auto que manejó ese
  piloto esa carrera; la regla real de la época es "si ambos autos
  puntuaron, solo cuenta el de mejor posición" (NO se suman) — confirmado
  exacto contra el título de Fangio 1956. Esto también informa cómo va a
  tener que armar `RaceResult` el script de la Etapa 3 (una sola fila por
  carrera+piloto, con el MEJOR resultado de sus relevos esa carrera — la
  constraint `UniqueConstraint(race_id, driver_id)` ya obliga a esto de
  todas formas).
  **Indianápolis 500 (1950-1960)** — contó oficialmente para el Mundial
  pero con pilotos/autos 100% de IndyCar sin conexión con la F1 europea.
  Decisión del dueño: excluirlo del calendario a cargar. Verificado que no
  cambia ningún resultado real: de los 11 años, un único piloto (Rodger
  Ward, ganador de Indy 1959) también corrió una carrera europea ese año
  (sacó 0 puntos ahí) — cero impacto en cualquier tabla real, y matemáticamente
  el descarte "mejores N" es idéntico con o sin Indy en el cálculo porque
  ningún piloto relevante sumó nada ahí.
  **Pendiente (Etapas 3-5)**: escribir el script de backfill (nuevo, corrida
  única, similar en espíritu a los `migration/` originales pero
  automatizado vía Jolpica — reusa el mapeo de IDs de la Etapa 1 y estas
  reglas de puntos); ejecutarlo contra `f1.db`; extender `ERAS` (decadas
  1950s/1960s/1970s), `POINTS_CUTOFF_ERAS`, título de la página, y rango de
  años del Simulador; re-exportar `docs/data/`.

- **2026-07-17** — Backfill histórico 1950-1979 (Etapas 3-5, cierre del
  proyecto "extender la app a 1950-2026"). La app ahora cubre **1950-2026**
  (antes 1980-2026). Etapas 0-2 (fix de descartes, mapeo de IDs, sistemas de
  puntos) están en entradas/commits previos. Esta cierra la carga real a
  `f1.db` y la UI.
  **Script de carga** (`scripts/backfill_pre1980.py`, corrida única, NO parte
  de export_static ni del Action): lee el snapshot de Jolpica
  (`.pre1980_raw_cache.json`), mapea IDs con `jolpica_map_pre1980.json`, y
  escribe Drivers/Circuits nuevos + Season + RaceCalendar + RaceResult +
  campeones, todo en UNA transacción (rollback total ante cualquier ID sin
  mapear). Tiene `DRY_RUN=1`. Cargó 317 carreras, 7001 resultados, 441
  pilotos y 34 circuitos nuevos, 30 temporadas. Backup previo en
  `f1.db.bak-pre-backfill1950` (gitignoreado).
  **Decisiones de datos:**
  - **Indianápolis 500 (1950-1960) EXCLUIDO**: contó para el Mundial pero con
    pilotos/autos de IndyCar sin conexión con la F1 europea. Verificado que no
    altera ningún campeón (un solo piloto sumó en Indy y en una carrera
    europea el mismo año, con 0 pts en la europea).
  - **Constructores unificados por marca de chasis** (decisión del dueño):
    Jolpica/FIA registra cada combinación chasis-motor por separado
    (brabham-repco, brabham-ford...); se colapsan a la marca (BRABHAM) vía el
    `code` de `jolpica_map_pre1980.json`. Reconciliado con los team_id que ya
    usa el histórico 1980+ (que nombra a los equipos desaparecidos con su
    nombre completo en mayúscula, sin fila en `teams` — ej. Lotus clásico →
    `TEAM LOTUS`, no un código nuevo). El costo aceptado: el "campeón de
    constructores" mostrado es la marca, no la combinación exacta que
    registró la FIA. `build_pre1980_map.py` se regeneró para esto (antes daba
    códigos de 3 letras a todos los constructores, lo que habría partido en
    dos identidades a los ~14 equipos que cruzan la frontera de 1980). De
    paso se corrigió que el generador de códigos de piloto evite chocar con
    team_ids (Bruce McLaren el piloto ya no recibe 'MCL').
  - **Autos compartidos** (mismo piloto en 2 autos, 1 carrera; 65 casos): la
    constraint `UniqueConstraint(race_id, driver_id)` obliga a una fila; se
    conserva el MEJOR resultado (regla FIA de la época, ver Etapa 2). 62-65
    casos.
  - **Metadata**: pilotos/circuitos nuevos toman nombre/nacionalidad/dob de
    Jolpica (nacionalidad traducida a español + bandera ISO vía tabla en el
    script). NO se pisan los de continuidad (su carga manual puede ser mejor).
    Circuitos históricos usan el nombre del trazado como `name` (Jolpica no
    da nombre de GP). Sin colores de equipo (no hay dato de esa era → gris,
    como ya pasa con varios equipos de 1980).
  - **Campos extendidos** (grid/quali/fastest_lap): NO se cargan (política
    igual al histórico 1980-2024). El punto de vuelta rápida de los 50s YA
    viene sumado en `points` de Jolpica, así que los standings salen bien sin
    el flag.
  **Reglas de Campeonato de Constructores clásico** (`crud.py`,
  `_build_constructor_standings`): hasta 1979 el título de constructores usó
  dos reglas que después desaparecieron: (a) por carrera solo puntuaba el
  MEJOR auto de cada equipo (no se sumaban los dos), y (b) descarte de
  resultados (mismo del año que aplica a pilotos). Sin ellas, 7 de 22 años
  1958-1979 mostraban al equipo equivocado en el tope de la tabla (ej. 1958
  Ferrari bruto por encima del campeón real Vanwall). Implementado con
  `MAX(points)` por (equipo, carrera) + `_apply_dropped_scores`, SOLO para
  `year <= CLASSIC_CONSTRUCTOR_MAX_YEAR` (1979); 1980+ sigue con `SUM` sin
  descarte, sin cambios. Verificado: con estas reglas el campeón queda en el
  tope en los 22 años, y el total reproduce el oficial exacto o casi (±1-4)
  para 1958-1978. Se agregó desempate determinístico por team_id (evita
  reordenamiento arbitrario de equipos empatados entre corridas — de ahí un
  diff cosmético de una vez en la cola de equipos con 0 puntos de varios años
  1980+, sin ningún cambio de total ni de campeón).
  **UI/export** (`export_static.py`, `docs/js/app.js`, `docs/index.html`):
  `ERAS` +décadas 1950s/1960s/1970s; `POINTS_CUTOFF_ERAS` +top-5 (1950-1959)
  y top-6 (1960+) para la grilla de resultados; `<title>` y textos "1980-2026"
  → "1950-2026". Los selectores de año (global, comparador, simulador) y el
  simulador se pueblan de `Object.keys(SEASONS)` / `points_systems.json`, así
  que tomaron 1950-1979 solos.
  **Validación**: los 30 campeones de pilotos 1950-1979 reproducen el total
  oficial EXACTO vía `crud.get_season_data` (incluye medios puntos: 1953
  Ascari 34.5, 1975 Lauda 64.5); los 22 campeones de constructores 1958-1979
  quedan en el tope; 1980+ sin regresión de totales (solo reordenamiento
  cosmético de empates); `records.json` con leaderboards clásicos correctos
  (Fangio 24 victorias en los 50s; Ferrari 250 all-time con la era unificada);
  todos los shapes que consume el frontend (drivers/constructors/positions/
  calendar/champions/records/points_systems) validados para años de muestra.
  **Pendiente**: (1) validación VISUAL en navegador no hecha en esta máquina
  (no hay Chromium/Playwright instalados) — la validación fue de datos +
  smoke test de shapes, no de render real; queda para el dueño abrir la app y
  mirar años clásicos. (2) Nombres de GP de circuitos históricos son el nombre
  del trazado ("Silverstone Circuit" en vez de "British Grand Prix") — dato
  cosmético mejorable. (3) El total de constructores por marca en años de
  motores múltiples difiere del registro oficial-por-combinación (consecuencia
  aceptada de unificar por marca). (4) `f1.db` local quedó con el backfill;
  para reconciliar 2025+ ver la nota de `import_to_db.py` en entradas previas.

- **2026-07-17** — Retoques post-backfill 1950-1979 pedidos por el dueño tras
  mirar la app: colores de equipo en la era clásica, sección Récords en Home,
  nombres reales de GP para los circuitos nuevos, y Simulador atado al año
  global.
  **Colores de equipo** (`scripts/backfill_team_colors_pre1980.py`, corrida
  única, dos pasos): (1) para equipos que siguen vigentes hoy (Ferrari,
  McLaren, Williams, Mercedes, Alfa Romeo, Aston Martin, ATS), se propaga
  hacia atrás el color más antiguo ya cargado en `season_team_colors` — 62
  filas nuevas. (2) Para los 15 años 1950-1979 donde el CAMPEÓN de
  constructores no tiene ningún color en la DB (Vanwall, Cooper, BRM,
  Brabham, Team Lotus, Matra, Tyrrell — equipos que no llegaron a 1980), se
  agregaron colores investigados contra Wikipedia (no inventados a ojo) SOLO
  para sus años de título — 15 filas. Caso particular: Team Lotus cambió de
  librea 3 veces en sus años de campeón (verde clásico 1963/1965 → rojo-
  dorado "Gold Leaf" 1968/1970 → negro-dorado "John Player Special"
  1972/1973/1978); se usa dorado como color representativo del período JPS
  porque negro puro sería invisible como acento sobre el tema oscuro de la
  app. Equipos sin NINGÚN dato de color en toda la DB (ninguna fuente,
  ninguna época) quedan en gris — no es una regresión, ya pasaba en sus años
  1980+ también.
  **Nombres de circuito**: los 34 circuitos nuevos del backfill tenían
  `Circuit.name` = nombre del trazado (Jolpica no da nombre de GP), ej.
  "Silverstone Circuit" en vez de "British Grand Prix". Se corrigió cruzando
  contra `CSV proyecto F1/f1_races.csv` (fuente de la migración original,
  gitignoreada) — matcheado por posición de ronda dentro del año (excluyendo
  Indianápolis 500 de ambos lados), 317/317 filas coincidieron sin
  ambigüedad. `circuit_name` (el trazado) no se tocó. De paso: ese mismo CSV
  (`f1_drivers.csv`) tiene la fecha de nacimiento de los 5 campeones con
  `dob` faltante documentados en la sección 2 (MSC, HIL, VIL, BUT, ROS) —
  **no se cargó en esta tarea** (fuera de alcance de lo pedido), queda
  anotado como fuente lista para una tarea de datos futura.
  **Récords en Home** (`buildHomeRecords()` en `app.js`, sección nueva en
  `docs/index.html` bajo el grid de Último GP): preview de "Más victorias —
  Pilotos/Equipos" (top 5, era "all" fija, no depende del año seleccionado)
  con botón "Ver todos →" a la página Récords completa. Reusa
  `recordsLeaderboard()` tal cual la usa esa página, sin duplicar el render.
  **Simulador atado al año global**: se eliminó el selector de año interno
  del Simulador (`simYearSelect`/`changeSimYear`) y la variable `simYear` —
  ahora usa `currentYear` directamente en todo el módulo, así que muestra
  siempre la temporada que indica el selector superior. `changeYear()` ahora
  también reconstruye el Simulador si es la página activa (antes solo
  reconstruía Home/Calendario al cambiar de año).
  **Validado**: Ferrari 1958 sale roja (`#DC0000`, mismo hex que 1980+);
  Lotus 1963 verde (`#1B7A3D`) vs. Lotus 1972 dorado JPS (`#C9A227`) — dos
  colores distintos para el mismo team_id en años distintos, refleja el
  cambio de librea real; `NUR` (Nürburgring) ahora exporta `name:"German
  Grand Prix"` con `circuit:"Nürburgring"` aparte; diff de `docs/data/`
  acotado exacto a los 30 archivos de temporada 1950-1979, cero cambios en
  1980+.
