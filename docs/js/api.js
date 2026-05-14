// api.js — Carga datos desde archivos JSON estáticos (pitwall/data/).
// Para regenerar los JSON después de un GP: python export_static.py

const _yearCache = {};

async function _fetch(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`404: ${url}`);
    return r.json();
}

window.loadYearData = async function (year) {
    const y = String(year);
    if (_yearCache[y]) return;

    const data = await _fetch(`data/seasons/${y}.json`);

    window.SEASONS[y] = data.season;
    window.POSITIONS[y] = data.positions;
    window.CAL_DATA.calendars[y] = data.calendar;
    window.SPRINTS[y] = data.sprints;
    window.RACE_CONSTRUCTORS[y] = data.race_constructors;

    _yearCache[y] = true;
};

window.initAppData = async function () {
    const loading = document.getElementById('loadingScreen');

    try {
        const init = await _fetch('data/init.json');

        window.CAL_DATA         = { circuits: init.circuits, calendars: {} };
        window.DRIVERS_INFO     = init.drivers;
        window.TEAMS_INFO       = init.teams;
        window.FLAGS            = init.flags;
        window.POSITIONS        = {};
        window.SPRINTS          = {};
        window.RACE_CONSTRUCTORS = {};

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
                        No se pudieron cargar los datos
                    </p>
                    <p style="color:#aaa">
                        Corré <code style="color:#47efda">python export_static.py</code> para generar los archivos de datos.
                    </p>
                </div>`;
        }
    }
};

// Carga todas las temporadas en paralelo (para trayectorias completas).
window._loadAllSeasons = async function () {
    const unloaded = Object.keys(window.SEASONS || {}).filter(
        y => !window.SEASONS[y].drivers || window.SEASONS[y].drivers.length === 0
    );
    await Promise.all(unloaded.map(y => window.loadYearData(y)));
};

document.addEventListener('DOMContentLoaded', () => window.initAppData());
