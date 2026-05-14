/**
 * extract_js_data.js
 * Lee los archivos JS del frontend y exporta todos los datos como JSON.
 * Uso: node extract_js_data.js
 * Requiere Node.js >= 14.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', 'pitwall', 'js');
const OUT_DIR = path.join(__dirname, 'data_export');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR);

function loadFile(filename) {
    const filepath = path.join(JS_DIR, filename);
    let code = fs.readFileSync(filepath, 'utf8');
    // Replace const/let with var so they appear on the sandbox object
    code = code.replace(/\bconst\b/g, 'var').replace(/\blet\b/g, 'var');
    const sandbox = {};
    try {
        vm.createContext(sandbox);
        vm.runInContext(code, sandbox);
    } catch (e) {
        console.error(`Error loading ${filename}: ${e.message}`);
    }
    return sandbox;
}

console.log('Loading JS files...');
const dataVars    = loadFile('data.js');
const driverVars  = loadFile('drivers-info.js');
const assetVars   = loadFile('assets.js');

const output = {
    SEASONS:            dataVars.SEASONS            || {},
    POSITIONS:          dataVars.POSITIONS          || {},
    CAL_DATA:           dataVars.CAL_DATA           || {},
    SPRINTS:            dataVars.SPRINTS            || {},
    RACE_CONSTRUCTORS:  dataVars.RACE_CONSTRUCTORS  || {},
    DRIVERS_INFO:       driverVars.DRIVERS_INFO     || {},
    TEAMS_INFO:         driverVars.TEAMS_INFO       || {},
    FLAGS:              assetVars.FLAGS             || {},
};

const outFile = path.join(OUT_DIR, 'all_data.json');
fs.writeFileSync(outFile, JSON.stringify(output));
console.log(`Done! Output: ${outFile}`);
console.log(`  Seasons:  ${Object.keys(output.SEASONS).length}`);
console.log(`  Drivers:  ${Object.keys(output.DRIVERS_INFO).length}`);
console.log(`  Teams:    ${Object.keys(output.TEAMS_INFO).length}`);
console.log(`  Circuits: ${Object.keys(output.CAL_DATA.circuits || {}).length}`);
