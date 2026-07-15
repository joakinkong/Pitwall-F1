"""
Códigos de no-clasificación usados en RaceResult.position_text / SprintResult.position_text
en lugar de un número de posición.

Debe mantenerse espejada con NON_FINISH_CODES en docs/js/app.js (el frontend no
tiene build step, así que la duplicación se resuelve a mano).
"""

NON_FINISH_CODES = {
    "R",    # Retirado (retired)
    "D",    # DSQ/DNS genérico (carga manual vía admin.html)
    "W",    # Withdrew (no tomó la largada tras estar inscripto)
    "DNS",  # Did Not Start
    "DSQ",  # Descalificado
    "EX",   # Excluido
    "E",    # Excluido (código histórico corto)
    "F",    # Failed to qualify (no clasificó)
    "N",    # Not classified (no clasificado)
}
