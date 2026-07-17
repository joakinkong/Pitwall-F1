"""
Construye scripts/jolpica_map_pre1980.json: mapeo de IDs Jolpica-F1 (drivers/
constructors/circuits) -> IDs internos de PIT WALL, para el backfill histórico
1950-1979 (ver plan en la conversación / futura entrada de CLAUDE.md).

Alcance: SOLO 1950-1979. El histórico 1980-2024 y el rango 2025-2026 tienen
sus propios mapeos/flujos (scripts/jolpica_map.json cubre 2025-2026).

Metodología:
1. Baja resultados reales (no roster nominal) de Jolpica para cada año
   1950-1979, paginado y mergeado por ronda (mismo patrón que validate_map.py).
2. Para cada driver/constructor/circuit distinto que aparece en resultados
   reales, intenta matchear por nombre contra las entidades YA existentes en
   f1.db (293 drivers / 14 teams / 57 circuits) -- necesario porque varios
   pilotos/equipos/circuitos de esta era siguen en la DB actual (ids
   reusados) o siguen corriendo hoy (circuitos).
3. Para lo que NO matchea con nada existente, genera un código nuevo de 3
   letras determinístico (derivado del apellido/nombre), evitando colisión
   con TODO id ya usado (existente en DB + ya asignado en este mismo batch).
4. Escribe scripts/jolpica_map_pre1980.json con todo flageado para revisión
   humana antes de tocar f1.db -- no escribe nada a la DB.

Solo librería estándar (sin pip install), rate-limited (1.5s entre requests).
"""
import json
import os
import re
import ssl
import sqlite3
import sys
import time
import unicodedata
import urllib.error
import urllib.request

BASE_URL = "https://api.jolpi.ca/ergast/f1"
PAGE_SIZE = 100
SLEEP_SECONDS = 1.5
YEARS = range(1950, 1980)

# Casos ambiguos (matchean >1 id existente, o son duplicados huérfanos
# preexistentes en la DB) resueltos a mano tras revisar uso real en
# race_calendar/race_results -- ver justificación en la conversación /
# CLAUDE.md. None fuerza código nuevo (ningún id existente es correcto).
MANUAL_OVERRIDES = {
    "drivers": {
        "depailler": "DEP",   # DEP tiene 8 filas reales en race_results, PDV tiene 0 (duplicado huérfano)
        "keegan": "RKE",      # RKE tiene 12 filas reales, RKG tiene 0 (duplicado huérfano)
    },
    "constructors": {},
    "circuits": {
        "silverstone": "GBR",       # SEV = "70th Anniversary GP" (evento especial 2020), no el nombre histórico
        "red_bull_ring": "OST",     # OST ya se usa 1980-1987 (Österreichring) -- continuidad directa con 1970-1979
        "ricard": "PRC",            # PRC ya se usa 1980-1989 -- continuidad directa; FRA es la era posterior (1990+)
        "nurburgring": None,        # GP Alemania en Nürburgring pre-1977: ni LUX (Luxemburgo 1997-98) ni EIF
                                     # (Eifel GP 2020) son el mismo evento histórico -- código nuevo.
    },
}

# CONSTRUCTORES: se unifican por MARCA DE CHASIS (decisión del dueño 2026-07-16,
# ver CLAUDE.md § backfill 1950-1979). Jolpica/FIA registra cada combinación
# chasis-motor como constructor separado (brabham-repco, brabham-ford, ...);
# los colapsamos a la marca del chasis para que los récords de equipo tengan
# sentido y haya continuidad con la era 1980+ que la app ya tiene.
#
# La marca de chasis se toma como la parte antes del primer "-", EXCEPTO los
# nombres propios que llevan guión de verdad (no son chasis-motor):
HYPHENATED_REAL_NAMES = {"Behra-Porsche", "Arzani-Volpini", "Tec-Mec"}

# Marca de chasis (mayúscula, ya sin sufijo de motor) -> team_id canónico que
# ya usa la era 1980+ (para no partir un equipo en dos identidades). Las marcas
# vigentes (Ferrari, McLaren, Mercedes, Williams, Alfa, Aston Martin) se
# resuelven dinámicamente contra la tabla `teams` por nombre; acá van solo los
# alias que NO se derivan solos:
CHASSIS_ALIASES = {
    "LOTUS": "TEAM LOTUS",   # Team Lotus clásico (Chapman) continúa como 'TEAM LOTUS' en 1980-1989
}


def chassis_brand(name):
    """Marca de chasis en mayúscula, colapsando el sufijo de motor."""
    if name in HYPHENATED_REAL_NAMES:
        return name.upper()
    if "-" in name:
        return name.split("-")[0].strip().upper()
    return name.upper()
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DB_PATH = os.path.join(REPO_ROOT, "f1.db")
OUT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "jolpica_map_pre1980.json")
CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".pre1980_raw_cache.json")


def _ssl_context():
    # Ver scripts/sync_jolpica.py: PITWALL_CA_INSECURE=1 es el escape para
    # desarrollo local detrás de un proxy que intercepta TLS (ej. Avast).
    if os.environ.get("PITWALL_CA_INSECURE") == "1":
        print("ADVERTENCIA: PITWALL_CA_INSECURE=1 - verificacion TLS desactivada.", file=sys.stderr)
        return ssl._create_unverified_context()
    return ssl.create_default_context()


def _get(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pitwall-build-pre1980-map"})
    with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
        return json.load(r)


def fetch_year_results(year):
    """Descarga todos los resultados de un año, mergeados por round (una
    carrera puede quedar partida entre 2 páginas de 100)."""
    races_by_round = {}
    offset = 0
    while True:
        url = f"{BASE_URL}/{year}/results.json?limit={PAGE_SIZE}&offset={offset}"
        data = _get(url)
        table = data["MRData"]["RaceTable"]
        races = table["Races"]
        total = int(data["MRData"]["total"])
        for race in races:
            rnd = race["round"]
            if rnd not in races_by_round:
                races_by_round[rnd] = race
            else:
                races_by_round[rnd]["Results"].extend(race["Results"])
        offset += PAGE_SIZE
        time.sleep(SLEEP_SECONDS)
        if offset >= total:
            break
    return list(races_by_round.values())


def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c))


def load_db_ids():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    drivers = {row[0]: row[1] for row in cur.execute("SELECT id, name FROM drivers")}
    teams = {row[0]: row[1] for row in cur.execute("SELECT id, display_name FROM teams")}
    teams_full = {row[0]: row[1] for row in cur.execute("SELECT id, full_name FROM teams")}
    circuits = {row[0]: row[1] for row in cur.execute("SELECT id, name FROM circuits")}
    circuits_city = {row[0]: row[1] for row in cur.execute("SELECT id, city FROM circuits")}
    circuits_track = {row[0]: row[1] for row in cur.execute("SELECT id, circuit_name FROM circuits")}
    # team_ids REALES usados en resultados (72), no solo la tabla `teams` (14):
    # el histórico 1980+ nombra a los equipos desaparecidos con su nombre
    # completo en mayúscula como team_id (BRABHAM, TEAM LOTUS, ...), sin fila
    # en `teams`. Los necesitamos para reconciliar la continuidad de marca.
    result_team_ids = {row[0] for row in cur.execute("SELECT DISTINCT team_id FROM race_results")}
    conn.close()
    return drivers, teams, teams_full, circuits, circuits_city, circuits_track, result_team_ids


def norm(s):
    if not s:
        return ""
    return re.sub(r"[^A-Z0-9]", "", strip_accents(s).upper())


def name_tokens(s):
    return set(norm(s).split()) if s else set()


def candidate_codes_driver(given, family):
    fam = strip_accents(family).upper()
    fam = re.sub(r"[^A-Z]", "", fam)
    giv = strip_accents(given).upper()
    giv = re.sub(r"[^A-Z]", "", giv)
    cands = []
    if len(fam) >= 3:
        cands.append(fam[:3])
    # variantes de desambiguación (mismo espiritu que HRB/RKG/RKE ya en la DB)
    for i in range(1, min(len(fam), 6)):
        c = (fam[:1] + fam[i:i + 2])[:3]
        if len(c) == 3:
            cands.append(c)
    if giv and fam:
        cands.append((giv[:1] + fam[:2])[:3])
        cands.append((giv[:2] + fam[:1])[:3])
    if len(fam) >= 4:
        cands.append(fam[:2] + fam[3])
    return [c for c in cands if len(c) == 3]


def candidate_codes_generic(name):
    words = [w for w in re.sub(r"[^A-Za-z0-9 ]", " ", strip_accents(name)).upper().split() if w]
    cands = []
    if words:
        main = words[-1] if len(words) > 1 else words[0]
        if len(main) >= 3:
            cands.append(main[:3])
        if len(words) >= 2:
            cands.append((words[0][:1] + words[1][:2])[:3])
            cands.append((words[0][:2] + words[1][:1])[:3])
        for w in words:
            if len(w) >= 3:
                cands.append(w[:3])
        # palabra única (o todas ya probadas): agotar combinaciones de 3
        # letras dentro de la palabra antes de recurrir a un código con
        # dígito (rompería la convención "siempre 3 letras" de toda la DB).
        for w in words:
            if len(w) < 3:
                continue
            for i in range(1, len(w) - 1):
                cands.append(w[0] + w[i] + w[i + 1])
            for i in range(1, len(w) - 1):
                cands.append(w[0:2] + w[i])
            consonants = [c for c in w if c not in "AEIOU"]
            if len(consonants) >= 3:
                cands.append("".join(consonants[:3]))
    return [c for c in cands if len(c) == 3]


def assign_code(candidates, used_ids):
    for c in candidates:
        if c and c not in used_ids:
            return c, False
    # fallback: numeric suffix sobre el primer candidato
    base = (candidates[0] if candidates else "XXX")[:2]
    for n in range(10):
        c = f"{base}{n}"
        if c not in used_ids:
            return c, True
    raise RuntimeError(f"No se pudo asignar código para candidatos {candidates}")


def main():
    print(f"Bajando resultados Jolpica {YEARS.start}-{YEARS.stop - 1}...", file=sys.stderr)

    if os.path.exists(CACHE_PATH):
        print("Usando cache local", CACHE_PATH, file=sys.stderr)
        with open(CACHE_PATH, encoding="utf-8") as f:
            all_races_by_year = json.load(f)
    else:
        all_races_by_year = {}
        for year in YEARS:
            print(f"  {year}...", file=sys.stderr)
            races = fetch_year_results(year)
            all_races_by_year[str(year)] = races
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(all_races_by_year, f)

    drivers_seen = {}   # driverId -> {given, family, dob, nat, years:set}
    constructors_seen = {}  # constructorId -> {name, nat, years:set}
    circuits_seen = {}  # circuitId -> {circuitName, locality, country, years:set}

    for year, races in all_races_by_year.items():
        for race in races:
            c = race["Circuit"]
            cid = c["circuitId"]
            circuits_seen.setdefault(cid, {
                "circuitName": c["circuitName"],
                "locality": c["Location"]["locality"],
                "country": c["Location"]["country"],
                "years": [],
            })
            circuits_seen[cid]["years"].append(int(year))
            for res in race["Results"]:
                d = res["Driver"]
                did = d["driverId"]
                drivers_seen.setdefault(did, {
                    "given": d.get("givenName", ""),
                    "family": d.get("familyName", ""),
                    "dob": d.get("dateOfBirth"),
                    "nat": d.get("nationality"),
                    "years": [],
                })
                drivers_seen[did]["years"].append(int(year))
                ct = res["Constructor"]
                ctid = ct["constructorId"]
                constructors_seen.setdefault(ctid, {
                    "name": ct["name"],
                    "nat": ct.get("nationality"),
                    "years": [],
                })
                constructors_seen[ctid]["years"].append(int(year))

    print(f"Distintos: {len(drivers_seen)} drivers, {len(constructors_seen)} constructors, "
          f"{len(circuits_seen)} circuits", file=sys.stderr)

    db_drivers, db_teams, db_teams_full, db_circuits, db_circuits_city, db_circuits_track, db_result_team_ids = load_db_ids()
    used_ids_drivers = set(db_drivers.keys())
    used_ids_teams = set(db_teams.keys())
    used_ids_circuits = set(db_circuits.keys())

    # índice de nombre normalizado -> id existente, para continuidad
    db_driver_by_name = {}
    for did, name in db_drivers.items():
        if name and name != did:
            db_driver_by_name.setdefault(norm(name), []).append(did)
    db_team_by_name = {}
    for tid, name in list(db_teams.items()) + list(db_teams_full.items()):
        if name:
            db_team_by_name.setdefault(norm(name), []).append(tid)
    db_circuit_by_name = {}
    for cid, name in list(db_circuits.items()) + list(db_circuits_city.items()) + list(db_circuits_track.items()):
        if name:
            db_circuit_by_name.setdefault(norm(name), []).append(cid)

    flagged = []
    out_drivers = {}
    for did, info in sorted(drivers_seen.items()):
        full_name = f"{info['given']} {info['family']}".strip()
        key = norm(full_name)
        key_fam = norm(info["family"])
        if did in MANUAL_OVERRIDES["drivers"]:
            code = MANUAL_OVERRIDES["drivers"][did]
            out_drivers[did] = code
            info["assigned_code"] = code
            info["continuity"] = True
            info["full_name"] = full_name
            continue
        match_ids = db_driver_by_name.get(key)
        continuity = False
        if match_ids:
            if len(match_ids) > 1:
                flagged.append(f"driver '{full_name}' ({did}) matchea multiples ids existentes: {match_ids}")
            code = match_ids[0]
            continuity = True
        else:
            # continuidad parcial por apellido (ej. nombre completo distinto por acentos/orden)
            partial = [i for k, ids in db_driver_by_name.items() if key_fam and key_fam in k for i in ids]
            if partial:
                flagged.append(f"driver '{full_name}' ({did}) posible match parcial por apellido con {set(partial)} -- revisar a mano, NO auto-asignado")
            cands = candidate_codes_driver(info["given"], info["family"])
            # Evitar también los códigos de 3 letras de equipos vigentes (FER,
            # MCL, WIL, MER...): aunque Driver.id y Team.id son tablas
            # separadas, dar a un piloto el código de un equipo distinto (ej.
            # el piloto Bruce McLaren con 'MCL', el team McLaren) es confuso y
            # frágil. Los team_ids de nombre completo (BRABHAM) no son de 3
            # letras, así que no entran en conflicto con un código de piloto.
            code, fallback = assign_code(cands, used_ids_drivers | used_ids_teams | set(out_drivers.values()))
            if fallback:
                flagged.append(f"driver '{full_name}' ({did}) sin candidato de 3 letras libre, código fallback: {code}")
        out_drivers[did] = code
        info["assigned_code"] = code
        info["continuity"] = continuity
        info["full_name"] = full_name

    # Constructores: unificados por MARCA DE CHASIS (ver constantes arriba).
    # Prioridad para el team_id canónico de una marca:
    #   1. MANUAL_OVERRIDES / CHASSIS_ALIASES explícito.
    #   2. Marca vigente que matchea la tabla `teams` por nombre -> código 3 letras.
    #   3. Marca cuyo nombre-mayúscula ya es un team_id del histórico 1980+ -> ese id.
    #   4. Nueva -> nombre de marca en mayúscula (misma convención que 1980+
    #      usa para equipos desaparecidos: 'BRABHAM', 'MASERATI', ...).
    out_constructors = {}
    for ctid, info in sorted(constructors_seen.items()):
        if ctid in MANUAL_OVERRIDES["constructors"]:
            code = MANUAL_OVERRIDES["constructors"][ctid]
            out_constructors[ctid] = code
            info["assigned_code"] = code
            info["chassis_brand"] = code
            info["continuity"] = code in used_ids_teams or code in db_result_team_ids
            continue
        brand = chassis_brand(info["name"])
        info["chassis_brand"] = brand
        if brand in CHASSIS_ALIASES:
            code = CHASSIS_ALIASES[brand]
            continuity = True
        else:
            match_ids = db_team_by_name.get(norm(brand))
            if match_ids:
                if len(match_ids) > 1:
                    flagged.append(f"marca '{brand}' (de '{info['name']}', {ctid}) matchea multiples ids vigentes: {match_ids}")
                code = match_ids[0]
                continuity = True
            elif brand in db_result_team_ids:
                code = brand           # reaparece en 1980+ con nombre completo
                continuity = True
            else:
                code = brand           # solo existió 1950-1979
                continuity = False
        out_constructors[ctid] = code
        info["assigned_code"] = code
        info["continuity"] = continuity

    out_circuits = {}
    for cid, info in sorted(circuits_seen.items()):
        key = norm(info["circuitName"])
        key2 = norm(info["locality"])
        if cid in MANUAL_OVERRIDES["circuits"]:
            forced = MANUAL_OVERRIDES["circuits"][cid]
            if forced is not None:
                out_circuits[cid] = forced
                info["assigned_code"] = forced
                info["continuity"] = True
                continue
            # forced is None: ningún id existente es correcto, cae al
            # bloque de código nuevo de abajo sin intentar auto-match.
            match_ids = None
        else:
            match_ids = db_circuit_by_name.get(key) or db_circuit_by_name.get(key2)
        continuity = False
        if match_ids:
            if len(match_ids) > 1:
                flagged.append(f"circuit '{info['circuitName']}' ({cid}) matchea multiples ids existentes: {match_ids}")
            code = match_ids[0]
            continuity = True
        else:
            cands = candidate_codes_generic(info["circuitName"]) + candidate_codes_generic(info["locality"])
            code, fallback = assign_code(cands, used_ids_circuits | set(out_circuits.values()))
            if fallback:
                flagged.append(f"circuit '{info['circuitName']}' ({cid}) sin candidato de 3 letras libre, código fallback: {code}")
        out_circuits[cid] = code
        info["assigned_code"] = code
        info["continuity"] = continuity

    result = {
        "_doc": {
            "description": "Mapeo Jolpica-F1 -> IDs internos para el backfill historico 1950-1979. "
                            "Alcance SOLO 1950-1979 (separado de scripts/jolpica_map.json, que es SOLO 2025-2026).",
            "generated_by": "scripts/build_pre1980_map.py",
            "review_needed": "Revisar 'flagged_for_review' antes de usar este mapa para escribir en f1.db. "
                              "continuity=true significa 'se reusa un id ya existente en la DB' (mismo piloto/equipo/"
                              "circuito que ya corre o corrio en 1980-2026); continuity=false es un id nuevo generado "
                              "deterministicamente y sin colision con ningun id existente ni con otro asignado en este batch.",
        },
        "flagged_for_review": flagged,
        "drivers": {did: {"code": v["assigned_code"], "name": v["full_name"], "continuity": v["continuity"],
                           "dob": v["dob"], "nationality": v["nat"], "years": sorted(set(v["years"]))}
                    for did, v in drivers_seen.items()},
        "constructors": {ctid: {"code": v["assigned_code"], "name": v["name"],
                                 "chassis_brand": v.get("chassis_brand"), "continuity": v["continuity"],
                                 "nationality": v["nat"], "years": sorted(set(v["years"]))}
                          for ctid, v in constructors_seen.items()},
        "circuits": {cid: {"code": v["assigned_code"], "name": v["circuitName"], "continuity": v["continuity"],
                            "locality": v["locality"], "country": v["country"], "years": sorted(set(v["years"]))}
                     for cid, v in circuits_seen.items()},
    }

    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"\nEscrito {OUT_PATH}", file=sys.stderr)
    print(f"Drivers: {len(out_drivers)} ({sum(1 for v in drivers_seen.values() if v['continuity'])} continuidad, "
          f"{sum(1 for v in drivers_seen.values() if not v['continuity'])} nuevos)", file=sys.stderr)
    print(f"Constructors: {len(out_constructors)} constructorIds -> {len(set(out_constructors.values()))} equipos "
          f"unificados por chasis ({sum(1 for v in constructors_seen.values() if v['continuity'])} continuidad, "
          f"{sum(1 for v in constructors_seen.values() if not v['continuity'])} nuevos)", file=sys.stderr)
    print(f"Circuits: {len(out_circuits)} ({sum(1 for v in circuits_seen.values() if v['continuity'])} continuidad, "
          f"{sum(1 for v in circuits_seen.values() if not v['continuity'])} nuevos)", file=sys.stderr)
    print(f"Flagged for review: {len(flagged)}", file=sys.stderr)


if __name__ == "__main__":
    main()
