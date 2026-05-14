"""
Exporta todos los datos de f1.db a archivos JSON estáticos en pitwall/data/.
Correr después de cada GP para que GitHub Pages sirva datos actualizados.

    python export_static.py
"""
import sys
import json
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from database import SessionLocal
import crud

OUT_DIR = os.path.join(os.path.dirname(__file__), "pitwall", "data")
SEASONS_DIR = os.path.join(OUT_DIR, "seasons")

os.makedirs(SEASONS_DIR, exist_ok=True)


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


db = SessionLocal()

try:
    print("Exportando init.json...")
    from models import Season, RaceCalendar

    years = crud.get_season_years(db)
    seasons_mini = {}
    for year in years:
        season = db.query(Season).filter(Season.year == year).first()
        cal = (
            db.query(RaceCalendar)
            .filter(RaceCalendar.year == year)
            .order_by(RaceCalendar.round)
            .all()
        )
        seasons_mini[str(year)] = {
            "champion_driver": season.champion_driver_id or "" if season else "",
            "champion_constructor": season.champion_constructor_id or "" if season else "",
            "races": [r.circuit_id for r in cal],
        }

    write_json(os.path.join(OUT_DIR, "init.json"), {
        "seasons_list": seasons_mini,
        "circuits": crud.get_all_circuits(db),
        "drivers": crud.get_all_drivers(db),
        "teams": crud.get_all_teams(db),
        "flags": crud.get_all_flags(db),
    })

    print(f"Exportando {len(years)} temporadas...")
    for year in years:
        season = crud.get_season_data(db, year)
        if not season:
            continue
        write_json(os.path.join(SEASONS_DIR, f"{year}.json"), {
            "season": season,
            "positions": crud.get_positions(db, year),
            "calendar": crud.get_calendar(db, year),
            "sprints": crud.get_sprints(db, year),
            "race_constructors": crud.get_race_constructors(db, year),
        })
        print(f"  {year} OK")

    print(f"\nListo. Archivos en pitwall/data/")

finally:
    db.close()
