const https = require('https');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Function to read key from openrouter.txt
function readKeyFromFile() {
    try {
        const possiblePaths = [
            path.join(__dirname, "../openrouter.txt"),
            path.join(process.cwd(), "openrouter.txt"),
            "C:\\Users\\FCI\\Desktop\\IMP\\codeguru\\openrouter.txt"
        ];

        for (const p of possiblePaths) {
            if (fs.existsSync(p)) {
                console.log(`Found openrouter.txt at: ${p}`);
                const content = fs.readFileSync(p, 'utf8');
                const match = content.match(/Key:\s*(sk-or-v1-[a-f0-9]+)/);
                if (match) return match[1].trim();
            }
        }
    } catch (e) {
        console.error("Error reading file:", e);
    }
    return null;
}

const envKey = process.env.OPENROUTER_API_KEY;
const fileKey = readKeyFromFile();

console.log("--- OpenRouter Key Verification ---");
console.log(`Environment Variable Key: ${envKey ? (envKey.substring(0, 10) + '...' + envKey.slice(-4)) : 'Not Set'}`);
console.log(`File Key (openrouter.txt): ${fileKey ? (fileKey.substring(0, 10) + '...' + fileKey.slice(-4)) : 'Not Found'}`);

const keyToUse = envKey || fileKey;

if (!keyToUse) {
    console.error("No API Key found!");
    process.exit(1);
}

console.log(`\nTesting with key: ${keyToUse.substring(0, 10)}...${keyToUse.slice(-4)}`);
console.log(`Key Length: ${keyToUse.length}`);

const data = JSON.stringify({
    model: "google/gemini-2.0-flash-exp:free",
    messages: [{ role: "user", content: "Say hello" }]
});

const options = {
    hostname: 'openrouter.ai',
    path: '/api/v1/chat/completions',
    method: 'POST',
    headers: {
        'Authorization': `Bearer ${keyToUse}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Prat011/free-cluely',
        'X-Title': 'Free Cluely',
        'Content-Length': data.length
    }
};

const req = https.request(options, (res) => {
    console.log(`\nStatus Code: ${res.statusCode}`);

    let body = '';
    res.on('data', (chunk) => body += chunk);
    res.on('end', () => {
        console.log("Response Body:");
        console.log(body);
        try {
            const json = JSON.parse(body);
            if (json.error) {
                console.error("\nAPI Error:", json.error);
            } else if (json.choices) {
                console.log("\nSuccess! Response:", json.choices[0].message.content);
            }
        } catch (e) {
            console.error("Failed to parse JSON response");
        }
    });
});

req.on('error', (error) => {
    console.error("Request Error:", error);
});

req.write(data);
req.end();
