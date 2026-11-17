const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetStr = `        - Does the temperature suggest adjusting min/max operating temps?
        
        Provide a professional, concise recommendation on what configuration values the user should change to better match their actual data profile. Format as a bulleted list.`;

const replaceStr = `        - Does the temperature suggest adjusting min/max operating temps?
        - Based on cell voltages (min, max, delta), are there any cell balance issues?
        - What improvements can be made to the charging strategy (e.g. adjust charge rate, float voltage, balancing threshold) given the overall data?
        
        Provide a professional, concise recommendation on what configuration values the user should change, as well as an improved charging strategy and settings to optimize battery health and performance. Format as a bulleted list.`;

code = code.replace(targetStr, replaceStr);

const dataSummaryTarget = `        - Avg Temp: \${historicalDataSummary.avgTemp?.toFixed(1)}°C`;
const dataSummaryReplace = `        - Avg Temp: \${historicalDataSummary.avgTemp?.toFixed(1)}°C
        - Max Cell Delta: \${historicalDataSummary.maxCellDelta !== undefined ? historicalDataSummary.maxCellDelta.toFixed(3) + 'V' : 'N/A'}
        - Min Cell Voltage: \${historicalDataSummary.minCellV !== undefined ? historicalDataSummary.minCellV.toFixed(3) + 'V' : 'N/A'}
        - Max Cell Voltage: \${historicalDataSummary.maxCellV !== undefined ? historicalDataSummary.maxCellV.toFixed(3) + 'V' : 'N/A'}`;

code = code.replace(dataSummaryTarget, dataSummaryReplace);

fs.writeFileSync('server.ts', code);
console.log("Updated prompt to include cell voltages and charging strategy");
