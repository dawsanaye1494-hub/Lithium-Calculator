const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `  const serialReaderRef = useRef<any>(null);`;
const replaceStr = `  
  // Real-time Energy Throughput Tracking
  useEffect(() => {
    let lastTime = Date.now();
    const interval = setInterval(() => {
      const now = Date.now();
      const deltaHours = (now - lastTime) / 3600000;
      lastTime = now;
      
      if (state.currentAmps !== 0) {
        setConfig(prevConfig => {
          let newAccumulatedAh = (prevConfig.accumulatedThroughputAh || 0) + (Math.abs(state.currentAmps) * deltaHours);
          let newCycleCount = prevConfig.cycleCount || 0;
          
          if (prevConfig.totalCapacityAh > 0 && newAccumulatedAh >= prevConfig.totalCapacityAh) {
            const addedCycles = Math.floor(newAccumulatedAh / prevConfig.totalCapacityAh);
            newCycleCount += addedCycles;
            newAccumulatedAh = newAccumulatedAh % prevConfig.totalCapacityAh;
          }
          
          if (newAccumulatedAh !== prevConfig.accumulatedThroughputAh || newCycleCount !== prevConfig.cycleCount) {
             return { ...prevConfig, cycleCount: newCycleCount, accumulatedThroughputAh: newAccumulatedAh };
          }
          return prevConfig;
        });
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [state.currentAmps]);

  const serialReaderRef = useRef<any>(null);`;

if (code.includes(targetStr)) {
  fs.writeFileSync('App.tsx', code.replace(targetStr, replaceStr));
  console.log("Added real-time cycle tracking effect.");
} else {
  console.log("Could not find target string.");
}
