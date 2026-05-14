# PIT WALL — F1 Stats App

Aplicación web estática de estadísticas de Fórmula 1. Sin build step, sin backend, sin dependencias npm.

## Stack

- **HTML** + **Tailwind CSS CDN** + **Chart.js 4.4.1** + **vanilla JS**
- Se sirve directamente con GitHub Pages o cualquier servidor estático
- Todos los datos están embebidos en archivos JS que se cargan como scripts globales

## Archivos principales

| Archivo | Contenido |
|---|---|
| `index.html` | Estructura HTML, incluye todos los scripts al final del `<body>` |
| `js/data.js` | `SEASONS`, `POSITIONS`, `CAL_DATA`, `SPRINTS`, `RACE_CONSTRUCTORS` (~350KB+) |
| `js/drivers-info.js` | `DRIVERS_INFO` (bios, banderas, números) y `TEAMS_INFO` (datos de equipos) |
| `js/app.js` | Toda la lógica: navegación, gráficos, renderizado UI |
| `js/assets.js` | Objeto `FLAGS` (circuito ID → código ISO de país) |
| `css/styles.css` | Estilos mínimos (Tailwind maneja el resto) |
| `circuits/` | SVGs de trazados de circuitos (nombre = ID del circuito) |

---

## Estructuras de datos

### SEASONS
```js
SEASONS[year] = {
  champion_driver:     'VER',        // ID interno del campeón (solo si la temporada está completa)
  champion_constructor:'RBR',        // ID del constructor campeón
  completed:           17,           // número de carreras completadas (undefined si la temporada está terminada del todo y es histórica, o si es la actual activa)
  races:               ['BHR','SAU',...], // array de IDs de circuito en orden
  drivers: [{
    id:    'VER',
    name:  'M. VERSTAPPEN',     // nombre abreviado para display
    team:  'RED BULL',
    total: 575,                  // puntos totales de la temporada
    cum:   [25,44,69,...],       // puntos acumulados carrera a carrera (longitud = races.length)
    color: '#3671C6'             // color del equipo en esa temporada
  }],
  constructors: [{
    id:    'RBR',
    name:  'RED BULL',
    total: 860,
    cum:   [43,86,...],
    color: '#3671C6'
  }]
}
```

**IMPORTANTE — `completed`:**
- `undefined` → temporada activa actual, O temporada histórica completada en algunos casos. `racesDone = s.races.length`
- número (ej. `16`) → temporada en progreso, solo X carreras hechas. `racesDone = s.completed`
- `true` (boolean) → **BUG conocido, no usar**. Causa `racesDone = true → slice(0,1)`. Ver bug histórico 1980-1989 que fue corregido quitando el campo.

### POSITIONS
```js
POSITIONS[year][driverId] = ['1','R','2','','D','3',...]
// Un elemento por cada carrera del año (misma longitud que season.races)
```

**Códigos de posición:**
| Código | Significado |
|---|---|
| `'1'`–`'6'` | Posición con puntos |
| `'7'`, `'8'`,... | Terminó la carrera fuera de puntos (numérico) |
| `'R'` | Retirado (DNF) |
| `'D'` | Descalificado o no clasificó / falló la clasificación (DNS) |
| `'W'` | Retirado del evento (withdrew) |
| `''` (vacío) | **No participó en esa carrera** — se ignora en todos los contadores |

**CRÍTICO:** `''` vacío ≠ `'D'`. Un piloto que solo corrió 3 de 16 GPs debe tener `''` en los 13 que no corrió, NO `'D'` ni `'R'`. De lo contrario, el gráfico de DNF/Abandono lo muestra con 13 abandonos falsos.

### CAL_DATA
```js
CAL_DATA = {
  circuits: {
    'BHR': { name: 'Bahrain Grand Prix', circuit: '...', city: '...', length: '5.412 km', turns: 15, laps: 57 }
  },
  calendars: {
    '2024': [{ id: 'BHR', date: '2 Mar', round: 1, event: '' }, ...]
  }
}
```

### FLAGS (assets.js)
```js
FLAGS = { 'BHR': 'bh', 'SAU': 'sa', ... }  // circuito ID → código ISO de país (2 letras)
```
Cuando se agrega un nuevo circuito al calendario, **hay que agregar su flag aquí también**.

---

## Sistema de IDs de pilotos

El sistema usa **dos identificadores distintos**:

### ID interno (`d.id`)
- Único por piloto, nunca se repite entre eras
- Usado en `SEASONS`, `POSITIONS`, `RACE_CONSTRUCTORS`, `DRIVERS_INFO`
- Ejemplos: `JOS` (Jos Verstappen), `VER` (Max Verstappen), `JVR` (Jean-Éric Vergne)
- En los 80s/90s: `GVI` (Gilles Villeneuve), `JON` (Alan Jones), `PIQ` (Nelson Piquet)

### Código de display (`dCode(id)`)
- Lo que el usuario ve en la app: código oficial F1 de 3 letras
- **Puede repetirse entre eras**: ambos Verstappen muestran "VER", ambos Magnussen "MAG"
- Resuelto por `DRIVER_DISPLAY_CODES` en `app.js` + helper `dCode(id)`
- El usuario quiere que coincida con los códigos reales de transmisión F1

**Nunca usar el display code como clave de datos. Siempre usar el ID interno.**

### IDs con colisiones conocidas (1980s vs eras posteriores)
Algunos IDs de pilotos de los 80s colisionan con pilotos posteriores en `DRIVERS_INFO`:
- `STR` → Lance Stroll en DRIVERS_INFO, pero Philippe Streiff en SEASONS 1984-1988
- `SAL` → Mika Salo en DRIVERS_INFO, pero Eliseo Salazar en SEASONS 1981-1983
- `ACH` → Andrea Chiesa en DRIVERS_INFO, pero Kenny Acheson en SEASONS 1983-1985

Esto significa que al ver el perfil de un piloto de los 80s con ID colisionado, mostrará la bio del piloto moderno. Es un bug conocido pendiente de resolución.

---

## Sistema de puntos por era

| Era | Puntos | Notas |
|---|---|---|
| 1950–1959 | 8-6-4-3-2-1 | Top 5 + vuelta rápida |
| 1960–1990 | 9-6-4-3-2-1 | Top 6 |
| 1991–2002 | 10-6-4-3-2-1 | Top 6 |
| 2003–2009 | 10-8-6-5-4-3-2-1 | Top 8 |
| 2010– | 25-18-15-12-10-8-6-4-2-1 | Top 10 + vuelta rápida desde 2019 |

La app **no aplica la regla de descarte** (drop scores). Para 1984 y 1988, donde Lauda y Senna ganaron históricamente con la regla de descarte, la app muestra a Prost como campeón (ganó más puntos totales).

---

## Convenciones de colores

- El color de un piloto = el color de su equipo **en esa temporada**
- `driver.color === constructor.color` → permite saber a qué equipo pertenece el piloto
- Para temporadas donde un piloto cambió de equipo a mitad de año: usar `RACE_CONSTRUCTORS[year][driverId][raceIdx]`

---

## Conversión de CSV a posiciones (fuente de datos: f1_results_full.csv)

Archivo: `c:/Users/usuario/Desktop/proyecto f1/CSV proyecto F1/f1_results_full.csv`
Columnas: `year, round, race_name, date, driver_name, driver_code, driver_nationality, constructor, constructor_nationality, grid_position, position, position_text, points, laps`

Reglas de conversión `position_text` → código de la app:
- `position` es número → guardar como string del número (`'7'`, `'11'`, etc.)
- `position_text = 'R'` → `'R'` (retired)
- `position_text = 'N'` → `'R'` (not classified = tratado como retiro)
- `position_text = 'D'` → `'D'` (disqualified)
- `position_text = 'W'` → `'W'` (withdrew)
- `position_text = 'F'` → `'D'` (failed to qualify = DNS)
- `position_text = 'E'` → `'D'` (excluded)
- Driver ausente del CSV para esa carrera → `''` (vacío, no participó)

---

## Bugs resueltos (historial)

### `season.races` es array, no número
`season.races` es un array de IDs de circuito. Para el largo usar siempre `season.races.length`, nunca comparar directamente `season.races` como número.

### `completed: true` rompe gráficos
Si `completed` es el booleano `true` (en vez de un número o `undefined`), entonces `racesDone = true` que JavaScript coerce a `1` en `Array.slice()`. Resultado: el gráfico muestra solo 1 punto de datos. Solución: eliminar el campo o poner el número correcto.

### Posiciones 7+ marcadas como 'R'
La migración original de datos 1980s convirtió posiciones 7-16 a `'R'` (retirado). Esto causaba que todos los que no sumaban puntos aparecieran como DNF. Solución: guardar la posición numérica real (`'7'`, `'8'`, etc.).

### No-participación marcada como 'D'
Pilotos que no corrieron en un GP se marcaban como `'D'` y se contaban como DNF en la app. Solución: usar `''` (vacío) para "no participó", que es ignorado por todos los contadores.

### `lastIndexOf('};')` insertó en la sección equivocada
Al insertar entradas en `DRIVERS_INFO`, usar `lastIndexOf('};')` apuntó al cierre de `TEAMS_INFO` en vez de `DRIVERS_INFO`. Solución: buscar el marcador `// ============ TEAMS INFO` y usar `lastIndexOf('};', teamsMarkerPos)`.

---

## Cobertura de datos

- **1980–2026**: datos completos desde CSV
- **1980**: 41 pilotos, 15 equipos, 14 carreras — Campeón: Alan Jones (WIL)
- **1989**: 47 pilotos, 20 equipos, 16 carreras — Campeón: Alain Prost (MCL)
- `DRIVERS_INFO`: 190+ entradas (bios en español)
- `TEAMS_INFO`: 14 entradas (equipos actuales)

---

## Páginas de la app

| Página | Función |
|---|---|
| **Home** | Campeón/líder, strip de ganadores por carrera, gráficos de victorias/podios/DNF, último GP, countdown al próximo |
| **Standings** | Tabla y gráfico de progresión de puntos, pilotos o constructores, comparador A vs B |
| **Calendar** | Grilla de carreras del año, abre detalle de GP |
| **GP Detail** | Clasificación de la carrera, info del circuito |
| **Driver Detail** | Bio, stats de temporada actual, historial por año |
| **Team Detail** | Stats del equipo, pilotos actuales, historial |

La navegación es con `showPage(pageName)` y `changeYear(year)`. El año actual se guarda en `currentYear` (string).
