"""
Migración one-off del esquema de f1.db para los campos extendidos de resultado
(grid / quali / vuelta rápida), Feature D — ver changelog de CLAUDE.md
(2026-07-15). La DB es local, única y gitignoreada, así que un ALTER TABLE
directo alcanza (no hay Alembic ni otra DB en CI que migrar).

Cambios sobre race_results:
  + quali_position INTEGER   (clasificación final de quali)
  + fastest_lap    INTEGER   (1 = hizo la vuelta rápida; NULL = sin dato)
  - laps                     (campo muerto: 100% NULL, sin consumidor; se elimina)

Idempotente: se puede correr varias veces sin romper. Requiere SQLite 3.35+
para DROP COLUMN (Python trae SQLite embebido; verificá con sqlite3.sqlite_version
si diera error).

    python migrate_extended_fields.py
"""
import os
import sqlite3

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "f1.db"))


def columns(cur, table):
    return {row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()}


def main():
    if not os.path.exists(DB_PATH):
        print(f"No existe {DB_PATH}. Nada que migrar (la DB se crea vacía al "
              f"arrancar el backend, ya con el esquema nuevo).")
        return

    print(f"SQLite {sqlite3.sqlite_version} · DB {DB_PATH}")
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    try:
        cols = columns(cur, "race_results")

        if "quali_position" not in cols:
            cur.execute("ALTER TABLE race_results ADD COLUMN quali_position INTEGER")
            print("  + quali_position agregada")
        else:
            print("  = quali_position ya existía")

        if "fastest_lap" not in cols:
            cur.execute("ALTER TABLE race_results ADD COLUMN fastest_lap INTEGER")
            print("  + fastest_lap agregada")
        else:
            print("  = fastest_lap ya existía")

        if "laps" in cols:
            # Seguridad: solo la borramos si está 100% vacía (como en la DB actual).
            non_null = cur.execute(
                "SELECT COUNT(*) FROM race_results WHERE laps IS NOT NULL"
            ).fetchone()[0]
            if non_null:
                print(f"  ! laps tiene {non_null} filas con dato — NO se elimina. "
                      f"Revisar a mano antes de dropear.")
            else:
                cur.execute("ALTER TABLE race_results DROP COLUMN laps")
                print("  - laps eliminada (estaba 100% vacía)")
        else:
            print("  = laps ya no existía")

        conn.commit()
        print("Migración OK. Esquema final race_results:",
              sorted(columns(cur, "race_results")))
    finally:
        conn.close()


if __name__ == "__main__":
    main()
