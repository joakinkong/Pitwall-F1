"""
import_to_db.py — Importa datos desde all_data.json a SQLite.

Uso:
    cd migration
    node extract_js_data.js      # genera data_export/all_data.json
    python import_to_db.py       # importa a ../f1.db
"""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from database import engine, SessionLocal, Base
import models  # noqa

Base.metadata.create_all(bind=engine)

DATA_FILE = os.path.join(os.path.dirname(__file__), 'data_export', 'all_data.json')

if not os.path.exists(DATA_FILE):
    print(f"Error: no se encontró {DATA_FILE}")
    print("Primero ejecutar: node extract_js_data.js")
    sys.exit(1)

print("Cargando datos...")
with open(DATA_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

SEASONS           = data.get('SEASONS', {})
POSITIONS         = data.get('POSITIONS', {})
CAL_DATA          = data.get('CAL_DATA', {})
SPRINTS           = data.get('SPRINTS', {})
RACE_CONSTRUCTORS = data.get('RACE_CONSTRUCTORS', {})
DRIVERS_INFO      = data.get('DRIVERS_INFO', {})
TEAMS_INFO        = data.get('TEAMS_INFO', {})
FLAGS             = data.get('FLAGS', {})

db = SessionLocal()


# ── Helpers ───────────────────────────────────────────────────────────────────

def team_id_from_name(team_name: str) -> str | None:
    name_upper = team_name.upper()
    for tid, tinfo in TEAMS_INFO.items():
        if tinfo.get('displayName', '').upper() == name_upper:
            return tid
    for tid, tinfo in TEAMS_INFO.items():
        if name_upper in tinfo.get('displayName', '').upper():
            return tid
    return None


def get_team_id_for_driver(driver_id: str, race_idx: int, year_str: str, season_data: dict) -> str:
    rc_year = RACE_CONSTRUCTORS.get(year_str, {})
    if driver_id in rc_year:
        driver_rc = rc_year[driver_id]
        if isinstance(driver_rc, dict) and str(race_idx) in driver_rc:
            return str(driver_rc[str(race_idx)])

    for d in season_data.get('drivers', []):
        if d['id'] == driver_id:
            return team_id_from_name(d.get('team', '')) or d.get('team', '')
    return ''


def get_race_points(driver_id: str, race_idx: int, season_data: dict) -> float:
    for d in season_data.get('drivers', []):
        if d['id'] == driver_id:
            cum = d.get('cum', [])
            if race_idx < len(cum):
                prev = cum[race_idx - 1] if race_idx > 0 else 0
                return float(cum[race_idx]) - float(prev)
    return 0.0


def clear_table(model):
    db.query(model).delete()
    db.commit()


# ── 1. Drivers ────────────────────────────────────────────────────────────────
print("Importando pilotos...")
clear_table(models.Driver)
for driver_id, info in DRIVERS_INFO.items():
    db.add(models.Driver(
        id=driver_id,
        name=info.get('name', driver_id),
        nationality=info.get('nat'),
        flag=info.get('flag'),
        number=info.get('num'),
        dob=info.get('dob'),
        debut_year=info.get('debut'),
        biography=info.get('bio'),
    ))
db.commit()
print(f"  {len(DRIVERS_INFO)} pilotos importados")


# ── 2. Teams ──────────────────────────────────────────────────────────────────
print("Importando equipos...")
clear_table(models.Team)
for team_id, info in TEAMS_INFO.items():
    db.add(models.Team(
        id=team_id,
        display_name=info.get('displayName', team_id),
        full_name=info.get('name'),
        base=info.get('base'),
        principal=info.get('principal'),
        founded=str(info.get('founded', '')),
        engine=info.get('engine'),
        biography=info.get('bio'),
    ))
db.commit()
print(f"  {len(TEAMS_INFO)} equipos importados")


# ── 3. Circuits ───────────────────────────────────────────────────────────────
print("Importando circuitos...")
clear_table(models.Circuit)
circuits_data = CAL_DATA.get('circuits', {})
for circuit_id, info in circuits_data.items():
    db.add(models.Circuit(
        id=circuit_id,
        name=info.get('name', circuit_id),
        circuit_name=info.get('circuit'),
        city=info.get('city'),
        flag=FLAGS.get(circuit_id),
        length=info.get('length'),
        turns=info.get('turns'),
        laps=info.get('laps'),
    ))
db.commit()
print(f"  {len(circuits_data)} circuitos importados")


# ── 4. Seasons + Calendar ─────────────────────────────────────────────────────
print("Importando temporadas y calendarios...")
clear_table(models.RaceResult)
clear_table(models.SprintResult)
clear_table(models.RaceCalendar)
clear_table(models.SeasonTeamColor)
clear_table(models.Season)

calendars = CAL_DATA.get('calendars', {})
race_id_map: dict[tuple, int] = {}  # (year, round) → race_calendar.id
total_races = 0

for year_str, season_data in SEASONS.items():
    year = int(year_str)
    db.add(models.Season(
        year=year,
        champion_driver_id=season_data.get('champion_driver') or None,
        champion_constructor_id=season_data.get('champion_constructor') or None,
    ))
    db.flush()

    cal_entries = calendars.get(year_str, [])
    for entry in cal_entries:
        circuit_id = entry.get('id', '')
        round_num = entry.get('round', 0)

        if circuit_id and not db.get(models.Circuit, circuit_id):
            db.add(models.Circuit(id=circuit_id, name=circuit_id, flag=FLAGS.get(circuit_id)))
            db.flush()

        rc = models.RaceCalendar(
            year=year,
            round=round_num,
            circuit_id=circuit_id,
            race_date=entry.get('date'),
            is_sprint=1 if entry.get('sprint') else 0,
            event_description=entry.get('event', ''),
        )
        db.add(rc)
        db.flush()
        race_id_map[(year, round_num)] = rc.id
        total_races += 1

db.commit()
print(f"  {len(SEASONS)} temporadas, {total_races} carreras en calendario")


# ── 5. Race Results ───────────────────────────────────────────────────────────
print("Importando resultados de carreras...")
total_results = 0

for year_str, positions_year in POSITIONS.items():
    year = int(year_str)
    season_data = SEASONS.get(year_str, {})
    cal_entries = calendars.get(year_str, [])

    for driver_id, pos_array in positions_year.items():
        for race_idx, pos_text in enumerate(pos_array):
            if race_idx >= len(cal_entries):
                break
            if pos_text == '':
                continue  # piloto no participó

            round_num = cal_entries[race_idx].get('round', race_idx + 1)
            race_id = race_id_map.get((year, round_num))
            if not race_id:
                continue

            team_id = get_team_id_for_driver(driver_id, race_idx, year_str, season_data)
            points = get_race_points(driver_id, race_idx, season_data)

            if not db.get(models.Driver, driver_id):
                db.add(models.Driver(id=driver_id, name=driver_id))
                db.flush()

            existing = db.query(models.RaceResult).filter_by(
                race_id=race_id, driver_id=driver_id
            ).first()
            if not existing:
                db.add(models.RaceResult(
                    race_id=race_id,
                    driver_id=driver_id,
                    team_id=team_id or '',
                    position_text=pos_text,
                    points=points,
                ))
                total_results += 1

    if year % 5 == 0:
        db.commit()
        print(f"  {year}...")

db.commit()
print(f"  {total_results} resultados importados")


# ── 6. Sprint Results ─────────────────────────────────────────────────────────
print("Importando sprints...")
total_sprints = 0

for year_str, sprints_year in SPRINTS.items():
    year = int(year_str)
    season_data = SEASONS.get(year_str, {})
    cal_entries = calendars.get(year_str, [])

    for race_idx_str, sprint_results in sprints_year.items():
        race_idx = int(race_idx_str)
        if race_idx >= len(cal_entries) or not isinstance(sprint_results, dict):
            continue
        round_num = cal_entries[race_idx].get('round', race_idx + 1)
        race_id = race_id_map.get((year, round_num))
        if not race_id:
            continue

        for driver_id, pos_text in sprint_results.items():
            if not pos_text:
                continue
            team_id = get_team_id_for_driver(driver_id, race_idx, year_str, season_data)
            existing = db.query(models.SprintResult).filter_by(
                race_id=race_id, driver_id=driver_id
            ).first()
            if not existing:
                db.add(models.SprintResult(
                    race_id=race_id,
                    driver_id=driver_id,
                    team_id=team_id or '',
                    position_text=str(pos_text),
                    points=0,
                ))
                total_sprints += 1

db.commit()
print(f"  {total_sprints} resultados de sprint importados")


# ── 7. Team Colors ────────────────────────────────────────────────────────────
print("Importando colores de equipos...")
color_count = 0
for year_str, season_data in SEASONS.items():
    year = int(year_str)
    for c in season_data.get('constructors', []):
        team_id = c.get('id', '')
        color = c.get('color', '')
        if not team_id or not color:
            continue
        existing = db.query(models.SeasonTeamColor).filter_by(year=year, team_id=team_id).first()
        if not existing:
            db.add(models.SeasonTeamColor(year=year, team_id=team_id, color=color))
            color_count += 1
db.commit()
print(f"  {color_count} colores importados")

db.close()
print("\n¡Migración completada!")
db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'f1.db'))
print(f"Base de datos: {db_path}")
