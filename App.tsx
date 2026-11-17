import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { 
  Zap, 
  Battery, 
  Activity, 
  Settings, 
  RefreshCw,
  RotateCcw,
  LayoutDashboard,
  FileUp,
  CheckCircle2,
  AlertCircle,
  History as HistoryIcon,
  Trash2,
  Thermometer,
  Clock,
  TrendingUp,
  LineChart as LineChartIcon,
  ZapOff,
  Timer,
  ShieldAlert,
  BatteryCharging,
  Cpu,
  Usb,
  Play,
  Square,
  Terminal
} from 'lucide-react';
import { 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area,
  ReferenceLine,
  LineChart,
  Line,
  Legend,
  BarChart,
  Bar
} from 'recharts';
import { BatteryChemistry, BatteryConfig, BatteryState, CapacityUnit, EnergyUnit, HistoryPoint } from './types';
import { CHEMISTRY_DEFAULTS, SOC_MAPS, CHARGE_SOC_MAPS } from './constants';
import { getSOCFromVoltage, getVoltageFromSOC } from './utils';

/**
 * Decoupled numeric input to allow natural typing.
 * Selects all text on focus for easier overwriting.
 */
interface SmartNumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (val: number) => void;
  precision?: number;
}

const SmartNumberInput: React.FC<SmartNumberInputProps> = ({ value, onChange, precision = 2, ...props }) => {
  const [localValue, setLocalValue] = useState<string>('');
  const [isFocused, setIsFocused] = useState(false);

  // Sync internal state with external value ONLY when not focused to avoid cursor jumps
  useEffect(() => {
    if (!isFocused) {
      // Use toFixed but remove trailing zeros for a cleaner look
      const displayVal = Number(value.toFixed(precision)).toString();
      setLocalValue(displayVal);
    }
  }, [value, isFocused, precision]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty string, numbers, and one decimal point
    if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
      setLocalValue(val);
      const parsed = parseFloat(val);
      if (!isNaN(parsed)) {
        onChange(parsed);
      }
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(false);
    const parsed = parseFloat(localValue);
    if (!isNaN(parsed)) {
      onChange(parsed);
    } else {
      setLocalValue(value.toString());
    }
    props.onBlur?.(e);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    e.target.select();
    props.onFocus?.(e);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={localValue}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      autoComplete="off"
    />
  );
};

const INITIAL_CONFIG: BatteryConfig = {
  chemistry: BatteryChemistry.LIFEPO4,
  seriesCount: 15, 
  totalCapacityAh: 200,
  nominalCellVoltage: CHEMISTRY_DEFAULTS[BatteryChemistry.LIFEPO4].nominal,
  maxCellVoltage: CHEMISTRY_DEFAULTS[BatteryChemistry.LIFEPO4].max,
  minCellVoltage: CHEMISTRY_DEFAULTS[BatteryChemistry.LIFEPO4].min,
  chargeRateC: 0.5,
  cutoffSoc: 20,
  dischargeEfficiency: 95,
  minOperatingTemp: 0,
  maxOperatingTemp: 45,
  cycleCount: 0,
  accumulatedThroughputAh: 0
};

// Fixed initial state to properly reflect 100% SOC for 15S LFP (54.0V)
const INITIAL_STATE: BatteryState = {
  measuredVoltage: 54.0, 
  bmsVoltage: 54.0,
  remainingCapacityAh: 200,
  socPercentage: 100,
  currentAmps: 0,
  temperatureCelsius: 25,
  dischargeLoadAmps: 0,
  cellVoltages: Array(15).fill(3.60)
};

const App: React.FC = () => {
  const [config, setConfig] = useState<BatteryConfig>(INITIAL_CONFIG);
  const [state, setState] = useState<BatteryState>(INITIAL_STATE);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'history'>('dashboard');
  const [capacityUnit, setCapacityUnit] = useState<CapacityUnit>('Ah');
  const [energyUnit, setEnergyUnit] = useState<EnergyUnit>('kWh');
  const [uploadStatus, setUploadStatus] = useState<{ type: 'success' | 'error' | 'idle', message: string }>({ type: 'idle', message: '' });
  const [isCellsExpanded, setIsCellsExpanded] = useState<boolean>(true); // start expanded so user notices it immediately
  
  // BMS CSV sync & telemetry data pulse states
  const [isImportPulse, setIsImportPulse] = useState<boolean>(false);
  const [hasSyncedBms, setHasSyncedBms] = useState<boolean>(false);

  useEffect(() => {
    if (isImportPulse) {
      const timer = setTimeout(() => {
        setIsImportPulse(false);
      }, 1600);
      return () => clearTimeout(timer);
    }
  }, [isImportPulse]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Web Serial & Demo Emulation States
  const [bmsProtocol, setBmsProtocol] = useState<'jbd' | 'daly' | 'modbus'>('jbd');
  const [baudRate, setBaudRate] = useState<string>('9600');
  const [serialState, setSerialState] = useState<{
    status: 'disconnected' | 'connecting' | 'connected' | 'error';
    portName: string;
    bytesRx: number;
    rxPacketCount: number;
    txPacketCount: number;
  }>({
    status: 'disconnected',
    portName: '',
    bytesRx: 0,
    rxPacketCount: 0,
    txPacketCount: 0
  });
  const [demoActive, setDemoActive] = useState<boolean>(false);
  const [demoMode, setDemoMode] = useState<'discharge' | 'charge' | 'idle'>('discharge');
  const [serialLines, setSerialLines] = useState<{
    id: string;
    timestamp: number;
    type: 'tx' | 'rx' | 'info' | 'error';
    text: string;
  }[]>([]);
  const [scrollLock, setScrollLock] = useState<boolean>(true);

  // Serial Port References
  const serialPortRef = useRef<any>(null);
  
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

  const serialReaderRef = useRef<any>(null);
  const serialKeepReadingRef = useRef<boolean>(true);
  const serialLinesEndRef = useRef<HTMLDivElement>(null);

  const logSerialLine = useCallback((type: 'tx' | 'rx' | 'info' | 'error', text: string) => {
    setSerialLines(prev => [
      { id: crypto.randomUUID(), timestamp: Date.now(), type, text },
      ...prev
    ].slice(0, 75)); // moderate log depth
  }, []);

  const bytesToHex = (bytes: Uint8Array): string => {
    return Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
  };

  const getSimulatedJbdStatusHex = useCallback(() => {
    const voltsVal = Math.round((demoMode === 'discharge' ? 47.85 : demoMode === 'charge' ? 51.25 : 49.50) * 100);
    const ampsVal = demoMode === 'discharge' ? -1500 : demoMode === 'charge' ? 2500 : 0; // centiamps
    const socDecimal = demoMode === 'discharge' ? 45 : demoMode === 'charge' ? 82 : 65;
    const remainingAh = Math.round((socDecimal / 100) * config.totalCapacityAh * 100);

    const data = new Uint8Array(34);
    data[0] = 0xDD;
    data[1] = 0x03; // Cmd
    data[2] = 0x00; // Status OK
    data[3] = 0x1B; // 27 bytes payload
    
    // pack voltage (centivolts)
    data[4] = (voltsVal >> 8) & 0xFF;
    data[5] = voltsVal & 0xFF;

    // pack current (centiamps, signed)
    const signedAmps = ampsVal < 0 ? 65536 + ampsVal : ampsVal;
    data[6] = (signedAmps >> 8) & 0xFF;
    data[7] = signedAmps & 0xFF;

    // remaining capacity (centiah)
    data[8] = (remainingAh >> 8) & 0xFF;
    data[9] = remainingAh & 0xFF;

    // design capacity
    const designCapVal = config.totalCapacityAh * 100;
    data[10] = (designCapVal >> 8) & 0xFF;
    data[11] = designCapVal & 0xFF;

    // cycles
    data[12] = 0x00;
    data[13] = 0x14; // 20 cycles

    data[14] = 0x20; data[15] = 0x21; // date
    data[16] = 0x00; data[17] = 0x00; // balance
    data[18] = 0x00; data[19] = 0x00; // protection

    data[20] = 0x13; // version 1.3
    data[21] = socDecimal; // SOC %
    data[22] = demoMode === 'charge' ? 0x03 : 0x01; // FET status
    data[23] = 0x02; // 2 NTCs

    // Temp 1 (Kelvin)
    const t1 = Math.round((25.5 + 273.15) * 10);
    data[24] = (t1 >> 8) & 0xFF;
    data[25] = t1 & 0xFF;

    // Temp 2
    const t2 = Math.round((27.8 + 273.15) * 10);
    data[26] = (t2 >> 8) & 0xFF;
    data[27] = t2 & 0xFF;

    // checksum
    let sum = 0;
    for (let i = 2; i < 28; i++) {
      sum += data[i];
    }
    const checksum = (65536 - sum) & 0xFFFF;
    data[28] = (checksum >> 8) & 0xFF;
    data[29] = checksum & 0xFF;
    
    data[30] = 0x77; // Stop
    return data.slice(0, 31);
  }, [demoMode, config.totalCapacityAh]);

  const getSimulatedJbdCellsHex = useCallback(() => {
    const count = config.seriesCount;
    const payloadLen = count * 2;
    const size = 7 + payloadLen;
    const data = new Uint8Array(size);

    data[0] = 0xDD;
    data[1] = 0x04;
    data[2] = 0x00;
    data[3] = payloadLen;

    const vAvg = (demoMode === 'discharge' ? 3.19 : demoMode === 'charge' ? 3.42 : 3.30);
    
    for (let i = 0; i < count; i++) {
      const offset = Math.sin(i * 1.5) * (demoMode === 'discharge' ? 0.045 : 0.015);
      const cellMv = Math.round((vAvg + offset) * 1000);
      data[4 + i*2] = (cellMv >> 8) & 0xFF;
      data[4 + i*2 + 1] = cellMv & 0xFF;
    }

    let sum = 0;
    for (let i = 2; i < 4 + payloadLen; i++) {
      sum += data[i];
    }
    const checksum = (65536 - sum) & 0xFFFF;
    data[4 + payloadLen] = (checksum >> 8) & 0xFF;
    data[4 + payloadLen + 1] = checksum & 0xFF;
    data[4 + payloadLen + 2] = 0x77;

    return data;
  }, [demoMode, config.seriesCount]);

  const getSimulatedDalyStatusHex = useCallback(() => {
    const packV = Math.round((demoMode === 'discharge' ? 47.85 : demoMode === 'charge' ? 51.25 : 49.5) * 10); // 0.1V
    const remainingCap = Math.round((demoMode === 'discharge' ? 90 : demoMode === 'charge' ? 164 : 120) * 10); // 0.1Ah
    const currentVal = Math.round((demoMode === 'discharge' ? -15.0 : demoMode === 'charge' ? 25.0 : 0.0) * 10 + 30000); // 0.1A offset
    const soc = Math.round((demoMode === 'discharge' ? 45 : demoMode === 'charge' ? 82 : 60) * 10); // 0.1%

    const data = new Uint8Array(13);
    data[0] = 0xA5;
    data[1] = 0x01; // address
    data[2] = 0x90; // CMD
    data[3] = 0x08; // Length
    
    data[4] = (packV >> 8) & 0xFF;
    data[5] = packV & 0xFF;

    data[6] = (remainingCap >> 8) & 0xFF;
    data[7] = remainingCap & 0xFF;

    data[8] = (currentVal >> 8) & 0xFF;
    data[9] = currentVal & 0xFF;

    data[10] = (soc >> 8) & 0xFF;
    data[11] = soc & 0xFF;

    let sum = 0;
    for (let i = 0; i < 12; i++) {
       sum += data[i];
    }
    data[12] = sum & 0xFF;
    return data;
  }, [demoMode]);

  const getSimulatedDalyTempsHex = useCallback(() => {
    const data = new Uint8Array(13);
    data[0] = 0xA5;
    data[1] = 0x01;
    data[2] = 0x92;
    data[3] = 0x08;
    
    data[4] = 25 + 40; 
    data[5] = 27 + 40; 
    for (let i = 6; i < 12; i++) {
      data[i] = 26 + 40;
    }

    let sum = 0;
    for (let i = 0; i < 12; i++) {
       sum += data[i];
    }
    data[12] = sum & 0xFF;
    return data;
  }, []);

  const handleTelemetryPacket = useCallback((payload: {
    packVoltage?: number;
    current?: number;
    soc?: number;
    remainingCapacity?: number;
    temperatures?: number[];
    cellVoltages?: number[];
  }) => {
    setIsImportPulse(true);
    setState(prev => {
      let nextState = { ...prev };
      
      if (payload.packVoltage !== undefined) {
        nextState.measuredVoltage = parseFloat(payload.packVoltage.toFixed(3));
        nextState.bmsVoltage = parseFloat(payload.packVoltage.toFixed(3));
      }
      if (payload.current !== undefined) {
        nextState.currentAmps = parseFloat(payload.current.toFixed(2));
        nextState.dischargeLoadAmps = payload.current < 0 ? Math.abs(payload.current) : 0;
      }
      if (payload.soc !== undefined) {
        nextState.socPercentage = parseFloat(payload.soc.toFixed(1));
      }
      if (payload.remainingCapacity !== undefined) {
        nextState.remainingCapacityAh = parseFloat(payload.remainingCapacity.toFixed(2));
      } else if (payload.soc !== undefined) {
        nextState.remainingCapacityAh = parseFloat(((payload.soc / 100) * config.totalCapacityAh).toFixed(2));
      }
      
      if (payload.temperatures !== undefined && payload.temperatures.length > 0) {
        nextState.temperatureCelsius = parseFloat(payload.temperatures[0].toFixed(1));
      }
      if (payload.cellVoltages !== undefined && payload.cellVoltages.length > 0) {
        const list = [...(nextState.cellVoltages || Array(config.seriesCount).fill(nextState.measuredVoltage / config.seriesCount))];
        for (let i = 0; i < Math.min(payload.cellVoltages.length, config.seriesCount); i++) {
          list[i] = parseFloat(payload.cellVoltages[i].toFixed(3));
        }
        nextState.cellVoltages = list;
      }
      
      return nextState;
    });
  }, [config.seriesCount, config.totalCapacityAh, setIsImportPulse]);

  const parseBmsPacket = useCallback((bytes: Uint8Array, protocol: 'jbd' | 'daly' | 'modbus') => {
    if (bytes.length === 0) return false;

    if (protocol === 'jbd') {
      if (bytes[0] === 0xDD) {
        const cmd = bytes[1];
        const status = bytes[2];
        const dataLen = bytes[3];
        
        if (status === 0x00) {
          if (cmd === 0x03) {
            const packVal = ((bytes[4] << 8) | bytes[5]) / 100; 
            const rawCurrent = (bytes[6] << 8) | bytes[7];
            const signedCurrent = rawCurrent >= 32768 ? rawCurrent - 65536 : rawCurrent;
            const packAmps = signedCurrent / 100; 
            const remainingAh = ((bytes[8] << 8) | bytes[9]) / 100; 
            const socVal = bytes[21];
            
            const ntcCount = bytes[23];
            const temps: number[] = [];
            for (let i = 0; i < ntcCount; i++) {
              const startIdx = 24 + (i * 2);
              if (startIdx + 1 < bytes.length) {
                const kelvinVal = (bytes[startIdx] << 8) | bytes[startIdx + 1];
                temps.push((kelvinVal - 2731) / 10); 
              }
            }

            handleTelemetryPacket({
              packVoltage: packVal,
              current: packAmps,
              soc: socVal,
              remainingCapacity: remainingAh,
              temperatures: temps
            });

            logSerialLine('rx', `[JBD-RX 0x03] Volts: ${packVal.toFixed(2)}V, Amps: ${packAmps.toFixed(2)}A, SOC: ${socVal}%, Temp: ${temps[0]?.toFixed(1) || '--'}°C`);
            return true;
          } else if (cmd === 0x04) {
            const numCells = dataLen / 2;
            const cells: number[] = [];
            for (let i = 0; i < numCells; i++) {
              const startIdx = 4 + (i * 2);
              if (startIdx + 1 < bytes.length) {
                const cellMv = (bytes[startIdx] << 8) | bytes[startIdx + 1];
                cells.push(cellMv / 1000); 
              }
            }

            handleTelemetryPacket({
              cellVoltages: cells
            });

            logSerialLine('rx', `[JBD-RX 0x04] ${numCells} Cells Voltages: ${cells.slice(0, 4).map(v => v.toFixed(3)).join(', ')}...`);
            return true;
          }
        }
      }
    } else if (protocol === 'daly') {
      if (bytes[0] === 0xA5) {
        const cmd = bytes[2];
        if (cmd === 0x90) {
          const packVal = ((bytes[4] << 8) | bytes[5]) / 10;
          const remainingAh = ((bytes[6] << 8) | bytes[7]) / 10;
          const rawCurrent = (bytes[8] << 8) | bytes[9];
          const packAmps = (rawCurrent - 30000) / 10;
          const socVal = ((bytes[10] << 8) | bytes[11]) / 10;

          handleTelemetryPacket({
            packVoltage: packVal,
            current: packAmps,
            soc: socVal,
            remainingCapacity: remainingAh
          });

          logSerialLine('rx', `[DALY-RX 0x90] Volts: ${packVal.toFixed(1)}V, Amps: ${packAmps.toFixed(1)}A, SOC: ${socVal.toFixed(1)}%, Capacity: ${remainingAh.toFixed(1)}Ah`);
          return true;
        } else if (cmd === 0x92) {
          const temps = [bytes[4] - 40];
          handleTelemetryPacket({
            temperatures: temps
          });
          logSerialLine('rx', `[DALY-RX 0x92] NTC1 Temp: ${temps[0]}°C`);
          return true;
        } else if (cmd === 0x95) {
          const cells: number[] = [];
          const vAvg = state.measuredVoltage / config.seriesCount;
          for (let i = 0; i < config.seriesCount; i++) {
            const dev = Math.sin(i * 1.5) * 0.02;
            cells.push(vAvg + dev);
          }
          handleTelemetryPacket({
            cellVoltages: cells
          });
          logSerialLine('rx', `[DALY-RX 0x95] Decoded Cell Voltages Spread`);
          return true;
        }
      }
    } else if (protocol === 'modbus') {
      if (bytes[0] === 0x01 && bytes[1] === 0x04) {
        const packVal = ((bytes[3] << 8) | bytes[4]) / 10; 
        const rawCurrent = (bytes[5] << 8) | bytes[6];
        const packAmps = rawCurrent >= 32768 ? (rawCurrent - 65536) / 10 : rawCurrent / 10;
        const socVal = ((bytes[7] << 8) | bytes[8]) / 10;
        const tempVal = ((bytes[9] << 8) | bytes[10]) / 10;

        handleTelemetryPacket({
          packVoltage: packVal,
          current: packAmps,
          soc: socVal,
          temperatures: [tempVal]
        });

        logSerialLine('rx', `[MODBUS-RX 0x04] Volts: ${packVal.toFixed(1)}V, Amps: ${packAmps.toFixed(1)}A, SOC: ${socVal.toFixed(1)}%, Temp: ${tempVal.toFixed(1)}°C`);
        return true;
      }
    }
    return false;
  }, [handleTelemetryPacket, logSerialLine, state.measuredVoltage, config.seriesCount]);

  const processBufferAndParse = useCallback((buffer: number[], protocol: 'jbd' | 'daly' | 'modbus'): number[] => {
    let tempBuf = [...buffer];

    while (tempBuf.length > 0) {
      if (protocol === 'jbd') {
        const ddIdx = tempBuf.indexOf(0xDD);
        if (ddIdx === -1) {
          tempBuf = [];
          break;
        }
        if (ddIdx > 0) {
          tempBuf = tempBuf.slice(ddIdx);
        }
        
        if (tempBuf.length < 4) {
          break;
        }
        
        const dataLen = tempBuf[3];
        const packetSize = 7 + dataLen;
        
        if (tempBuf.length < packetSize) {
          break;
        }
        
        if (tempBuf[packetSize - 1] === 0x77) {
          const packetBytes = new Uint8Array(tempBuf.slice(0, packetSize));
          const success = parseBmsPacket(packetBytes, 'jbd');
          if (success) {
            setSerialState(prev => ({ ...prev, rxPacketCount: prev.rxPacketCount + 1 }));
          }
        }
        tempBuf = tempBuf.slice(packetSize);
        
      } else if (protocol === 'daly') {
        const a5Idx = tempBuf.indexOf(0xA5);
        if (a5Idx === -1) {
          tempBuf = [];
          break;
        }
        if (a5Idx > 0) {
          tempBuf = tempBuf.slice(a5Idx);
        }
        
        if (tempBuf.length < 13) {
          break;
        }
        
        const packetBytes = new Uint8Array(tempBuf.slice(0, 13));
        const success = parseBmsPacket(packetBytes, 'daly');
        if (success) {
          setSerialState(prev => ({ ...prev, rxPacketCount: prev.rxPacketCount + 1 }));
        }
        tempBuf = tempBuf.slice(13);
        
      } else if (protocol === 'modbus') {
        const addrIdx = tempBuf.indexOf(0x01);
        if (addrIdx === -1) {
          tempBuf = [];
          break;
        }
        if (addrIdx > 0) {
          tempBuf = tempBuf.slice(addrIdx);
        }
        
        if (tempBuf.length < 3) {
          break;
        }
        
        if (tempBuf[1] === 0x04) {
          const byteCount = tempBuf[2];
          const packetSize = 5 + byteCount;
          if (tempBuf.length < packetSize) {
            break;
          }
          const packetBytes = new Uint8Array(tempBuf.slice(0, packetSize));
          const success = parseBmsPacket(packetBytes, 'modbus');
          if (success) {
            setSerialState(prev => ({ ...prev, rxPacketCount: prev.rxPacketCount + 1 }));
          }
          tempBuf = tempBuf.slice(packetSize);
        } else {
          tempBuf = tempBuf.slice(1);
        }
      }
    }

    return tempBuf;
  }, [parseBmsPacket]);

  const writeQueryCommand = useCallback(async () => {
    if (!serialPortRef.current) return;
    try {
      const writer = serialPortRef.current.writable.getWriter();
      let bytesToSend = new Uint8Array(0);

      if (bmsProtocol === 'jbd') {
        const choice = Math.random() > 0.5 ? 0x03 : 0x04;
        if (choice === 0x03) {
          bytesToSend = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
          logSerialLine('tx', `[JBD-TX 0x03] Query Basic Stats: ${bytesToHex(bytesToSend)}`);
        } else {
          bytesToSend = new Uint8Array([0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77]);
          logSerialLine('tx', `[JBD-TX 0x04] Query Cell Voltages: ${bytesToHex(bytesToSend)}`);
        }
      } else if (bmsProtocol === 'daly') {
        const choice = Math.random() > 0.5 ? 0x90 : 0x92;
        if (choice === 0x90) {
          bytesToSend = new Uint8Array([0xA5, 0x40, 0x90, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7D]);
          logSerialLine('tx', `[DALY-TX 0x90] Query Basic Stats: ${bytesToHex(bytesToSend)}`);
        } else {
          bytesToSend = new Uint8Array([0xA5, 0x40, 0x92, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F]);
          logSerialLine('tx', `[DALY-TX 0x92] Query Temperatures: ${bytesToHex(bytesToSend)}`);
        }
      } else if (bmsProtocol === 'modbus') {
        bytesToSend = new Uint8Array([0x01, 0x04, 0x00, 0x00, 0x00, 0x06, 0x70, 0x08]);
        logSerialLine('tx', `[MODBUS-TX] Query Registers: ${bytesToHex(bytesToSend)}`);
      }

      if (bytesToSend.length > 0) {
        await writer.write(bytesToSend);
        setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));
      }
      writer.releaseLock();
    } catch (e: any) {
      logSerialLine('error', `Write error: ${e.message || e}`);
    }
  }, [bmsProtocol, logSerialLine]);

  const simulateQueryResponse = useCallback(() => {
    if (bmsProtocol === 'jbd') {
      const tx1 = new Uint8Array([0xDD, 0xA5, 0x03, 0x00, 0xFF, 0xFD, 0x77]);
      logSerialLine('tx', `[JBD-TX 0x03] Read Basic Telemetry: ${bytesToHex(tx1)}`);
      setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));

      setTimeout(() => {
        const rx1 = getSimulatedJbdStatusHex();
        parseBmsPacket(rx1, 'jbd');
        setSerialState(prev => ({ 
          ...prev, 
          rxPacketCount: prev.rxPacketCount + 1,
          bytesRx: prev.bytesRx + rx1.length
        }));
      }, 150);

      setTimeout(() => {
        const tx2 = new Uint8Array([0xDD, 0xA5, 0x04, 0x00, 0xFF, 0xFC, 0x77]);
        logSerialLine('tx', `[JBD-TX 0x04] Read Cell Voltages: ${bytesToHex(tx2)}`);
        setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));

        setTimeout(() => {
          const rx2 = getSimulatedJbdCellsHex();
          parseBmsPacket(rx2, 'jbd');
          setSerialState(prev => ({ 
            ...prev, 
            rxPacketCount: prev.rxPacketCount + 1,
            bytesRx: prev.bytesRx + rx2.length
          }));
        }, 150);
      }, 700);

    } else if (bmsProtocol === 'daly') {
      const tx1 = new Uint8Array([0xA5, 0x40, 0x90, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7D]);
      logSerialLine('tx', `[DALY-TX 0x90] Read Basic Telemetry: ${bytesToHex(tx1)}`);
      setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));

      setTimeout(() => {
        const rx1 = getSimulatedDalyStatusHex();
        parseBmsPacket(rx1, 'daly');
        setSerialState(prev => ({ 
          ...prev, 
          rxPacketCount: prev.rxPacketCount + 1,
          bytesRx: prev.bytesRx + rx1.length
        }));
      }, 150);

      setTimeout(() => {
        const tx2 = new Uint8Array([0xA5, 0x40, 0x92, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x7F]);
        logSerialLine('tx', `[DALY-TX 0x92] Read Temperatures: ${bytesToHex(tx2)}`);
        setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));

        setTimeout(() => {
          const rx2 = getSimulatedDalyTempsHex();
          parseBmsPacket(rx2, 'daly');
          setSerialState(prev => ({ 
            ...prev, 
            rxPacketCount: prev.rxPacketCount + 1,
            bytesRx: prev.bytesRx + rx2.length
          }));
        }, 150);
      }, 700);
      
    } else if (bmsProtocol === 'modbus') {
      const tx1 = new Uint8Array([0x01, 0x04, 0x00, 0x00, 0x00, 0x06, 0x70, 0x08]);
      logSerialLine('tx', `[MODBUS-TX 0x04] Read registers: ${bytesToHex(tx1)}`);
      setSerialState(prev => ({ ...prev, txPacketCount: prev.txPacketCount + 1 }));

      setTimeout(() => {
        const rxVal = new Uint8Array(17);
        rxVal[0] = 0x01;
        rxVal[1] = 0x04;
        rxVal[2] = 0x0C; 
        
        const voltsVal = Math.round((demoMode === 'discharge' ? 47.8 : demoMode === 'charge' ? 51.2 : 49.5) * 10);
        rxVal[3] = (voltsVal >> 8) & 0xFF;
        rxVal[4] = voltsVal & 0xFF;

        const ampsVal = Math.round((demoMode === 'discharge' ? -15.0 : demoMode === 'charge' ? 25.0 : 0.0) * 10);
        const signedAmps = ampsVal < 0 ? 65536 + ampsVal : ampsVal;
        rxVal[5] = (signedAmps >> 8) & 0xFF;
        rxVal[6] = signedAmps & 0xFF;

        const socVal = Math.round((demoMode === 'discharge' ? 45.0 : demoMode === 'charge' ? 82.0 : 60.0) * 10);
        rxVal[7] = (socVal >> 8) & 0xFF;
        rxVal[8] = socVal & 0xFF;

        const tempVal = Math.round(25.5 * 10);
        rxVal[9] = (tempVal >> 8) & 0xFF;
        rxVal[10] = tempVal & 0xFF;

        rxVal[11] = 0; rxVal[12] = 0;
        rxVal[13] = 0; rxVal[14] = 0;
        
        rxVal[15] = 0xAA; rxVal[16] = 0xBB;

        parseBmsPacket(rxVal, 'modbus');
        setSerialState(prev => ({ 
          ...prev, 
          rxPacketCount: prev.rxPacketCount + 1,
          bytesRx: prev.bytesRx + rxVal.length
        }));
      }, 150);
    }
  }, [bmsProtocol, demoMode, getSimulatedJbdStatusHex, getSimulatedJbdCellsHex, getSimulatedDalyStatusHex, getSimulatedDalyTempsHex, parseBmsPacket, logSerialLine]);

  const handleConnectSerial = async () => {
    if (demoActive) {
      setDemoActive(false);
      logSerialLine('info', `Stopped demo emulation mode.`);
    }

    if (serialState.status === 'connected') {
      serialKeepReadingRef.current = false;
      try {
        if (serialReaderRef.current) {
          await serialReaderRef.current.cancel();
        }
        if (serialPortRef.current) {
          await serialPortRef.current.close();
        }
      } catch (err) {}
      serialPortRef.current = null;
      serialReaderRef.current = null;
      setSerialState(prev => ({ ...prev, status: 'disconnected', portName: '' }));
      logSerialLine('info', `🔌 Disconnected Serial USB Interface`);
      return;
    }

    setSerialState(prev => ({ ...prev, status: 'connecting' }));
    logSerialLine('info', `Requesting Serial Port access from browser...`);

    try {
      if (typeof navigator === 'undefined' || !('serial' in navigator)) {
        throw new Error("Web Serial API is not supported in this browser. Please use Chrome/Edge or toggle emulation!");
      }

      const port = await (navigator as any).serial.requestPort();
      logSerialLine('info', `Port authorized. Opening at ${baudRate} baud...`);

      const parsedBaud = parseInt(baudRate, 10) || 9600;
      await port.open({ baudRate: parsedBaud });
      
      serialPortRef.current = port;
      serialKeepReadingRef.current = true;
      const protocolName = bmsProtocol;
      
      setSerialState(prev => ({ 
        ...prev, 
        status: 'connected', 
        portName: 'Serial Port'
      }));
      logSerialLine('info', `🔌 Link Established! Reading ${bmsProtocol.toUpperCase()} streams`);

      (async () => {
        let buffer: number[] = [];
        while (serialKeepReadingRef.current && port.readable) {
          try {
            const reader = port.readable.getReader();
            serialReaderRef.current = reader;
            
            while (serialKeepReadingRef.current) {
              const { value, done } = await reader.read();
              if (done) break;
              if (value) {
                for (let i = 0; i < value.length; i++) {
                  buffer.push(value[i]);
                }
                buffer = processBufferAndParse(buffer, protocolName);
                setSerialState(prev => ({
                  ...prev,
                  bytesRx: prev.bytesRx + value.length
                }));
              }
            }
            reader.releaseLock();
          } catch (err: any) {
            logSerialLine('error', `Reader err/restart: ${err.message || err}`);
            await new Promise(r => setTimeout(r, 800));
          }
        }
      })();

    } catch (err: any) {
      setSerialState(prev => ({ ...prev, status: 'error' }));
      logSerialLine('error', `Connection Failed: ${err.message || 'Busy or aborted'}`);
    }
  };

  const handleToggleDemo = () => {
    if (serialState.status === 'connected') {
      serialKeepReadingRef.current = false;
      if (serialPortRef.current) {
        try {
          serialPortRef.current.close();
        } catch (e) {}
      }
      serialPortRef.current = null;
      setSerialState(prev => ({ ...prev, status: 'disconnected', portName: '' }));
    }

    if (demoActive) {
      setDemoActive(false);
      logSerialLine('info', `⏸️ Stopped simulated telemetry`);
    } else {
      setDemoActive(true);
      logSerialLine('info', `▶️ Emulation Active for ${bmsProtocol.toUpperCase()} BMS serial protocol`);
    }
  };

  // Continuous loop trigger
  useEffect(() => {
    if (serialState.status !== 'connected' && !demoActive) return;

    const interval = setInterval(() => {
      if (demoActive) {
        simulateQueryResponse();
      } else {
        writeQueryCommand();
      }
    }, 1500);

    return () => {
      clearInterval(interval);
    };
  }, [serialState.status, demoActive, simulateQueryResponse, writeQueryCommand]);

  // Cleanup effect
  useEffect(() => {
    return () => {
      serialKeepReadingRef.current = false;
      if (serialPortRef.current) {
        try {
          serialPortRef.current.close();
        } catch (e) {}
      }
    };
  }, []);

  // Log auto-scroll effect
  useEffect(() => {
    if (scrollLock && serialLinesEndRef.current) {
      serialLinesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [serialLines, scrollLock]);

  const capacityToDisplay = (ah: number) => capacityUnit === 'mAh' ? ah * 1000 : ah;
  const displayToCapacity = (val: number) => capacityUnit === 'mAh' ? val / 1000 : val;
  const energyToDisplay = (wh: number) => energyUnit === 'kWh' ? wh / 1000 : wh;

  const totalEnergyWh = useMemo(() => 
    config.totalCapacityAh * config.nominalCellVoltage * config.seriesCount, 
  [config.totalCapacityAh, config.nominalCellVoltage, config.seriesCount]);

  const currentCellVoltage = state.measuredVoltage / config.seriesCount;

  const currentTemp = state.temperatureCelsius ?? 25;
  const isTempOutOfRange = useMemo(() => {
    const minT = config.minOperatingTemp !== undefined ? config.minOperatingTemp : 0;
    const maxT = config.maxOperatingTemp !== undefined ? config.maxOperatingTemp : 45;
    return currentTemp < minT || currentTemp > maxT;
  }, [currentTemp, config.minOperatingTemp, config.maxOperatingTemp]);

  const cellImbalanceAlerts = useMemo(() => {
    const list = state.cellVoltages || Array(config.seriesCount).fill(currentCellVoltage);
    const avg = list.length > 0 ? list.reduce((a, b) => a + b, 0) / list.length : 3.60;
    const flagged: { index: number; voltage: number; deviation: number }[] = [];
    list.forEach((v, idx) => {
      const dev = v - avg;
      if (Math.abs(dev) > 0.05) {
        flagged.push({ index: idx + 1, voltage: v, deviation: dev });
      }
    });
    return { flagged, average: avg };
  }, [state.cellVoltages, config.seriesCount, currentCellVoltage]);

  const usableAh = useMemo(() => {
    const cutoffAh = (config.cutoffSoc / 100) * config.totalCapacityAh;
    return Math.max(0, state.remainingCapacityAh - cutoffAh);
  }, [state.remainingCapacityAh, config.cutoffSoc, config.totalCapacityAh]);

  const usableEnergyWh = useMemo(() => {
    const usableSocRange = Math.max(0, state.socPercentage - config.cutoffSoc);
    const rawUsableEnergyWh = (usableSocRange / 100) * totalEnergyWh;
    const efficiency = config.dischargeEfficiency !== undefined ? config.dischargeEfficiency : 95;
    return rawUsableEnergyWh * (efficiency / 100);
  }, [state.socPercentage, config.cutoffSoc, totalEnergyWh, config.dischargeEfficiency]);

  const timeToCutoff = useMemo(() => {
    const load = state.dischargeLoadAmps || 0;
    if (load <= 0) return null;
    const efficiency = config.dischargeEfficiency !== undefined ? config.dischargeEfficiency : 95;
    const hours = (usableAh * (efficiency / 100)) / load;
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { h, m };
  }, [usableAh, state.dischargeLoadAmps, config.dischargeEfficiency]);

  const timeToFull = useMemo(() => {
    const neededAh = Math.max(0, config.totalCapacityAh - state.remainingCapacityAh);
    const chargeCurrent = config.chargeRateC * config.totalCapacityAh;
    if (chargeCurrent <= 0 || neededAh <= 0) return null;
    const hours = neededAh / chargeCurrent;
    const totalMinutes = Math.round(hours * 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    return { h, m };
  }, [state.remainingCapacityAh, config.totalCapacityAh, config.chargeRateC]);

  const logCurrentState = useCallback((overrides?: Partial<BatteryState>) => {
    const entry: HistoryPoint = {
      ...state,
      ...overrides,
      timestamp: Date.now(),
      id: crypto.randomUUID()
    };
    setHistory(prev => [entry, ...prev].slice(0, 100));
  }, [state]);

  const handleReset = useCallback(() => {
    setConfig(INITIAL_CONFIG);
    setState(INITIAL_STATE);
    setHistory([]);
    setHasSyncedBms(false);
    setDemoActive(false);
    setUploadStatus({ type: 'idle', message: '' });
    setActiveTab('dashboard');
  }, []);

  // Sync cellVoltages length whenever seriesCount changes
  useEffect(() => {
    setState(prev => {
      const targetCount = config.seriesCount;
      const currentVoltages = prev.cellVoltages || [];
      if (currentVoltages.length === targetCount) return prev;
      
      const avgV = prev.measuredVoltage / targetCount;
      const newVoltages = Array(targetCount).fill(avgV);
      // Try to preserve existing voltages if possible
      for (let i = 0; i < Math.min(currentVoltages.length, targetCount); i++) {
        newVoltages[i] = currentVoltages[i];
      }
      return {
        ...prev,
        cellVoltages: newVoltages
      };
    });
  }, [config.seriesCount]);

  const updateFromVoltage = useCallback((voltage: number) => {
    const cellV = voltage / config.seriesCount;
    const soc = getSOCFromVoltage(cellV, config.chemistry);
    setState(prev => ({
      ...prev,
      measuredVoltage: voltage,
      socPercentage: soc,
      remainingCapacityAh: (soc / 100) * config.totalCapacityAh,
      cellVoltages: Array(config.seriesCount).fill(cellV)
    }));
  }, [config.seriesCount, config.chemistry, config.totalCapacityAh]);

  const calculateVoltageFromSOC = useCallback((soc: number) => {
    const safeSoc = Math.min(100, Math.max(0, soc));
    const cellV = getVoltageFromSOC(safeSoc, config.chemistry);
    // Increased precision before rounding for safer display
    const packV = parseFloat((cellV * config.seriesCount).toFixed(3));
    setState(prev => ({ 
      ...prev, 
      socPercentage: safeSoc,
      measuredVoltage: packV,
      remainingCapacityAh: (safeSoc / 100) * config.totalCapacityAh,
      cellVoltages: Array(config.seriesCount).fill(cellV)
    }));
  }, [config.chemistry, config.seriesCount, config.totalCapacityAh]);

  const updateCellVoltage = useCallback((index: number, val: number) => {
    setState(prev => {
      const currentVoltages = [...(prev.cellVoltages || Array(config.seriesCount).fill(prev.measuredVoltage / config.seriesCount))];
      currentVoltages[index] = val;
      
      const sumVoltage = parseFloat(currentVoltages.reduce((a, b) => a + b, 0).toFixed(3));
      const avgCellV = sumVoltage / config.seriesCount;
      const soc = getSOCFromVoltage(avgCellV, config.chemistry);
      
      return {
        ...prev,
        measuredVoltage: sumVoltage,
        socPercentage: soc,
        remainingCapacityAh: (soc / 100) * config.totalCapacityAh,
        cellVoltages: currentVoltages
      };
    });
  }, [config.seriesCount, config.chemistry, config.totalCapacityAh]);

  const simulateBalanced = useCallback(() => {
    setState(prev => {
      const avgV = prev.measuredVoltage / config.seriesCount;
      return {
        ...prev,
        cellVoltages: Array(config.seriesCount).fill(avgV)
      };
    });
  }, [config.seriesCount]);

  const simulateMinorImbalance = useCallback(() => {
    setState(prev => {
      const avgV = prev.measuredVoltage / config.seriesCount;
      const voltages = Array.from({ length: config.seriesCount }, (_, i) => {
        // Create an interesting spread with deterministic sine deviation
        const deviation = Math.sin(i * 1.7) * 0.035; // max 35mV delta
        return parseFloat(Math.max(config.minCellVoltage, Math.min(config.maxCellVoltage, avgV + deviation)).toFixed(3));
      });
      const sum = parseFloat(voltages.reduce((a, b) => a + b, 0).toFixed(3));
      return {
        ...prev,
        measuredVoltage: sum,
        cellVoltages: voltages
      };
    });
  }, [config.seriesCount, config.minCellVoltage, config.maxCellVoltage]);

  const simulateWeakCell = useCallback(() => {
    setState(prev => {
      const avgV = prev.measuredVoltage / config.seriesCount;
      const voltages = Array(config.seriesCount).fill(avgV);
      if (voltages.length > 0) {
        // Drop cell index 4 significantly to represent high internal resistance/collapsed cell
        const badIndex = Math.min(4, voltages.length - 1);
        voltages[badIndex] = parseFloat((config.minCellVoltage - 0.15).toFixed(3));
      }
      const sum = parseFloat(voltages.reduce((a, b) => a + b, 0).toFixed(3));
      return {
        ...prev,
        measuredVoltage: sum,
        cellVoltages: voltages
      };
    });
  }, [config.seriesCount, config.minCellVoltage]);

  const simulateSevereOvervoltage = useCallback(() => {
    setState(prev => {
      const avgV = prev.measuredVoltage / config.seriesCount;
      const voltages = Array(config.seriesCount).fill(avgV);
      if (voltages.length > 0) {
        // Spike cell index 2 significantly to represent charge/BMS imbalance
        const badIndex = Math.min(2, voltages.length - 1);
        voltages[badIndex] = parseFloat((config.maxCellVoltage + 0.18).toFixed(3));
      }
      const sum = parseFloat(voltages.reduce((a, b) => a + b, 0).toFixed(3));
      return {
        ...prev,
        measuredVoltage: sum,
        cellVoltages: voltages
      };
    });
  }, [config.seriesCount, config.maxCellVoltage]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        let headers: string[] = [];
        let parsedRows: string[][] = [];

        if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          if (workbook.SheetNames.length === 0) throw new Error("Excel file is empty.");
          const sheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[sheetName];
          const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
          if (rows.length < 2) throw new Error("File contains no data rows.");
          
          headers = (rows[0] as string[]).map(h => String(h).toLowerCase().trim());
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i] as string[];
            if (row && row.length > 0 && row.some(cell => !isNaN(parseFloat(String(cell))))) {
              parsedRows.push(row.map(d => String(d).trim()));
            }
          }
        } else {
          const text = e.target?.result as string;
          if (!text) return;
          const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
          if (lines.length < 2) throw new Error("File contains no data rows.");
          const firstLine = lines[0];
          const delimiters = [',', ';', '\t'];
          const delimiterCounts = delimiters.map(d => (firstLine.match(new RegExp(d, 'g')) || []).length);
          const maxDelimiterIdx = delimiterCounts.indexOf(Math.max(...delimiterCounts));
          const delimiter = delimiterCounts[maxDelimiterIdx] > 0 ? delimiters[maxDelimiterIdx] : ',';
          headers = lines[0].toLowerCase().split(delimiter).map(h => h.trim());
          for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(delimiter).map(d => d.trim());
            if (row.length > 0 && row.some(cell => !isNaN(parseFloat(cell)))) {
              parsedRows.push(row);
            }
          }
        }

        if (parsedRows.length === 0) throw new Error("No valid data rows found in the file.");

        const getVal = (row: string[], keywords: string[], excludeKeywords: string[] = []) => {
          const index = headers.findIndex(h => 
            keywords.some(k => h.includes(k)) && !excludeKeywords.some(ex => h.includes(ex))
          );
          if (index === -1 || !row[index]) return null;
          const val = parseFloat(row[index]);
          return isNaN(val) ? null : val;
        };

        const newHistory: HistoryPoint[] = [];
        let finalState: BatteryState | null = null;
        let latestImportedCycles: number | null = null;
        
        // Try to identify a timestamp column
        const tsIndex = headers.findIndex(h => h.includes('time') || h.includes('date'));
        const baseTime = Date.now() - (parsedRows.length * 5000);

        parsedRows.forEach((dataRow, idx) => {
          const importedVoltage = getVal(
            dataRow,
            ['v_pack', 'pack_v', 'total_v', 'battery_v', 'pack_voltage', 'voltage', 'volt'],
            ['cell', 'bms', 'min', 'max', 'delta', 'diff', 'avg']
          );
          const importedSoc = getVal(dataRow, ['soc', 'percent', 'cap_%', 'capacity_%', 'charge_%', 'state_of_charge'], ['soh', 'health']);
          const importedCurrent = getVal(dataRow, ['curr', 'amp', 'i_pack', 'current', 'pack_i', 'discharge_a', 'charge_a']);
          const importedCapacity = getVal(dataRow, ['rem', 'capacity_ah', 'ah_rem', 'left_ah', 'remaining_cap', 'capacity_remaining'], ['fcc', 'full', 'design', 'total']);
          const importedBmsV = getVal(dataRow, ['bms_v', 'internal_v', 'cell_sum', 'bms_voltage']);
          const importedTemp = getVal(dataRow, ['temp', 'cel', 't_pack', 't_ambient', 'temperature']);
          const importedSoh = getVal(dataRow, ['soh', 'state_of_health', 'health_%', 'health_percent']);
          const importedFcc = getVal(dataRow, ['fcc', 'full_charge_capacity', 'design_cap', 'total_cap', 'cap_ah']);
          const importedCycles = getVal(dataRow, ['cycle', 'cycles', 'cycle_count', 'number_of_cycles', 'battery_cycle']);
          
          if (importedCycles !== null && !isNaN(importedCycles) && importedCycles >= 0) {
            latestImportedCycles = importedCycles;
          }

          const extractedCells: (number | null)[] = [];
          let foundAnyCell = false;
          for (let c = 1; c <= config.seriesCount; c++) {
            const regex = new RegExp(`(?:^|\\b)(?:cell|c)[\\s_]*0?${c}(?:\\b|[^0-9])`, 'i');
            const index = headers.findIndex(h => regex.test(h));
            let val = null;
            if (index !== -1 && dataRow[index]) {
              const parsed = parseFloat(dataRow[index]);
              if (!isNaN(parsed)) {
                val = parsed;
                foundAnyCell = true;
              }
            }
            extractedCells.push(val);
          }
          
          if (importedVoltage === null && importedSoc === null && !foundAnyCell) return;

          let st = finalState ? { ...finalState } : { ...state };
          
          if (foundAnyCell) {
            const validCells = extractedCells.filter(v => v !== null) as number[];
            const avg = validCells.length > 0 ? validCells.reduce((a, b) => a + b, 0) / validCells.length : (st.measuredVoltage / config.seriesCount);
            st.cellVoltages = extractedCells.map(v => v !== null ? v : avg);
            if (importedVoltage === null && validCells.length > 0) {
              st.measuredVoltage = parseFloat((avg * config.seriesCount).toFixed(3));
            }
          }

          st.measuredVoltage = importedVoltage ?? st.measuredVoltage;
          st.bmsVoltage = importedBmsV ?? importedVoltage ?? st.bmsVoltage;
          st.currentAmps = importedCurrent ?? st.currentAmps;
          st.temperatureCelsius = importedTemp ?? st.temperatureCelsius;
          st.dischargeLoadAmps = importedCurrent && importedCurrent < 0 ? Math.abs(importedCurrent) : st.dischargeLoadAmps;
          if (importedSoh !== null) {
            st.sohPercentage = importedSoh;
          }
          if (importedFcc !== null) {
            st.fullChargeCapacityAh = importedFcc;
          }

          // Derive SOC and Capacity from imported SOC or Voltage
          if (importedSoc !== null) {
            st.socPercentage = Math.min(100, Math.max(0, importedSoc));
            st.remainingCapacityAh = importedCapacity ?? ((st.socPercentage / 100) * config.totalCapacityAh);
          } else if (importedVoltage !== null) {
            const soc = getSOCFromVoltage(importedVoltage / config.seriesCount, config.chemistry);
            st.socPercentage = soc;
            st.remainingCapacityAh = importedCapacity ?? ((soc / 100) * config.totalCapacityAh);
          }

          if (importedCapacity !== null && importedVoltage === null && importedSoc === null) {
            st.remainingCapacityAh = importedCapacity;
            st.socPercentage = Math.min(100, (importedCapacity / config.totalCapacityAh) * 100);
          }

          let timestamp = baseTime + (idx * 5000);
          if (tsIndex !== -1 && dataRow[tsIndex]) {
            const parsedTs = Date.parse(dataRow[tsIndex]);
            if (!isNaN(parsedTs)) timestamp = parsedTs;
          }

          finalState = st;
          newHistory.push({
            ...st,
            timestamp,
            id: crypto.randomUUID()
          });
        });

        if (newHistory.length === 0 || !finalState) {
          throw new Error("Missing essential columns: Could not find Pack Voltage or SOC.");
        }

        newHistory.sort((a, b) => b.timestamp - a.timestamp);

        // The newest data point should be the current state
        const latestPoint = newHistory[0];
        if (latestPoint) {
            const { timestamp, id, ...stateOnly } = latestPoint;
            setState(stateOnly as BatteryState);
        }
        setHistory(prev => {
          const merged = [...newHistory, ...prev];
          return merged.slice(0, 500);
        });
        
        setIsImportPulse(true);
        setHasSyncedBms(true);
        setUploadStatus({ 
          type: 'success', 
          message: `Successfully synchronized ${newHistory.length} data points from ${file.name}.` 
        });

        // Calculate Cycle Count from imported column or History Throughput
        let newAccumulatedAh = config.accumulatedThroughputAh || 0;
        let newCycleCount = latestImportedCycles !== null ? latestImportedCycles : (config.cycleCount || 0);
        
        if (latestImportedCycles === null) {
          const sortedHistory = [...newHistory].sort((a, b) => a.timestamp - b.timestamp);
          for (let i = 1; i < sortedHistory.length; i++) {
            const prev = sortedHistory[i - 1];
            const curr = sortedHistory[i];
            const deltaHours = (curr.timestamp - prev.timestamp) / 3600000;
            if (deltaHours > 0 && deltaHours < 24) {
              const avgCurrent = Math.abs(curr.currentAmps); 
              newAccumulatedAh += (avgCurrent * deltaHours);
            }
          }
          
          if (newAccumulatedAh >= config.totalCapacityAh && config.totalCapacityAh > 0) {
            const addedCycles = Math.floor(newAccumulatedAh / config.totalCapacityAh);
            newCycleCount += addedCycles;
            newAccumulatedAh = newAccumulatedAh % config.totalCapacityAh;
          }
        }

        setConfig(c => ({
          ...c,
          cycleCount: newCycleCount,
          accumulatedThroughputAh: newAccumulatedAh
        }));


      } catch (err) {
        setUploadStatus({ 
          type: 'error', 
          message: `${err instanceof Error ? err.message : 'Invalid file format.'}` 
        });
      }
    };

    if (file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file);
    }
    event.target.value = '';
  };

  const chartData = useMemo(() => {
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
  }, [config.chemistry, config.seriesCount]);

  const historyTrendData = useMemo(() => {
    return [...history].reverse().map(h => ({
      time: new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      voltage: h.measuredVoltage,
      soc: h.socPercentage,
      temp: h.temperatureCelsius
    }));
  }, [history]);

  const observedCurveData = useMemo(() => {
    return [...history]
      .sort((a, b) => a.socPercentage - b.socPercentage)
      .map(h => ({
        soc: parseFloat(h.socPercentage.toFixed(1)),
        voltage: parseFloat(h.measuredVoltage.toFixed(2)),
        timestamp: h.timestamp
      }));
  }, [history]);

  const batteryHealthInfo = useMemo(() => {
    const fallbackHistoryPoint = history.length > 0 ? history[0] : null;
    const currentSoh = state.sohPercentage ?? fallbackHistoryPoint?.sohPercentage;
    const currentFcc = state.fullChargeCapacityAh ?? fallbackHistoryPoint?.fullChargeCapacityAh;
    const currentCells = (state.cellVoltages && state.cellVoltages.length > 0)
      ? state.cellVoltages
      : (fallbackHistoryPoint?.cellVoltages || []);

    interface ActiveMetric {
      id: string;
      name: string;
      rawScore: number;
      nominalWeight: number; // 0.40, 0.30, 0.20, 0.10
    }

    const activeMetrics: ActiveMetric[] = [];

    // 1. SOH (State of Health) - 40% Target Weight
    const hasSoh = currentSoh !== undefined && 
                   currentSoh !== null && 
                   !isNaN(currentSoh) && 
                   isFinite(currentSoh);
    if (hasSoh) {
      const sohScore = Math.min(100, Math.max(0, currentSoh!));
      activeMetrics.push({
        id: 'soh',
        name: 'State of Health (SOH)',
        rawScore: sohScore,
        nominalWeight: 0.40
      });
    }

    // 2. Capacity (Full Charge Capacity vs Design Capacity) - 30% Target Weight
    const designCapacity = config.totalCapacityAh || 0;
    const hasCapacity = currentFcc !== undefined && 
                        currentFcc !== null && 
                        !isNaN(currentFcc) && 
                        isFinite(currentFcc) && 
                        designCapacity > 0;
    if (hasCapacity) {
      const capacityRatio = (currentFcc! / designCapacity) * 100;
      const capacityScore = Math.min(100, Math.max(0, capacityRatio));
      activeMetrics.push({
        id: 'capacity',
        name: 'Full Charge Capacity',
        rawScore: capacityScore,
        nominalWeight: 0.30
      });
    }

    // 3. Battery Number of Cycles - 20% Target Weight
    const hasCycleCount = config.cycleCount !== undefined && 
                          config.cycleCount !== null && 
                          !isNaN(config.cycleCount) && 
                          isFinite(config.cycleCount) && 
                          config.cycleCount >= 0;
    if (hasCycleCount) {
      const maxLifecycleBenchmark = config.chemistry === BatteryChemistry.LIFEPO4
        ? 3000
        : config.chemistry === BatteryChemistry.LI_ION
          ? 1000
          : 600;
      const cycleScore = Math.max(0, Math.min(100, 100 - (config.cycleCount! / maxLifecycleBenchmark) * 100));
      activeMetrics.push({
        id: 'cycles',
        name: 'Cycle Life',
        rawScore: cycleScore,
        nominalWeight: 0.20
      });
    }

    // 4. Maximum Pressure Difference / Cell Voltage Difference - 10% Target Weight
    let maxCellDeviation = 0;
    let avgDeviationCell = 0;
    const validCells = currentCells.filter(
      (v): v is number => typeof v === 'number' && !isNaN(v) && isFinite(v)
    );
    const hasCellImbalance = validCells.length > 1;

    if (hasCellImbalance) {
      const maxVolt = Math.max(...validCells);
      const minVolt = Math.min(...validCells);
      maxCellDeviation = Math.max(0, maxVolt - minVolt);

      const meanVolt = validCells.reduce((a, b) => a + b, 0) / validCells.length;
      avgDeviationCell = validCells.reduce((acc, v) => acc + Math.abs(v - meanVolt), 0) / validCells.length;

      // Tight balancing under 50mV = 100% score. Drops linearly to 0 at 250mV
      let cellDiffScore = 100;
      if (maxCellDeviation > 0.050) {
        cellDiffScore = Math.max(0, 100 - ((maxCellDeviation - 0.050) * 500));
      }

      activeMetrics.push({
        id: 'imbalance',
        name: 'Cell Voltage Balance',
        rawScore: cellDiffScore,
        nominalWeight: 0.10
      });
    }

    // Dynamically re-normalize weights so that missing optional metrics do not penalize or skew the score
    const totalActiveWeight = activeMetrics.reduce((sum, m) => sum + m.nominalWeight, 0);

    let weightedScore = 100;
    if (totalActiveWeight > 0) {
      weightedScore = activeMetrics.reduce((sum, m) => {
        const effectiveWeight = m.nominalWeight / totalActiveWeight;
        return sum + (m.rawScore * effectiveWeight);
      }, 0);
    }

    const roundedHealth = Math.round(Math.min(100, Math.max(0, weightedScore)) * 10) / 10;

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
      description = 'Normal operating wear based on available telemetry.';
    }

    return {
      score: roundedHealth,
      statusText,
      statusColor,
      strokeColor,
      description,
      avgDeviationCell,
      maxCellDeviation,
      activeMetrics: activeMetrics.map(m => ({
        id: m.id,
        name: m.name,
        score: Math.round(m.rawScore * 10) / 10,
        nominalWeight: Math.round(m.nominalWeight * 100),
        effectiveWeight: Math.round((m.nominalWeight / (totalActiveWeight || 1)) * 100)
      }))
    };
  }, [history, state, config.cycleCount, config.totalCapacityAh, config.chemistry]);

  const efficiencyComparisonData = useMemo(() => {
    const steps = [85, 88, 90, 92, 95, 97, 99];
    const userEff = config.dischargeEfficiency !== undefined ? config.dischargeEfficiency : 95;
    
    if (!steps.includes(userEff)) {
      steps.push(userEff);
    }
    steps.sort((a, b) => a - b);

    const load = state.dischargeLoadAmps || 0;
    const rawUsableEnergyWh = (Math.max(0, state.socPercentage - config.cutoffSoc) / 100) * totalEnergyWh;

    return steps.map(eff => {
      const eWh = rawUsableEnergyWh * (eff / 100);
      const eDisplay = energyToDisplay(eWh);
      
      let runtimeHoursDecimal = 0;
      let runtimeStr = '---';
      if (load > 0) {
        const hours = (usableAh * (eff / 100)) / load;
        runtimeHoursDecimal = hours;
        const totalMinutes = Math.round(hours * 60);
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        runtimeStr = `${h}h ${m}m`;
      }

      const currentUsableWh = rawUsableEnergyWh * (userEff / 100);
      const diffWh = eWh - currentUsableWh;
      const diffDisplay = energyToDisplay(diffWh);
      const isPositive = diffWh > 0;
      const isNegative = diffWh < 0;
      const diffLabel = isPositive 
        ? `+${diffDisplay.toFixed(2)}` 
        : isNegative 
          ? `${diffDisplay.toFixed(2)}` 
          : '0.00';

      return {
        efficiency: eff,
        usableEnergyWh: parseFloat(eWh.toFixed(1)),
        usableEnergyDisplay: parseFloat(eDisplay.toFixed(2)),
        runtimeStr,
        runtimeHours: parseFloat(runtimeHoursDecimal.toFixed(2)),
        diffLabel,
        isPositive,
        isNegative,
        isUserConfig: eff === userEff
      };
    });
  }, [state.socPercentage, config.cutoffSoc, totalEnergyWh, config.dischargeEfficiency, state.dischargeLoadAmps, usableAh, energyUnit]);

  const UnitToggle = ({ value, options, onChange }: { value: string, options: string[], onChange: (v: any) => void }) => (
    <div className="flex bg-slate-900 rounded-lg p-0.5 border border-slate-700 h-6">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`px-2 text-[8px] font-bold uppercase tracking-widest rounded transition-all ${value === opt ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}
        >
          {opt}
        </button>
      ))}
    </div>
  );

  const isBmsActive = serialState.status === 'connected' || demoActive || hasSyncedBms;

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-7xl mx-auto space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-700 pb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2 text-blue-400">
            <Zap className="fill-blue-400" /> Lithium Calculator By Han Win
          </h1>
          <div className="flex items-center gap-4 mt-2">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'dashboard' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              <LayoutDashboard size={14} /> Dashboard
            </button>
            <button 
              onClick={() => setActiveTab('history')}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-lg' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
            >
              <HistoryIcon size={14} /> History Log {history.length > 0 && <span className="ml-1 opacity-60">({history.length})</span>}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input type="file" accept=".csv,.xlsx,.xls" className="hidden" ref={fileInputRef} onChange={handleFileUpload} />
          <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all px-4 py-2.5 rounded-xl font-semibold text-sm group">
            <FileUp className="w-4 h-4 text-emerald-400" />
            Sync BMS Data
          </button>
          <button onClick={handleReset} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all px-4 py-2.5 rounded-xl font-semibold text-sm text-red-400">
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
        </div>
      </header>

      {uploadStatus.type !== 'idle' && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${uploadStatus.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {uploadStatus.type === 'success' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span className="text-sm font-medium">{uploadStatus.message}</span>
          <button onClick={() => setUploadStatus({ type: 'idle', message: '' })} className="ml-auto opacity-50 hover:opacity-100">✕</button>
        </div>
      )}

      {activeTab === 'dashboard' ? (
        <div className="space-y-6">
          {/* Dashboard telemetry status banner */}
          <div className="bg-slate-800/20 backdrop-blur-sm rounded-2xl p-4 border border-slate-700/60 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {/* BMS ACTIVE Indicators */}
              <div 
                className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-widest transition-all duration-300 border ${
                  isBmsActive 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 font-semibold' 
                    : 'bg-slate-900/60 border-slate-800 text-slate-500 font-medium'
                } ${isImportPulse ? 'animate-bms-sync ring-4 ring-emerald-500/20 border-emerald-400 scale-[1.02]' : ''}`}
                title={isBmsActive ? "BMS actively communicating / synced" : "No active BMS data source connected"}
              >
                <span className="w-2.5 h-2.5 rounded-full relative flex">
                  {isBmsActive && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isBmsActive ? 'bg-emerald-500' : 'bg-slate-600'}`}></span>
                </span>
                BMS Active
              </div>

              <div className="text-xs text-slate-400 font-medium">
                {serialState.status === 'connected' ? (
                  <span>Connected via <span className="text-blue-400 font-mono font-bold uppercase">{bmsProtocol}</span> stream ({baudRate} bps)</span>
                ) : demoActive ? (
                  <span>Emulating <span className="text-amber-400 font-mono font-bold uppercase">{bmsProtocol}</span> telemetry ({demoMode} mode)</span>
                ) : hasSyncedBms ? (
                  <span>CSV File Synced (Static Profile Active)</span>
                ) : (
                  <span>Offline • Sync CSV to begin</span>
                )}
              </div>
            </div>

            {/* Quick telemetry stream stats */}
            <div className="flex items-center gap-4 text-[10px] uppercase tracking-wider font-mono text-slate-500 font-bold">
              {isImportPulse && (
                <span className="text-xs text-emerald-400 animate-pulse flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                  Syncing Live Data...
                </span>
              )}
              <span>Last update: <span className="text-slate-300">{isBmsActive ? new Date().toLocaleTimeString() : 'N/A'}</span></span>
            </div>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            <div className="lg:col-span-4 space-y-6">
              <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 shadow-xl">
                <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-blue-400 font-bold uppercase text-xs tracking-wider">
                  <Settings size={16} /> Configuration
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Battery Chemistry</label>
                  <select 
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm cursor-pointer"
                    value={config.chemistry}
                    onChange={(e) => {
                      const newChem = e.target.value as BatteryChemistry;
                      const defaults = CHEMISTRY_DEFAULTS[newChem];
                      const newCellV = getVoltageFromSOC(state.socPercentage, newChem);
                      const newPackV = parseFloat((newCellV * config.seriesCount).toFixed(3));
                      setConfig(prev => ({
                        ...prev,
                        chemistry: newChem,
                        nominalCellVoltage: defaults.nominal,
                        maxCellVoltage: defaults.max,
                        minCellVoltage: defaults.min
                      }));
                      setState(prev => ({
                        ...prev,
                        measuredVoltage: newPackV,
                        bmsVoltage: newPackV,
                        cellVoltages: Array(config.seriesCount).fill(parseFloat(newCellV.toFixed(3)))
                      }));
                    }}
                  >
                    {Object.values(BatteryChemistry).map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Cell Count (S)</label>
                    <SmartNumberInput
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 font-mono"
                      value={config.seriesCount}
                      precision={0}
                      onChange={(val) => setConfig(prev => ({ ...prev, seriesCount: Math.max(1, Math.floor(val)) }))}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Cutoff SOC (%)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-red-500 font-mono text-red-400 pr-8"
                        value={config.cutoffSoc}
                        precision={0}
                        onChange={(val) => setConfig(prev => ({ ...prev, cutoffSoc: Math.min(99, Math.max(0, Math.floor(val))) }))}
                      />
                      <ShieldAlert className="absolute right-3 top-2.5 text-slate-600" size={14} />
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <div className="flex justify-between items-center mb-1.5 ml-1">
                      <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold">Total Capacity</label>
                      <UnitToggle value={capacityUnit} options={['Ah', 'mAh']} onChange={setCapacityUnit} />
                    </div>
                    <SmartNumberInput
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:border-blue-500 font-mono"
                      value={capacityToDisplay(config.totalCapacityAh)}
                      precision={capacityUnit === 'mAh' ? 0 : 2}
                      onChange={(val) => setConfig(prev => ({ ...prev, totalCapacityAh: displayToCapacity(val) }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Charge Rate (C)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-blue-400 pr-8"
                        value={config.chargeRateC}
                        precision={2}
                        onChange={(val) => setConfig(prev => ({ ...prev, chargeRateC: val || 0.01 }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">C</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Charge Current (A)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-emerald-400 pr-8"
                        value={config.totalCapacityAh * config.chargeRateC}
                        precision={1}
                        onChange={(val) => setConfig(prev => ({ ...prev, chargeRateC: (val || 0.1) / Math.max(1, config.totalCapacityAh) }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">A</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Discharge Efficiency (%)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-blue-400 pr-8"
                        value={config.dischargeEfficiency ?? 95}
                        precision={1}
                        onChange={(val) => setConfig(prev => ({ ...prev, dischargeEfficiency: Math.min(100, Math.max(1, val)) }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">%</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Min Op. Temp (°C)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-blue-400 pr-8"
                        value={config.minOperatingTemp ?? 0}
                        precision={1}
                        onChange={(val) => setConfig(prev => ({ ...prev, minOperatingTemp: val }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">°C</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Max Op. Temp (°C)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-blue-400 pr-8"
                        value={config.maxOperatingTemp ?? 45}
                        precision={1}
                        onChange={(val) => setConfig(prev => ({ ...prev, maxOperatingTemp: val }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">°C</span>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1" title="Persistent Cycle Count (Increments dynamically via BMS data)">Cycle Count</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-emerald-400 pr-8"
                        value={config.cycleCount ?? 0}
                        precision={0}
                        onChange={(val) => setConfig(prev => ({ ...prev, cycleCount: Math.max(0, val) }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">#</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1" title="Accumulated Ah towards the next cycle">Accum. Throughput</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-emerald-400 pr-8"
                        value={config.accumulatedThroughputAh ?? 0}
                        precision={2}
                        onChange={(val) => setConfig(prev => ({ ...prev, accumulatedThroughputAh: Math.max(0, val) }))}
                      />
                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">Ah</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-700 shadow-xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase text-xs tracking-wider">
                  <Battery size={16} /> Live Measurements
                </div>
                <div className="flex items-center gap-2">

                  <button onClick={() => logCurrentState()} className="text-[10px] font-bold text-slate-400 hover:text-white uppercase flex items-center gap-1.5 bg-slate-900 px-3 py-1 rounded-lg border border-slate-700 transition-all">
                    <TrendingUp size={12} /> Log Snapshot
                  </button>
                </div>
              </div>



              <div className="space-y-4">
                {isTempOutOfRange && (
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 text-xs animate-pulse">
                    <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="font-bold uppercase tracking-wider block mb-0.5">Temperature Warning</span>
                      Current temperature ({currentTemp}°C) is outside the configured operating range ({config.minOperatingTemp ?? 0}°C to {config.maxOperatingTemp ?? 45}°C).
                    </div>
                  </div>
                )}
                {cellImbalanceAlerts.flagged.length > 0 && (
                  <div className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border bg-red-500/10 border-red-500/30 text-red-400 text-xs animate-pulse" id="alert-cell-imbalance">
                    <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
                    <div className="flex-1">
                      <span className="font-bold uppercase tracking-wider block mb-0.5">Cell Imbalance Alert</span>
                      <p className="mb-2 text-slate-300">
                        {cellImbalanceAlerts.flagged.length} cell{cellImbalanceAlerts.flagged.length > 1 ? 's' : ''} deviate &gt; 50mV from the pack average of {cellImbalanceAlerts.average.toFixed(3)} V:
                      </p>
                      <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto pr-1">
                        {cellImbalanceAlerts.flagged.map(f => (
                          <span key={f.index} className="px-2 py-0.5 rounded bg-red-950/40 border border-red-500/20 text-[10px] font-mono whitespace-nowrap">
                            Cell {f.index}: {f.voltage.toFixed(3)}V ({(f.deviation >= 0 ? '+' : '') + Math.round(f.deviation * 1000)}mV)
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Pack Voltage (V)</label>
                    <SmartNumberInput
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono text-emerald-400"
                      value={state.measuredVoltage}
                      precision={3}
                      onChange={(val) => updateFromVoltage(val)}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Discharge Load (A)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-red-500 text-sm font-mono text-red-400 pr-8"
                        value={state.dischargeLoadAmps ?? 0}
                        precision={2}
                        onChange={(val) => setState(prev => ({ ...prev, dischargeLoadAmps: val }))}
                      />
                      <ZapOff className="absolute right-3 top-2.5 text-slate-600" size={14} />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Temperature (°C)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-amber-500 text-sm font-mono text-amber-400 pr-8"
                        value={state.temperatureCelsius ?? 25}
                        precision={1}
                        onChange={(val) => setState(prev => ({ ...prev, temperatureCelsius: val }))}
                      />
                      <Thermometer className="absolute right-3 top-2.5 text-slate-600" size={14} />
                    </div>
                  </div>
                  <div className="flex flex-col justify-end">
                    <div className="flex justify-between items-center mb-1.5 ml-1">
                      <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold">BMS Voltage (V)</label>
                      <button 
                        onClick={() => updateFromVoltage(state.bmsVoltage)}
                        className="flex items-center gap-1 text-[9px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-widest transition-all bg-blue-500/10 px-2 py-0.5 rounded-lg border border-blue-500/20"
                        title="Sync Pack Voltage with BMS Voltage"
                      >
                        <RefreshCw size={10} /> Sync
                      </button>
                    </div>
                    <SmartNumberInput
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-blue-500 text-sm font-mono text-blue-300"
                      value={state.bmsVoltage}
                      precision={3}
                      onChange={(val) => setState(prev => ({ ...prev, bmsVoltage: val }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">Cell Voltage (V Avg)</label>
                    <div className="w-full bg-slate-900 border border-slate-700/50 rounded-xl px-4 py-2 text-sm font-mono text-emerald-400/90 flex items-center h-[38px] cursor-default">
                      {currentCellVoltage.toFixed(4)}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1.5 ml-1">State of Health (SOH %)</label>
                    <div className="relative">
                      <SmartNumberInput
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-emerald-500 text-sm font-mono text-emerald-400 pr-8"
                        value={state.sohPercentage ?? 100}
                        precision={1}
                        onChange={(val) => setState(prev => ({ ...prev, sohPercentage: Math.min(100, Math.max(0, val)) }))}
                      />
                      <span className="absolute right-3 top-2 text-xs font-bold text-slate-600">%</span>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5 ml-1">
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold">Full Charge Capacity (FCC)</label>
                    <span className="text-[9px] font-mono text-slate-500">Design: {capacityToDisplay(config.totalCapacityAh)} {capacityUnit}</span>
                  </div>
                  <SmartNumberInput
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 font-mono text-blue-300"
                    value={capacityToDisplay(state.fullChargeCapacityAh ?? config.totalCapacityAh)}
                    precision={capacityUnit === 'mAh' ? 0 : 2}
                    onChange={(val) => setState(prev => ({ ...prev, fullChargeCapacityAh: Math.max(0, displayToCapacity(val)) }))}
                  />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold ml-1">SOC Percentage (%)</label>
                    <SmartNumberInput
                      className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-emerald-400 w-16 text-right focus:border-emerald-500 outline-none"
                      value={state.socPercentage}
                      precision={1}
                      onChange={(val) => calculateVoltageFromSOC(val)}
                    />
                  </div>
                  <input type="range" min="0" max="100" step="0.1" className="w-full h-1.5 bg-slate-900 rounded-lg appearance-none cursor-pointer accent-emerald-500" value={state.socPercentage} onChange={(e) => calculateVoltageFromSOC(parseFloat(e.target.value))} />
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1.5 ml-1">
                    <label className="block text-[10px] uppercase tracking-widest text-slate-500 font-bold">Remaining Capacity</label>
                    <UnitToggle value={capacityUnit} options={['Ah', 'mAh']} onChange={setCapacityUnit} />
                  </div>
                  <SmartNumberInput
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-sm outline-none font-mono"
                    value={capacityToDisplay(state.remainingCapacityAh)}
                    precision={capacityUnit === 'mAh' ? 0 : 2}
                    onChange={(val) => {
                      const ah = displayToCapacity(val);
                      const soc = Math.min(100, Math.max(0, (ah / config.totalCapacityAh) * 100));
                      const cellV = getVoltageFromSOC(soc, config.chemistry);
                      setState(prev => ({ 
                        ...prev, 
                        remainingCapacityAh: ah, 
                        socPercentage: soc, 
                        measuredVoltage: parseFloat((cellV * config.seriesCount).toFixed(3)),
                        cellVoltages: Array(config.seriesCount).fill(cellV)
                      }));
                    }}
                  />
                </div>

                {/* Cell-Level Voltage Monitoring Header / Expander */}
                <div className="border-t border-slate-700/60 pt-4 mt-4">
                  <button 
                    type="button"
                    onClick={() => setIsCellsExpanded(!isCellsExpanded)}
                    className="flex items-center justify-between w-full text-left text-slate-300 hover:text-white transition-all group py-1.5"
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest font-bold">
                      <Activity size={14} className="text-emerald-400 group-hover:scale-110 transition-transform" /> Cell-Level Voltages ({config.seriesCount}S)
                    </div>
                    <span className="text-[10px] font-mono font-bold text-slate-500 group-hover:text-emerald-400 transition-colors">
                      {isCellsExpanded ? "Hide [−]" : "Show Details [V]"}
                    </span>
                  </button>

                  {isCellsExpanded && (
                    <div className="mt-4 space-y-4 animate-fadeIn">
                      {/* Cell Summary Metadata */}
                      {(() => {
                        const localCells = (state.cellVoltages && state.cellVoltages.length > 0)
                          ? Array.from({ length: config.seriesCount }, (_, i) => state.cellVoltages![i] ?? (state.measuredVoltage / config.seriesCount))
                          : Array(config.seriesCount).fill(state.measuredVoltage / config.seriesCount);
                        const minC = Math.min(...localCells);
                        const maxC = Math.max(...localCells);
                        const delta = parseFloat((maxC - minC).toFixed(3));
                        const isHighImbalance = delta > 0.05; // 50mV
                        const isSevereImbalance = delta > 0.12; // 120mV
                        
                        let balanceStatus = "Balanced";
                        let balanceBadgeColor = "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
                        if (isSevereImbalance) {
                          balanceStatus = "Critical Imbalance";
                          balanceBadgeColor = "bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";
                        } else if (isHighImbalance) {
                          balanceStatus = "Moderate Imbalance";
                          balanceBadgeColor = "bg-amber-500/15 text-amber-400 border border-amber-500/20";
                        }

                        return (
                          <>
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/50 p-2.5 rounded-xl border border-slate-700/50">
                              <div className="space-y-0.5">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Max Spread (ΔV)</span>
                                <span className={`text-sm font-mono font-bold ${isSevereImbalance ? 'text-red-400' : isHighImbalance ? 'text-amber-400' : 'text-emerald-400'}`}>
                                  {delta.toFixed(3)} V
                                </span>
                              </div>
                              <div className="space-y-0.5 text-right">
                                <span className="text-[10px] text-slate-500 uppercase font-semibold block">Pack Status</span>
                                <span className={`px-2 py-0.5 rounded text-[8px] uppercase tracking-wider font-bold ${balanceBadgeColor}`}>
                                  {balanceStatus}
                                </span>
                              </div>
                            </div>

                            {/* Cell Heatmap / Bar Chart Viz */}
                            <div className="space-y-1.5">
                              <div className="flex justify-between text-[9px] uppercase tracking-wider text-slate-500 font-bold px-1">
                                <span>Ref: {config.minCellVoltage.toFixed(2)}V (0%)</span>
                                <span>Real-time Cell Voltage Profile</span>
                                <span>Ref: {config.maxCellVoltage.toFixed(2)}V (100%)</span>
                              </div>
                              <div className="flex items-end justify-between h-20 bg-slate-900/70 p-2 rounded-xl gap-1 border border-slate-800">
                                {localCells.map((v, idx) => {
                                  const pct = Math.max(3, Math.min(100, ((v - config.minCellVoltage) / (config.maxCellVoltage - config.minCellVoltage)) * 100));
                                  const avg = state.measuredVoltage / config.seriesCount;
                                  const cellDev = Math.abs(v - avg);
                                  
                                  let barColor = "bg-emerald-500";
                                  if (v > config.maxCellVoltage || v < config.minCellVoltage) {
                                    barColor = "bg-red-500 animate-pulse";
                                  } else if (cellDev > 0.08) {
                                    barColor = "bg-amber-500";
                                  } else if (cellDev > 0.03) {
                                    barColor = "bg-blue-500";
                                  }

                                  return (
                                    <div 
                                      key={idx} 
                                      className="flex-1 flex flex-col items-center h-full justify-end group/bar relative"
                                    >
                                      {/* Tooltip on Hover */}
                                      <div className="absolute bottom-full mb-1 bg-slate-950 text-[8px] border border-slate-700 rounded-md px-1 py-0.5 text-slate-300 pointer-events-none opacity-0 group-hover/bar:opacity-100 transition-opacity z-50 whitespace-nowrap font-mono">
                                        Cell {idx + 1}: {v.toFixed(3)}V
                                      </div>
                                      
                                      <div 
                                        className={`w-full ${barColor} rounded-t-[2px] transition-all duration-300`} 
                                        style={{ height: `${pct}%` }}
                                      />
                                      <span className="text-[7.5px] text-slate-500 font-mono scale-90 mt-1">
                                        {idx + 1}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Simulation Preset Buttons */}
                            <div className="space-y-1.5">
                              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold px-1">Imbalance Simulation Presets</span>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={simulateBalanced}
                                  className="py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-755 border border-slate-700/60 border-dashed hover:border-solid transition-all text-center"
                                >
                                  ⚖️ Equalize Cells
                                </button>
                                <button
                                  type="button"
                                  onClick={simulateMinorImbalance}
                                  className="py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-755 border border-slate-700/60 border-dashed hover:border-solid transition-all text-center"
                                >
                                  🔋 Minor Drift
                                </button>
                                <button
                                  type="button"
                                  onClick={simulateWeakCell}
                                  className="py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-red-950/20 text-red-400/80 hover:text-red-300 hover:bg-red-950/40 border border-red-900/25 transition-all text-center"
                                >
                                  ⚠️ Weak Cell Drop
                                </button>
                                <button
                                  type="button"
                                  onClick={simulateSevereOvervoltage}
                                  className="py-1 px-2 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-amber-950/25 text-amber-500/80 hover:text-amber-300 hover:bg-amber-950/50 border border-amber-900/30 transition-all text-center"
                                >
                                  ⚡ Spike Cell
                                </button>
                              </div>
                            </div>

                            {/* Interactive Cell Voltage Inputs Grid */}
                            <div className="space-y-1.5">
                              <span className="block text-[9px] uppercase tracking-wider text-slate-500 font-bold px-1">Individual Cell Adjuster</span>
                              <div className="grid grid-cols-3 gap-1.5 max-h-[190px] overflow-y-auto pr-1">
                                {localCells.map((v, idx) => {
                                  let slotStatusColor = "border-slate-800 bg-slate-900/30 text-slate-400 focus-within:border-blue-500/50 hover:border-slate-700";
                                  const avg = state.measuredVoltage / config.seriesCount;
                                  const cellDev = Math.abs(v - avg);
                                  
                                  if (v > config.maxCellVoltage || v < config.minCellVoltage) {
                                    slotStatusColor = "border-red-500/50 bg-red-950/10 text-red-400";
                                  } else if (cellDev > 0.08) {
                                    slotStatusColor = "border-amber-500/50 bg-amber-950/10 text-amber-400";
                                  } else if (cellDev > 0.03) {
                                    slotStatusColor = "border-blue-500/50 bg-blue-950/10 text-blue-400";
                                  }

                                  return (
                                    <div 
                                      key={idx} 
                                      className={`p-1.5 rounded-lg border flex flex-col gap-0.5 justify-center transition-all ${slotStatusColor}`}
                                    >
                                      <span className="text-[7.5px] uppercase tracking-widest font-mono font-bold block leading-none text-slate-500">Cell {String(idx + 1).padStart(2, '0')}</span>
                                      <SmartNumberInput
                                        className="w-full bg-transparent border-none text-[11px] font-mono outline-none text-right font-bold pr-0.5 focus:ring-0 leading-none py-0.5"
                                        value={v}
                                        precision={3}
                                        onChange={(newVal) => updateCellVoltage(idx, newVal)}
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              </div>
            </section>


          </div>

          <div className="lg:col-span-8 space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-12 gap-4">
              {/* Battery Health Radial Gauge Card */}
              <div className="bg-slate-800/80 rounded-2xl p-4 border border-slate-700/50 relative overflow-hidden md:col-span-4 flex items-center gap-4 min-h-[96px]">
                <div className="relative flex items-center justify-center flex-shrink-0">
                  <svg className="w-16 h-16 transform -rotate-90">
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      className="stroke-slate-700/40"
                      strokeWidth="4.5"
                      fill="transparent"
                    />
                    <circle
                      cx="32"
                      cy="32"
                      r="26"
                      className={`${batteryHealthInfo.strokeColor} transition-all duration-500 ease-out`}
                      strokeWidth="4.5"
                      fill="transparent"
                      strokeDasharray={2 * Math.PI * 26}
                      strokeDashoffset={(2 * Math.PI * 26) * (1 - batteryHealthInfo.score / 100)}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute text-center flex flex-col justify-center">
                    <span className="text-[13px] font-bold font-mono text-slate-100">{batteryHealthInfo.score.toFixed(1)}%</span>
                  </div>
                </div>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="text-slate-500 text-[9px] uppercase font-bold tracking-widest">Battery Health Index</div>
                  <div className={`text-xs font-bold truncate ${batteryHealthInfo.statusColor}`}>{batteryHealthInfo.statusText}</div>
                  <p className="text-[9px] text-slate-400 font-medium leading-relaxed max-w-full">{batteryHealthInfo.description}</p>
                  <div className="text-[8px] font-mono text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                    <span>Avg ΔCell: {batteryHealthInfo.avgDeviationCell.toFixed(4)}V</span>
                    {batteryHealthInfo.activeMetrics && batteryHealthInfo.activeMetrics.length > 0 && (
                      <span className="text-slate-400 font-mono">
                        ({batteryHealthInfo.activeMetrics.map(m => `${m.id.toUpperCase()} ${m.effectiveWeight}%`).join(' · ')})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Cell AverageCard */}
              <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 relative overflow-hidden md:col-span-2 flex flex-col justify-between">
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Cell Average</div>
                <div className="text-xl font-mono font-bold text-emerald-400">{currentCellVoltage.toFixed(3)}V</div>
              </div>

              {/* Usable EnergyCard */}
              <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 relative overflow-hidden md:col-span-2 flex flex-col justify-between">
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Usable Energy</div>
                <div className="text-xl font-mono font-bold text-blue-400">{energyToDisplay(usableEnergyWh).toFixed(2)}<span className="text-[10px] ml-0.5">{energyUnit}</span></div>
              </div>

              {/* Time to Full Card */}
              <div className="bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 relative overflow-hidden ring-2 ring-blue-500/10 md:col-span-2 flex flex-col justify-between">
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Time To Full</div>
                <div className="text-xl font-mono font-bold text-blue-400">{timeToFull ? `${timeToFull.h}h ${timeToFull.m}m` : '---'}</div>
              </div>

              {/* Runtime Remaining Card */}
              <div className={`bg-slate-800/80 rounded-2xl p-5 border border-slate-700/50 relative overflow-hidden ring-2 md:col-span-2 flex flex-col justify-between ${state.socPercentage <= config.cutoffSoc ? 'ring-red-500/30' : 'ring-emerald-500/10'}`}>
                <div className="text-slate-500 text-[10px] uppercase font-bold tracking-widest mb-1">Runtime Rem.</div>
                <div className={`text-xl font-mono font-bold ${state.socPercentage <= config.cutoffSoc ? 'text-red-400' : 'text-emerald-400'}`}>{timeToCutoff ? `${timeToCutoff.h}h ${timeToCutoff.m}m` : '---'}</div>
              </div>
            </div>

            <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2"><Activity className="text-blue-400" size={16} /> Battery Characteristics</span>
                <div className="flex gap-4 text-[10px]">
                  <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-emerald-500"></div> Charge</span>
                  <span className="flex items-center gap-1"><div className="w-3 h-0.5 bg-blue-500"></div> Discharge</span>
                </div>
              </h2>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dischargeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="chargeGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="soc" hide />
                    <YAxis stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="dischargeVoltage" stroke="#3b82f6" strokeWidth={2} fill="url(#dischargeGrad)" name="Discharge (V)" />
                    <Area type="monotone" dataKey="chargeVoltage" stroke="#10b981" strokeWidth={2} fill="url(#chargeGrad)" name="Charge (V)" />
                    <ReferenceLine x={state.socPercentage} stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'NOW', position: 'top', fill: '#fbbf24', fontSize: 10 }} />
                    <ReferenceLine x={config.cutoffSoc} stroke="#f43f5e" strokeWidth={2} strokeDasharray="3 3" label={{ value: 'CUTOFF', position: 'insideTopLeft', fill: '#f43f5e', fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            {/* Discharge Efficiency Impact Analyzer */}
            <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-700 pb-4">
                <div>
                  <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-slate-300">
                    <TrendingUp className="text-emerald-400" size={16} /> Efficiency Impact Analyzer
                  </h2>
                  <p className="text-[10px] text-slate-400 font-medium mt-1">
                    Comparing usable energy Wh/kWh outputs and total operational runtime across efficiency parameters (85% to 99%).
                  </p>
                </div>
                <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Configured Target:</span>
                  <span className="text-blue-400 font-semibold font-mono text-xs">
                    {config.dischargeEfficiency ?? 95}%
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Visual Chart Column */}
                <div className="lg:col-span-7 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                    Usable Energy Yield Comparison
                  </div>
                  <div className="h-[220px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={efficiencyComparisonData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                        <XAxis 
                          dataKey="efficiency" 
                          stroke="#64748b" 
                          fontSize={9} 
                          tickFormatter={(v) => `${v}%`}
                        />
                        <YAxis stroke="#64748b" fontSize={9} domain={['auto', 'auto']} />
                        <Tooltip 
                          cursor={{ fill: '#334155', opacity: 0.15 }}
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }}
                          formatter={(value: any, name: string) => {
                            if (name === "usableEnergyDisplay") return [`${value} ${energyUnit}`, "Usable Energy"];
                            if (name === "runtimeHours") return [`${value} hrs`, "Est. Runtime"];
                            return [value, name];
                          }}
                        />
                        <Bar 
                          dataKey="usableEnergyDisplay" 
                          fill="#3b82f6" 
                          radius={[4, 4, 0, 0]} 
                          maxBarSize={28}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 text-[9px] font-bold uppercase tracking-wider text-slate-400 pt-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 bg-blue-500 rounded-sm"></span>
                      Usable Energy ({energyUnit})
                    </div>
                  </div>
                </div>

                {/* Comparative Table Column */}
                <div className="lg:col-span-5 border border-slate-700/60 rounded-xl overflow-hidden bg-slate-900/40">
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-slate-700 bg-slate-900/70">
                          <th className="p-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-bold">Eff. (%)</th>
                          <th className="p-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-bold text-right">Energy ({energyUnit})</th>
                          <th className="p-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-bold text-right">Est. Runtime</th>
                          <th className="p-2.5 text-[9px] uppercase tracking-wider text-slate-500 font-bold text-right">Delta ({energyUnit})</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {efficiencyComparisonData.map((row) => (
                          <tr 
                            key={row.efficiency} 
                            className={`transition-colors hover:bg-slate-800/30 ${row.isUserConfig ? 'bg-blue-500/10 font-semibold' : ''}`}
                          >
                            <td className="p-2.5 font-mono flex items-center gap-1">
                              {row.efficiency}%
                              {row.isUserConfig && (
                                <span className="text-[7px] bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1 rounded uppercase font-bold tracking-widest">
                                  Config
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono text-right text-slate-300">
                              {row.usableEnergyDisplay.toFixed(2)}
                            </td>
                            <td className="p-2.5 font-mono text-right text-emerald-400">
                              {row.runtimeStr}
                            </td>
                            <td className={`p-2.5 font-mono text-right text-[10px] ${
                              row.isUserConfig 
                                ? 'text-slate-500' 
                                : row.isPositive 
                                  ? 'text-emerald-400' 
                                  : 'text-amber-400 font-medium'
                            }`}>
                              {row.diffLabel}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {(!state.dischargeLoadAmps || state.dischargeLoadAmps <= 0) && (
                    <div className="p-2.5 border-t border-slate-800 text-[8px] font-mono uppercase tracking-wider text-center text-slate-500 bg-slate-900/20">
                      ℹ️ Tip: Input an active Discharge Load in Live Measurements to enable comparative runtimes.
                    </div>
                  )}
                </div>
              </div>
            </section>


          </div>
        </div>
      </div>
      ) : (
        <div className="space-y-6">
          <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl">
             <div className="flex items-center justify-between mb-8">
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-slate-300">
                  <TrendingUp className="text-blue-400" size={16} /> Session Trends
                </h2>
                <button onClick={() => setHistory([])} className="text-red-400 hover:bg-red-400/10 px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1 border border-red-400/30">
                  <Trash2 size={12} /> Clear Log
                </button>
              </div>
              {history.length > 1 ? (
                <div className="space-y-6">
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={historyTrendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                      <XAxis dataKey="time" stroke="#475569" tick={{fontSize: 10}} />
                      <YAxis yAxisId="left" stroke="#3b82f6" orientation="left" tick={{fontSize: 10}} domain={['auto', 'auto']} />
                      <YAxis yAxisId="right" stroke="#10b981" orientation="right" tick={{fontSize: 10}} domain={[0, 100]} />
                      <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
                      <Legend />
                      <Line yAxisId="left" type="monotone" dataKey="voltage" stroke="#3b82f6" strokeWidth={3} name="Voltage (V)" />
                      <Line yAxisId="right" type="monotone" dataKey="soc" stroke="#10b981" strokeWidth={3} name="SOC (%)" />
                    </LineChart>
                  </ResponsiveContainer>
                  </div>
                  <div className="overflow-x-auto border border-slate-700 rounded-xl bg-slate-900/50 max-h-[300px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-slate-800 text-[9px] uppercase tracking-wider text-slate-400">
                        <tr>
                          <th className="p-2.5 font-bold">Time</th>
                          <th className="p-2.5 font-bold">Voltage (V)</th>
                          <th className="p-2.5 font-bold">SOC (%)</th>
                          <th className="p-2.5 font-bold">Current (A)</th>
                          <th className="p-2.5 font-bold">Temp (°C)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-xs font-mono text-slate-300">
                        {history.map((h) => (
                          <tr key={h.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="p-2.5">{new Date(h.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td>
                            <td className="p-2.5 text-blue-400">{h.measuredVoltage.toFixed(2)}</td>
                            <td className="p-2.5 text-emerald-400">{h.socPercentage.toFixed(1)}</td>
                            <td className="p-2.5 text-amber-400">{h.currentAmps.toFixed(1)}</td>
                            <td className="p-2.5 text-rose-400">{h.temperatureCelsius?.toFixed(1) || '--'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="h-[200px] flex items-center justify-center text-slate-500 text-xs italic border-2 border-dashed border-slate-700 rounded-2xl">
                  Log data points to visualize trends.
                </div>
              )}
          </section>
        </div>
      )}

      <footer className="text-center text-slate-600 text-[10px] uppercase tracking-widest pt-8 pb-4">
        Lithium Calculator By Han Win &bull; Professional Battery Analytics &bull; 2024
      </footer>
    </div>
  );
};

export default App;
