const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

if (!code.includes('CHARGE_SOC_MAPS')) {
  code = code.replace(/import { CHEMISTRY_DEFAULTS, SOC_MAPS } from '\.\/constants';/, "import { CHEMISTRY_DEFAULTS, SOC_MAPS, CHARGE_SOC_MAPS } from './constants';");
  fs.writeFileSync('App.tsx', code);
  console.log("Updated imports");
}
