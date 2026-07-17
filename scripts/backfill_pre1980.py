"""
Backfill histórico de las temporadas 1950-1979 a f1.db (Etapa 3-4 del proyecto
"extender la app a 1950-2026" — ver CLAUDE.md § Changelog). Corrida ÚNICA,
local, contra la f1.db del dueño. NO forma parte de export_static.py ni del
Action de Jolpica (esos son solo 2025+). En espíritu es como los scripts de
`migration/` originales que cargaron 1980-2024, pero automatizado vía la API
Jolpica-F1 y reusando el mapeo de IDs ya validado (Etapa 1) y los sistemas de
puntos ya validados (Etapa 2).

Fuente de datos: scripts/.pre1980_raw_cache.json (snapshot de la API Jolpica,
lo baja build_pre1980_map.py). Si no existe, este script falla pidiendo correr
primero build_pre1980_map.py.

Qué escribe en f1.db (todo dentro de UNA transacción — o entra todo, o nada):
  - Driver:  filas NUEVAS (los de continuidad NO se pisan; su metadata ya
             cargada a mano puede ser mejor que la de Jolpica).
  - Circuit: filas NUEVAS (idem continuidad).
  - Team:    NO se crean filas para equipos históricos desaparecidos — igual
             que el histórico 1980+, que los referencia solo por team_id
             (nombre en mayúscula) sin fila en `teams`. Los vigentes ya tienen
             fila.
  - Season:  una por año, con champion_driver_id / champion_constructor_id
             (mapeados; constructor es None para 1950-1957, sin campeonato).
  - RaceCalendar + RaceResult: por año (delete-first de ese año para que la
             re-corrida sea idempotente).
  - SeasonTeamColor: NO se cargan (no hay dato de color de esa era; el
             frontend cae a gris por defecto, igual que para varios equipos
             de 1980).

Decisiones clave (ver CLAUDE.md para el detalle):
  - Indianápolis 500 (1950-1960) EXCLUIDO del calendario (pilotos/autos de
    IndyCar sin conexión con la F1 europea; no cambia ningún campeón real).
  - Constructores unificados por MARCA DE CHASIS (brabham-repco+brabham-ford
    -> BRABHAM), vía el `code` ya resuelto en jolpica_map_pre1980.json.
  - Autos compartidos (mismo piloto en 2 autos en 1 carrera): la constraint
    UniqueConstraint(race_id, driver_id) obliga a UNA fila; se conserva el
    MEJOR resultado del piloto esa carrera (menor posición; los puntos de esa
    fila) — coincide con la regla FIA de la época, verificada contra Fangio
    1956 en la Etapa 2.
  - Campos extendidos (grid/quali/fastest_lap): NO se cargan (política igual
    al histórico 1980-2024, congelado sin ellos). El punto de vuelta rápida
    de los 50s YA viene sumado en `points` de Jolpica, así que los standings
    salen correctos sin necesitar el flag.

Solo librería estándar + SQLAlchemy (que el backend ya usa).
"""
import json
import os
import ssl
import sys
import time
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))

from database import SessionLocal, engine, Base  # noqa: E402
from models import (  # noqa: E402
    Driver, Circuit, Season, RaceCalendar, RaceResult,
)

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCRIPTS_DIR = os.path.join(REPO_ROOT, "scripts")
CACHE_PATH = os.path.join(SCRIPTS_DIR, ".pre1980_raw_cache.json")
STANDINGS_CACHE_PATH = os.path.join(SCRIPTS_DIR, ".pre1980_standings_cache.json")
MAP_PATH = os.path.join(SCRIPTS_DIR, "jolpica_map_pre1980.json")
JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"

YEARS = range(1950, 1980)
EXCLUDE_RACE = "Indianapolis 500"

MONTHS_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

# positionText de Ergast -> código interno (espejo de sync_jolpica.py /
# backend/constants.py). En 1950-1979 solo aparecen R, W, D (verificado).
ERGAST_POS_CODES = {"R": "R", "D": "DSQ", "E": "EX", "W": "W", "F": "F", "N": "N"}

# nacionalidad Jolpica (inglés) -> (nombre en español como usa la DB, ISO-2 flag)
NATIONALITY = {
    "British": ("Reino Unido", "gb"), "French": ("Francia", "fr"),
    "Italian": ("Italia", "it"), "American": ("Estados Unidos", "us"),
    "New Zealander": ("Nueva Zelanda", "nz"), "German": ("Alemania", "de"),
    "Brazilian": ("Brasil", "br"), "Swiss": ("Suiza", "ch"),
    "Swedish": ("Suecia", "se"), "Australian": ("Australia", "au"),
    "Argentine": ("Argentina", "ar"), "Belgian": ("Bélgica", "be"),
    "Austrian": ("Austria", "at"), "South African": ("Sudáfrica", "za"),
    "Mexican": ("México", "mx"), "Dutch": ("Países Bajos", "nl"),
    "Canadian": ("Canadá", "ca"), "Spanish": ("España", "es"),
    "Thai": ("Tailandia", "th"), "Finnish": ("Finlandia", "fi"),
    "Monegasque": ("Mónaco", "mc"), "Rhodesian": ("Rodesia", "zw"),
    "Irish": ("Irlanda", "ie"), "Liechtensteiner": ("Liechtenstein", "li"),
    "Uruguayan": ("Uruguay", "uy"), "Japanese": ("Japón", "jp"),
    "East German": ("Alemania del Este", "de"), "Portuguese": ("Portugal", "pt"),
    "Danish": ("Dinamarca", "dk"), "Venezuelan": ("Venezuela", "ve"),
}


class BackfillError(Exception):
    pass


def load_json(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _ssl_context():
    if os.environ.get("PITWALL_CA_INSECURE") == "1":
        print("ADVERTENCIA: PITWALL_CA_INSECURE=1 - verificacion TLS desactivada.", file=sys.stderr)
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pitwall-backfill-pre1980"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
        return json.load(r)


def load_standings():
    """Campeón (posición 1) de pilotos y constructores por año, cacheado en
    disco. Estructura: {year: {'driver': ext_id|None, 'constructor': ext_id|None}}.
    El constructor es None en 1950-1957 (no había campeonato). Se toma el
    ext_id crudo de Jolpica; el mapeo a id interno se hace en el caller."""
    if os.path.exists(STANDINGS_CACHE_PATH):
        return load_json(STANDINGS_CACHE_PATH)
    out = {}
    for year in YEARS:
        print(f"  standings {year}...", file=sys.stderr)
        entry = {"driver": None, "constructor": None}
        d = _get(f"{JOLPICA_BASE}/{year}/driverStandings.json")
        lists = d["MRData"]["StandingsTable"]["StandingsLists"]
        if lists:
            entry["driver"] = lists[0]["DriverStandings"][0]["Driver"]["driverId"]
        time.sleep(1.5)
        c = _get(f"{JOLPICA_BASE}/{year}/constructorStandings.json")
        clists = c["MRData"]["StandingsTable"]["StandingsLists"]
        if clists:
            entry["constructor"] = clists[0]["ConstructorStandings"][0]["Constructor"]["constructorId"]
        time.sleep(1.5)
        out[str(year)] = entry
    with open(STANDINGS_CACHE_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    return out


def to_position_text(position_text, status):
    if position_text.isdigit():
        return str(int(position_text))
    code = ERGAST_POS_CODES.get(position_text)
    if code is None:
        raise BackfillError(f"positionText no reconocido: {position_text!r} (status {status!r})")
    if code == "R" and status and status.lower().startswith("did not start"):
        return "DNS"
    return code


def race_date_display(iso_date):
    # '1950-05-13' -> '13 May'
    if not iso_date:
        return ""
    y, m, d = iso_date.split("-")
    return f"{int(d)} {MONTHS_ABBR[int(m) - 1]}"


def main():
    if not os.path.exists(CACHE_PATH):
        raise BackfillError(
            f"No existe {CACHE_PATH}. Correr primero:\n"
            f"  PITWALL_CA_INSECURE=1 python scripts/build_pre1980_map.py")
    cache = load_json(CACHE_PATH)
    jmap = load_json(MAP_PATH)
    dmap = {k: v["code"] for k, v in jmap["drivers"].items()}
    cmap = {k: v["code"] for k, v in jmap["constructors"].items()}
    zmap = {k: v["code"] for k, v in jmap["circuits"].items()}
    standings = load_standings()

    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    existing_drivers = {d.id for d in db.query(Driver.id).all()}
    existing_circuits = {c.id for c in db.query(Circuit.id).all()}

    # Metadata de entidades nuevas: primer año de aparición para debut_year.
    driver_meta = {}   # code -> {name, nat, flag, dob, debut}
    circuit_meta = {}  # code -> {name, circuit_name, city, flag}

    stats = {"races": 0, "results": 0, "collapsed": 0, "new_drivers": 0,
             "new_circuits": 0, "seasons": 0}
    missing = set()

    try:
        for year in YEARS:
            races = [r for r in cache[str(year)] if r["raceName"] != EXCLUDE_RACE]
            if not races:
                continue

            # limpiar cualquier dato previo de este año (idempotencia)
            cal_ids = [c.id for c in db.query(RaceCalendar.id).filter(RaceCalendar.year == year).all()]
            if cal_ids:
                db.query(RaceResult).filter(RaceResult.race_id.in_(cal_ids)).delete(synchronize_session=False)
                db.query(RaceCalendar).filter(RaceCalendar.year == year).delete(synchronize_session=False)

            round_num = 0
            for race in sorted(races, key=lambda r: int(r["round"])):
                round_num += 1
                cj = race["Circuit"]
                cid = zmap.get(cj["circuitId"])
                if cid is None:
                    missing.add(f"circuit:{cj['circuitId']}")
                    continue
                circuit_meta.setdefault(cid, {
                    "name": cj["circuitName"],  # sin nombre de GP en Jolpica; se usa el del trazado
                    "circuit_name": cj["circuitName"],
                    "city": f"{cj['Location']['locality']}, {cj['Location']['country']}",
                    "flag": "",
                })

                cal = RaceCalendar(
                    year=year, round=round_num, circuit_id=cid,
                    race_date=race_date_display(race.get("date")),
                    is_sprint=0, event_description="",
                )
                db.add(cal)
                db.flush()  # para obtener cal.id
                stats["races"] += 1

                # agrupar resultados por piloto interno (colapsar autos compartidos)
                best = {}  # driver_code -> (pos_sort, position_text, points, team_code)
                for res in race["Results"]:
                    drv = res["Driver"]
                    did = dmap.get(drv["driverId"])
                    if did is None:
                        missing.add(f"driver:{drv['driverId']}")
                        continue
                    tid = cmap.get(res["Constructor"]["constructorId"])
                    if tid is None:
                        missing.add(f"constructor:{res['Constructor']['constructorId']}")
                        continue
                    ptxt = to_position_text(res["positionText"], res.get("status", ""))
                    pts = float(res.get("points", 0) or 0)
                    # clave de orden: posición numérica si la hay, si no un valor alto
                    pos_sort = int(res["position"]) if res.get("position", "").isdigit() else 9999

                    driver_meta.setdefault(did, {
                        "name": f"{drv.get('givenName','')} {drv.get('familyName','')}".strip(),
                        "nat": drv.get("nationality"),
                        "dob": drv.get("dateOfBirth"),
                        "debut": year,
                    })

                    prev = best.get(did)
                    if prev is None or pos_sort < prev[0]:
                        if prev is not None:
                            stats["collapsed"] += 1
                        best[did] = (pos_sort, ptxt, pts, tid)
                    else:
                        stats["collapsed"] += 1

                for did, (_, ptxt, pts, tid) in best.items():
                    db.add(RaceResult(
                        race_id=cal.id, driver_id=did, team_id=tid,
                        position_text=ptxt, points=pts,
                    ))
                    stats["results"] += 1

            # Campeones del año (posición 1 de los standings oficiales de Jolpica)
            st = standings.get(str(year), {})
            champ_driver = None
            if st.get("driver"):
                champ_driver = dmap.get(st["driver"])
                if champ_driver is None:
                    missing.add(f"driver(champion):{st['driver']}")
            champ_constructor = None
            if st.get("constructor"):
                champ_constructor = cmap.get(st["constructor"])
                if champ_constructor is None:
                    missing.add(f"constructor(champion):{st['constructor']}")

            season = db.query(Season).filter(Season.year == year).first()
            if season is None:
                season = Season(year=year)
                db.add(season)
            season.champion_driver_id = champ_driver
            season.champion_constructor_id = champ_constructor
            stats["seasons"] += 1

        if missing:
            raise BackfillError(
                "IDs sin mapear (nada se escribió):\n  " + "\n  ".join(sorted(missing)))

        # Insertar entidades nuevas (drivers/circuits) — no pisar las de continuidad.
        for code, m in driver_meta.items():
            if code in existing_drivers:
                continue
            nat_es, flag = NATIONALITY.get(m["nat"], (m["nat"], ""))
            db.add(Driver(
                id=code, name=m["name"], nationality=nat_es, flag=flag,
                dob=m["dob"], debut_year=m["debut"],
            ))
            existing_drivers.add(code)
            stats["new_drivers"] += 1

        for code, m in circuit_meta.items():
            if code in existing_circuits:
                continue
            db.add(Circuit(
                id=code, name=m["name"], circuit_name=m["circuit_name"],
                city=m["city"], flag=m["flag"],
            ))
            existing_circuits.add(code)
            stats["new_circuits"] += 1

        if os.environ.get("DRY_RUN") == "1":
            db.rollback()
            print("DRY_RUN=1 — rollback, nada escrito. Stats de lo que se habría cargado:")
            for k, v in stats.items():
                print(f"  {k}: {v}")
            return

        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print("Backfill 1950-1979 OK (commit).")
    for k, v in stats.items():
        print(f"  {k}: {v}")


if __name__ == "__main__":
    try:
        main()
    except BackfillError as e:
        print(f"ERROR: {e}", file=sys.stderr)
        sys.exit(1)
