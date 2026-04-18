// Script: agrega CAL_DATA.calendars para 2010-2020
const fs = require('fs');
const path = require('path');

const CSV_RACES = path.join(__dirname, '../CSV proyecto f1/f1_races.csv');
const DATA_JS   = path.join(__dirname, 'js/data.js');

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

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

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

function formatDate(d) {
  const [, m, day] = d.split('-');
  return parseInt(day) + ' ' + MONTHS[parseInt(m) - 1];
}

const races = parseCSV(CSV_RACES);
const calendars = {};

for (const r of races) {
  const yr = r.year;
  if (+yr < 2010 || +yr > 2020) continue;
  if (!calendars[yr]) calendars[yr] = [];
  const code = RACE_CODES[r.race_name] || r.race_name.slice(0, 3).toUpperCase();
  calendars[yr].push({ id: code, date: formatDate(r.date), round: +r.round, event: '' });
}

for (const y of Object.keys(calendars)) {
  calendars[y].sort((a, b) => a.round - b.round);
}

// Build insert string
const parts = [];
for (const y of Object.keys(calendars).sort((a, b) => +a - +b)) {
  parts.push('"' + y + '": ' + JSON.stringify(calendars[y]));
}
const insert = parts.join(',') + ',';

const src = fs.readFileSync(DATA_JS, 'utf8');
const updated = src.replace('"calendars": {', '"calendars": {' + insert);
fs.writeFileSync(DATA_JS, updated, 'utf8');

console.log('✓ Calendarios 2010-2020 agregados');
console.log('  Años:', Object.keys(calendars).sort().join(', '));

// Quick sample
console.log('\n2010 calendar:');
calendars['2010'].forEach(r => console.log('  R' + r.round + ' ' + r.id + ' ' + r.date));
