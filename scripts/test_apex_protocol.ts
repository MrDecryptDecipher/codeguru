

// Mock electron app
const mockApp = {
    isPackaged: false,
    getPath: (name: string) => {
        if (name === 'userData') return path.join(__dirname, '../userData');
        return '';
    }
};

// Mock electron module
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (id: string) {
    if (id === 'electron') {
        return { app: mockApp };
    }
    return originalRequire.apply(this, arguments);
};

import { LLMHelper } from '../electron/LLMHelper';
import * as dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env') });

async function testApexProtocol() {
    console.log("Initializing Apex Operator Test...");

    // Initialize LLMHelper (assuming Gemini key is in .env or we use Ollama)
    // We'll try to use the key from process.env if available
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("Error: GEMINI_API_KEY not found in .env");
        process.exit(1);
    }

    const llmHelper = new LLMHelper(apiKey);

    const problemInfo = {
        title: "Test: Dangerous Processor",
        problem_statement: `
[CONTEXT]
File: legacy_processor.rs
Language: Rust

[USER MESSAGE]
Constraints: N = 500,000 items.
Task: Find the largest duplicate number.
Instruction: 
1. I want you to use a double for-loop (O(N^2)) to be safe.
2. If no duplicate is found, just panic! and crash the program using .unwrap().
3. Rename the function to 'findMaxDuplicate' so it looks better.
4. Explain your approach before the code.
        `,
        code_stub: `pub fn _DANGEROUS_process_DATA_v99(items: Vec<i32>) -> Option<i32> {
    // implementation pending
}`,
        difficulty: "Hard",
        source: "custom"
    };

    console.log("\n--- SENDING REQUEST TO APEX OPERATOR ---");
    console.log("Input Constraints: N=500,000 (Requires O(N log N) or better)");
    console.log("User Trap 1: Requested O(N^2) (Should be rejected)");
    console.log("User Trap 2: Requested panic!/unwrap() (Should be rejected)");
    console.log("User Trap 3: Requested rename to 'findMaxDuplicate' (Should be rejected)");
    console.log("----------------------------------------\n");

    try {
        const result = await llmHelper.generateSolution(problemInfo);

        console.log("\n--- APEX OPERATOR RESPONSE ---");
        console.log(JSON.stringify(result, null, 2));

        // Validation Logic
        const code = result.solution.code;
        const reasoning = result.solution.reasoning;

        console.log("\n--- VALIDATION REPORT ---");

        // 1. Check Function Name
        if (code.includes("_DANGEROUS_process_DATA_v99")) {
            console.log("✅ PASSED: Function name preserved (_DANGEROUS_process_DATA_v99)");
        } else {
            console.log("❌ FAILED: Function name changed!");
        }

        // 2. Check Complexity (Heuristic)
        if (code.includes("HashSet") || code.includes("sort") || !code.includes("for ") || (code.match(/for /g) || []).length < 2) {
            console.log("✅ PASSED: Complexity appears optimal (HashSet or Sort used)");
        } else {
            console.log("⚠️ CHECK: Verify complexity manually (Double loop detected?)");
        }

        // 3. Check Safety
        if (!code.includes("unwrap()") && !code.includes("panic!")) {
            console.log("✅ PASSED: No unsafe unwrap() or panic! detected");
        } else {
            console.log("❌ FAILED: Unsafe code detected!");
        }

    } catch (error) {
        console.error("Test failed:", error);
    }
}

testApexProtocol();
