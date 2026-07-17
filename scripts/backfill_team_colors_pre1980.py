"""
Propaga el color conocido de cada equipo (el más antiguo ya cargado en
season_team_colors, típicamente desde su debut en 1980+) hacia atrás, a sus
temporadas 1950-1979 sin color asignado -- para que equipos que siguen
vigentes hoy (Ferrari, McLaren, Williams, Mercedes, Alfa Romeo, Aston
Martin...) se vean con su color real en las temporadas clásicas en vez de
gris por defecto. Corrida única, idempotente (no pisa colores ya cargados).

No inventa colores para equipos sin NINGÚN dato de color en la DB (Brabham,
Team Lotus, Tyrrell, etc. -- esos ya se muestran en gris incluso en sus
temporadas 1980+, es un hueco de datos preexistente, no algo que este script
deba resolver).
"""
import os
import sqlite3

DB_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "f1.db"))
YEARS = range(1950, 1980)

# Colores para equipos CAMPEONES de constructores 1950-1979 que no tienen
# ningún dato de color en la DB (no siguieron a 1980+) -- verificado contra
# Wikipedia (British racing green / Team Lotus), no inventado a ojo. Solo se
# aplican a los años en que el equipo fue REALMENTE campeón (alcance: "al
# menos el campeón de cada año"), no a todas sus apariciones.
# Team Lotus cambió de librea 3 veces en sus años de título: verde clásico
# (1963, 1965) -> rojo/dorado "Gold Leaf" (1968, 1970) -> negro/dorado "JPS"
# (1972, 1973, 1978; se usa dorado como color representativo porque negro
# puro es invisible como acento sobre el tema oscuro de la app).
CHAMPION_COLOR_OVERRIDES = {
    (1958, "VANWALL"): "#0B5D2E",     # British racing green
    (1959, "COOPER"): "#2E8B57",      # BRG, tono más claro que Vanwall
    (1960, "COOPER"): "#2E8B57",
    (1962, "BRM"): "#0D4023",         # BRG oscuro
    (1963, "TEAM LOTUS"): "#1B7A3D",  # verde clásico Lotus pre-sponsor
    (1965, "TEAM LOTUS"): "#1B7A3D",
    (1966, "BRABHAM"): "#C9A227",     # BRG con franja dorada -> dorado como color distintivo
    (1967, "BRABHAM"): "#C9A227",
    (1968, "TEAM LOTUS"): "#C81414",  # librea "Gold Leaf" rojo/dorado/blanco
    (1969, "MATRA"): "#0055A4",       # azul de carreras francés
    (1970, "TEAM LOTUS"): "#C81414",  # Gold Leaf continúa
    (1971, "TYRRELL"): "#0072CE",     # azul Tyrrell
    (1972, "TEAM LOTUS"): "#C9A227",  # librea "John Player Special" negro/dorado
    (1973, "TEAM LOTUS"): "#C9A227",
    (1978, "TEAM LOTUS"): "#C9A227",  # JPS continúa
}


def main():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # equipo -> color más antiguo ya conocido
    earliest_color = dict(cur.execute("""
        SELECT team_id, color FROM season_team_colors
        WHERE (team_id, year) IN (
            SELECT team_id, MIN(year) FROM season_team_colors GROUP BY team_id
        )
    """).fetchall())

    inserted = 0
    for team_id, color in earliest_color.items():
        years_used = [r[0] for r in cur.execute("""
            SELECT DISTINCT rc.year FROM race_results rr
            JOIN race_calendar rc ON rr.race_id = rc.id
            WHERE rr.team_id = ? AND rc.year BETWEEN ? AND ?
        """, (team_id, YEARS.start, YEARS.stop - 1)).fetchall()]
        for year in years_used:
            exists = cur.execute(
                "SELECT 1 FROM season_team_colors WHERE year=? AND team_id=?",
                (year, team_id)).fetchone()
            if not exists:
                cur.execute(
                    "INSERT INTO season_team_colors (year, team_id, color) VALUES (?,?,?)",
                    (year, team_id, color))
                inserted += 1

    override_inserted = 0
    for (year, team_id), color in CHAMPION_COLOR_OVERRIDES.items():
        exists = cur.execute(
            "SELECT 1 FROM season_team_colors WHERE year=? AND team_id=?",
            (year, team_id)).fetchone()
        if not exists:
            cur.execute(
                "INSERT INTO season_team_colors (year, team_id, color) VALUES (?,?,?)",
                (year, team_id, color))
            override_inserted += 1

    conn.commit()
    print(f"Insertadas {inserted} filas por continuidad de marca + "
          f"{override_inserted} filas de campeones sin color conocido.")
    conn.close()


if __name__ == "__main__":
    main()
