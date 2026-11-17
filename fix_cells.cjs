const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `          const cellVoltages: number[] = [];
          for (let c = 1; c <= config.seriesCount; c++) {
            const v = getVal(dataRow, [\`cell\${c}\`, \`cell_\${c}\`, \`c\${c}\`, \`c\${c}_v\`, \`cell \${c}\`, \`cell_v_\${c}\`]);
            if (v !== null) cellVoltages.push(v);
          }
          
          if (importedVoltage === null && importedSoc === null) return;

          let st = finalState ? { ...finalState } : { ...state };
          
          st.measuredVoltage = importedVoltage ?? st.measuredVoltage;
          st.bmsVoltage = importedBmsV ?? importedVoltage ?? st.bmsVoltage;
          st.currentAmps = importedCurrent ?? st.currentAmps;
          st.temperatureCelsius = importedTemp ?? st.temperatureCelsius;
          st.dischargeLoadAmps = importedCurrent && importedCurrent < 0 ? Math.abs(importedCurrent) : st.dischargeLoadAmps;
          if (cellVoltages.length > 0) {
            st.cellVoltages = cellVoltages;
          }`;

const replaceStr = `          const extractedCells: (number | null)[] = [];
          let foundAnyCell = false;
          for (let c = 1; c <= config.seriesCount; c++) {
            const regex = new RegExp(\`(?:^|\\\\b)(?:cell|c)[\\\\s_]*0?\${c}(?:\\\\b|[^0-9])\`, 'i');
            const index = headers.findIndex(h => regex.test(h));
            let val = null;
            if (index !== -1 && dataRow[index]) {
              const parsed = parseFloat(dataRow[index]);
              if (!isNaN(parsed)) {
                val = parsed;
                foundAnyCell = true;
              }
            }
            extractedCells.push(val);
          }
          
          if (importedVoltage === null && importedSoc === null) return;

          let st = finalState ? { ...finalState } : { ...state };
          
          st.measuredVoltage = importedVoltage ?? st.measuredVoltage;
          st.bmsVoltage = importedBmsV ?? importedVoltage ?? st.bmsVoltage;
          st.currentAmps = importedCurrent ?? st.currentAmps;
          st.temperatureCelsius = importedTemp ?? st.temperatureCelsius;
          st.dischargeLoadAmps = importedCurrent && importedCurrent < 0 ? Math.abs(importedCurrent) : st.dischargeLoadAmps;
          
          if (foundAnyCell) {
            const validCells = extractedCells.filter(v => v !== null) as number[];
            const avg = validCells.length > 0 ? validCells.reduce((a, b) => a + b, 0) / validCells.length : (st.measuredVoltage / config.seriesCount);
            st.cellVoltages = extractedCells.map(v => v !== null ? v : avg);
          }`;

if (code.includes(targetStr)) {
  fs.writeFileSync('App.tsx', code.replace(targetStr, replaceStr));
  console.log("Updated cellVoltages extraction logic.");
} else {
  console.log("Could not find target string.");
}
