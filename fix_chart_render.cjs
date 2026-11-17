const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `            <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl">
              <h2 className="text-sm font-bold uppercase tracking-widest mb-6 flex items-center gap-2 text-slate-300">
                <Activity className="text-blue-400" size={16} /> Discharge Characteristics
              </h2>
              <div className="h-[280px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                    <XAxis dataKey="soc" hide />
                    <YAxis stroke="#475569" tick={{ fontSize: 10 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #334155', borderRadius: '12px' }} />
                    <Area type="monotone" dataKey="voltage" stroke="#3b82f6" strokeWidth={2} fill="url(#curveGrad)" />
                    <ReferenceLine x={state.socPercentage} stroke="#fbbf24" strokeWidth={2} strokeDasharray="5 5" label={{ value: 'NOW', position: 'top', fill: '#fbbf24', fontSize: 10 }} />
                    <ReferenceLine x={config.cutoffSoc} stroke="#f43f5e" strokeWidth={2} strokeDasharray="3 3" label={{ value: 'CUTOFF', position: 'insideTopLeft', fill: '#f43f5e', fontSize: 10 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>`;

const replaceStr = `            <section className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700 shadow-xl">
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
            </section>`;

if (code.includes(targetStr)) {
  code = code.replace(targetStr, replaceStr);
  fs.writeFileSync('App.tsx', code);
  console.log("Updated chart render");
} else {
  console.log("chart render not found");
}
