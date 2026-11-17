const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `  const chartData = useMemo(() => {
    return SOC_MAPS[config.chemistry].map(point => ({
      soc: point.soc,
      voltage: parseFloat((point.v * config.seriesCount).toFixed(2)),
      cellVoltage: parseFloat(point.v.toFixed(3))
    })).sort((a, b) => a.soc - b.soc);
  }, [config.chemistry, config.seriesCount]);`;

const replaceStr = `  const chartData = useMemo(() => {
    return SOC_MAPS[config.chemistry].map(point => {
      const chargePoint = CHARGE_SOC_MAPS[config.chemistry].find(p => p.soc === point.soc) || point;
      return {
        soc: point.soc,
        dischargeVoltage: parseFloat((point.v * config.seriesCount).toFixed(2)),
        dischargeCellVoltage: parseFloat(point.v.toFixed(3)),
        chargeVoltage: parseFloat((chargePoint.v * config.seriesCount).toFixed(2)),
        chargeCellVoltage: parseFloat(chargePoint.v.toFixed(3))
      };
    }).sort((a, b) => a.soc - b.soc);
  }, [config.chemistry, config.seriesCount]);`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('App.tsx', code);
  console.log("Updated chartData");
} else {
  console.log("chartData not found");
}
