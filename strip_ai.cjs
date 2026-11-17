const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// 1. Remove gemini imports
code = code.replace(/import { getBatteryInsights, getConfigSuggestions, getLiveMeasurementSuggestions } from '\.\/geminiService';\n/, '');

// 2. Remove state variables
code = code.replace(/  const \[aiInsights, setAiInsights\] = useState<string \| null>\(null\);\n/, '');
code = code.replace(/  const \[configSuggestions, setConfigSuggestions\] = useState<string \| null>\(null\);\n/, '');
code = code.replace(/  const \[isSuggestingConfig, setIsSuggestingConfig\] = useState<boolean>\(false\);\n/, '');
code = code.replace(/  const \[liveSuggestions, setLiveSuggestions\] = useState<string \| null>\(null\);\n/, '');
code = code.replace(/  const \[isSuggestingLive, setIsSuggestingLive\] = useState<boolean>\(false\);\n/, '');
code = code.replace(/  const \[isAiLoading, setIsAiLoading\] = useState<boolean>\(false\);\n/, '');

// 3. Remove Engineer Assessment Section
const engineerAssTarget = `            <section className={\`bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl transition-all \${aiInsights || isAiLoading ? 'opacity-100' : 'opacity-60'}\`}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2 text-slate-300">
                  <Zap className="text-amber-400" size={16} /> Engineer Assessment
                </h2>
                <button 
                  onClick={async () => {
                    setIsAiLoading(true);
                    const res = await getBatteryInsights(config.chemistry, state.measuredVoltage, state.socPercentage, config.seriesCount, state.bmsVoltage, config.totalCapacityAh, config.chargeRateC, state.dischargeLoadAmps);
                    setAiInsights(res || 'Analysis failed.');
                    setIsAiLoading(false);
                  }}
                  className="bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition-all"
                  disabled={isAiLoading}
                >
                  {isAiLoading ? 'Analyzing...' : 'Run Detailed Analysis'}
                </button>
              </div>
              {aiInsights ? (
                <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line max-h-[250px] overflow-y-auto font-mono bg-slate-900/50 p-4 rounded-xl border border-slate-700">
                  {aiInsights}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-center opacity-50">
                  <Activity size={32} className="mb-2" />
                  <p className="text-xs px-12">Click 'Run Detailed Analysis' to get an engineer's perspective on health and charging timelines.</p>
                </div>
              )}
            </section>`;
if(code.includes(engineerAssTarget)) {
  code = code.replace(engineerAssTarget, '');
} else {
    console.log("Could not find engineerAssTarget.");
}

fs.writeFileSync('App.tsx', code);
console.log("Removed UI bits");
