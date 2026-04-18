# PIT WALL — F1 2021-2026

App web estática con la progresión de pilotos y constructores de Fórmula 1 entre 2021 y 2026.

## Estructura

```
pitwall/
├── index.html              Estructura HTML + layout
├── css/
│   └── styles.css          Estilos custom (complementan Tailwind CDN)
├── js/
│   ├── data.js             SEASONS, CAL_DATA, POSITIONS, SPRINTS  ← se edita cada GP
│   ├── assets.js           TRACKS (SVGs) + FLAGS + FLAG_SVGS       ← casi nunca cambia
│   ├── drivers-info.js     DRIVERS_INFO + TEAMS_INFO               ← cambia a inicio de temporada
│   └── app.js              Navegación, charts, UI, detalles        ← cambia con features nuevas
└── README.md
```

## Cómo correr localmente

Abrir `index.html` directamente en el navegador o, mejor, usar **Live Server** de VS Code: click derecho en `index.html` → "Open with Live Server".

## Workflow después de cada GP

1. Abrir terminal en esta carpeta.
2. Ejecutar `claude` (Claude Code CLI).
3. Pedirle: *"Agregá los resultados del GP de X 2026: P1 ANT, P2 RUS, ..."*.
4. Claude edita sólo `js/data.js` con un diff quirúrgico.
5. `git add . && git commit -m "R4 Miami results" && git push`.
6. GitHub Pages se actualiza solo.

## Stack

- **Tailwind CSS** vía CDN (`cdn.tailwindcss.com`).
- **Chart.js 4.4.1** vía CDN para los gráficos de progresión.
- **Google Fonts**: Space Grotesk + Inter + Material Symbols.
- **Sin build step, sin backend**: hosting estático, ideal para GitHub Pages.
