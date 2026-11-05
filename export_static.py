"""
Exporta todos los datos de f1.db a archivos JSON estáticos en docs/data/.
Correr después de cada GP para que GitHub Pages sirva datos actualizados.

    python export_static.py            # NO toca años gestionados por la automatización
    python export_static.py --force    # sí los reescribe (ver política abajo)

FUENTE DE VERDAD PARA 2025+ (ver CLAUDE.md § changelog "sync Jolpica"):
las temporadas 2025+ las escribe el GitHub Action vía scripts/sync_jolpica.py
DIRECTO al JSON de producción, sin pasar por f1.db. Como f1.db (local, del dueño)
puede NO tener esos datos nuevos, un `export_static.py` normal las regeneraría
desde una DB desactualizada y PISARÍA lo que escribió el Action. Para evitar esa
trampa, por defecto este script:
  - NO reescribe docs/data/seasons/{year}.json para años >= MANAGED_FROM_YEAR;
  - preserva la entrada de esos años en init.json (seasons_list) tal como está.
Con --force los reescribe igual (usar solo si ya reconciliaste la DB con el JSON
de producción vía scripts/import_to_db.py, si no vas a revertir datos del Action).
records.json se genera con scripts/build_records.py a partir de los JSON de
docs/data/ (no de la DB), la misma implementación que corre el Action tras cada
sync, así que no depende de que f1.db esté al día.
"""
import sys
import json
import os
import argparse

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from database import SessionLocal
import crud

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "scripts"))
import build_records

OUT_DIR = os.path.join(os.path.dirname(__file__), "docs", "data")
SEASONS_DIR = os.path.join(OUT_DIR, "seasons")

# Años gestionados por la automatización Jolpica (fuente de verdad = JSON de
# producción, no f1.db). Mantener en sync con MANAGED_FROM_YEAR de
# scripts/sync_jolpica.py.
MANAGED_FROM_YEAR = 2025

os.makedirs(SEASONS_DIR, exist_ok=True)

_ap = argparse.ArgumentParser(description="Exporta f1.db a docs/data/*.json.")
_ap.add_argument("--force", action="store_true",
                 help=f"Reescribir también los años gestionados por la automatización "
                      f"(>= {MANAGED_FROM_YEAR}). Por defecto se preservan.")
ARGS = _ap.parse_args()


def load_existing_init():
    path = os.path.join(OUT_DIR, "init.json")
    if os.path.isfile(path):
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    return None

def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))


db = SessionLocal()

try:
    print("Exportando init.json...")
    from models import Season, RaceCalendar

    existing_init = load_existing_init()
    years = crud.get_season_years(db)
    seasons_mini = {}
    for year in years:
        # Años gestionados: preservar la entrada del init.json de producción (la
        # mantiene el Action) en vez de regenerarla desde una DB posiblemente
        # desactualizada. Con --force se regenera desde la DB.
        if (not ARGS.force and year >= MANAGED_FROM_YEAR and existing_init
                and str(year) in existing_init.get("seasons_list", {})):
            seasons_mini[str(year)] = existing_init["seasons_list"][str(year)]
            continue
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
        # Guarda de fuente de verdad: no pisar los años del Action salvo --force.
        if not ARGS.force and year >= MANAGED_FROM_YEAR:
            print(f"  {year} SKIP (gestionado por la automatización; usar --force "
                  f"para reescribir desde f1.db)")
            continue
        season = crud.get_season_data(db, year)
        if not season:
            continue
        payload = {
            "season": season,
            "positions": crud.get_positions(db, year),
            "calendar": crud.get_calendar(db, year),
            "sprints": crud.get_sprints(db, year),
            "race_constructors": crud.get_race_constructors(db, year),
        }
        # Campos extendidos (grid/quali/vuelta rápida): solo 2025+. El flag
        # "extended" le dice al frontend si mostrar esas vistas; las claves
        # grid/quali/fastest_laps se omiten cuando no hay datos para no inflar
        # los ~45 JSON históricos. Ausencia puntual dentro de una temporada con
        # datos = "" en el array (grid/quali) o ronda ausente (fastest_laps).
        extended = crud.season_has_extended(db, year)
        payload["extended"] = extended
        if extended:
            payload["grid"] = crud.get_grid(db, year)
            payload["quali"] = crud.get_quali(db, year)
            payload["fastest_laps"] = crud.get_fastest_laps(db, year)
        write_json(os.path.join(SEASONS_DIR, f"{year}.json"), payload)
        print(f"  {year} OK{' (+extended)' if extended else ''}")

    print("Exportando records.json...")
    # Las correcciones de equipo del historico salen de f1.db (ver
    # build_records.write_team_overrides); el resto lo lee de los JSON recien escritos.
    db_path = os.path.join(os.path.dirname(__file__), "f1.db")
    n_over, over_changed = build_records.write_team_overrides(db_path)
    print(f"  records_team_overrides.json: {n_over} filas"
          f"{' (CAMBIO - commitear scripts/records_team_overrides.json)' if over_changed else ''}")
    write_json(os.path.join(OUT_DIR, "records.json"), build_records.build())
    print("  records.json OK")

    print(f"\nListo. Archivos en docs/data/")

finally:
    db.close()
