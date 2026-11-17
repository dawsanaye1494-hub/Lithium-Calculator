const fs = require('fs');
let code = fs.readFileSync('App.tsx', 'utf8');

// There's a stray Auto-Adjust button remaining
const strayButtonRegex = /<button[^>]*>\s*<Zap size=\{12\} \/> Auto-Adjust\s*<\/button>/g;
code = code.replace(strayButtonRegex, '');

// Wait, let's look at the surrounding context of the button.
