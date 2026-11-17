const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `        // Trigger AI suggestions for config`;
const replaceStr = `        // Calculate Cycle Count from History Throughput
        let newAccumulatedAh = config.accumulatedThroughputAh || 0;
        let newCycleCount = config.cycleCount || 0;
        
        // Ensure newHistory is sorted ascending by time for accurate delta calculation
        const sortedHistory = [...newHistory].sort((a, b) => a.timestamp - b.timestamp);
        for (let i = 1; i < sortedHistory.length; i++) {
          const prev = sortedHistory[i - 1];
          const curr = sortedHistory[i];
          const deltaHours = (curr.timestamp - prev.timestamp) / 3600000;
          if (deltaHours > 0 && deltaHours < 24) {
            // Use average current of the interval or just current
            const avgCurrent = Math.abs(curr.currentAmps); 
            newAccumulatedAh += (avgCurrent * deltaHours);
          }
        }
        
        if (newAccumulatedAh >= config.totalCapacityAh && config.totalCapacityAh > 0) {
          const addedCycles = Math.floor(newAccumulatedAh / config.totalCapacityAh);
          newCycleCount += addedCycles;
          newAccumulatedAh = newAccumulatedAh % config.totalCapacityAh;
        }

        setConfig(c => ({
          ...c,
          cycleCount: newCycleCount,
          accumulatedThroughputAh: newAccumulatedAh
        }));

        // Trigger AI suggestions for config`;

if (code.includes(targetStr)) {
  fs.writeFileSync('App.tsx', code.replace(targetStr, replaceStr));
  console.log("Updated handleFileUpload to process cycle counts.");
} else {
  console.log("Could not find target string.");
}
