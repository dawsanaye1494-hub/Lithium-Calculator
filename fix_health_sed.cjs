const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// Find start and end indices of the function
const startIdx = code.indexOf('  const batteryHealthInfo = useMemo(() => {');
const endIdx = code.indexOf('    return {', startIdx);

if (startIdx !== -1 && endIdx !== -1) {
  const newHealthLogic = `  const batteryHealthInfo = useMemo(() => {
    const latestPoint = history.length > 0 ? history[0] : state;
    
    // 1. SOH (State of Health)
    const soh = latestPoint.sohPercentage ?? 100;
    const sohScore = Math.min(100, Math.max(0, soh));
    
    // 2. Battery number of cycles
    const cycles = config.cycleCount || 0;
    const cycleScore = Math.max(0, 100 - (cycles / 3000) * 100);
    
    // 3. Full charge capacity vs Design capacity
    const designCapacity = config.totalCapacityAh || 100;
    const fullChargeCapacity = latestPoint.fullChargeCapacityAh ?? designCapacity;
    const capacityScore = Math.min(100, Math.max(0, (fullChargeCapacity / designCapacity) * 100));
    
    // 4. Maximum pressure difference of battery (Cell voltage difference)
    let maxCellDeviation = 0;
    const currentVoltages = latestPoint.cellVoltages || [];
    if (currentVoltages.length > 0) {
      const maxVolt = Math.max(...currentVoltages);
      const minVolt = Math.min(...currentVoltages);
      maxCellDeviation = maxVolt - minVolt;
    }
    
    let cellDiffScore = 100;
    if (maxCellDeviation > 0.050) {
      cellDiffScore = Math.max(0, 100 - ((maxCellDeviation - 0.050) * 500));
    } else if (currentVoltages.length === 0) {
      cellDiffScore = 100;
    }
    
    const averageHealth = (sohScore + capacityScore + cycleScore + cellDiffScore) / 4;
    const roundedHealth = Math.round(averageHealth * 10) / 10;
    
    let statusText = 'Excellent';
    let statusColor = 'text-emerald-400';
    let strokeColor = 'stroke-emerald-400';
    let description = 'Operating at peak nominal curve efficiency.';

    if (roundedHealth < 75) {
      statusText = 'Service Required';
      statusColor = 'text-red-400';
      strokeColor = 'stroke-red-500';
      description = 'Severe capacity fade, high cycle wear, or critical cell imbalance.';
    } else if (roundedHealth < 85) {
      statusText = 'Fair / Wear';
      statusColor = 'text-amber-400';
      strokeColor = 'stroke-amber-400';
      description = 'Moderate wear detected. Capacity loss or noticeable cell imbalance.';
    } else if (roundedHealth < 95) {
      statusText = 'Good';
      statusColor = 'text-blue-400';
      strokeColor = 'stroke-blue-400';
      description = 'Normal operating wear based on cycles and cell voltage alignment.';
    }

`;
  code = code.substring(0, startIdx) + newHealthLogic + code.substring(endIdx);
  fs.writeFileSync('App.tsx', code);
  console.log('Replaced via index');
} else {
  console.log('Not found');
}
