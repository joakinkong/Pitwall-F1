# PIT WALL — Guía de inicio

## Primera vez (setup)

### 1. Instalar dependencias Python
```bash
cd backend
pip install -r requirements.txt
```

### 2. Migrar datos (requiere Node.js)
```bash
cd migration
node extract_js_data.js      # extrae los datos de los JS → JSON
python import_to_db.py       # importa JSON → SQLite (f1.db)
```

### 3. Arrancar el backend
```bash
cd backend
uvicorn main:app --reload
```
El servidor corre en http://localhost:8000

### 4. Abrir la app
- **App principal:** http://localhost:8000  (o abrir pitwall/index.html directamente)
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
├── pitwall/          ← Frontend (HTML/CSS/JS)
│   ├── index.html    ← App principal
│   ├── admin.html    ← Panel de administración
│   └── js/api.js     ← Cliente que se conecta al backend
├── backend/          ← API FastAPI + SQLite
│   ├── main.py       ← Punto de entrada
│   └── requirements.txt
├── migration/        ← Scripts de migración (solo se usan una vez)
│   ├── extract_js_data.js
│   └── import_to_db.py
└── f1.db             ← Base de datos SQLite (creada por la migración)
```
