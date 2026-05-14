"""
Endpoints de datos: sirven datos en el formato exacto que el frontend espera,
compatible con los objetos SEASONS, POSITIONS, CAL_DATA, DRIVERS_INFO, etc.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from database import get_db
import crud

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/init")
def get_init_data(db: Session = Depends(get_db)):
    """
    Datos mínimos para inicializar la app: lista de años con campeón y races,
    más todos los datos estáticos (circuitos, pilotos, equipos, flags).
    """
    years = crud.get_season_years(db)
    seasons_mini = {}
    for year in years:
        from models import Season, RaceCalendar
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

    return {
        "seasons_list": seasons_mini,
        "circuits": crud.get_all_circuits(db),
        "drivers": crud.get_all_drivers(db),
        "teams": crud.get_all_teams(db),
        "flags": crud.get_all_flags(db),
    }


@router.get("/seasons/{year}")
def get_season(year: int, db: Session = Depends(get_db)):
    """Devuelve SEASONS[year] completo con standings y cum points."""
    data = crud.get_season_data(db, year)
    if not data:
        raise HTTPException(status_code=404, detail="Season not found")
    return data


@router.get("/seasons/{year}/positions")
def get_positions(year: int, db: Session = Depends(get_db)):
    """Devuelve POSITIONS[year]: {driver_id: [pos_por_carrera]}"""
    return crud.get_positions(db, year)


@router.get("/seasons/{year}/calendar")
def get_calendar(year: int, db: Session = Depends(get_db)):
    """Devuelve CAL_DATA.calendars[year]: [{id, date, round, event, sprint?}]"""
    return crud.get_calendar(db, year)


@router.get("/seasons/{year}/sprints")
def get_sprints(year: int, db: Session = Depends(get_db)):
    """Devuelve SPRINTS[year]: {race_idx: {driver_id: pos}}"""
    return crud.get_sprints(db, year)


@router.get("/seasons/{year}/race-constructors")
def get_race_constructors(year: int, db: Session = Depends(get_db)):
    """Devuelve RACE_CONSTRUCTORS[year]: {driver_id: {race_idx: team_id}}"""
    return crud.get_race_constructors(db, year)


@router.get("/seasons/{year}/full")
def get_season_full(year: int, db: Session = Depends(get_db)):
    """Devuelve todos los datos de una temporada en un solo request."""
    season = crud.get_season_data(db, year)
    if not season:
        raise HTTPException(status_code=404, detail="Season not found")
    return {
        "season": season,
        "positions": crud.get_positions(db, year),
        "calendar": crud.get_calendar(db, year),
        "sprints": crud.get_sprints(db, year),
        "race_constructors": crud.get_race_constructors(db, year),
    }


@router.get("/circuits")
def get_circuits(db: Session = Depends(get_db)):
    return crud.get_all_circuits(db)


@router.get("/drivers")
def get_drivers(db: Session = Depends(get_db)):
    return crud.get_all_drivers(db)


@router.get("/drivers/{driver_id}")
def get_driver(driver_id: str, db: Session = Depends(get_db)):
    d = crud.get_driver(db, driver_id)
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    history = crud.get_driver_history(db, driver_id)
    return {
        "id": d.id,
        "name": d.name,
        "nat": d.nationality or "",
        "flag": d.flag or "",
        "num": d.number or 0,
        "dob": d.dob or "",
        "debut": d.debut_year or 0,
        "bio": d.biography or "",
        "history": history,
    }


@router.get("/teams")
def get_teams(db: Session = Depends(get_db)):
    return crud.get_all_teams(db)


@router.get("/teams/{team_id}")
def get_team(team_id: str, db: Session = Depends(get_db)):
    t = crud.get_team(db, team_id)
    if not t:
        raise HTTPException(status_code=404, detail="Team not found")
    history = crud.get_team_history(db, team_id)
    return {
        "id": t.id,
        "displayName": t.display_name,
        "name": t.full_name or t.display_name,
        "base": t.base or "",
        "principal": t.principal or "",
        "founded": t.founded or "",
        "engine": t.engine or "",
        "bio": t.biography or "",
        "history": history,
    }


@router.get("/flags")
def get_flags(db: Session = Depends(get_db)):
    return crud.get_all_flags(db)


@router.get("/races/{race_id}")
def get_race(race_id: int, db: Session = Depends(get_db)):
    data = crud.get_race_detail(db, race_id)
    if not data:
        raise HTTPException(status_code=404, detail="Race not found")
    return data
