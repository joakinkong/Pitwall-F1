from sqlalchemy import Column, Integer, String, Float, UniqueConstraint, ForeignKey, Text
from database import Base


class Driver(Base):
    __tablename__ = "drivers"
    id = Column(String, primary_key=True)  # VER, HAM, etc.
    name = Column(String, nullable=False)
    nationality = Column(String)
    flag = Column(String)        # ISO 2-letter country code
    number = Column(Integer)
    dob = Column(String)         # YYYY-MM-DD
    debut_year = Column(Integer)
    biography = Column(Text)


class Team(Base):
    __tablename__ = "teams"
    id = Column(String, primary_key=True)  # RBR, MCL, etc.
    display_name = Column(String, nullable=False)  # RED BULL
    full_name = Column(String)
    base = Column(String)
    principal = Column(String)
    founded = Column(String)
    engine = Column(String)
    biography = Column(Text)


class Circuit(Base):
    __tablename__ = "circuits"
    id = Column(String, primary_key=True)  # BHR, SAU, etc.
    name = Column(String, nullable=False)  # Bahrain Grand Prix
    circuit_name = Column(String)
    city = Column(String)
    flag = Column(String)        # ISO 2-letter country flag code
    length = Column(String)      # "5.412 km"
    turns = Column(Integer)
    laps = Column(Integer)


class Season(Base):
    __tablename__ = "seasons"
    year = Column(Integer, primary_key=True)
    champion_driver_id = Column(String, ForeignKey("drivers.id"), nullable=True)
    champion_constructor_id = Column(String, ForeignKey("teams.id"), nullable=True)


class SeasonTeamColor(Base):
    __tablename__ = "season_team_colors"
    id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    team_id = Column(String, nullable=False)
    color = Column(String, nullable=False)
    __table_args__ = (UniqueConstraint("year", "team_id"),)


class RaceCalendar(Base):
    __tablename__ = "race_calendar"
    id = Column(Integer, primary_key=True, autoincrement=True)
    year = Column(Integer, nullable=False)
    round = Column(Integer, nullable=False)
    circuit_id = Column(String, ForeignKey("circuits.id"), nullable=False)
    race_date = Column(String)        # display string "2 Mar"
    is_sprint = Column(Integer, default=0)
    event_description = Column(String, default="")
    race_hour_utc = Column(Integer, nullable=True)  # UTC hour of race start
    __table_args__ = (UniqueConstraint("year", "round"),)


class RaceResult(Base):
    __tablename__ = "race_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("race_calendar.id"), nullable=False)
    driver_id = Column(String, nullable=False)
    team_id = Column(String, nullable=False)
    position_text = Column(String)   # '1'-'20', 'R', 'D', 'W', ''
    points = Column(Float, default=0)
    grid_position = Column(Integer, nullable=True)
    laps = Column(Integer, nullable=True)
    __table_args__ = (UniqueConstraint("race_id", "driver_id"),)


class SprintResult(Base):
    __tablename__ = "sprint_results"
    id = Column(Integer, primary_key=True, autoincrement=True)
    race_id = Column(Integer, ForeignKey("race_calendar.id"), nullable=False)
    driver_id = Column(String, nullable=False)
    team_id = Column(String, nullable=False)
    position_text = Column(String)
    points = Column(Float, default=0)
    __table_args__ = (UniqueConstraint("race_id", "driver_id"),)
