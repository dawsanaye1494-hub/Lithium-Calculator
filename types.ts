
  export enum BatteryChemistry {
    LI_ION = 'Li-ion (NMC/NCA)',
    LIFEPO4 = 'LiFePO4 (LFP)',
    LIPO = 'Li-Polymer'
  }

  export type CapacityUnit = 'Ah' | 'mAh';
  export type EnergyUnit = 'Wh' | 'kWh';

  export interface BatteryConfig {
    chemistry: BatteryChemistry;
    seriesCount: number;
    totalCapacityAh: number;
    nominalCellVoltage: number;
    maxCellVoltage: number;
    minCellVoltage: number;
    chargeRateC: number; 
    cutoffSoc: number; // New field for safety cutoff
    dischargeEfficiency?: number; // Configurable discharge efficiency percentage
    minOperatingTemp?: number; // Minimum operating temperature in Celsius
    maxOperatingTemp?: number; // Maximum operating temperature in Celsius
    cycleCount?: number;
    accumulatedThroughputAh?: number;
  }

  export interface BatteryState {
    measuredVoltage: number;
    bmsVoltage: number;
    remainingCapacityAh: number;
    socPercentage: number;
    currentAmps: number;
    temperatureCelsius?: number;
    dischargeLoadAmps?: number;
    cellVoltages?: number[]; // Cell-level voltages (length equals seriesCount)
    sohPercentage?: number;
    fullChargeCapacityAh?: number;
  }

  export interface HistoryPoint extends BatteryState {
    timestamp: number;
    id: string;
  }

  export interface CalculationResult {
    estimatedSOC: number;
    totalEnergyWh: number;
    remainingEnergyWh: number;
    voltagePerCell: number;
    estimatedRemainingAh: number;
  }
