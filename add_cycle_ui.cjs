const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const targetStr = `                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">°C</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>`;

const replaceStr = `                      <span className="absolute right-4 top-2 text-xs font-bold text-slate-600">°C</span>
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
            </section>`;

if (code.includes(targetStr)) {
  fs.writeFileSync('App.tsx', code.replace(targetStr, replaceStr));
  console.log("Added Cycle Count UI.");
} else {
  console.log("Target string not found in App.tsx.");
}
