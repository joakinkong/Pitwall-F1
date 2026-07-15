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

## Viewing the app

The app loads data from static JSON files in `docs/data/` — no server needed.
Open `docs/index.html` directly, or visit the GitHub Pages URL.

## Adding results after a GP

The admin panel requires the backend running locally:

### 1. Install dependencies (first time only)

```bash
cd backend
pip install -r requirements.txt
```

### 2. Start the server

```bash
cd backend
uvicorn main:app --reload
```

### 3. Enter results

1. Go to http://localhost:8000/admin
2. Select the season and race
3. Enter finishing positions (1–20, R for retirement, D for DSQ)
4. Save

### 4. Export and push

```bash
python export_static.py   # regenerates docs/data/ from f1.db
git add docs/data
git commit -m "GP results: <race name>"
git push
```

GitHub Pages will reflect the new results automatically.

> `f1.db` is not included in the repo. Contact the repo owner to get a copy.
