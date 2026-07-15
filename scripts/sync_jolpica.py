"""
sync_jolpica.py — sincroniza los resultados de una temporada 2025+ desde la API
Jolpica-F1 (Ergast) directo a docs/data/seasons/{year}.json + docs/data/init.json,
SIN pasar por f1.db. Es el corazón de la automatización post-GP (la corre un
GitHub Action, tarea posterior). Solo librería estándar (corre en el Action sin
paso de instalación), como scripts/validate_map.py.

    python scripts/sync_jolpica.py --year 2025
    python scripts/sync_jolpica.py --year 2026 --dry-run   # calcula y muestra el
                                                           # diff semántico, no escribe

FUENTE DE VERDAD (leer CLAUDE.md § changelog 2026-07-15 "sync Jolpica"):
para 2025+ el JSON de producción es la fuente de verdad, NO f1.db. Este script
lo escribe; export_static.py se niega a pisar esos años salvo --force (ver ahí).
scripts/import_to_db.py permite backfillear f1.db desde el JSON para reconciliar.

QUÉ TOMA DE JOLPICA (recalculado, autoritativo): positions, grid, quali, vuelta
rápida, sprints, y los puntos/standings (total + cum por ronda).
QUÉ PRESERVA DEL JSON EXISTENTE (metadata que no vive en Jolpica, viene de la DB
del dueño): calendar (fechas display, event, flag sprint, hora UTC), nombres de
piloto ("L. Norris"), nombres de equipo ("McLAREN"), colores, y champion_* (que
es una decisión del dueño). Por eso el JSON de la temporada DEBE existir ya.

VALIDACIÓN ESTRICTA antes de escribir (si algo falla: exit EXIT_ERROR, no escribe
NADA): rondas con fecha pasada tienen resultados completos en Jolpica (una
carrera recién terminada puede tardar horas → "aún no disponible", no error);
≥MIN_CARS autos por carrera; ningún ID sin mapear (usa scripts/jolpica_map.json,
nunca inventa); los puntos recalculados cuadran con los standings de Jolpica.

EXIT CODES (para el Action):
    0  (EXIT_WROTE)       se escribieron datos nuevos → hay algo que comitear
    3  (EXIT_NO_CHANGES)  sin novedades → nada que comitear (idempotente)
    1  (EXIT_ERROR)       error de validación/red → NO se escribió nada
"""
import argparse
import datetime as dt
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"
PAGE_SIZE = 100                  # Jolpica cappea el límite real en 100
REQUEST_PAUSE_SECONDS = 1.5      # cortesía: API comunitaria gratuita con rate limit
MANAGED_FROM_YEAR = 2025         # antes de esto el histórico está congelado
MIN_CARS_PER_RACE = 18           # grilla mínima razonable para dar una carrera por completa
GRACE_HOURS = 48                 # una carrera recién corrida puede tardar en cargarse

EXIT_WROTE = 0
EXIT_NO_CHANGES = 3
EXIT_ERROR = 1

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "docs", "data")
SEASONS_DIR = os.path.join(DATA_DIR, "seasons")
MAP_PATH = os.path.join(SCRIPT_DIR, "jolpica_map.json")
INIT_PATH = os.path.join(DATA_DIR, "init.json")

MONTHS = {m: i for i, m in enumerate(
    ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"], start=1)}

# positionText de Ergast → código interno de no-clasificación (backend/constants.py).
# Un número se deja tal cual (sin ceros a la izquierda). Cualquier código NO listado
# hace fallar el sync (nunca se inventa un código nuevo silenciosamente).
ERGAST_POS_CODES = {
    "R": "R",     # Retired
    "D": "DSQ",   # Disqualified (Ergast usa "D"; internamente "DSQ", como la carga manual)
    "E": "EX",    # Excluded
    "W": "W",     # Withdrew
    "F": "F",     # Failed to qualify
    "N": "N",     # Not classified
}


class SyncError(Exception):
    """Falla de validación → el script sale con EXIT_ERROR sin escribir nada."""


# ── HTTP ──────────────────────────────────────────────────────────────────────

def _ssl_context():
    # En CI (GitHub Actions) los certificados del sistema andan y esto usa
    # verificación normal. PITWALL_CA_INSECURE=1 es un escape SOLO para dev local
    # detrás de un proxy que intercepta TLS; NUNCA setearlo en el Action.
    if os.environ.get("PITWALL_CA_INSECURE") == "1":
        print("ADVERTENCIA: PITWALL_CA_INSECURE=1 — verificación TLS DESACTIVADA "
              "(solo dev local, jamás en CI).", file=sys.stderr)
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pitwall-sync-jolpica/1.0"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
        return json.load(r)


def fetch_all_by_round(year, resource, inner_key):
    """Baja un recurso por año paginando y mergeando por 'round' (una carrera
    puede quedar partida entre dos páginas porque el límite de 100 no coincide
    con ~20 resultados por carrera). Devuelve {round:int -> race dict}."""
    by_round = {}
    offset = 0
    while True:
        url = f"{JOLPICA_BASE}/{year}/{resource}.json?limit={PAGE_SIZE}&offset={offset}"
        md = fetch_json(url)["MRData"]
        total = int(md["total"])
        for race in md["RaceTable"]["Races"]:
            rnd = int(race["round"])
            if rnd in by_round:
                by_round[rnd][inner_key].extend(race.get(inner_key, []))
            else:
                race.setdefault(inner_key, [])
                by_round[rnd] = race
        offset += PAGE_SIZE
        if offset >= total:
            break
        time.sleep(REQUEST_PAUSE_SECONDS)
    return by_round


# ── Carga de mapeos y datos locales ────────────────────────────────────────────

def load_json_file(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def map_id(section, ext_id, jmap, missing):
    internal = jmap[section].get(ext_id)
    if internal is None:
        missing.add(f"{section}:{ext_id}")
    return internal


# ── Conversión de códigos ───────────────────────────────────────────────────────

def to_position_text(position_text, status):
    if position_text.isdigit():
        return str(int(position_text))
    code = ERGAST_POS_CODES.get(position_text)
    if code is None:
        raise SyncError(
            f"positionText de Ergast no reconocido: {position_text!r} "
            f"(status {status!r}). Agregar el mapeo en ERGAST_POS_CODES y en "
            f"backend/constants.py / docs/js/app.js si es un código nuevo.")
    if code == "R" and status and status.lower().startswith("did not start"):
        return "DNS"
    return code


# ── Parse de fecha del calendario ("16 Mar" + año) ──────────────────────────────

def parse_calendar_date(date_str, year):
    parts = (date_str or "").split()
    if len(parts) != 2 or parts[1] not in MONTHS:
        raise SyncError(
            f"No pude parsear la fecha del calendario {date_str!r} para {year}. "
            f"Se esperaba 'D Mon' (ej '16 Mar').")
    return dt.date(year, MONTHS[parts[1]], int(parts[0]))


# ── Núcleo: construir el JSON de la temporada ───────────────────────────────────

def build_season_json(year, base, jmap, today):
    """Devuelve (nuevo_dict_temporada, resumen_dict). Lanza SyncError si algo no valida."""
    calendar = base["calendar"]                       # se preserva tal cual
    rounds_in_cal = [c["round"] for c in calendar]
    round_to_idx = {c["round"]: i for i, c in enumerate(calendar)}
    round_to_circuit = {c["round"]: c["id"] for c in calendar}
    total_rounds = len(calendar)

    # 1) bajar de Jolpica
    print(f"  bajando resultados/sprint/quali de {year}...", file=sys.stderr)
    results = fetch_all_by_round(year, "results", "Results")
    time.sleep(REQUEST_PAUSE_SECONDS)
    sprints = fetch_all_by_round(year, "sprint", "SprintResults")
    time.sleep(REQUEST_PAUSE_SECONDS)
    quali = fetch_all_by_round(year, "qualifying", "QualifyingResults")
    time.sleep(REQUEST_PAUSE_SECONDS)

    # standings para validación de puntos
    dstand_md = fetch_json(f"{JOLPICA_BASE}/{year}/driverStandings.json")["MRData"]
    time.sleep(REQUEST_PAUSE_SECONDS)
    cstand_md = fetch_json(f"{JOLPICA_BASE}/{year}/constructorStandings.json")["MRData"]
    missing = set()
    driver_standings = {}
    dlists = dstand_md["StandingsTable"]["StandingsLists"]
    if dlists:
        for row in dlists[0]["DriverStandings"]:
            iid = map_id("drivers", row["Driver"]["driverId"], jmap, missing)
            if iid:
                driver_standings[iid] = float(row["points"])
    constructor_standings = {}
    clists = cstand_md["StandingsTable"]["StandingsLists"]
    if clists:
        for row in clists[0]["ConstructorStandings"]:
            iid = map_id("constructors", row["Constructor"]["constructorId"], jmap, missing)
            if iid:
                constructor_standings[iid] = float(row["points"])

    # 2) validación de fechas: qué rondas procesar
    def race_complete(rnd):
        race = results.get(rnd)
        return race is not None and len(race.get("Results", [])) >= MIN_CARS_PER_RACE

    grace = dt.timedelta(hours=GRACE_HOURS)
    today_dt = dt.datetime.combine(today, dt.time())
    process_rounds = []
    pending = []
    for rnd in rounds_in_cal:
        rdate = parse_calendar_date(calendar[round_to_idx[rnd]]["date"], year)
        rdate_dt = dt.datetime.combine(rdate, dt.time())
        if race_complete(rnd) and rdate_dt <= today_dt:
            process_rounds.append(rnd)
        elif rdate_dt < today_dt - grace:
            # ya pasó hace rato y NO está completa en Jolpica → error real
            n = len(results.get(rnd, {}).get("Results", []))
            raise SyncError(
                f"round {rnd} ({round_to_circuit[rnd]}, {calendar[round_to_idx[rnd]]['date']} "
                f"{year}) ya pasó hace >{GRACE_HOURS}h pero Jolpica trae {n} resultados "
                f"(<{MIN_CARS_PER_RACE}). Datos incompletos, no se escribe nada.")
        elif rdate_dt <= today_dt:
            pending.append(rnd)  # recién corrida, aún no cargada → no es error

    # 3) mapear IDs de todas las rondas a procesar (falla listando faltantes)
    #    Estructuras por ronda:
    race_pos = {}       # rnd -> {internal_driver: position_text}
    race_pts = {}       # rnd -> {internal_driver: race_points_float}
    grid_by = {}        # rnd -> {internal_driver: grid_str}
    team_by = {}        # rnd -> {internal_driver: internal_team}
    fl_by = {}          # rnd -> internal_driver (vuelta rápida)
    for rnd in process_rounds:
        race = results[rnd]
        # cross-check circuito del round contra el mapa (detecta reordenamientos)
        cid = race["Circuit"]["circuitId"]
        mapped_cid = jmap["races"]["circuits"].get(cid)
        if mapped_cid is None:
            missing.add(f"races.circuits:{cid}")
        elif mapped_cid != round_to_circuit[rnd]:
            raise SyncError(
                f"round {rnd}: Jolpica trae circuito '{cid}' → '{mapped_cid}', pero el "
                f"calendario local tiene '{round_to_circuit[rnd]}' (¿reordenamiento?).")
        race_pos[rnd], race_pts[rnd], grid_by[rnd], team_by[rnd] = {}, {}, {}, {}
        for res in race["Results"]:
            drv = map_id("drivers", res["Driver"]["driverId"], jmap, missing)
            team = map_id("constructors", res["Constructor"]["constructorId"], jmap, missing)
            if not drv or not team:
                continue
            race_pos[rnd][drv] = to_position_text(res["positionText"], res.get("status", ""))
            race_pts[rnd][drv] = float(res["points"])
            grid_by[rnd][drv] = str(int(res["grid"])) if str(res.get("grid", "")).strip() != "" else ""
            team_by[rnd][drv] = team
            fl = res.get("FastestLap")
            if fl and fl.get("rank") == "1":
                fl_by[rnd] = drv

    # sprint por ronda
    sprint_pos = {}     # rnd -> {internal_driver: position_text}
    sprint_pts = {}     # rnd -> {internal_driver: sprint_points_float}
    for rnd in process_rounds:
        srace = sprints.get(rnd)
        if not srace:
            continue
        sprint_pos[rnd], sprint_pts[rnd] = {}, {}
        for res in srace.get("SprintResults", []):
            drv = map_id("drivers", res["Driver"]["driverId"], jmap, missing)
            if not drv:
                continue
            sprint_pos[rnd][drv] = to_position_text(res["positionText"], res.get("status", ""))
            sprint_pts[rnd][drv] = float(res["points"])

    # quali por ronda
    quali_by = {}       # rnd -> {internal_driver: quali_pos_str}
    for rnd in process_rounds:
        qrace = quali.get(rnd)
        if not qrace:
            continue
        quali_by[rnd] = {}
        for res in qrace.get("QualifyingResults", []):
            drv = map_id("drivers", res["Driver"]["driverId"], jmap, missing)
            if not drv:
                continue
            quali_by[rnd][drv] = str(int(res["position"]))

    if missing:
        raise SyncError(
            "IDs de Jolpica sin mapear en scripts/jolpica_map.json (agregarlos ahí, "
            "ver validate_map.py — NUNCA inventar el mapeo):\n  " +
            "\n  ".join(sorted(missing)))

    # 4) armar arrays por piloto en orden de calendario
    all_drivers = set()
    for rnd in process_rounds:
        all_drivers.update(race_pos[rnd].keys())

    def build_grid_like(per_round):
        out = {}
        for drv in all_drivers:
            arr = [""] * total_rounds
            for rnd in process_rounds:
                v = per_round.get(rnd, {}).get(drv, "")
                arr[round_to_idx[rnd]] = v
            if any(x != "" for x in arr):
                out[drv] = arr
        return out

    positions = build_grid_like(race_pos)
    grid = build_grid_like(grid_by)
    quali_out = build_grid_like(quali_by)

    sprints_out = {}
    for rnd in process_rounds:
        if sprint_pos.get(rnd):
            sprints_out[str(round_to_idx[rnd])] = dict(sorted(sprint_pos[rnd].items()))

    fastest_laps = {str(round_to_idx[rnd]): fl_by[rnd]
                    for rnd in process_rounds if rnd in fl_by}

    # 5) totales y cum (puntos por ronda = carrera + sprint; convención de la DB)
    combined_round_pts = {}   # drv -> {rnd: pts}
    for rnd in process_rounds:
        for drv, pts in race_pts[rnd].items():
            combined_round_pts.setdefault(drv, {})[rnd] = pts + sprint_pts.get(rnd, {}).get(drv, 0.0)

    driver_total = {d: sum(rp.values()) for d, rp in combined_round_pts.items()}
    driver_cum = {}
    for drv, rp in combined_round_pts.items():
        running, cum = 0.0, []
        for rnd in sorted(rp, key=lambda r: round_to_idx[r]):
            running += rp[rnd]
            cum.append(running)
        driver_cum[drv] = cum

    # constructores: puntos por ronda sumando ambos autos (carrera + sprint)
    team_round_pts = {}
    for rnd in process_rounds:
        for drv, pts in race_pts[rnd].items():
            team = team_by[rnd][drv]
            total = pts + sprint_pts.get(rnd, {}).get(drv, 0.0)
            team_round_pts.setdefault(team, {}).setdefault(rnd, 0.0)
            team_round_pts[team][rnd] += total
    team_total = {t: sum(rp.values()) for t, rp in team_round_pts.items()}
    team_cum = {}
    for team, rp in team_round_pts.items():
        running, cum = 0.0, []
        for rnd in sorted(rp, key=lambda r: round_to_idx[r]):
            running += rp[rnd]
            cum.append(running)
        team_cum[team] = cum

    # 6) validación: puntos recalculados == standings de Jolpica (si no salteamos rondas)
    if not pending:
        _check_totals(driver_total, driver_standings, "piloto")
        _check_totals(team_total, constructor_standings, "constructor")

    # 7) season.drivers / constructors, preservando metadata del JSON existente
    base_drivers = {d["id"]: d for d in base["season"]["drivers"]}
    base_dorder = {d["id"]: i for i, d in enumerate(base["season"]["drivers"])}
    base_constructors = {c["id"]: c for c in base["season"]["constructors"]}
    base_corder = {c["id"]: i for i, c in enumerate(base["season"]["constructors"])}
    team_color = {c["id"]: c["color"] for c in base["season"]["constructors"]}
    team_display = {c["id"]: c["name"] for c in base["season"]["constructors"]}

    def driver_entry(drv):
        prev = base_drivers.get(drv)
        # equipo mostrado = el de más rondas (primario), como hace crud
        team_counts = {}
        for rnd in process_rounds:
            t = team_by.get(rnd, {}).get(drv)
            if t:
                team_counts[t] = team_counts.get(t, 0) + 1
        primary = max(team_counts, key=team_counts.get) if team_counts else None
        return {
            "id": drv,
            "name": prev["name"] if prev else _fallback_driver_name(drv, base),
            "team": prev["team"] if prev else team_display.get(primary, primary or ""),
            "total": driver_total.get(drv, 0.0),
            "cum": driver_cum.get(drv, [driver_total.get(drv, 0.0)]),
            "color": prev["color"] if prev else team_color.get(primary, "#888888"),
        }

    drivers_list = sorted(
        (driver_entry(d) for d in all_drivers),
        key=lambda e: (-e["total"], base_dorder.get(e["id"], 10_000), e["id"]))

    def constructor_entry(team):
        prev = base_constructors.get(team)
        return {
            "id": team,
            "name": prev["name"] if prev else team_display.get(team, team),
            "total": team_total.get(team, 0.0),
            "cum": team_cum.get(team, [team_total.get(team, 0.0)]),
            "color": prev["color"] if prev else team_color.get(team, "#888888"),
        }

    constructors_list = sorted(
        (constructor_entry(t) for t in team_total),
        key=lambda e: (-e["total"], base_corder.get(e["id"], 10_000), e["id"]))

    # 8) race_constructors (solo cambios respecto del equipo primario del piloto)
    primary_team = {}
    for drv in all_drivers:
        counts = {}
        for rnd in process_rounds:
            t = team_by.get(rnd, {}).get(drv)
            if t:
                counts[t] = counts.get(t, 0) + 1
        if counts:
            primary_team[drv] = max(counts, key=counts.get)
    race_constructors = {}
    for drv in all_drivers:
        changes = {}
        for rnd in process_rounds:
            t = team_by.get(rnd, {}).get(drv)
            if t and t != primary_team.get(drv):
                changes[str(round_to_idx[rnd])] = t
        if changes:
            race_constructors[drv] = dict(sorted(changes.items(), key=lambda kv: int(kv[0])))

    # 9) ensamblar en el MISMO orden de claves que export_static.py
    completed = len(process_rounds)
    season_obj = {
        "champion_driver": base["season"].get("champion_driver", ""),
        "champion_constructor": base["season"].get("champion_constructor", ""),
        "races": [c["id"] for c in calendar],
        "drivers": drivers_list,
        "constructors": constructors_list,
    }
    if completed < total_rounds:
        season_obj["completed"] = completed

    extended = bool(grid or quali_out or fastest_laps)
    out = {
        "season": season_obj,
        "positions": dict(sorted(positions.items())),
        "calendar": calendar,
        "sprints": sprints_out,
        "race_constructors": dict(sorted(race_constructors.items())),
        "extended": extended,
    }
    if extended:
        out["grid"] = dict(sorted(grid.items()))
        out["quali"] = dict(sorted(quali_out.items()))
        out["fastest_laps"] = fastest_laps

    summary = {"process_rounds": process_rounds, "pending": pending,
               "drivers": len(drivers_list), "extended": extended}
    return out, summary


def _check_totals(computed, standings, label):
    problems = []
    ids = set(computed) | set(standings)
    for iid in sorted(ids):
        c = round(computed.get(iid, 0.0), 4)
        s = round(standings.get(iid, 0.0), 4)
        if c != s:
            problems.append(f"    {iid}: recalculado {c} vs Jolpica standings {s}")
    if problems:
        raise SyncError(
            f"Los puntos recalculados de {label} NO cuadran con los standings de "
            f"Jolpica (no se escribe nada):\n" + "\n".join(problems))


def _fallback_driver_name(drv, base):
    # Piloto nuevo que no estaba en el JSON: no tenemos su nombre interno de la DB.
    # Se usa el código como placeholder (mismo patrón preexistente de la app para
    # pilotos sin name) y se avisa; el dueño debería completarlo en init.json.
    print(f"  AVISO: piloto {drv} no estaba en el JSON existente; se usa el código "
          f"como nombre placeholder. Completar metadata en init.json.", file=sys.stderr)
    return drv


# ── init.json ───────────────────────────────────────────────────────────────────

def update_init(year, season_obj):
    init = load_json_file(INIT_PATH)
    entry = {
        "champion_driver": season_obj["champion_driver"],
        "champion_constructor": season_obj["champion_constructor"],
        "races": season_obj["races"],
    }
    changed = init["seasons_list"].get(str(year)) != entry
    if changed:
        init["seasons_list"][str(year)] = entry
    return init, changed


# ── Escritura / diff ────────────────────────────────────────────────────────────

def write_json(path, data):
    # Mismo formato exacto que export_static.py (compacto, sin newline final) para
    # que ambas herramientas produzcan bytes idénticos.
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


def semantic_diff(old, new):
    """Diff estructural old→new: claves agregadas/quitadas y regresiones en las
    compartidas. Se usa como evidencia (los JSON son minificados de una línea, un
    git diff textual no sirve)."""
    lines = []
    old_keys, new_keys = set(old), set(new)
    for k in sorted(new_keys - old_keys):
        lines.append(f"  + clave NUEVA top-level: {k}")
    for k in sorted(old_keys - new_keys):
        lines.append(f"  - clave QUITADA top-level: {k}")
    for k in sorted(old_keys & new_keys):
        if old[k] != new[k]:
            lines.append(f"  ~ clave modificada: {k}")
            lines.extend(_diff_detail(k, old[k], new[k]))
    return lines


def _diff_detail(key, a, b):
    out = []
    if isinstance(a, dict) and isinstance(b, dict):
        for sk in sorted(set(a) | set(b)):
            if a.get(sk) != b.get(sk):
                out.append(f"      · {key}.{sk}: {a.get(sk)!r} → {b.get(sk)!r}")
    elif isinstance(a, list) and isinstance(b, list):
        if len(a) != len(b):
            out.append(f"      · {key}: len {len(a)} → {len(b)}")
        for i, (x, y) in enumerate(zip(a, b)):
            if x != y:
                out.append(f"      · {key}[{i}]: {x!r} → {y!r}")
    else:
        out.append(f"      · {key}: {a!r} → {b!r}")
    return out[:60]


# ── Main ──────────────────────────────────────────────────────────────────────

def run(year, dry_run):
    if year < MANAGED_FROM_YEAR:
        raise SyncError(
            f"Este script solo gestiona {MANAGED_FROM_YEAR}+. El histórico "
            f"1980-{MANAGED_FROM_YEAR - 1} está congelado y no se toca vía Jolpica.")
    season_path = os.path.join(SEASONS_DIR, f"{year}.json")
    if not os.path.isfile(season_path):
        raise SyncError(
            f"No existe {season_path}. El sync PRESERVA metadata (calendario, "
            f"nombres, colores, campeón) de ese JSON, así que la temporada tiene "
            f"que estar exportada primero (export_static.py).")

    base = load_json_file(season_path)
    jmap = load_json_file(MAP_PATH)
    today = dt.datetime.now(dt.timezone.utc).date()

    new_season, summary = build_season_json(year, base, jmap, today)
    new_init, init_changed = update_init(year, new_season["season"])

    season_changed = base != new_season
    diff = semantic_diff(base, new_season)

    print(f"Temporada {year}: {summary['drivers']} pilotos, "
          f"{len(summary['process_rounds'])} rondas procesadas, "
          f"{len(summary['pending'])} pendientes (recién corridas, aún no en Jolpica).")
    if summary["pending"]:
        print(f"  rondas pendientes: {summary['pending']}")
    print("Diff semántico contra el JSON existente:")
    print("\n".join(diff) if diff else "  (sin cambios)")

    if not season_changed and not init_changed:
        print("Sin novedades: el JSON ya está al día.")
        return EXIT_NO_CHANGES

    if dry_run:
        print("[--dry-run] NO se escribió nada. Habría escrito y salido EXIT_WROTE.")
        return EXIT_WROTE

    if season_changed:
        write_json(season_path, new_season)
        print(f"Escrito {season_path}")
    if init_changed:
        write_json(INIT_PATH, new_init)
        print(f"Actualizado {INIT_PATH} (seasons_list[{year}])")
    return EXIT_WROTE


def main():
    ap = argparse.ArgumentParser(description="Sincroniza una temporada 2025+ desde Jolpica-F1.")
    ap.add_argument("--year", type=int, required=True, help="Año a sincronizar (>=2025).")
    ap.add_argument("--dry-run", action="store_true",
                    help="Calcula y muestra el diff pero NO escribe.")
    args = ap.parse_args()
    try:
        code = run(args.year, args.dry_run)
    except SyncError as e:
        print(f"\nERROR de validación:\n{e}", file=sys.stderr)
        sys.exit(EXIT_ERROR)
    except urllib.error.URLError as e:
        print(f"\nERROR de red consultando Jolpica: {e}", file=sys.stderr)
        sys.exit(EXIT_ERROR)
    sys.exit(code)


if __name__ == "__main__":
    main()
