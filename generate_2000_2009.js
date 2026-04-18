// Script: genera datos 2000-2009 desde CSVs y los inyecta en data.js
// Uso: node generate_2000_2009.js

const fs = require('fs');
const path = require('path');

const CSV_RESULTS = path.join(__dirname, '../CSV proyecto f1/f1_results_full.csv');
const CSV_RACES   = path.join(__dirname, '../CSV proyecto f1/f1_races.csv');
const DATA_JS     = path.join(__dirname, 'js/data.js');

const RACE_CODES = {
  'Australian Grand Prix':    'AUS',
  'Malaysian Grand Prix':     'MAS',
  'Brazilian Grand Prix':     'SAO',
  'San Marino Grand Prix':    'SMR',
  'Spanish Grand Prix':       'ESP',
  'Monaco Grand Prix':        'MCO',
  'European Grand Prix':      'EUR',
  'Canadian Grand Prix':      'CAN',
  'French Grand Prix':        'FRA',
  'British Grand Prix':       'GBR',
  'German Grand Prix':        'GER',
  'Hungarian Grand Prix':     'HUN',
  'Belgian Grand Prix':       'BEL',
  'Italian Grand Prix':       'ITA',
  'United States Grand Prix': 'USA',
  'Japanese Grand Prix':      'JPN',
  'Bahrain Grand Prix':       'BHR',
  'Chinese Grand Prix':       'CHN',
  'Turkish Grand Prix':       'TUR',
  'Austrian Grand Prix':      'AUT',
  'Singapore Grand Prix':     'SGP',
  'Abu Dhabi Grand Prix':     'ABU',
};

const TEAM_MAP = {
  // Top teams with known colors
  'Ferrari':     { id: 'FER', name: 'FERRARI',    color: '#DC0000' },
  'McLaren':     { id: 'MCL', name: 'McLAREN',     color: '#FF8700' },
  'Williams':    { id: 'WIL', name: 'WILLIAMS',    color: '#005AFF' },
  'Red Bull':    { id: 'RBR', name: 'RED BULL',    color: '#3671C6' },
  'Renault':     { id: 'REN', name: 'RENAULT',     color: '#FFD700' },
  'Toyota':      { id: 'TOY', name: 'TOYOTA',      color: '#CC0000' },
  'BAR':         { id: 'BAR', name: 'BAR',          color: '#BBBBBB' },
  'Honda':       { id: 'HON', name: 'HONDA',        color: '#999999' },
  'Brawn':       { id: 'BGP', name: 'BRAWN',        color: '#80FF00' },
  'BMW Sauber':  { id: 'BMW', name: 'BMW SAUBER',   color: '#6699FF' },
  'Toro Rosso':  { id: 'TRO', name: 'TORO ROSSO',  color: '#1E3D8F' },
  'Force India': { id: 'FIN', name: 'FORCE INDIA',  color: '#FF80C7' },
  'Benetton':    { id: 'BEN', name: 'BENETTON',     color: '#AAAAAA' },
  'Jordan':      { id: 'JOR', name: 'JORDAN',       color: '#AAAAAA' },
  'Sauber':      { id: 'SAB', name: 'SAUBER',       color: '#9B0000' },
  'Jaguar':      { id: 'JAG', name: 'JAGUAR',       color: '#AAAAAA' },
  'Minardi':     { id: 'MIN', name: 'MINARDI',      color: '#AAAAAA' },
  'Arrows':      { id: 'ARR', name: 'ARROWS',       color: '#AAAAAA' },
  'Prost':       { id: 'PRO', name: 'PROST',        color: '#AAAAAA' },
  'Super Aguri': { id: 'SAG', name: 'SUPER AGURI',  color: '#AAAAAA' },
  'MF1':         { id: 'MF1', name: 'MF1',          color: '#AAAAAA' },
  'Spyker MF1':  { id: 'SPY', name: 'SPYKER',       color: '#AAAAAA' },
  'Spyker':      { id: 'SPK', name: 'SPYKER',       color: '#AAAAAA' },
};

const NEW_CIRCUITS = {
  SMR: { name: 'San Marino Grand Prix', circuit: 'Autodromo Enzo e Dino Ferrari', city: 'Imola, Italy', length: '4.909 km', turns: 17, laps: 62 },
  FRA: { name: 'French Grand Prix',     circuit: 'Circuit de Nevers Magny-Cours', city: 'Magny-Cours, France', length: '4.411 km', turns: 17, laps: 70 },
};

function parseCSV(fp) {
  const lines = fs.readFileSync(fp, 'utf8').trim().split('\n');
  const h = lines[0].split(',').map(x => x.trim());
  return lines.slice(1).map(l => {
    const v = l.split(',');
    const o = {};
    h.forEach((k, i) => { o[k] = (v[i] || '').trim(); });
    return o;
  });
}

function formatName(full) {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return full.toUpperCase();
  return parts[0][0].toUpperCase() + '. ' + parts.slice(1).join(' ').toUpperCase();
}

function teamOf(name) {
  return TEAM_MAP[name] || { id: name.slice(0,3).toUpperCase(), name: name.toUpperCase(), color: '#888888' };
}

function round1(n) { return Math.round(n * 10) / 10; }

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function formatDate(d) {
  const [, m, day] = d.split('-');
  return parseInt(day) + ' ' + MONTHS[parseInt(m)-1];
}

// ── Parse results ─────────────────────────────────────────────────────────────
const rows = parseCSV(CSV_RESULTS).filter(r => +r.year >= 2000 && +r.year <= 2009);
const byYear = {};
for (const r of rows) {
  const y = r.year, rd = +r.round;
  if (!byYear[y]) byYear[y] = {};
  if (!byYear[y][rd]) byYear[y][rd] = [];
  byYear[y][rd].push(r);
}

// ── Parse races for calendar dates ─────────────────────────────────────────
const raceRows = parseCSV(CSV_RACES).filter(r => +r.year >= 2000 && +r.year <= 2009);
const calByYear = {};
for (const r of raceRows) {
  if (!calByYear[r.year]) calByYear[r.year] = [];
  calByYear[r.year].push(r);
}

// ── Build SEASONS, POSITIONS, CALENDARS ──────────────────────────────────────
const SEASONS_NEW   = {};
const POSITIONS_NEW = {};
const CALENDARS_NEW = {};

for (const year of Object.keys(byYear).sort()) {
  const rounds = Object.keys(byYear[year]).map(Number).sort((a,b)=>a-b);

  const raceCodes = rounds.map(rd => {
    const name = byYear[year][rd][0].race_name;
    return RACE_CODES[name] || name.slice(0,3).toUpperCase();
  });

  const driverMap = {};
  const constrMap = {};

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

  const drivers = Object.values(driverMap).map(d => {
    let cum = 0;
    const cumArr = rounds.map(rd => { cum = round1(cum + (d.pts[rd] || 0)); return cum; });
    return { id: d.code, name: d.name, team: d.team, total: round1(cum), cum: cumArr, color: d.color };
  }).sort((a,b) => b.total - a.total);

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

  // Calendar
  const calRaces = (calByYear[year] || []).slice().sort((a,b)=>+a.round-+b.round);
  CALENDARS_NEW[year] = calRaces.map(r => ({
    id: RACE_CODES[r.race_name] || r.race_name.slice(0,3).toUpperCase(),
    date: formatDate(r.date),
    round: +r.round,
    event: '',
  }));
}

// ── Inject into data.js ───────────────────────────────────────────────────────
let src = fs.readFileSync(DATA_JS, 'utf8');

const seasonsInsert = Object.entries(SEASONS_NEW).map(([y,v])=>`"${y}":${JSON.stringify(v)}`).join(',');
src = src.replace('const SEASONS={', `const SEASONS={${seasonsInsert},`);

const posInsert = Object.entries(POSITIONS_NEW).map(([y,v])=>`"${y}":${JSON.stringify(v)}`).join(',');
src = src.replace('const POSITIONS={', `const POSITIONS={${posInsert},`);

const calInsert = Object.entries(CALENDARS_NEW).map(([y,v])=>`"${y}":${JSON.stringify(v)}`).join(',');
src = src.replace('"calendars": {', `"calendars": {${calInsert},`);

const circuitInsert = Object.entries(NEW_CIRCUITS).map(([k,v])=>`"${k}":${JSON.stringify(v)}`).join(',');
src = src.replace('"circuits": {', `"circuits": {${circuitInsert},`);

fs.writeFileSync(DATA_JS, src, 'utf8');

console.log('✓ data.js actualizado con temporadas 2000-2009');
console.log('  Años:', Object.keys(SEASONS_NEW).join(', '));
console.log('  Circuitos nuevos:', Object.keys(NEW_CIRCUITS).join(', '));
console.log('\nCampeones:');
for (const [y,s] of Object.entries(SEASONS_NEW)) {
  console.log(`  ${y}: ${s.champion_driver} / ${s.champion_constructor}`);
}
