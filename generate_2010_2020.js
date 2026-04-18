// Script: genera datos 2010-2020 desde CSVs y los inyecta en data.js
// Uso: node generate_2010_2020.js

const fs = require('fs');
const path = require('path');

const CSV_RESULTS = path.join(__dirname, '../CSV proyecto f1/f1_results_full.csv');
const DATA_JS     = path.join(__dirname, 'js/data.js');

// ── Race name → 3-letter code ──────────────────────────────────────────────
const RACE_CODES = {
  'Bahrain Grand Prix':          'BHR',
  'Australian Grand Prix':       'AUS',
  'Malaysian Grand Prix':        'MAS',
  'Chinese Grand Prix':          'CHN',
  'Spanish Grand Prix':          'ESP',
  'Monaco Grand Prix':           'MCO',
  'Turkish Grand Prix':          'TUR',
  'Canadian Grand Prix':         'CAN',
  'European Grand Prix':         'EUR',
  'British Grand Prix':          'GBR',
  'German Grand Prix':           'GER',
  'Hungarian Grand Prix':        'HUN',
  'Belgian Grand Prix':          'BEL',
  'Italian Grand Prix':          'ITA',
  'Singapore Grand Prix':        'SGP',
  'Japanese Grand Prix':         'JPN',
  'Korean Grand Prix':           'KOR',
  'Brazilian Grand Prix':        'SAO',
  'Abu Dhabi Grand Prix':        'ABU',
  'Indian Grand Prix':           'IND',
  'United States Grand Prix':    'USA',
  'Austrian Grand Prix':         'AUT',
  'Russian Grand Prix':          'RUS',
  'Mexican Grand Prix':          'MEX',
  'Azerbaijan Grand Prix':       'AZE',
  'French Grand Prix':           'FRA',
  'Styrian Grand Prix':          'STY',
  '70th Anniversary Grand Prix': 'SEV',
  'Tuscan Grand Prix':           'TUS',
  'Eifel Grand Prix':            'EIF',
  'Portuguese Grand Prix':       'PRT',
  'Emilia Romagna Grand Prix':   'EMI',
  'Sakhir Grand Prix':           'SAK',
};

// ── Constructor → {id, name, color} ───────────────────────────────────────
const TEAM_MAP = {
  'Mercedes':      { id: 'MER', name: 'MERCEDES',     color: '#00D2BE' },
  'Red Bull':      { id: 'RBR', name: 'RED BULL',      color: '#3671C6' },
  'Ferrari':       { id: 'FER', name: 'FERRARI',       color: '#DC0000' },
  'McLaren':       { id: 'MCL', name: 'McLAREN',       color: '#FF8700' },
  'Williams':      { id: 'WIL', name: 'WILLIAMS',      color: '#00A0DE' },
  'Renault':       { id: 'REN', name: 'RENAULT',       color: '#FFD700' },
  'Force India':   { id: 'FIN', name: 'FORCE INDIA',   color: '#FF80C7' },
  'Toro Rosso':    { id: 'TRO', name: 'TORO ROSSO',    color: '#1E3D8F' },
  'Sauber':        { id: 'SAB', name: 'SAUBER',        color: '#9B0000' },
  'Lotus':         { id: 'LOT', name: 'LOTUS',         color: '#004225' },
  'Lotus F1':      { id: 'LF1', name: 'LOTUS F1',      color: '#B8860B' },
  'Racing Point':  { id: 'RPT', name: 'RACING POINT',  color: '#F363B9' },
  'Alfa Romeo':    { id: 'ALF', name: 'ALFA ROMEO',    color: '#900000' },
  'AlphaTauri':    { id: 'APT', name: 'ALPHATAURI',    color: '#2B4562' },
  'Haas F1 Team':  { id: 'HAA', name: 'HAAS',          color: '#E6002B' },
  'Caterham':      { id: 'CAT', name: 'CATERHAM',      color: '#005030' },
  'HRT':           { id: 'HRT', name: 'HRT',           color: '#A6904F' },
  'Manor Marussia':{ id: 'MAN', name: 'MANOR',         color: '#006DC1' },
  'Marussia':      { id: 'MAR', name: 'MARUSSIA',      color: '#EF1E36' },
  'Virgin':        { id: 'VIR', name: 'VIRGIN',        color: '#CE1126' },
};

// ── New circuits to add to CAL_DATA (not already present) ─────────────────
const NEW_CIRCUITS = {
  MAS: { name: 'Malaysian Grand Prix',       circuit: 'Sepang International Circuit',      city: 'Kuala Lumpur, Malaysia',      length: '5.543 km', turns: 15, laps: 56 },
  EUR: { name: 'European Grand Prix',        circuit: 'Valencia Street Circuit',            city: 'Valencia, Spain',             length: '5.419 km', turns: 25, laps: 57 },
  GER: { name: 'German Grand Prix',          circuit: 'Hockenheimring',                    city: 'Hockenheim, Germany',         length: '4.574 km', turns: 17, laps: 67 },
  KOR: { name: 'Korean Grand Prix',          circuit: 'Korean International Circuit',       city: 'Yeongam, South Korea',        length: '5.615 km', turns: 18, laps: 55 },
  IND: { name: 'Indian Grand Prix',          circuit: 'Buddh International Circuit',        city: 'Greater Noida, India',        length: '5.125 km', turns: 16, laps: 60 },
  TUS: { name: 'Tuscan Grand Prix',          circuit: 'Mugello Circuit',                    city: 'Scarperia, Italy',            length: '5.245 km', turns: 15, laps: 59 },
  EIF: { name: 'Eifel Grand Prix',           circuit: 'Nürburgring',                        city: 'Nürburg, Germany',            length: '5.148 km', turns: 15, laps: 60 },
  SAK: { name: 'Sakhir Grand Prix',          circuit: 'Bahrain International Circuit (Outer)', city: 'Sakhir, Bahrain',         length: '3.543 km', turns: 11, laps: 87 },
  SEV: { name: '70th Anniversary Grand Prix',circuit: 'Silverstone Circuit',                city: 'Silverstone, UK',             length: '5.891 km', turns: 18, laps: 52 },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function parseCSV(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
  const headers = lines[0].split(',').map(h => h.trim());
  return lines.slice(1).map(line => {
    // Naive split – the CSVs don't have quoted commas
    const vals = line.split(',');
    const obj = {};
    headers.forEach((h, i) => { obj[h] = (vals[i] || '').trim(); });
    return obj;
  });
}

function formatName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.toUpperCase();
  return parts[0][0].toUpperCase() + '. ' + parts.slice(1).join(' ').toUpperCase();
}

function teamOf(constructorName) {
  return TEAM_MAP[constructorName] || { id: constructorName.slice(0,3).toUpperCase(), name: constructorName.toUpperCase(), color: '#888888' };
}

function round1(n) { return Math.round(n * 10) / 10; }

// ── Parse results, filter 2010-2020 ───────────────────────────────────────
const allRows = parseCSV(CSV_RESULTS);
const rows    = allRows.filter(r => +r.year >= 2010 && +r.year <= 2020);

// Group: year → round (sorted) → rows[]
const byYear = {};
for (const r of rows) {
  const y = r.year, rd = +r.round;
  if (!byYear[y]) byYear[y] = {};
  if (!byYear[y][rd]) byYear[y][rd] = [];
  byYear[y][rd].push(r);
}

// ── Build SEASONS_NEW and POSITIONS_NEW ────────────────────────────────────
const SEASONS_NEW   = {};
const POSITIONS_NEW = {};

for (const year of Object.keys(byYear).sort()) {
  const rounds = Object.keys(byYear[year]).map(Number).sort((a,b) => a-b);

  // race codes in order
  const raceCodes = rounds.map(rd => {
    const name = byYear[year][rd][0].race_name;
    return RACE_CODES[name] || name.slice(0,3).toUpperCase();
  });

  // accumulate driver points
  const driverMap = {};   // code → { name, team, color, pts[round] }
  const constrMap = {};   // conId → { name, color, pts[round] }

  for (const rd of rounds) {
    for (const r of byYear[year][rd]) {
      const code = r.driver_code || r.driver_name.slice(0,3).toUpperCase();
      const pts  = parseFloat(r.points) || 0;
      const team = teamOf(r.constructor);

      if (!driverMap[code]) {
        driverMap[code] = { code, name: formatName(r.driver_name), team: team.name, color: team.color, pts: {} };
      }
      driverMap[code].pts[rd] = pts;

      const cid = team.id;
      if (!constrMap[cid]) constrMap[cid] = { id: cid, name: team.name, color: team.color, pts: {} };
      constrMap[cid].pts[rd] = (constrMap[cid].pts[rd] || 0) + pts;
    }
  }

  // build driver entries with cumulative array
  const drivers = Object.values(driverMap).map(d => {
    let cum = 0;
    const cumArr = rounds.map(rd => { cum = round1(cum + (d.pts[rd] || 0)); return cum; });
    return { id: d.code, name: d.name, team: d.team, total: round1(cum), cum: cumArr, color: d.color };
  }).sort((a,b) => b.total - a.total);

  // build constructor entries
  const constructors = Object.values(constrMap).map(c => {
    let cum = 0;
    const cumArr = rounds.map(rd => { cum = round1(cum + (c.pts[rd] || 0)); return cum; });
    return { id: c.id, name: c.name, total: round1(cum), cum: cumArr, color: c.color };
  }).sort((a,b) => b.total - a.total);

  SEASONS_NEW[year] = {
    champion_driver:      drivers[0]?.id || '',
    champion_constructor: constructors[0]?.id || '',
    races:     raceCodes,
    completed: rounds.length,
    drivers,
    constructors,
  };

  // build POSITIONS: code → array of position_text per race
  const posMap = {};
  for (const d of Object.values(driverMap)) posMap[d.code] = {};
  for (const rd of rounds) {
    for (const r of byYear[year][rd]) {
      const code = r.driver_code || r.driver_name.slice(0,3).toUpperCase();
      posMap[code][rd] = r.position_text || 'R';
    }
  }
  const positions = {};
  for (const [code, byRd] of Object.entries(posMap)) {
    positions[code] = rounds.map(rd => byRd[rd] || '');
  }
  POSITIONS_NEW[year] = positions;
}

// ── Inject into data.js ────────────────────────────────────────────────────
let src = fs.readFileSync(DATA_JS, 'utf8');

// 1. Inject new years into SEASONS (insert before existing first year "2021")
const seasonsInsert = Object.entries(SEASONS_NEW)
  .map(([y, v]) => `"${y}": ${JSON.stringify(v)}`)
  .join(',');

src = src.replace('const SEASONS={', `const SEASONS={${seasonsInsert},`);

// 2. Inject new years into POSITIONS
const posInsert = Object.entries(POSITIONS_NEW)
  .map(([y, v]) => `"${y}": ${JSON.stringify(v)}`)
  .join(',');

src = src.replace('const POSITIONS={', `const POSITIONS={${posInsert},`);

// 3. Inject new circuits into CAL_DATA.circuits
const circuitInsert = Object.entries(NEW_CIRCUITS)
  .map(([k, v]) => `"${k}": ${JSON.stringify(v)}`)
  .join(',');

src = src.replace('"circuits": {', `"circuits": {${circuitInsert},`);

// ── Write updated data.js ──────────────────────────────────────────────────
fs.writeFileSync(DATA_JS, src, 'utf8');
console.log('✓ data.js actualizado con temporadas 2010-2020');
console.log(`  Años agregados: ${Object.keys(SEASONS_NEW).join(', ')}`);
console.log(`  Circuitos nuevos: ${Object.keys(NEW_CIRCUITS).join(', ')}`);
