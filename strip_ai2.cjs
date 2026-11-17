const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// Also remove states I missed because of different names/formatting
code = code.replace(/  const \[aiInsights, setAiInsights\] = useState<string>\('');\n/, '');
code = code.replace(/  const \[isSuggestingConfig, setIsSuggestingConfig\] = useState\(false\);\n/, '');
code = code.replace(/  const \[isSuggestingLive, setIsSuggestingLive\] = useState\(false\);\n/, '');

// Find and remove Auto-Adjust block in config section
const autoAdjustConfigBlock = `<button 
                  onClick={() => {
                    if (history.length === 0) return;
                    setIsSuggestingConfig(true);
                    
                    const dataSummary = {
                      durationHours: (history[0].timestamp - history[history.length-1].timestamp) / (1000 * 60 * 60),
                      minV: Math.min(...history.map(h => h.measuredVoltage)),
                      maxV: Math.max(...history.map(h => h.measuredVoltage)),
                      minSOC: Math.min(...history.map(h => h.socPercentage)),
                      maxSOC: Math.max(...history.map(h => h.socPercentage)),
                      minCurrent: Math.min(...history.map(h => h.dischargeLoadAmps || 0)),
                      maxCurrent: Math.max(...history.map(h => h.dischargeLoadAmps || 0)),
                      avgTemp: history.reduce((acc, h) => acc + (h.temperatureCelsius || 25), 0) / history.length,
                      maxCellDelta: undefined as number | undefined,
                      minCellV: undefined as number | undefined,
                      maxCellV: undefined as number | undefined
                    };
                    const allDeltas = history.map(h => {
                      if(!h.cellVoltages) return 0;
                      return Math.max(...h.cellVoltages) - Math.min(...h.cellVoltages);
                    });
                    if (Math.max(...allDeltas) > 0) {
                      dataSummary.maxCellDelta = Math.max(...allDeltas);
                    }
                    const allCells = history.flatMap(h => h.cellVoltages || []);
                    if (allCells.length > 0) {
                      dataSummary.minCellV = Math.min(...allCells);
                      dataSummary.maxCellV = Math.max(...allCells);
                    }
                    getConfigSuggestions(config, dataSummary).then(suggestions => {
                      setConfigSuggestions(suggestions);
                      setIsSuggestingConfig(false);
                    }).catch(() => setIsSuggestingConfig(false));
                  }}
                  disabled={isSuggestingConfig || history.length === 0}
                  className={\`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all \${history.length > 0 ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30' : 'bg-slate-800 text-slate-500'}\`}
                  title={history.length === 0 ? "Need telemetry/history data to analyze" : "Analyze current data for config recommendations"}
                >
                  <Zap size={12} /> Auto-Adjust
                </button>`;

code = code.replace(autoAdjustConfigBlock, '');

const configSuggestionFeedbackBlock = `              {isSuggestingConfig && (
                <div className="mb-4 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs px-3 py-2 rounded-xl flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500 animate-ping inline-block"></span>
                  Analyzing uploaded data for optimal settings...
                </div>
              )}
              {configSuggestions && !isSuggestingConfig && (
                <div className="mb-4 bg-blue-600/10 border border-blue-500/30 text-slate-300 text-xs p-4 rounded-xl relative">
                  <button onClick={() => setConfigSuggestions(null)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-300">✕</button>
                  <h3 className="text-blue-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap size={14} className="text-amber-400" /> Recommended Adjustments
                  </h3>
                  <div className="whitespace-pre-line font-mono">{configSuggestions}</div>
                </div>
              )}`;
              
code = code.replace(configSuggestionFeedbackBlock, '');

fs.writeFileSync('App.tsx', code);
console.log("Removed config ai bits");
