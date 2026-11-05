"""
build_records.py — genera docs/data/records.json leyendo SOLO los JSON de
docs/data/ (init.json + seasons/*.json + points_systems.json), sin f1.db. Solo
librería estándar, así que corre en el GitHub Action justo después de
scripts/sync_jolpica.py y los récords no quedan viejos después de cada GP.

    python scripts/build_records.py            # escribe docs/data/records.json
    python scripts/build_records.py --check    # no escribe; exit 1 si el archivo
                                               # actual difiere del que saldría

Es la contraparte "desde JSON" de las funciones de récords de backend/crud.py
(most_wins_by_*, most_podiums_by_*, best_win_streak, biggest_title_margin), con
los mismos criterios: victoria = position_text '1'; podio = position_text
numérico y <= 3 (nunca un código de no-clasificación); racha = victorias
consecutivas del piloto en las carreras que corrió, cruzando temporadas; margen
de título = campeón vs. mejor otro piloto, solo en temporadas con campeón
decidido. export_static.py usa este mismo módulo, así hay una única
implementación.

ERAS vive acá (antes en export_static.py): tocar acá si cambia el reglamento.
"""
import argparse
import json
import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "docs", "data")
SEASONS_DIR = os.path.join(DATA_DIR, "seasons")
RECORDS_PATH = os.path.join(DATA_DIR, "records.json")
OVERRIDES_PATH = os.path.join(SCRIPT_DIR, "records_team_overrides.json")
FROZEN_BEFORE_YEAR = 2025  # antes de esto el histórico está congelado (ver CLAUDE.md)

LIMIT = 10  # leaderboards truncados a top 10

# Eras para la página de récords. "from"/"to" en None → se completa con el
# primer/último año real. Ajustar acá si cambia el reglamento.
ERAS = [
    {"id": "all", "label": None, "from": None, "to": None},
    {"id": "1950s", "label": "1950s", "from": 1950, "to": 1959},
    {"id": "1960s", "label": "1960s", "from": 1960, "to": 1969},
    {"id": "1970s", "label": "1970s", "from": 1970, "to": 1979},
    {"id": "1980s", "label": "1980s", "from": 1980, "to": 1989},
    {"id": "1990s", "label": "1990s", "from": 1990, "to": 1999},
    {"id": "2000s", "label": "2000s", "from": 2000, "to": 2009},
    {"id": "2010s", "label": "2010s", "from": 2010, "to": 2019},
    {"id": "2020s", "label": "2020s", "from": 2020, "to": 2029},
    {"id": "v10", "label": "V10 (1995-2005)", "from": 1995, "to": 2005},
    {"id": "v8", "label": "V8 (2006-2013)", "from": 2006, "to": 2013},
    {"id": "turbo_hybrid", "label": "Turbo-Híbrida (2014-2025)", "from": 2014, "to": 2025},
    {"id": "2026plus", "label": "Reglamento 2026+", "from": 2026, "to": 9999},
]


def _load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def _short_driver_name(full):
    # Mismo criterio que crud._get_driver_display_names: "Lewis Hamilton" → "L. Hamilton".
    parts = (full or "").split()
    if len(parts) >= 2:
        return f"{parts[0][0]}. {' '.join(parts[1:])}"
    return full


def load_overrides():
    """{"year|round|driver": team_id}: filas del histórico (< 2025) donde el equipo
    que se reconstruye del JSON no coincide con el de f1.db. Ver
    write_team_overrides()."""
    if os.path.isfile(OVERRIDES_PATH):
        return _load(OVERRIDES_PATH)
    return {}


def load_results(init):
    """[(year, round, driver_id, team_id, position_text)] de todas las temporadas,
    más {year: season_json}. El team_id sale de season.drivers[].team (nombre de
    display → id vía season.constructors) y de race_constructors para las rondas
    donde el piloto corrió con otro equipo; las filas del histórico que ese método
    no reconstruye bien se corrigen con records_team_overrides.json."""
    overrides = load_overrides()
    rows = []
    seasons = {}
    for year in sorted(int(y) for y in init["seasons_list"]):
        path = os.path.join(SEASONS_DIR, f"{year}.json")
        if not os.path.isfile(path):
            continue
        sj = _load(path)
        seasons[year] = sj
        name_to_ids = {}
        for c in sj["season"]["constructors"]:
            name_to_ids.setdefault(c["name"], []).append(c["id"])
        primary = {}
        for d in sj["season"]["drivers"]:
            ids = name_to_ids.get(d["team"], [])
            if len(ids) != 1:
                raise SystemExit(
                    f"{year}: no puedo resolver el equipo {d['team']!r} de {d['id']} a "
                    f"un único id (candidatos: {ids}).")
            primary[d["id"]] = ids[0]
        calendar = sj["calendar"]
        rc = sj.get("race_constructors", {})
        for drv, arr in sj["positions"].items():
            if drv not in primary:
                raise SystemExit(f"{year}: {drv} tiene posiciones pero no está en season.drivers.")
            for idx, pos in enumerate(arr):
                if pos == "":
                    continue
                rnd = calendar[idx]["round"]
                team = rc.get(drv, {}).get(str(idx), primary[drv])
                team = overrides.get(f"{year}|{rnd}|{drv}", team)
                rows.append((year, rnd, drv, team, pos))
    return rows, seasons


def _is_podium(pos):
    return pos.isdigit() and int(pos) <= 3


def _leaderboard(counter, names, key):
    ordered = sorted(counter.items(), key=lambda kv: (-kv[1], kv[0]))[:LIMIT]
    return [{"id": i, "name": names.get(i, i), key: n} for i, n in ordered]


def _win_streak(rows, from_y, to_y, driver_names):
    by_driver = {}
    for year, rnd, drv, _team, pos in rows:
        if from_y <= year <= to_y:
            by_driver.setdefault(drv, []).append((year, rnd, pos))
    best = None
    for drv in sorted(by_driver):
        streak, start = 0, None
        for year, rnd, pos in sorted(by_driver[drv]):
            if pos == "1":
                if streak == 0:
                    start = (year, rnd)
                streak += 1
                if best is None or streak > best["streak"]:
                    best = {"driver_id": drv, "streak": streak,
                            "from_year": start[0], "from_round": start[1],
                            "to_year": year, "to_round": rnd}
            else:
                streak = 0
    if best is None:
        return None
    best["driver_name"] = driver_names.get(best["driver_id"], best["driver_id"])
    return best


def _season_totals(year, sj, points_doc):
    """total de puntos por piloto. En temporadas con descarte, `total` ya es el
    oficial (neto). Sin descarte se usa el último `cum` (suma completa) porque
    `total` de un piloto que cambió de equipo puede traer solo su stint mayor
    (bug histórico de crud._build_driver_standings, ver CLAUDE.md)."""
    has_drop = bool(points_doc["years"].get(str(year), {}).get("dropped_scores"))
    out = {}
    for d in sj["season"]["drivers"]:
        if not has_drop and d.get("cum"):
            out[d["id"]] = d["cum"][-1]
        else:
            out[d["id"]] = d["total"]
    return out


def _title_margin(seasons, from_y, to_y, points_doc, driver_names):
    best = None
    for year in sorted(seasons):
        if not (from_y <= year <= to_y):
            continue
        sj = seasons[year]
        champ = sj["season"].get("champion_driver") or ""
        if not champ:
            continue
        totals = _season_totals(year, sj, points_doc)
        if champ not in totals:
            continue
        others = [(d, t) for d, t in totals.items() if d != champ]
        if not others:
            continue
        runner_id, runner_pts = max(others, key=lambda x: x[1])
        margin = round(totals[champ] - runner_pts, 1)
        if best is None or margin > best["margin"]:
            best = {"year": year,
                    "champion_id": champ, "champion_points": totals[champ],
                    "runnerup_id": runner_id, "runnerup_points": runner_pts,
                    "margin": margin}
    if best is None:
        return None
    best["champion_name"] = driver_names.get(best["champion_id"], best["champion_id"])
    best["runnerup_name"] = driver_names.get(best["runnerup_id"], best["runnerup_id"])
    return best


def records_for_era(rows, seasons, points_doc, driver_names, team_names, from_y, to_y):
    wins_d, wins_t, pod_d, pod_t = {}, {}, {}, {}
    for year, _rnd, drv, team, pos in rows:
        if not (from_y <= year <= to_y):
            continue
        if pos == "1":
            wins_d[drv] = wins_d.get(drv, 0) + 1
            wins_t[team] = wins_t.get(team, 0) + 1
        if _is_podium(pos):
            pod_d[drv] = pod_d.get(drv, 0) + 1
            pod_t[team] = pod_t.get(team, 0) + 1
    return {
        "most_wins_drivers": _leaderboard(wins_d, driver_names, "wins"),
        "most_wins_teams": _leaderboard(wins_t, team_names, "wins"),
        "most_podiums_drivers": _leaderboard(pod_d, driver_names, "podiums"),
        "most_podiums_teams": _leaderboard(pod_t, team_names, "podiums"),
        "win_streak": _win_streak(rows, from_y, to_y, driver_names),
        "title_margin": _title_margin(seasons, from_y, to_y, points_doc, driver_names),
    }


def build():
    init = _load(os.path.join(DATA_DIR, "init.json"))
    points_doc = _load(os.path.join(DATA_DIR, "points_systems.json"))
    driver_names = {i: _short_driver_name(d["name"]) for i, d in init["drivers"].items()}
    team_names = {i: t["displayName"] for i, t in init["teams"].items()}
    rows, seasons = load_results(init)
    years = sorted(seasons)
    min_year, max_year = years[0], years[-1]
    eras_out, records_out = [], {}
    for era in ERAS:
        from_y = era["from"] if era["from"] is not None else min_year
        to_y = era["to"] if era["to"] is not None else max_year
        label = era["label"] if era["label"] is not None else f"Todo ({min_year}-{max_year})"
        eras_out.append({"id": era["id"], "label": label})
        records_out[era["id"]] = records_for_era(
            rows, seasons, points_doc, driver_names, team_names, from_y, to_y)
    return {"eras": eras_out, "records": records_out}


def write_team_overrides(db_path):
    """Regenera records_team_overrides.json comparando, para los años congelados,
    el equipo que se reconstruye del JSON con el team_id real de f1.db. Lo llama
    export_static.py (que es quien tiene la DB); el Action no lo necesita porque el
    histórico no cambia.

    Por qué existe: en el histórico, race_constructors (crud.get_race_constructors)
    marca los cambios respecto del equipo MÁS FRECUENTE del piloto, pero
    season.drivers[].team muestra el equipo con MÁS PUNTOS. Para pilotos que
    cambiaron de equipo las dos cosas no coinciden y el equipo de cada ronda no se
    puede reconstruir solo desde el JSON (263 filas al 2026-11-05). Desde 2025 el
    sync usa el mismo criterio en ambos lados, así que no hace falta."""
    import sqlite3
    init = _load(os.path.join(DATA_DIR, "init.json"))
    saved = dict(load_overrides())
    try:
        os.replace(OVERRIDES_PATH, OVERRIDES_PATH + ".tmp")
    except FileNotFoundError:
        pass
    try:
        json_rows, _ = load_results(init)  # sin overrides: es lo que queremos corregir
    finally:
        if os.path.exists(OVERRIDES_PATH + ".tmp"):
            os.replace(OVERRIDES_PATH + ".tmp", OVERRIDES_PATH)
    js = {(y, r, d): t for y, r, d, t, _p in json_rows if y < FROZEN_BEFORE_YEAR}
    con = sqlite3.connect(db_path)
    try:
        db_rows = con.execute(
            "SELECT rc.year, rc.round, rr.driver_id, rr.team_id FROM race_results rr "
            "JOIN race_calendar rc ON rr.race_id = rc.id WHERE rc.year < ?",
            (FROZEN_BEFORE_YEAR,)).fetchall()
    finally:
        con.close()
    out = {}
    for y, r, d, t in db_rows:
        if js.get((y, r, d)) != t:
            out[f"{y}|{r}|{d}"] = t
    out = dict(sorted(out.items()))
    with open(OVERRIDES_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    return len(out), saved != out


def serialize(data):
    # Mismo formato que export_static.py / sync_jolpica.py (compacto, sin newline final).
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))


def main():
    ap = argparse.ArgumentParser(description="Genera docs/data/records.json desde los JSON.")
    ap.add_argument("--check", action="store_true",
                    help="No escribe; sale con 1 si records.json no está al día.")
    args = ap.parse_args()
    text = serialize(build())
    current = None
    if os.path.isfile(RECORDS_PATH):
        with open(RECORDS_PATH, encoding="utf-8") as f:
            current = f.read()
    if args.check:
        if current == text:
            print("records.json al día.")
            return 0
        print("records.json DESACTUALIZADO respecto de los JSON de temporada.")
        return 1
    if current == text:
        print("records.json sin cambios.")
        return 0
    with open(RECORDS_PATH, "w", encoding="utf-8") as f:
        f.write(text)
    print(f"Escrito {RECORDS_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
