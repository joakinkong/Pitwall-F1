"""
Extiende docs/data/points_systems.json con los sistemas de puntos reales de
1950-1979 (parte de la Etapa 2 del backfill histórico 1950-1979 -- ver
CLAUDE.md § Changelog). Corrida única, no se integra a export_static.py.

Fuentes cruzadas (misma política que meta.verified_against ya existía para
1980-2026): Wikipedia "List of Formula One World Championship points scoring
systems" + formula1points.com, más verificación aritmética propia: los
"totales" que Wikipedia lista para 1967-1979 (ej. "9 total: 5 de las
primeras 6, 4 de las últimas 5") NO son la escala de puntos por carrera --
son la regla de descarte de temporada partida en mitades. Se confirmó
comparando la suma de carreras de cada mitad contra el conteo real de
carreras por año (vía Jolpica): coincide exacto en los 13 años 1967-1979.
La escala de puntos por carrera fue CONSTANTE 9-6-4-3-2-1 desde 1961 hasta
1990 (confirmado independientemente por formula1points.com, que agrupa
1961-1990 bajo un único "9 points system") -- por eso 1961-1979 referencia
el mismo catálogo "classic_9" que ya usaban 1980-1990, cada año con su
propio dropped_scores.

Antes de 1961:
- 1950-1959: top 5 puntúan 8-6-4-3-2, + 1 punto de vuelta rápida (a
  CUALQUIER piloto, no solo el top 5; compartido si hay empate). Descarte
  flat "mejores N": 4 (1950-1957), 5 (1958-1959).
- 1960: 8-6-4-3-2-1 (top 6), sin punto de vuelta rápida. Descarte: mejores 6.

Indianápolis 500 (contó para el Mundial 1950-1960 pero con pilotos/autos de
IndyCar sin ninguna otra conexión con la F1 europea) se EXCLUYE del
calendario a cargar -- decisión explícita del dueño. Se verificó que esto
no cambia ningún resultado real de campeonato: de los 11 años, solo un
piloto irrelevante (Rodger Ward, 1959) sumó puntos en Indy Y en una carrera
europea ese año, y en la europea sacó 0 puntos -- cero impacto en cualquier
tabla real. El descarte "mejores N" ya no necesita ajuste por la exclusión
de Indy: como ningún piloto relevante tiene puntos ahí, es aritméticamente
idéntico a "mejores N de las carreras cargadas" (sin Indy) que a "mejores N
del calendario oficial completo" (con Indy).
"""
import json
import os

PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..",
                     "docs", "data", "points_systems.json")

# (year, dropped_scores) -- system/points ya resueltos más abajo por rango de año.
# Verificado empíricamente (no solo por fuente secundaria -- ver
# scripts/.pre1980_raw_cache.json + WebFetch de "List of Formula One World
# Drivers' Champions"): para cada año se buscó el valor de "keep" que
# reproduce EXACTO el total oficial del campeón real, sumando por ronda el
# MEJOR resultado del piloto esa carrera (no la suma -- ver nota sobre autos
# compartidos abajo). Los 17 años 1950-1966 validan al punto exacto con esta
# tabla. La primera pasada (solo Wikipedia "scoring systems" page) tenía mal
# 1954-1958 (decía 4,4,4,4,5; el valor real es 5,5,5,5,6) -- confirmado con
# el caso de Fangio 1956 (30 pts oficiales, descarte "mejores 5", incluyendo
# la regla especial de auto compartido de ese año).
FLAT_1950_1960 = {
    1950: 4, 1951: 4, 1952: 4, 1953: 4, 1954: 5, 1955: 5, 1956: 5, 1957: 5,
    1958: 6, 1959: 5, 1960: 6,
}
FLAT_1961_1966 = {
    1961: 5, 1962: 5, 1963: 6, 1964: 6, 1965: 6, 1966: 5,
}
# year -> (races_first_half, keep_first, races_second_half, keep_second)
# Verificado: races_first_half + races_second_half == carreras reales del año.
SPLIT_1967_1979 = {
    1967: (6, 5, 5, 4),
    1968: (6, 5, 6, 5),
    1969: (6, 5, 5, 4),
    1970: (7, 6, 6, 5),
    1971: (6, 5, 5, 4),
    1972: (6, 5, 6, 5),
    1973: (8, 7, 7, 6),
    1974: (8, 7, 7, 6),
    1975: (7, 6, 7, 6),
    1976: (8, 7, 8, 7),
    1977: (9, 8, 8, 7),
    1978: (8, 7, 8, 7),
    1979: (7, 4, 8, 4),
}


def main():
    with open(PATH, encoding="utf-8") as f:
        data = json.load(f)

    data["systems"]["pre_1960_top5"] = {
        "label": "8-6-4-3-2 · top 5 + vuelta rápida (1950–1959)",
        "points": [8, 6, 4, 3, 2],
    }
    data["systems"]["top6_8pts"] = {
        "label": "8-6-4-3-2-1 · top 6 (1960)",
        "points": [8, 6, 4, 3, 2, 1],
    }
    # classic_9 ya existía para 1980-1990; ahora también lo referencian
    # 1961-1979 (misma escala, confirmada constante 1961-1990).
    data["systems"]["classic_9"]["label"] = "9-6-4-3-2-1 · top 6 (1961–1990)"

    years = data["years"]

    for year, keep in FLAT_1950_1960.items():
        if year == 1960:
            years[str(year)] = {
                "system": "top6_8pts",
                "points": [8, 6, 4, 3, 2, 1],
                "dropped_scores": {"mode": "best_n", "keep": keep},
                "fastest_lap_point": False,
                "sprint": None,
            }
        else:
            years[str(year)] = {
                "system": "pre_1960_top5",
                "points": [8, 6, 4, 3, 2],
                "dropped_scores": {"mode": "best_n", "keep": keep},
                "fastest_lap_point": True,
                "sprint": None,
            }

    for year, keep in FLAT_1961_1966.items():
        years[str(year)] = {
            "system": "classic_9",
            "points": [9, 6, 4, 3, 2, 1],
            "dropped_scores": {"mode": "best_n", "keep": keep},
            "fastest_lap_point": False,
            "sprint": None,
        }

    for year, (r1, k1, r2, k2) in SPLIT_1967_1979.items():
        years[str(year)] = {
            "system": "classic_9",
            "points": [9, 6, 4, 3, 2, 1],
            "dropped_scores": {
                "mode": "split",
                "halves": [{"races": r1, "keep": k1}, {"races": r2, "keep": k2}],
            },
            "fastest_lap_point": False,
            "sprint": None,
        }

    # Reordenar "years" por año ascendente para que el archivo sea legible.
    data["years"] = {k: years[k] for k in sorted(years, key=int)}

    data["meta"]["range"] = [1950, 2026]
    data["meta"]["description"] = (
        "Sistema de puntos del Campeonato del Mundo de F1 por año (1950–2026), "
        "para el simulador '¿y si...?'. Cada año describe el sistema REAL que "
        "rigió; el simulador aplica el sistema de otro año a las posiciones ya "
        "exportadas en docs/data/seasons/{year}.json (clave 'positions' para "
        "carrera, 'sprints' para sprint)."
    )
    data["meta"]["limitations"].extend([
        "Indianápolis 500 (1950-1960): contó oficialmente para el Mundial de "
        "F1 pero con pilotos/autos de IndyCar sin conexión con la F1 europea. "
        "Se excluyó del calendario cargado (decisión del dueño) -- verificado "
        "que no cambia ningún resultado real: de los 11 años, un único piloto "
        "irrelevante sumó puntos ahí y en una carrera europea el mismo año "
        "(0 puntos en esa carrera europea), sin impacto en ninguna tabla.",
        "Autos compartidos entre 2 pilotos (frecuente hasta 1957, prohibido "
        "desde 1958): la regla real de la época era 'si un piloto corrió "
        "relevo en más de un auto en la misma carrera y ambos puntuaron, "
        "solo cuenta el de mejor posición' (no se suman) -- verificado "
        "exacto contra Fangio 1956 (30 pts oficiales). El simulador no "
        "modela esto: recalcula por posición de carrera vía POSITIONS, que "
        "ya solo tiene UNA posición por piloto/ronda (la carga real a "
        "RaceResult también aplica esta regla de 'mejor resultado cuenta', "
        "ver CLAUDE.md § backfill 1950-1979 para el detalle del script de "
        "carga). Los puntos reales por carrera SÍ reflejan el reparto "
        "histórico entre los 2 pilotos (vienen de Jolpica-F1 ya repartidos).",
    ])

    with open(PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"OK -- {len(years)} años en total, rango {min(int(y) for y in years)}-{max(int(y) for y in years)}")


if __name__ == "__main__":
    main()
