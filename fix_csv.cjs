const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `          const importedBmsV = getVal(dataRow, ['bms_v', 'internal_v', 'cell_sum', 'bms_voltage']);
          const importedTemp = getVal(dataRow, ['temp', 'cel', 't_pack', 't_ambient', 'temperature']);`;

const replacement = `          const importedBmsV = getVal(dataRow, ['bms_v', 'internal_v', 'cell_sum', 'bms_voltage']);
          const importedTemp = getVal(dataRow, ['temp', 'cel', 't_pack', 't_ambient', 'temperature']);
          const importedSoh = getVal(dataRow, ['soh', 'state_of_health', 'health_%', 'health_percent']);
          const importedFcc = getVal(dataRow, ['fcc', 'full_charge_capacity', 'design_cap', 'total_cap', 'cap_ah']);`;

code = code.replace(targetStr, replacement);

const stateCreationStr = `          const newState: BatteryState = {
            measuredVoltage: currentV,
            bmsVoltage: bmsV,
            socPercentage: currentSoc,
            remainingCapacityAh: currentRemAh,
            currentAmps: currentI,
            temperatureCelsius: currentT,
            cellVoltages: finalCells
          };`;
const replacementState = `          const newState: BatteryState = {
            measuredVoltage: currentV,
            bmsVoltage: bmsV,
            socPercentage: currentSoc,
            remainingCapacityAh: currentRemAh,
            currentAmps: currentI,
            temperatureCelsius: currentT,
            cellVoltages: finalCells,
            ...(importedSoh !== null && { sohPercentage: importedSoh }),
            ...(importedFcc !== null && { fullChargeCapacityAh: importedFcc })
          };`;

code = code.replace(stateCreationStr, replacementState);
fs.writeFileSync('App.tsx', code);
