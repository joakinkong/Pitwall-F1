# PIT WALL — Guía de inicio

## Primera vez (setup)

### 1. Instalar dependencias Python
```bash
cd backend
pip install -r requirements.txt
```

### 2. Nota sobre migración
> ⚠️ La migración inicial (extracción de datos JS → JSON → SQLite) ya fue ejecutada. La carpeta `migration/` se eliminó del repo.

### 3. Arrancar el backend
```bash
cd backend
uvicorn main:app --reload
```
El servidor corre en http://localhost:8000

### 4. Abrir la app
- **App principal:** http://localhost:8000  (o abrir docs/index.html directamente)
- **Panel admin:**   http://localhost:8000/admin

---

## Uso diario (después de cada GP)

1. Abrí http://localhost:8000/admin
2. Seleccioná el año y la carrera que terminó
3. Completá los resultados (P1-P20, R para retiros, D para DSQ)
4. Guardá — la app refleja los cambios inmediatamente en todas las tabs

---

## Estructura del proyecto

```
proyecto f1/
├── docs/          ← Frontend (HTML/CSS/JS)
│   ├── index.html    ← App principal
│   ├── admin.html    ← Panel de administración
│   └── js/api.js     ← Cliente que se conecta al backend
├── backend/          ← API FastAPI + SQLite
│   ├── main.py       ← Punto de entrada
│   └── requirements.txt
└── f1.db             ← Base de datos SQLite
```
