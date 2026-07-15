"""
import_to_db.py — reconcilia f1.db (local, del dueño) con el JSON de producción
de una temporada gestionada por la automatización (2025+). Es el companion de
scripts/sync_jolpica.py: el Action escribe el JSON directo, y este script trae
esos datos de vuelta a f1.db para que el admin panel y los exports agregados
(records.json / init.json globales) no queden desactualizados.

    python scripts/import_to_db.py --year 2025

Requiere f1.db (usa backend/ como el resto de las herramientas del dueño). Lee
docs/data/seasons/{year}.json + docs/data/init.json y REEMPLAZA los resultados
de carrera/sprint de ese año en la DB (borra los del año y reinserta desde el
JSON), preservando la metadata que ya vive en la DB (nombres, bios, etc.).

CÓMO RECUPERA LOS PUNTOS: el JSON no guarda puntos por carrera, pero sí el
acumulado `cum` por piloto. Los puntos combinados (carrera + sprint) de cada
ronda salen de la DIFERENCIA de `cum` entre rondas consecutivas participadas —
exacto y sin recomputar, así que reproduce cualquier caso raro (medios puntos,
etc.) tal como lo scoreó la fuente. Eso va a RaceResult.points (la convención de
la DB: los puntos de sprint están foldeados ahí; SprintResult.points no lo suma
el cálculo de standings). SprintResult.points se completa con la tabla de sprint
de points_systems.json solo como dato informativo.

Después de correr esto, `python export_static.py --force` reproduce el mismo JSON.
"""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from database import SessionLocal                       # noqa: E402
from models import (Season, RaceCalendar, RaceResult,   # noqa: E402
                    SprintResult, SeasonTeamColor, Driver, Team, Circuit)

MANAGED_FROM_YEAR = 2025
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "docs", "data")


def load(path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def sprint_points_table(year, points_doc):
    y = points_doc["years"].get(str(year), {})
    sid = y.get("sprint")
    if not sid:
        return []
    return points_doc["sprint_systems"][sid]["points"]


def points_from_table(pos_text, table):
    if pos_text.isdigit():
        p = int(pos_text)
        if 1 <= p <= len(table):
            return float(table[p - 1])
    return 0.0


def run(year):
    if year < MANAGED_FROM_YEAR:
        sys.exit(f"import_to_db solo aplica a años gestionados (>= {MANAGED_FROM_YEAR}).")

    season_json = load(os.path.join(DATA_DIR, "seasons", f"{year}.json"))
    init = load(os.path.join(DATA_DIR, "init.json"))
    points_doc = load(os.path.join(DATA_DIR, "points_systems.json"))

    calendar = season_json["calendar"]
    positions = season_json["positions"]
    sprints = season_json.get("sprints", {})
    grid = season_json.get("grid", {})
    quali = season_json.get("quali", {})
    fastest_laps = season_json.get("fastest_laps", {})
    drivers = season_json["season"]["drivers"]
    race_constructors = season_json.get("race_constructors", {})

    display_to_id = {t["displayName"]: tid for tid, t in init["teams"].items()}
    primary_team = {}
    for d in drivers:
        tid = display_to_id.get(d["team"])
        if tid is None:
            sys.exit(f"No pude mapear el equipo {d['team']!r} del piloto {d['id']} "
                     f"a un id interno (revisá init.json teams).")
        primary_team[d["id"]] = tid

    sprint_table = sprint_points_table(year, points_doc)

    db = SessionLocal()
    try:
        # 1) Season (campeón)
        season = db.query(Season).filter(Season.year == year).first()
        if not season:
            season = Season(year=year)
            db.add(season)
        season.champion_driver_id = season_json["season"].get("champion_driver") or None
        season.champion_constructor_id = season_json["season"].get("champion_constructor") or None

        # 2) Calendario (upsert por year+round) → race_id por índice de ronda
        race_id_by_idx = {}
        for idx, c in enumerate(calendar):
            entry = (db.query(RaceCalendar)
                     .filter(RaceCalendar.year == year, RaceCalendar.round == c["round"]).first())
            if not entry:
                entry = RaceCalendar(year=year, round=c["round"])
                db.add(entry)
            entry.circuit_id = c["id"]
            entry.race_date = c.get("date", "")
            entry.event_description = c.get("event", "")
            entry.is_sprint = 1 if c.get("sprint") else 0
            if "hour_utc" in c:
                entry.race_hour_utc = c["hour_utc"]
            db.flush()
            race_id_by_idx[idx] = entry.id

        # 3) Colores por equipo/temporada (desde season.constructors[].color)
        for cst in season_json["season"]["constructors"]:
            col = (db.query(SeasonTeamColor)
                   .filter(SeasonTeamColor.year == year, SeasonTeamColor.team_id == cst["id"]).first())
            if not col:
                col = SeasonTeamColor(year=year, team_id=cst["id"], color=cst["color"])
                db.add(col)
            else:
                col.color = cst["color"]

        # 4) Reemplazar resultados del año (borrar + reinsertar desde el JSON)
        race_ids = list(race_id_by_idx.values())
        if race_ids:
            db.query(RaceResult).filter(RaceResult.race_id.in_(race_ids)).delete(synchronize_session=False)
            db.query(SprintResult).filter(SprintResult.race_id.in_(race_ids)).delete(synchronize_session=False)

        def team_for(driver_id, idx):
            return race_constructors.get(driver_id, {}).get(str(idx), primary_team[driver_id])

        n_res = 0
        for d in drivers:
            did = d["id"]
            arr = positions.get(did, [])
            participated = [i for i, v in enumerate(arr) if v != ""]
            cum = d["cum"]
            prev = 0.0
            for k, idx in enumerate(participated):
                pts = round(cum[k] - prev, 4) if k < len(cum) else 0.0
                prev = cum[k] if k < len(cum) else prev
                g = grid.get(did, [])
                q = quali.get(did, [])
                gv = g[idx] if idx < len(g) and g[idx] != "" else None
                qv = q[idx] if idx < len(q) and q[idx] != "" else None
                db.add(RaceResult(
                    race_id=race_id_by_idx[idx],
                    driver_id=did,
                    team_id=team_for(did, idx),
                    position_text=arr[idx],
                    points=pts,
                    grid_position=int(gv) if gv is not None else None,
                    quali_position=int(qv) if qv is not None else None,
                    fastest_lap=1 if fastest_laps.get(str(idx)) == did else None,
                ))
                n_res += 1

        # 5) Sprints
        n_spr = 0
        for idx_str, res in sprints.items():
            idx = int(idx_str)
            for did, pos in res.items():
                db.add(SprintResult(
                    race_id=race_id_by_idx[idx],
                    driver_id=did,
                    team_id=team_for(did, idx),
                    position_text=pos,
                    points=points_from_table(pos, sprint_table),
                ))
                n_spr += 1

        db.commit()
        print(f"Reconciliado {year} en f1.db: {n_res} resultados de carrera, "
              f"{n_spr} de sprint, {len(calendar)} rondas de calendario.")
    finally:
        db.close()


def main():
    ap = argparse.ArgumentParser(description="Reconcilia f1.db desde el JSON de producción (2025+).")
    ap.add_argument("--year", type=int, required=True)
    args = ap.parse_args()
    run(args.year)


if __name__ == "__main__":
    main()
