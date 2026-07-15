"""
Endpoints de administración: CRUD para resultados, pilotos, equipos y calendario.
No requiere autenticación (app personal local). Acceder en /admin.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from database import get_db
import crud

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class RaceResultIn(BaseModel):
    driver_id: str
    team_id: str
    position: str   # '1'-'20', 'R', 'D', 'W', '' (no participó)
    points: float = 0
    grid_position: Optional[int] = None
    quali_position: Optional[int] = None
    fastest_lap: Optional[int] = None   # 1 = vuelta rápida; None = sin dato


class SprintResultIn(BaseModel):
    driver_id: str
    team_id: str
    position: str
    points: float = 0


class CalendarEntryIn(BaseModel):
    year: int
    round: int
    circuit_id: str
    race_date: Optional[str] = None
    is_sprint: int = 0
    event_description: Optional[str] = ""


class DriverIn(BaseModel):
    id: str
    name: str
    nationality: Optional[str] = None
    flag: Optional[str] = None
    number: Optional[int] = None
    dob: Optional[str] = None
    debut_year: Optional[int] = None
    biography: Optional[str] = None


class TeamIn(BaseModel):
    id: str
    display_name: str
    full_name: Optional[str] = None
    base: Optional[str] = None
    principal: Optional[str] = None
    founded: Optional[str] = None
    engine: Optional[str] = None
    biography: Optional[str] = None


class SeasonChampionIn(BaseModel):
    driver_id: Optional[str] = None
    constructor_id: Optional[str] = None


class ColorIn(BaseModel):
    team_id: str
    color: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/seasons")
def list_seasons(db: Session = Depends(get_db)):
    from models import Season, RaceCalendar
    seasons = db.query(Season).order_by(Season.year.desc()).all()
    result = []
    for s in seasons:
        race_count = db.query(RaceCalendar).filter(RaceCalendar.year == s.year).count()
        result.append({
            "year": s.year,
            "champion_driver": s.champion_driver_id,
            "champion_constructor": s.champion_constructor_id,
            "race_count": race_count,
        })
    return result


@router.get("/seasons/{year}/calendar")
def get_admin_calendar(year: int, db: Session = Depends(get_db)):
    from models import RaceCalendar
    races = (
        db.query(RaceCalendar)
        .filter(RaceCalendar.year == year)
        .order_by(RaceCalendar.round)
        .all()
    )
    return [
        {
            "id": r.id,
            "round": r.round,
            "circuit_id": r.circuit_id,
            "race_date": r.race_date,
            "is_sprint": bool(r.is_sprint),
            "event_description": r.event_description,
        }
        for r in races
    ]


@router.post("/seasons/{year}/calendar")
def add_calendar_entry(year: int, entry: CalendarEntryIn, db: Session = Depends(get_db)):
    data = entry.model_dump()
    data["year"] = year
    race = crud.upsert_calendar_entry(db, data)
    return {"id": race.id, "message": "OK"}


@router.put("/seasons/{year}/champion")
def set_champion(year: int, body: SeasonChampionIn, db: Session = Depends(get_db)):
    crud.update_season_champion(db, year, body.driver_id, body.constructor_id)
    return {"message": "OK"}


@router.get("/races/{race_id}/results")
def get_race_results(race_id: int, db: Session = Depends(get_db)):
    from models import RaceResult
    rows = db.query(RaceResult).filter(RaceResult.race_id == race_id).all()
    return [
        {
            "driver_id": r.driver_id,
            "team_id": r.team_id,
            "position": r.position_text,
            "points": r.points,
            "grid_position": r.grid_position,
            "quali_position": r.quali_position,
            "fastest_lap": r.fastest_lap,
        }
        for r in rows
    ]


@router.put("/races/{race_id}/results")
def update_race_results(race_id: int, results: list[RaceResultIn], db: Session = Depends(get_db)):
    race = crud.get_race_calendar_by_id(db, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    crud.upsert_race_results(db, race_id, [r.model_dump() for r in results])
    return {"message": "OK", "count": len(results)}


@router.get("/races/{race_id}/sprint")
def get_sprint_results(race_id: int, db: Session = Depends(get_db)):
    from models import SprintResult
    rows = db.query(SprintResult).filter(SprintResult.race_id == race_id).all()
    return [
        {"driver_id": r.driver_id, "team_id": r.team_id, "position": r.position_text, "points": r.points}
        for r in rows
    ]


@router.put("/races/{race_id}/sprint")
def update_sprint_results(race_id: int, results: list[SprintResultIn], db: Session = Depends(get_db)):
    race = crud.get_race_calendar_by_id(db, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    crud.upsert_sprint_results(db, race_id, [r.model_dump() for r in results])
    return {"message": "OK", "count": len(results)}


@router.get("/drivers")
def list_drivers(db: Session = Depends(get_db)):
    from models import Driver
    return [
        {"id": d.id, "name": d.name, "flag": d.flag, "number": d.number}
        for d in db.query(Driver).order_by(Driver.name).all()
    ]


@router.post("/drivers")
def create_driver(body: DriverIn, db: Session = Depends(get_db)):
    crud.upsert_driver(db, body.model_dump())
    return {"message": "OK"}


@router.put("/drivers/{driver_id}")
def update_driver(driver_id: str, body: DriverIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["id"] = driver_id
    crud.upsert_driver(db, data)
    return {"message": "OK"}


@router.get("/teams")
def list_teams(db: Session = Depends(get_db)):
    from models import Team
    return [
        {"id": t.id, "display_name": t.display_name, "full_name": t.full_name}
        for t in db.query(Team).all()
    ]


@router.post("/teams")
def create_team(body: TeamIn, db: Session = Depends(get_db)):
    crud.upsert_team(db, body.model_dump())
    return {"message": "OK"}


@router.put("/teams/{team_id}")
def update_team(team_id: str, body: TeamIn, db: Session = Depends(get_db)):
    data = body.model_dump()
    data["id"] = team_id
    crud.upsert_team(db, data)
    return {"message": "OK"}


@router.put("/seasons/{year}/colors")
def update_colors(year: int, colors: list[ColorIn], db: Session = Depends(get_db)):
    from models import SeasonTeamColor
    for c in colors:
        existing = (
            db.query(SeasonTeamColor)
            .filter(SeasonTeamColor.year == year, SeasonTeamColor.team_id == c.team_id)
            .first()
        )
        if existing:
            existing.color = c.color
        else:
            db.add(SeasonTeamColor(year=year, team_id=c.team_id, color=c.color))
    db.commit()
    return {"message": "OK"}
