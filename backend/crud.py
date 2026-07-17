"""
Todas las consultas a la DB. Los métodos "for_frontend_*" devuelven datos en el
formato exacto que el frontend espera (compatible con los objetos JS anteriores).
"""
import json
import os
from sqlalchemy.orm import Session
from sqlalchemy import text, bindparam, or_
from models import (
    Driver, Team, Circuit, Season, SeasonTeamColor,
    RaceCalendar, RaceResult, SprintResult
)

_POINTS_SYSTEMS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "docs", "data", "points_systems.json"
)
_dropped_scores_cache: dict[int, dict] | None = None


def _load_dropped_scores_rules() -> dict[int, dict]:
    """year -> dropped_scores rule (solo años con descarte en el campeonato de
    PILOTOS; ver docs/data/points_systems.json y CLAUDE.md § Changelog). Los
    constructores 1980-1990 no tuvieron descarte, así que esto NUNCA se usa
    para _build_constructor_standings. Cacheado a nivel de módulo: el archivo
    es estático de referencia histórica, no cambia en runtime del backend."""
    global _dropped_scores_cache
    if _dropped_scores_cache is not None:
        return _dropped_scores_cache
    try:
        with open(_POINTS_SYSTEMS_PATH, encoding="utf-8") as f:
            data = json.load(f)
    except FileNotFoundError:
        _dropped_scores_cache = {}
        return _dropped_scores_cache
    _dropped_scores_cache = {
        int(year_str): meta["dropped_scores"]
        for year_str, meta in data.get("years", {}).items()
        if meta.get("dropped_scores")
    }
    return _dropped_scores_cache


def _apply_dropped_scores(round_points: list[float], rule: dict) -> float:
    """Recalcula el total oficial de una temporada con descarte aplicado,
    sobre el array de puntos por ronda en orden de calendario. Dos modos
    (ver points_systems.json): 'best_n' (mejores N de todas las carreras) y
    'split' (temporada partida en mitades, mejores N de cada mitad — 1980)."""
    if rule["mode"] == "best_n":
        return sum(sorted(round_points, reverse=True)[: rule["keep"]])
    if rule["mode"] == "split":
        total = 0.0
        idx = 0
        for half in rule["halves"]:
            seg = round_points[idx: idx + half["races"]]
            total += sum(sorted(seg, reverse=True)[: half["keep"]])
            idx += half["races"]
        return total
    raise ValueError(f"Modo de descarte desconocido: {rule['mode']!r}")


# ── Drivers ──────────────────────────────────────────────────────────────────

def get_all_drivers(db: Session) -> dict:
    """Devuelve DRIVERS_INFO: {id: {name, nat, flag, num, dob, debut, bio}}"""
    rows = db.query(Driver).all()
    return {
        r.id: {
            "name": r.name,
            "nat": r.nationality or "",
            "flag": r.flag or "",
            "num": r.number or 0,
            "dob": r.dob or "",
            "debut": r.debut_year or 0,
            "bio": r.biography or "",
        }
        for r in rows
    }


def get_driver(db: Session, driver_id: str):
    return db.query(Driver).filter(Driver.id == driver_id).first()


def upsert_driver(db: Session, data: dict):
    d = db.query(Driver).filter(Driver.id == data["id"]).first()
    if d:
        for k, v in data.items():
            setattr(d, k, v)
    else:
        d = Driver(**data)
        db.add(d)
    db.commit()
    return d


# ── Teams ─────────────────────────────────────────────────────────────────────

def get_all_teams(db: Session) -> dict:
    """Devuelve TEAMS_INFO: {id: {name, displayName, base, principal, ...}}"""
    rows = db.query(Team).all()
    return {
        r.id: {
            "name": r.full_name or r.display_name,
            "displayName": r.display_name,
            "base": r.base or "",
            "principal": r.principal or "",
            "founded": r.founded or "",
            "engine": r.engine or "",
            "bio": r.biography or "",
        }
        for r in rows
    }


def get_team(db: Session, team_id: str):
    return db.query(Team).filter(Team.id == team_id).first()


def upsert_team(db: Session, data: dict):
    t = db.query(Team).filter(Team.id == data["id"]).first()
    if t:
        for k, v in data.items():
            setattr(t, k, v)
    else:
        t = Team(**data)
        db.add(t)
    db.commit()
    return t


# ── Circuits ──────────────────────────────────────────────────────────────────

def get_all_circuits(db: Session) -> dict:
    """Devuelve CAL_DATA.circuits: {id: {name, circuit, city, length, turns, laps}}"""
    rows = db.query(Circuit).all()
    return {
        r.id: {
            "name": r.name,
            "circuit": r.circuit_name or "",
            "city": r.city or "",
            "length": r.length or "",
            "turns": r.turns or 0,
            "laps": r.laps or 0,
        }
        for r in rows
    }


def get_all_flags(db: Session) -> dict:
    """Devuelve FLAGS: {circuit_id: iso_flag}"""
    rows = db.query(Circuit).all()
    return {r.id: r.flag or "" for r in rows if r.flag}


# ── Seasons ───────────────────────────────────────────────────────────────────

def get_season_years(db: Session) -> list[int]:
    rows = db.query(Season.year).order_by(Season.year.desc()).all()
    return [r[0] for r in rows]


def get_season_data(db: Session, year: int) -> dict | None:
    """
    Devuelve SEASONS[year]: {champion_driver, champion_constructor, completed,
    races:[circuit_ids], drivers:[...], constructors:[...]}
    """
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        return None

    # Races in order
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    race_ids = [r.id for r in cal_rows]
    circuit_ids = [r.circuit_id for r in cal_rows]
    total_races = len(race_ids)

    # How many races have results?
    completed = _count_completed_races(db, race_ids)

    # Colors
    color_map = _get_color_map(db, year)

    # Driver standings with cumulative points
    drivers = _build_driver_standings(db, year, race_ids, color_map)
    constructors = _build_constructor_standings(db, year, race_ids, color_map)

    result = {
        "champion_driver": season.champion_driver_id or "",
        "champion_constructor": season.champion_constructor_id or "",
        "races": circuit_ids,
        "drivers": drivers,
        "constructors": constructors,
    }

    if completed < total_races:
        result["completed"] = completed

    return result


def _count_completed_races(db: Session, race_ids: list[int]) -> int:
    if not race_ids:
        return 0
    stmt = text(
        "SELECT COUNT(DISTINCT race_id) FROM race_results WHERE race_id IN :race_ids"
    ).bindparams(bindparam("race_ids", expanding=True))
    row = db.execute(stmt, {"race_ids": race_ids}).fetchone()
    return row[0] if row else 0


def _get_color_map(db: Session, year: int) -> dict:
    """team_id → color hex"""
    rows = (
        db.query(SeasonTeamColor)
        .filter(SeasonTeamColor.year == year)
        .all()
    )
    return {r.team_id: r.color for r in rows}


def _build_driver_standings(db: Session, year: int, race_ids: list[int], color_map: dict) -> list:
    if not race_ids:
        return []

    # Total points per driver (using team from last race)
    totals_stmt = text("""
        SELECT rr.driver_id, rr.team_id, SUM(rr.points) as total
        FROM race_results rr
        WHERE rr.race_id IN :race_ids
        GROUP BY rr.driver_id, rr.team_id
        ORDER BY total DESC
    """).bindparams(bindparam("race_ids", expanding=True))
    totals = db.execute(totals_stmt, {"race_ids": race_ids}).fetchall()

    if not totals:
        return []

    # Cumulative points per driver per round (one row per driver per round)
    cum_stmt = text("""
        SELECT rr.driver_id, rc.round, SUM(rr.points) as pts
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rr.race_id IN :race_ids
        GROUP BY rr.driver_id, rc.round
        ORDER BY rr.driver_id, rc.round
    """).bindparams(bindparam("race_ids", expanding=True))
    cum_rows = db.execute(cum_stmt, {"race_ids": race_ids}).fetchall()

    from collections import defaultdict as _dd
    _driver_rounds: dict[str, list[tuple]] = _dd(list)
    for driver_id, round_num, pts in cum_rows:
        _driver_rounds[driver_id].append((round_num, pts))

    cum_map: dict[str, list[float]] = {}
    for driver_id, rounds in _driver_rounds.items():
        running = 0.0
        cum = []
        for _, pts in sorted(rounds):
            running += pts
            cum.append(running)
        cum_map[driver_id] = cum

    # Descarte de resultados (solo campeonato de PILOTOS, años 1950-1990 con
    # sistema "mejores N" -- ver docs/data/points_systems.json). El total
    # oficial de esos años NO es la suma bruta: hay que quedarse con los N
    # mejores resultados (o las mitades de temporada de 1980). `cum` queda
    # como progresión bruta sin tocar -- es cómo ya se muestra el gráfico de
    # trayectoria, y ya existe precedente de total != cum[-1] (ver el caso
    # TSU 2025 documentado en CLAUDE.md) así que no es una inconsistencia
    # nueva, es el mismo patrón aplicado a un caso más.
    dropped_rule = _load_dropped_scores_rules().get(year)
    official_totals: dict[str, float] = {}
    if dropped_rule:
        for driver_id, rounds in _driver_rounds.items():
            round_points = [0.0] * len(race_ids)
            for round_num, pts in rounds:
                if 1 <= round_num <= len(race_ids):
                    round_points[round_num - 1] += pts
            official_totals[driver_id] = _apply_dropped_scores(round_points, dropped_rule)

    # Driver display names
    driver_names = _get_driver_display_names(db)
    team_names = _get_team_display_names(db)

    result = []
    seen_drivers = set()
    for driver_id, team_id, total in totals:
        if driver_id in seen_drivers:
            continue
        seen_drivers.add(driver_id)
        cum = cum_map.get(driver_id, [total])
        color = color_map.get(team_id, "#888888")
        team_display = team_names.get(team_id, team_id)
        display_total = official_totals.get(driver_id, total) if dropped_rule else total
        result.append({
            "id": driver_id,
            "name": driver_names.get(driver_id, driver_id),
            "team": team_display,
            "total": display_total,
            "cum": cum,
            "color": color,
        })

    if dropped_rule:
        result.sort(key=lambda d: d["total"], reverse=True)

    return result


def _build_constructor_standings(db: Session, year: int, race_ids: list[int], color_map: dict) -> list:
    if not race_ids:
        return []

    totals_stmt = text("""
        SELECT rr.team_id, SUM(rr.points) as total
        FROM race_results rr
        WHERE rr.race_id IN :race_ids
        GROUP BY rr.team_id
        ORDER BY total DESC
    """).bindparams(bindparam("race_ids", expanding=True))
    totals = db.execute(totals_stmt, {"race_ids": race_ids}).fetchall()

    if not totals:
        return []

    # Aggregate per team per round first, then cumulative
    round_pts_stmt = text("""
        SELECT rr.team_id, rc.round, SUM(rr.points) as pts
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rr.race_id IN :race_ids
        GROUP BY rr.team_id, rc.round
        ORDER BY rr.team_id, rc.round
    """).bindparams(bindparam("race_ids", expanding=True))
    round_pts = db.execute(round_pts_stmt, {"race_ids": race_ids}).fetchall()

    from collections import defaultdict
    team_rounds: dict[str, list[tuple]] = defaultdict(list)
    for team_id, round_num, pts in round_pts:
        team_rounds[team_id].append((round_num, pts))

    cum_map: dict[str, list[float]] = {}
    for team_id, rounds in team_rounds.items():
        running = 0.0
        cum = []
        for _, pts in sorted(rounds):
            running += pts
            cum.append(running)
        cum_map[team_id] = cum

    team_names = _get_team_display_names(db)

    result = []
    for team_id, total in totals:
        cum = cum_map.get(team_id, [total])
        color = color_map.get(team_id, "#888888")
        result.append({
            "id": team_id,
            "name": team_names.get(team_id, team_id),
            "total": total,
            "cum": cum,
            "color": color,
        })

    return result


def _get_driver_display_names(db: Session) -> dict:
    rows = db.query(Driver.id, Driver.name).all()
    out = {}
    for driver_id, name in rows:
        parts = name.split()
        if len(parts) >= 2:
            out[driver_id] = f"{parts[0][0]}. {' '.join(parts[1:])}"
        else:
            out[driver_id] = name
    return out


def _get_team_display_names(db: Session) -> dict:
    rows = db.query(Team.id, Team.display_name).all()
    return {r[0]: r[1] for r in rows}


# ── Positions ─────────────────────────────────────────────────────────────────

def get_positions(db: Session, year: int) -> dict:
    """Devuelve POSITIONS[year]: {driver_id: [pos_per_race, ...]}"""
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    if not cal_rows:
        return {}

    race_id_to_idx = {r.id: i for i, r in enumerate(cal_rows)}
    total = len(cal_rows)

    results = (
        db.query(RaceResult.driver_id, RaceResult.race_id, RaceResult.position_text)
        .filter(RaceResult.race_id.in_([r.id for r in cal_rows]))
        .all()
    )

    positions: dict[str, list[str]] = {}
    for driver_id, race_id, pos_text in results:
        if driver_id not in positions:
            positions[driver_id] = [""] * total
        idx = race_id_to_idx.get(race_id)
        if idx is not None:
            positions[driver_id][idx] = pos_text or ""

    return positions


# ── Extended result fields (grid / quali / fastest lap) ─────────────────────────
# Solo se cargan de 2025 en adelante (via automatización Jolpica o admin manual);
# el histórico 1980-2024 queda congelado sin estos campos. El export usa
# season_has_extended() para poner el flag "extended" en el JSON de temporada, y
# el frontend oculta estas vistas cuando extended=false (ver CLAUDE.md).

def _grid_like(db: Session, year: int, column) -> dict:
    """Mirror de get_positions para una columna entera de RaceResult (grid/quali).
    Devuelve {driver_id: [valor_por_ronda, ...]} con "" donde no hay dato."""
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    if not cal_rows:
        return {}
    race_id_to_idx = {r.id: i for i, r in enumerate(cal_rows)}
    total = len(cal_rows)

    rows = (
        db.query(RaceResult.driver_id, RaceResult.race_id, column)
        .filter(RaceResult.race_id.in_([r.id for r in cal_rows]))
        .all()
    )
    out: dict[str, list[str]] = {}
    for driver_id, race_id, value in rows:
        idx = race_id_to_idx.get(race_id)
        if idx is None:
            continue
        if driver_id not in out:
            out[driver_id] = [""] * total
        out[driver_id][idx] = "" if value is None else str(value)

    # Descartar pilotos sin ningún dato en la columna (mantiene el JSON chico y
    # evita filas vacías en temporadas parcialmente cargadas).
    return {d: arr for d, arr in out.items() if any(v != "" for v in arr)}


def get_grid(db: Session, year: int) -> dict:
    """{driver_id: [grid_position_por_ronda]}. "" = sin dato en esa ronda."""
    return _grid_like(db, year, RaceResult.grid_position)


def get_quali(db: Session, year: int) -> dict:
    """{driver_id: [quali_position_por_ronda]}. "" = sin dato en esa ronda."""
    return _grid_like(db, year, RaceResult.quali_position)


def get_fastest_laps(db: Session, year: int) -> dict:
    """{ronda_idx (0-based, string en JSON): driver_id} — quién hizo la vuelta
    rápida en cada ronda. Mismo patrón de indexado que get_sprints."""
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    race_id_to_idx = {r.id: i for i, r in enumerate(cal_rows)}
    rows = (
        db.query(RaceResult.driver_id, RaceResult.race_id)
        .filter(
            RaceResult.race_id.in_([r.id for r in cal_rows]),
            RaceResult.fastest_lap == 1,
        )
        .all()
    )
    out: dict[int, str] = {}
    for driver_id, race_id in rows:
        idx = race_id_to_idx.get(race_id)
        if idx is not None:
            out[idx] = driver_id
    return out


def season_has_extended(db: Session, year: int) -> bool:
    """True si la temporada tiene AL MENOS un dato de grid/quali/vuelta rápida.
    Derivado de los datos (no hardcodeado a 2025) para que se autocorrija si el
    dueño llegara a backfillear una temporada vieja."""
    return (
        db.query(RaceResult.id)
        .join(RaceCalendar, RaceResult.race_id == RaceCalendar.id)
        .filter(
            RaceCalendar.year == year,
            or_(
                RaceResult.grid_position.isnot(None),
                RaceResult.quali_position.isnot(None),
                RaceResult.fastest_lap.isnot(None),
            ),
        )
        .first()
        is not None
    )


# ── Calendar ──────────────────────────────────────────────────────────────────

def get_calendar(db: Session, year: int) -> list:
    """Devuelve CAL_DATA.calendars[year]: [{id, date, round, event, sprint?}]"""
    rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    result = []
    for r in rows:
        entry: dict = {
            "id": r.circuit_id,
            "date": r.race_date or "",
            "round": r.round,
            "event": r.event_description or "",
        }
        if r.is_sprint:
            entry["sprint"] = True
        if r.race_hour_utc is not None:
            entry["hour_utc"] = r.race_hour_utc
        result.append(entry)
    return result


# ── Sprints ───────────────────────────────────────────────────────────────────

def get_sprints(db: Session, year: int) -> dict:
    """Devuelve SPRINTS[year]: {race_index: {driver_id: position_text}}"""
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    race_id_to_idx = {r.id: i for i, r in enumerate(cal_rows)}

    sprint_rows = (
        db.query(SprintResult)
        .filter(SprintResult.race_id.in_([r.id for r in cal_rows]))
        .all()
    )

    sprints: dict[int, dict] = {}
    for sr in sprint_rows:
        idx = race_id_to_idx.get(sr.race_id)
        if idx is not None:
            sprints.setdefault(idx, {})[sr.driver_id] = sr.position_text or ""

    return sprints


# ── Race Constructors ─────────────────────────────────────────────────────────

def get_race_constructors(db: Session, year: int) -> dict:
    """
    Devuelve RACE_CONSTRUCTORS[year]: {driver_id: {race_index: team_id}}
    Solo incluye drivers/races donde el equipo difiere del primario de la temporada.
    """
    cal_rows = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    race_id_to_idx = {r.id: i for i, r in enumerate(cal_rows)}

    result_rows = (
        db.query(RaceResult.driver_id, RaceResult.race_id, RaceResult.team_id)
        .filter(RaceResult.race_id.in_([r.id for r in cal_rows]))
        .all()
    )

    # Primary team = most common team for that driver this year
    from collections import Counter
    team_counts: dict[str, Counter] = {}
    driver_race_teams: dict[str, dict[int, str]] = {}
    for driver_id, race_id, team_id in result_rows:
        team_counts.setdefault(driver_id, Counter())[team_id] += 1
        idx = race_id_to_idx.get(race_id)
        if idx is not None:
            driver_race_teams.setdefault(driver_id, {})[idx] = team_id

    primary_team = {d: c.most_common(1)[0][0] for d, c in team_counts.items()}

    rc: dict[str, dict[int, str]] = {}
    for driver_id, race_teams in driver_race_teams.items():
        primary = primary_team.get(driver_id)
        changes = {idx: tid for idx, tid in race_teams.items() if tid != primary}
        if changes:
            rc[driver_id] = changes

    return rc


# ── Race Detail ───────────────────────────────────────────────────────────────

def get_race_detail(db: Session, race_id: int) -> dict | None:
    race = db.query(RaceCalendar).filter(RaceCalendar.id == race_id).first()
    if not race:
        return None

    circuit = db.query(Circuit).filter(Circuit.id == race.circuit_id).first()

    results = (
        db.query(RaceResult)
        .filter(RaceResult.race_id == race_id)
        .all()
    )

    sprints = (
        db.query(SprintResult)
        .filter(SprintResult.race_id == race_id)
        .all()
    )

    driver_names = {r.id: r.name for r in db.query(Driver).all()}
    team_names = {r.id: r.display_name for r in db.query(Team).all()}

    def sort_key(pos):
        try:
            return (0, int(pos))
        except (ValueError, TypeError):
            return (1, pos or "Z")

    return {
        "id": race.id,
        "year": race.year,
        "round": race.round,
        "circuit": {
            "id": circuit.id if circuit else race.circuit_id,
            "name": circuit.name if circuit else "",
            "circuit": circuit.circuit_name if circuit else "",
            "city": circuit.city if circuit else "",
            "flag": circuit.flag if circuit else "",
            "length": circuit.length if circuit else "",
            "turns": circuit.turns if circuit else 0,
            "laps": circuit.laps if circuit else 0,
        },
        "results": sorted([
            {
                "driver_id": r.driver_id,
                "driver_name": driver_names.get(r.driver_id, r.driver_id),
                "team_id": r.team_id,
                "team_name": team_names.get(r.team_id, r.team_id),
                "position": r.position_text or "",
                "points": r.points or 0,
            }
            for r in results
        ], key=lambda x: sort_key(x["position"])),
        "sprint_results": sorted([
            {
                "driver_id": s.driver_id,
                "driver_name": driver_names.get(s.driver_id, s.driver_id),
                "team_id": s.team_id,
                "team_name": team_names.get(s.team_id, s.team_id),
                "position": s.position_text or "",
                "points": s.points or 0,
            }
            for s in sprints
        ], key=lambda x: sort_key(x["position"])) if sprints else None,
    }


# ── Admin: Race Results ───────────────────────────────────────────────────────

def upsert_race_results(db: Session, race_id: int, results: list[dict]):
    for r in results:
        existing = (
            db.query(RaceResult)
            .filter(RaceResult.race_id == race_id, RaceResult.driver_id == r["driver_id"])
            .first()
        )
        if existing:
            existing.team_id = r.get("team_id", existing.team_id)
            existing.position_text = r.get("position", existing.position_text)
            existing.points = r.get("points", existing.points)
            existing.grid_position = r.get("grid_position", existing.grid_position)
            existing.quali_position = r.get("quali_position", existing.quali_position)
            existing.fastest_lap = r.get("fastest_lap", existing.fastest_lap)
        else:
            db.add(RaceResult(
                race_id=race_id,
                driver_id=r["driver_id"],
                team_id=r.get("team_id", ""),
                position_text=r.get("position", ""),
                points=r.get("points", 0),
                grid_position=r.get("grid_position"),
                quali_position=r.get("quali_position"),
                fastest_lap=r.get("fastest_lap"),
            ))
    db.commit()


def upsert_sprint_results(db: Session, race_id: int, results: list[dict]):
    for r in results:
        existing = (
            db.query(SprintResult)
            .filter(SprintResult.race_id == race_id, SprintResult.driver_id == r["driver_id"])
            .first()
        )
        if existing:
            existing.team_id = r.get("team_id", existing.team_id)
            existing.position_text = r.get("position", existing.position_text)
            existing.points = r.get("points", existing.points)
        else:
            db.add(SprintResult(
                race_id=race_id,
                driver_id=r["driver_id"],
                team_id=r.get("team_id", ""),
                position_text=r.get("position", ""),
                points=r.get("points", 0),
            ))
    db.commit()


def upsert_calendar_entry(db: Session, data: dict) -> RaceCalendar:
    entry = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == data["year"], RaceCalendar.round == data["round"])
        .first()
    )
    if entry:
        for k, v in data.items():
            if k not in ("year", "round"):
                setattr(entry, k, v)
    else:
        entry = RaceCalendar(**data)
        db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_race_calendar_entry(db: Session, year: int, round_num: int):
    return (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year, RaceCalendar.round == round_num)
        .first()
    )


def get_race_calendar_by_id(db: Session, race_id: int):
    return db.query(RaceCalendar).filter(RaceCalendar.id == race_id).first()


def update_season_champion(db: Session, year: int, driver_id: str | None, constructor_id: str | None):
    season = db.query(Season).filter(Season.year == year).first()
    if not season:
        season = Season(year=year)
        db.add(season)
    if driver_id is not None:
        season.champion_driver_id = driver_id
    if constructor_id is not None:
        season.champion_constructor_id = constructor_id
    db.commit()


def get_driver_history(db: Session, driver_id: str) -> list[dict]:
    """Returns [{year, team, position, points, wins, podiums}] for a driver."""
    rows = db.execute(text("""
        SELECT rc.year,
               rr.team_id,
               SUM(rr.points) as total,
               SUM(CASE WHEN rr.position_text = '1' THEN 1 ELSE 0 END) as wins,
               SUM(CASE WHEN rr.position_text GLOB '[0-9]*' AND CAST(rr.position_text AS INTEGER) <= 3 THEN 1 ELSE 0 END) as podiums
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rr.driver_id = :driver_id
        GROUP BY rc.year, rr.team_id
        ORDER BY rc.year DESC
    """), {"driver_id": driver_id}).fetchall()

    team_names = _get_team_display_names(db)
    result = []
    for year, team_id, total, wins, podiums in rows:
        result.append({
            "year": year,
            "team": team_names.get(team_id, team_id),
            "points": total,
            "wins": wins,
            "podiums": podiums,
        })
    return result


def get_team_history(db: Session, team_id: str) -> list[dict]:
    rows = db.execute(text("""
        SELECT rc.year,
               SUM(rr.points) as total,
               SUM(CASE WHEN rr.position_text = '1' THEN 1 ELSE 0 END) as wins
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rr.team_id = :team_id
        GROUP BY rc.year
        ORDER BY rc.year DESC
    """), {"team_id": team_id}).fetchall()

    return [{"year": year, "points": total, "wins": wins} for year, total, wins in rows]


# ── Records ──────────────────────────────────────────────────────────────────

def most_wins_by_driver(db: Session, from_year: int, to_year: int, limit: int = 10) -> list[dict]:
    rows = db.execute(text("""
        SELECT rr.driver_id, COUNT(*) as wins
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year AND rr.position_text = '1'
        GROUP BY rr.driver_id
        ORDER BY wins DESC, rr.driver_id
        LIMIT :limit
    """), {"from_year": from_year, "to_year": to_year, "limit": limit}).fetchall()
    names = _get_driver_display_names(db)
    return [{"id": d, "name": names.get(d, d), "wins": w} for d, w in rows]


def most_wins_by_team(db: Session, from_year: int, to_year: int, limit: int = 10) -> list[dict]:
    rows = db.execute(text("""
        SELECT rr.team_id, COUNT(*) as wins
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year AND rr.position_text = '1'
        GROUP BY rr.team_id
        ORDER BY wins DESC, rr.team_id
        LIMIT :limit
    """), {"from_year": from_year, "to_year": to_year, "limit": limit}).fetchall()
    names = _get_team_display_names(db)
    return [{"id": t, "name": names.get(t, t), "wins": w} for t, w in rows]


def most_podiums_by_driver(db: Session, from_year: int, to_year: int, limit: int = 10) -> list[dict]:
    """Podio = position_text numérico y <= 3. Nunca cuenta un código de no-clasificación
    (ver NON_FINISH_CODES en constants.py) porque el filtro es puramente "es numérico"."""
    rows = db.execute(text("""
        SELECT rr.driver_id, COUNT(*) as podiums
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year
          AND rr.position_text GLOB '[0-9]*' AND CAST(rr.position_text AS INTEGER) <= 3
        GROUP BY rr.driver_id
        ORDER BY podiums DESC, rr.driver_id
        LIMIT :limit
    """), {"from_year": from_year, "to_year": to_year, "limit": limit}).fetchall()
    names = _get_driver_display_names(db)
    return [{"id": d, "name": names.get(d, d), "podiums": p} for d, p in rows]


def most_podiums_by_team(db: Session, from_year: int, to_year: int, limit: int = 10) -> list[dict]:
    rows = db.execute(text("""
        SELECT rr.team_id, COUNT(*) as podiums
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year
          AND rr.position_text GLOB '[0-9]*' AND CAST(rr.position_text AS INTEGER) <= 3
        GROUP BY rr.team_id
        ORDER BY podiums DESC, rr.team_id
        LIMIT :limit
    """), {"from_year": from_year, "to_year": to_year, "limit": limit}).fetchall()
    names = _get_team_display_names(db)
    return [{"id": t, "name": names.get(t, t), "podiums": p} for t, p in rows]


def best_win_streak(db: Session, from_year: int, to_year: int) -> dict | None:
    """
    Racha más larga de victorias consecutivas de un piloto. Considera solo las
    carreras en las que el piloto efectivamente compitió (tiene fila en
    race_results), en orden cronológico global (year, round) — por eso puede
    cruzar temporadas.
    """
    rows = db.execute(text("""
        SELECT rr.driver_id, rc.year, rc.round, rr.position_text
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year
        ORDER BY rr.driver_id, rc.year, rc.round
    """), {"from_year": from_year, "to_year": to_year}).fetchall()

    best = None
    cur_driver = None
    cur_streak = 0
    cur_start = None
    for driver_id, year, round_num, pos in rows:
        if driver_id != cur_driver:
            cur_driver = driver_id
            cur_streak = 0
            cur_start = None
        if pos == '1':
            if cur_streak == 0:
                cur_start = (year, round_num)
            cur_streak += 1
            if best is None or cur_streak > best["streak"]:
                best = {
                    "driver_id": driver_id, "streak": cur_streak,
                    "from_year": cur_start[0], "from_round": cur_start[1],
                    "to_year": year, "to_round": round_num,
                }
        else:
            cur_streak = 0

    if best is None:
        return None
    names = _get_driver_display_names(db)
    best["driver_name"] = names.get(best["driver_id"], best["driver_id"])
    return best


def biggest_title_margin(db: Session, from_year: int, to_year: int) -> dict | None:
    """
    Mayor diferencia de puntos entre campeón y subcampeón, entre los títulos ya
    decididos (Season.champion_driver_id no nulo) en el rango de años. Usa el
    total de puntos de temporada por piloto (suma entre equipos, por si cambió
    de equipo a mitad de año), con descarte aplicado en los años que
    corresponda (ver _apply_dropped_scores) -- mismo criterio que
    _build_driver_standings, para que este número no quede desincronizado del
    que ya muestra la app.
    """
    champions = dict(db.execute(text("""
        SELECT year, champion_driver_id FROM seasons
        WHERE year BETWEEN :from_year AND :to_year
          AND champion_driver_id IS NOT NULL AND champion_driver_id != ''
    """), {"from_year": from_year, "to_year": to_year}).fetchall())

    if not champions:
        return None

    round_rows = db.execute(text("""
        SELECT rc.year, rr.driver_id, rc.round, SUM(rr.points) as pts
        FROM race_results rr
        JOIN race_calendar rc ON rr.race_id = rc.id
        WHERE rc.year BETWEEN :from_year AND :to_year
        GROUP BY rc.year, rr.driver_id, rc.round
    """), {"from_year": from_year, "to_year": to_year}).fetchall()

    race_counts = dict(db.execute(text("""
        SELECT year, COUNT(*) FROM race_calendar
        WHERE year BETWEEN :from_year AND :to_year
        GROUP BY year
    """), {"from_year": from_year, "to_year": to_year}).fetchall())

    from collections import defaultdict
    by_year: dict[int, dict[str, list]] = defaultdict(lambda: defaultdict(list))
    for year, driver_id, round_num, pts in round_rows:
        by_year[year][driver_id].append((round_num, pts))

    dropped_rules = _load_dropped_scores_rules()

    best = None
    for year, champ_id in champions.items():
        drivers = by_year.get(year)
        if not drivers or champ_id not in drivers:
            continue
        n_races = race_counts.get(year, 0)
        rule = dropped_rules.get(year)
        totals: dict[str, float] = {}
        for driver_id, rounds in drivers.items():
            if rule:
                arr = [0.0] * n_races
                for round_num, pts in rounds:
                    if 1 <= round_num <= n_races:
                        arr[round_num - 1] += pts
                totals[driver_id] = _apply_dropped_scores(arr, rule)
            else:
                totals[driver_id] = sum(pts for _, pts in rounds)

        champ_pts = totals[champ_id]
        runner_id, runner_pts = max(
            ((d, t) for d, t in totals.items() if d != champ_id),
            key=lambda x: x[1], default=(None, None)
        )
        if runner_id is None:
            continue
        margin = round(champ_pts - runner_pts, 1)
        if best is None or margin > best["margin"]:
            best = {
                "year": year,
                "champion_id": champ_id, "champion_points": champ_pts,
                "runnerup_id": runner_id, "runnerup_points": runner_pts,
                "margin": margin,
            }

    if best is None:
        return None
    names = _get_driver_display_names(db)
    best["champion_name"] = names.get(best["champion_id"], best["champion_id"])
    best["runnerup_name"] = names.get(best["runnerup_id"], best["runnerup_id"])
    return best


def get_records_for_era(db: Session, from_year: int, to_year: int, limit: int = 10) -> dict:
    """Agrupa todos los récords de una era en un dict, para export_static.py."""
    return {
        "most_wins_drivers": most_wins_by_driver(db, from_year, to_year, limit),
        "most_wins_teams": most_wins_by_team(db, from_year, to_year, limit),
        "most_podiums_drivers": most_podiums_by_driver(db, from_year, to_year, limit),
        "most_podiums_teams": most_podiums_by_team(db, from_year, to_year, limit),
        "win_streak": best_win_streak(db, from_year, to_year),
        "title_margin": biggest_title_margin(db, from_year, to_year),
    }
