import { SOC_MAPS } from './constants';
import { BatteryChemistry } from './types';

/**
 * Linearly interpolates SOC based on voltage.
 * We ensure the map is sorted by voltage descending (High V -> Low V).
 */
export const getSOCFromVoltage = (cellVoltage: number, chemistry: BatteryChemistry): number => {
  const map = [...SOC_MAPS[chemistry]].sort((a, b) => b.v - a.v);
  
  // Strict boundary checks
  if (cellVoltage >= map[0].v) return 100;
  if (cellVoltage <= map[map.length - 1].v) return 0;

  for (let i = 0; i < map.length - 1; i++) {
    const high = map[i];
    const low = map[i + 1];
    
    if (cellVoltage <= high.v && cellVoltage >= low.v) {
      const rangeV = high.v - low.v;
      if (rangeV === 0) return high.soc;
      const progressV = cellVoltage - low.v;
      const ratio = progressV / rangeV;
      return low.soc + ratio * (high.soc - low.soc);
    }
  }
  return 0;
};

/**
 * Estimates voltage from SOC percentage.
 * We ensure the map is sorted by SOC descending (100% -> 0%).
 */
export const getVoltageFromSOC = (soc: number, chemistry: BatteryChemistry): number => {
  const map = [...SOC_MAPS[chemistry]].sort((a, b) => b.soc - a.soc);
  
  // Strict boundary checks
  if (soc >= 100) return map[0].v;
  if (soc <= 0) return map[map.length - 1].v;

  for (let i = 0; i < map.length - 1; i++) {
    const high = map[i];    // Higher SOC entry (e.g., 90%)
    const low = map[i + 1]; // Lower SOC entry (e.g., 80%)

    if (soc <= high.soc && soc >= low.soc) {
      const rangeSoc = high.soc - low.soc;
      if (rangeSoc === 0) return high.v;
      const progressSoc = soc - low.soc;
      const ratio = progressSoc / rangeSoc;
      // Interpolate between the two voltage points
      return low.v + ratio * (high.v - low.v);
    }
  }
  return map[map.length - 1].v;
};
