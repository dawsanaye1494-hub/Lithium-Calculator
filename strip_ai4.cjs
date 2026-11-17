const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

const liveSuggestButtonBlock = `                  <button 
                    onClick={async () => {
                      setIsSuggestingLive(true);
                      const suggestions = await getLiveMeasurementSuggestions(config, state);
                      setLiveSuggestions(suggestions);
                      setIsSuggestingLive(false);
                    }}
                    disabled={isSuggestingLive}
                    className="text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/20 bg-emerald-500/10 uppercase flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all"
                  >
                    <Zap size={12} /> {isSuggestingLive ? 'Thinking...' : 'AI Suggestion'}
                  </button>`;

code = code.replace(liveSuggestButtonBlock, '');

const liveSuggestionFeedbackBlock = `              {liveSuggestions && !isSuggestingLive && (
                <div className="mb-4 bg-emerald-600/10 border border-emerald-500/30 text-slate-300 text-xs p-4 rounded-xl relative">
                  <button onClick={() => setLiveSuggestions(null)} className="absolute top-2 right-2 text-slate-500 hover:text-slate-300">✕</button>
                  <h3 className="text-emerald-400 font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                    <Zap size={14} className="text-emerald-400" /> Live Measurement Advice
                  </h3>
                  <div className="whitespace-pre-line font-mono">{liveSuggestions}</div>
                </div>
              )}`;

code = code.replace(liveSuggestionFeedbackBlock, '');

fs.writeFileSync('App.tsx', code);
console.log("Removed live ai bits");
