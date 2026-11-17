
import { BatteryChemistry } from './types';

// Voltage to SOC maps (Cell Level)
// These represent typical discharge curves at low current (0.1C - 0.2C)
export const SOC_MAPS: Record<BatteryChemistry, { v: number; soc: number }[]> = {
  [BatteryChemistry.LI_ION]: [
    { v: 4.20, soc: 100 },
    { v: 4.15, soc: 95 },
    { v: 4.10, soc: 90 },
    { v: 4.05, soc: 85 },
    { v: 4.00, soc: 80 },
    { v: 3.95, soc: 75 },
    { v: 3.90, soc: 70 },
    { v: 3.85, soc: 60 },
    { v: 3.80, soc: 50 },
    { v: 3.75, soc: 40 },
    { v: 3.70, soc: 30 },
    { v: 3.65, soc: 20 },
    { v: 3.60, soc: 15 },
    { v: 3.55, soc: 10 },
    { v: 3.50, soc: 5 },
    { v: 3.00, soc: 0 }
  ],
  [BatteryChemistry.LIFEPO4]: [
    { v: 3.60, soc: 100 },
    { v: 3.40, soc: 99 },
    { v: 3.35, soc: 90 },
    { v: 3.32, soc: 80 },
    { v: 3.30, soc: 70 },
    { v: 3.28, soc: 60 },
    { v: 3.26, soc: 50 },
    { v: 3.24, soc: 40 },
    { v: 3.22, soc: 30 },
    { v: 3.20, soc: 20 },
    { v: 3.15, soc: 15 },
    { v: 3.10, soc: 10 },
    { v: 3.05, soc: 5 },
    { v: 2.50, soc: 0 }
  ],
  [BatteryChemistry.LIPO]: [
    { v: 4.23, soc: 100 },
    { v: 4.18, soc: 95 },
    { v: 4.11, soc: 90 },
    { v: 4.05, soc: 85 },
    { v: 3.98, soc: 80 },
    { v: 3.93, soc: 75 },
    { v: 3.88, soc: 70 },
    { v: 3.83, soc: 60 },
    { v: 3.79, soc: 50 },
    { v: 3.75, soc: 40 },
    { v: 3.72, soc: 30 },
    { v: 3.68, soc: 20 },
    { v: 3.63, soc: 10 },
    { v: 3.50, soc: 5 },
    { v: 3.27, soc: 0 }
  ]
};

export const CHEMISTRY_DEFAULTS: Record<BatteryChemistry, { nominal: number; max: number; min: number }> = {
  [BatteryChemistry.LI_ION]: { nominal: 3.7, max: 4.2, min: 3.0 },
  [BatteryChemistry.LIFEPO4]: { nominal: 3.2, max: 3.6, min: 2.5 },
  [BatteryChemistry.LIPO]: { nominal: 3.7, max: 4.23, min: 3.2 }
};

export const CHARGE_SOC_MAPS: Record<BatteryChemistry, { v: number; soc: number }[]> = {
  [BatteryChemistry.LI_ION]: [
    { v: 4.20, soc: 100 },
    { v: 4.18, soc: 95 },
    { v: 4.15, soc: 90 },
    { v: 4.10, soc: 85 },
    { v: 4.06, soc: 80 },
    { v: 4.02, soc: 75 },
    { v: 3.98, soc: 70 },
    { v: 3.93, soc: 60 },
    { v: 3.88, soc: 50 },
    { v: 3.84, soc: 40 },
    { v: 3.79, soc: 30 },
    { v: 3.75, soc: 20 },
    { v: 3.70, soc: 15 },
    { v: 3.66, soc: 10 },
    { v: 3.60, soc: 5 },
    { v: 3.00, soc: 0 }
  ],
  [BatteryChemistry.LIFEPO4]: [
    { v: 3.65, soc: 100 },
    { v: 3.45, soc: 99 },
    { v: 3.40, soc: 90 },
    { v: 3.38, soc: 80 },
    { v: 3.35, soc: 70 },
    { v: 3.33, soc: 60 },
    { v: 3.32, soc: 50 },
    { v: 3.31, soc: 40 },
    { v: 3.30, soc: 30 },
    { v: 3.28, soc: 20 },
    { v: 3.25, soc: 15 },
    { v: 3.22, soc: 10 },
    { v: 3.15, soc: 5 },
    { v: 2.50, soc: 0 }
  ],
  [BatteryChemistry.LIPO]: [
    { v: 4.23, soc: 100 },
    { v: 4.20, soc: 95 },
    { v: 4.16, soc: 90 },
    { v: 4.10, soc: 85 },
    { v: 4.05, soc: 80 },
    { v: 4.00, soc: 75 },
    { v: 3.95, soc: 70 },
    { v: 3.90, soc: 60 },
    { v: 3.86, soc: 50 },
    { v: 3.83, soc: 40 },
    { v: 3.79, soc: 30 },
    { v: 3.75, soc: 20 },
    { v: 3.71, soc: 10 },
    { v: 3.58, soc: 5 },
    { v: 3.27, soc: 0 }
  ]
};
