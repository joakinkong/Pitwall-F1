"""
Valida que scripts/jolpica_map.json cubra todos los driverId/constructorId/
circuitId que aparecen en los resultados REALES de Jolpica-F1 para un año
dado (no solo el roster nominal de drivers.json/constructors.json — así se
detectan también sustitutos de mitad de temporada). Lo reusa el GitHub
Action de automatización de resultados: si este script falla, el Action
debe fallar también en vez de intentar cargar un resultado sin mapeo.

Uso:
    python scripts/validate_map.py <year>
    python scripts/validate_map.py 2025

Sale con código 0 si todo está mapeado, código 1 si falta algo (y lo lista).
Sin dependencias externas (solo librería estándar) para poder correr tal
cual en un GitHub Action sin paso de instalación.
"""
import json
import os
import sys
import time
import urllib.error
import urllib.request

JOLPICA_BASE = "https://api.jolpi.ca/ergast/f1"
PAGE_SIZE = 100  # Jolpica cappea el límite real acá aunque se pida más
REQUEST_PAUSE_SECONDS = 1.5  # cortesía: es una API comunitaria gratuita
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
MAP_PATH = os.path.join(SCRIPT_DIR, "jolpica_map.json")


def load_map():
    with open(MAP_PATH, encoding="utf-8") as f:
        return json.load(f)


def fetch_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "pitwall-validate-map/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.load(r)


def fetch_all_results(year):
    """Descarga todos los resultados de carrera de un año, paginando. Una
    carrera puede quedar partida entre dos páginas (el límite de 100 resultados
    no coincide con ~20 resultados por carrera), así que se mergean por
    'round' en vez de concatenar las páginas tal cual — si no, una carrera
    partida aparece dos veces con resultados incompletos en cada mitad."""
    races_by_round = {}
    offset = 0
    while True:
        url = f"{JOLPICA_BASE}/{year}/results.json?limit={PAGE_SIZE}&offset={offset}"
        data = fetch_json(url)
        md = data["MRData"]
        total = int(md["total"])
        for race in md["RaceTable"]["Races"]:
            rnd = int(race["round"])
            if rnd in races_by_round:
                races_by_round[rnd]["Results"].extend(race.get("Results", []))
            else:
                races_by_round[rnd] = race
        offset += PAGE_SIZE
        if offset >= total:
            break
        time.sleep(REQUEST_PAUSE_SECONDS)
    return list(races_by_round.values())


def collect_ids(races):
    """IDs distintos de driver/constructor/circuito que aparecen en los
    resultados, más un round -> circuitId para la verificación cruzada."""
    driver_ids, constructor_ids, circuit_ids = set(), set(), set()
    rounds_to_circuit = {}
    for race in races:
        rnd = int(race["round"])
        circuit_id = race["Circuit"]["circuitId"]
        circuit_ids.add(circuit_id)
        rounds_to_circuit[rnd] = circuit_id
        for result in race.get("Results", []):
            driver_ids.add(result["Driver"]["driverId"])
            constructor_ids.add(result["Constructor"]["constructorId"])
    return driver_ids, constructor_ids, circuit_ids, rounds_to_circuit


def load_local_calendar(year):
    """round -> código interno de carrera, desde el JSON de temporada ya
    exportado. None si esa temporada todavía no se exportó localmente."""
    path = os.path.join(SCRIPT_DIR, "..", "docs", "data", "seasons", f"{year}.json")
    if not os.path.isfile(path):
        return None
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    return {r["round"]: r["id"] for r in data["calendar"]}


def validate(year):
    jmap = load_map()
    driver_map = jmap["drivers"]
    constructor_map = jmap["constructors"]
    circuit_map = jmap["races"]["circuits"]

    print(f"Bajando resultados de Jolpica para {year}...")
    races = fetch_all_results(year)
    driver_ids, constructor_ids, circuit_ids, rounds_to_circuit = collect_ids(races)

    missing_drivers = sorted(d for d in driver_ids if d not in driver_map)
    missing_constructors = sorted(c for c in constructor_ids if c not in constructor_map)
    missing_circuits = sorted(c for c in circuit_ids if c not in circuit_map)

    # Verificación cruzada: el round tiene que apuntar al circuito esperado
    # según el calendario local (detecta reordenamientos o mapeos erróneos).
    round_mismatches = []
    local_calendar = load_local_calendar(year)
    if local_calendar is not None:
        for rnd, circuit_id in sorted(rounds_to_circuit.items()):
            expected_local_id = circuit_map.get(circuit_id)
            local_id = local_calendar.get(rnd)
            if local_id is None:
                round_mismatches.append(
                    f"  round {rnd}: Jolpica trae circuitId '{circuit_id}' pero el "
                    f"calendario local de {year} no tiene ese round"
                )
            elif expected_local_id is not None and expected_local_id != local_id:
                round_mismatches.append(
                    f"  round {rnd}: el mapeo dice circuitId '{circuit_id}' -> "
                    f"'{expected_local_id}', pero el calendario local tiene "
                    f"'{local_id}' en ese round (¿reordenamiento de calendario?)"
                )
    else:
        print(f"  (no existe docs/data/seasons/{year}.json local — se omite la "
              f"verificación cruzada round/circuito)")

    print()
    print(f"Resultados descargados: {len(races)} carreras, "
          f"{len(driver_ids)} pilotos distintos, {len(constructor_ids)} equipos "
          f"distintos, {len(circuit_ids)} circuitos distintos.")
    print()

    ok = not (missing_drivers or missing_constructors or missing_circuits or round_mismatches)
    if ok:
        print(f"OK — todos los IDs de {year} están en scripts/jolpica_map.json.")
        return 0

    print(f"FALTAN mapeos en scripts/jolpica_map.json para {year}:")
    if missing_drivers:
        print(f"\n  drivers ({len(missing_drivers)}):")
        for d in missing_drivers:
            print(f"    - {d}")
    if missing_constructors:
        print(f"\n  constructors ({len(missing_constructors)}):")
        for c in missing_constructors:
            print(f"    - {c}")
    if missing_circuits:
        print(f"\n  races.circuits ({len(missing_circuits)}):")
        for c in missing_circuits:
            print(f"    - {c}")
    if round_mismatches:
        print("\n  verificación cruzada round/circuito:")
        for m in round_mismatches:
            print(m)

    print()
    print("Agregá las entradas que falten en scripts/jolpica_map.json (ver la clave")
    print("_doc ahí, y CLAUDE.md § Convenciones para el proceso) y volvé a correr")
    print("este script para confirmar.")
    return 1


def main():
    if len(sys.argv) != 2:
        print("Uso: python scripts/validate_map.py <year>", file=sys.stderr)
        sys.exit(2)
    try:
        year = int(sys.argv[1])
    except ValueError:
        print("El año debe ser un número, ej: python scripts/validate_map.py 2025", file=sys.stderr)
        sys.exit(2)

    try:
        exit_code = validate(year)
    except urllib.error.URLError as e:
        print(f"Error de red consultando Jolpica: {e}", file=sys.stderr)
        sys.exit(1)
    sys.exit(exit_code)


if __name__ == "__main__":
    main()
