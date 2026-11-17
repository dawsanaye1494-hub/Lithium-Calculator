const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const oldHealthLogic = `  const batteryHealthInfo = useMemo(() => {
    const pointsToAnalyze = history.length > 0 ? history : [state];
    
    let totalScore = 0;
    let totalPointsAnalyzed = 0;
    let maxCellDeviation = 0;
    let deviationSum = 0;

    pointsToAnalyze.forEach(point => {
      const currentVoltages = point.cellVoltages || Array(config.seriesCount).fill(point.measuredVoltage / config.seriesCount);
      
      let sumOfDeviations = 0;
      let minVolt = 999;
      let maxVolt = -999;
      
      currentVoltages.forEach(v => {
        const idealCellV = getVoltageFromSOC(point.socPercentage, config.chemistry);
        sumOfDeviations += Math.abs(v - idealCellV);
        if (v < minVolt) minVolt = v;
        if (v > maxVolt) maxVolt = v;
      });
      
      const avgDeviation = sumOfDeviations / currentVoltages.length;
      const spread = maxVolt - minVolt;
      
      deviationSum += avgDeviation;
      if (avgDeviation > maxCellDeviation) {
        maxCellDeviation = avgDeviation;
      }
      
      const devPenalty = avgDeviation * 130; 
      // High-resolution cell imbalance penalty escalates strongly for imbalances above 20mV
      const balancePenalty = Math.max(0, spread - 0.02) * 220;
      const packBmsDiff = Math.abs(point.measuredVoltage - point.bmsVoltage);
      const cellBmsDiff = packBmsDiff / config.seriesCount;
      const mismatchPenalty = cellBmsDiff * 80;

      const temp = point.temperatureCelsius ?? 25;
      let tempPenalty = 0;
      const minTempLimit = config.minOperatingTemp ?? 0;
      const maxTempLimit = config.maxOperatingTemp ?? 45;
      if (temp > maxTempLimit) {
        tempPenalty = (temp - maxTempLimit) * 1.5;
      } else if (temp < minTempLimit) {
        tempPenalty = (minTempLimit - temp) * 1.5;
      }

      const pointScore = Math.max(35, Math.min(100, 100 - devPenalty - balancePenalty - mismatchPenalty - tempPenalty));
      totalScore += pointScore;
      totalPointsAnalyzed++;
    });

    const averageHealth = totalPointsAnalyzed > 0 ? totalScore / totalPointsAnalyzed : 100;
    const roundedHealth = Math.round(averageHealth * 10) / 10;`;

const newHealthLogic = `  const batteryHealthInfo = useMemo(() => {
    const latestPoint = history.length > 0 ? history[0] : state;
    
    // 1. SOH (State of Health)
    const soh = latestPoint.sohPercentage ?? 100;
    const sohScore = Math.min(100, Math.max(0, soh));
    
    // 2. Battery number of cycles
    const cycles = config.cycleCount || 0;
    // Assume 3000 cycles is 0 score for cycle component
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
    
    // Cell diff score: 100 if <= 50mV, drops to 0 at 250mV
    let cellDiffScore = 100;
    if (maxCellDeviation > 0.050) {
      cellDiffScore = Math.max(0, 100 - ((maxCellDeviation - 0.050) * 500));
    } else if (currentVoltages.length === 0) {
      cellDiffScore = 100; // Default if no cells
    }
    
    // Composite Health Score based strictly on requested parameters
    const averageHealth = (sohScore + capacityScore + cycleScore + cellDiffScore) / 4;
    const roundedHealth = Math.round(averageHealth * 10) / 10;
    
    let deviationSum = maxCellDeviation;
    let totalPointsAnalyzed = 1;`;

if (code.includes('const pointsToAnalyze = history.length > 0 ? history : [state];')) {
  // Regex to replace from `const batteryHealthInfo = useMemo(() => {` to `const roundedHealth = Math.round(averageHealth * 10) / 10;`
  code = code.replace(oldHealthLogic, newHealthLogic);
  fs.writeFileSync('App.tsx', code);
  console.log('Replaced health logic');
} else {
  console.log('Could not find logic');
}
