const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `const localCells = state.cellVoltages || Array(config.seriesCount).fill(state.measuredVoltage / config.seriesCount);`;
const replaceStr = `const localCells = (state.cellVoltages && state.cellVoltages.length > 0)
                          ? Array.from({ length: config.seriesCount }, (_, i) => state.cellVoltages![i] ?? (state.measuredVoltage / config.seriesCount))
                          : Array(config.seriesCount).fill(state.measuredVoltage / config.seriesCount);`;

if (code.includes(targetStr)) {
  fs.writeFileSync('App.tsx', code.replace(targetStr, replaceStr));
  console.log("Updated localCells to dynamically size based on config.seriesCount.");
} else {
  console.log("Target not found.");
}
