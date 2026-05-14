// api.js — Cliente de la API FastAPI.
// Se carga antes de app.js y popula los globales SEASONS, POSITIONS, etc.

const API_BASE = 'http://localhost:8000/api';
const _yearCache = {};

async function _fetch(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API ${r.status}: ${url}`);
    return r.json();
}

// Carga los datos completos de una temporada y los pone en los globales.
window.loadYearData = async function (year) {
    const y = String(year);
    if (_yearCache[y]) return;

    const data = await _fetch(`${API_BASE}/seasons/${y}/full`);

    window.SEASONS[y] = data.season;
    window.POSITIONS[y] = data.positions;
    window.CAL_DATA.calendars[y] = data.calendar;
    window.SPRINTS[y] = data.sprints;
    window.RACE_CONSTRUCTORS[y] = data.race_constructors;

    _yearCache[y] = true;
};

// Inicializa todos los datos. Llamado automáticamente al cargar el DOM.
window.initAppData = async function () {
    const loading = document.getElementById('loadingScreen');

    try {
        const init = await _fetch(`${API_BASE}/init`);

        // Datos estáticos globales
        window.CAL_DATA    = { circuits: init.circuits, calendars: {} };
        window.DRIVERS_INFO = init.drivers;
        window.TEAMS_INFO   = init.teams;
        window.FLAGS        = init.flags;
        window.POSITIONS    = {};
        window.SPRINTS      = {};
        window.RACE_CONSTRUCTORS = {};

        // Skeleton de todas las temporadas (para el selector de año)
        window.SEASONS = {};
        for (const [y, s] of Object.entries(init.seasons_list)) {
            window.SEASONS[y] = {
                champion_driver: s.champion_driver,
                champion_constructor: s.champion_constructor,
                races: s.races,
                drivers: [],
                constructors: [],
            };
        }

        // Carga completa del año actual
        const defaultYear = '2026';
        await window.loadYearData(defaultYear);

        if (loading) loading.style.display = 'none';
        if (window.initApp) window.initApp();

    } catch (err) {
        console.error('Error cargando datos:', err);
        if (loading) {
            loading.innerHTML = `
                <div style="text-align:center;color:#ffb4a7;padding:2rem;font-family:sans-serif">
                    <p style="font-size:1.2rem;margin-bottom:1rem;font-weight:bold">
                        No se pudo conectar al servidor
                    </p>
                    <p style="color:#aaa;margin-bottom:1.5rem">
                        Asegurate de que el backend está corriendo:
                    </p>
                    <code style="background:#1b1c1d;color:#47efda;padding:8px 16px;border-radius:4px;display:inline-block">
                        cd backend &amp;&amp; uvicorn main:app --reload
                    </code>
                </div>`;
        }
    }
};

document.addEventListener('DOMContentLoaded', () => window.initAppData());
