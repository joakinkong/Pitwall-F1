# PIT WALL — F1 Stats

Personal F1 statistics app covering seasons from 1980 to 2026.

## Features

- **Driver standings** with cumulative points chart per season
- **Constructor standings** with historical team colors
- **Race calendar** with circuit info and results per round
- **Driver & team comparator** across seasons
- **Sprint results** tracked separately
- **Admin panel** to enter results after each Grand Prix

## Stack

- **Frontend:** Vanilla JS + Tailwind CSS + Chart.js
- **Backend:** Python / FastAPI + SQLAlchemy
- **Database:** SQLite (`f1.db`, not included in repo)

## Setup

### 1. Install dependencies

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the server

```bash
cd backend
uvicorn main:app --reload
```

### 3. Open the app

- App: http://localhost:8000
- Admin panel: http://localhost:8000/admin

> `f1.db` is required but not included in the repo (it's a binary file). Contact the repo owner to get a copy.

## Adding results after a GP

1. Go to http://localhost:8000/admin
2. Select the season and race
3. Enter finishing positions (1–20, R for retirement, D for DSQ)
4. Save — all tabs update automatically
