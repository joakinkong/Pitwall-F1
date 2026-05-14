import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from database import engine, Base
import models  # noqa: F401 — ensures models are registered
from routes.data import router as data_router
from routes.admin import router as admin_router

# Create all tables on startup
Base.metadata.create_all(bind=engine)

app = FastAPI(title="PIT WALL — F1 Stats API", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data_router)
app.include_router(admin_router)

# Serve frontend static files
FRONTEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "pitwall"))

@app.get("/")
def serve_index():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/admin")
def serve_admin():
    return FileResponse(os.path.join(FRONTEND_DIR, "admin.html"))

# Mount subdirectories at their natural paths (AFTER explicit routes)
for subdir in ("css", "js", "circuits"):
    subpath = os.path.join(FRONTEND_DIR, subdir)
    if os.path.isdir(subpath):
        app.mount(f"/{subdir}", StaticFiles(directory=subpath), name=subdir)
