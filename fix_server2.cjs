const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const catchBlock = `      if (error?.message?.includes('API key not valid') || error?.status === 400 || JSON.stringify(error).includes('API_KEY_INVALID')) {
        return res.status(400).json({ error: "Your Gemini API key is invalid. Please open the Settings menu and update it." });
      }`;

code = code.replace(/if \(error\?\.message\?\.includes\('API key not valid'\)\) \{\s*return res\.status\(400\)\.json\(\{ error\: \"API key is invalid\. Please update it in the Settings\.\" \}\);\s*\}/g, catchBlock);

fs.writeFileSync('server.ts', code);
console.log("Updated error handling");
