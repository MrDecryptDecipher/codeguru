const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const isWindows = os.platform() === 'win32';
const rootDir = path.join(__dirname, '..');
const venvDir = path.join(rootDir, 'venv');

// Determine paths based on OS
const pythonExec = isWindows
    ? path.join(venvDir, 'Scripts', 'python.exe')
    : path.join(venvDir, 'bin', 'python3');

const scriptPath = path.join(__dirname, 'ingest_leetcode_data.py');
const requirementsPath = path.join(__dirname, 'requirements.txt');

function runCommand(command, args, name, envVars = {}) {
    return new Promise((resolve, reject) => {
        // Quote paths if they contain spaces
        const commandStr = command.includes(' ') ? `"${command}"` : command;
        const argsStr = args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ');

        console.log(`[${name}] Running: ${commandStr} ${argsStr}`);

        const proc = spawn(commandStr, args, {
            cwd: rootDir,
            stdio: 'inherit',
            shell: true,
            env: { ...process.env, ...envVars }
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(new Error(`${name} failed with code ${code}`));
            }
        });
    });
}

async function main() {
    try {
        // Kaggle Credentials (provided by user)
        const kaggleEnv = {
            KAGGLE_USERNAME: 'godsandeep',
            KAGGLE_KEY: 'ad186a12accb9be01213cb7317d6d904'
        };

        // 1. Check/Create venv
        // Check if python executable exists, if not, recreate venv
        if (!fs.existsSync(pythonExec)) {
            console.log(`Python executable not found at ${pythonExec}. Creating virtual environment...`);

            // If venv dir exists but is broken, try to remove it
            if (fs.existsSync(venvDir)) {
                try {
                    fs.rmSync(venvDir, { recursive: true, force: true });
                    console.log('Removed broken venv directory.');
                } catch (e) {
                    console.warn("Warning: Could not remove existing venv folder. Setup might fail.");
                }
            }

            const pythonSystem = isWindows ? 'python' : 'python3';
            await runCommand(pythonSystem, ['-m', 'venv', 'venv'], 'Create Venv');
        }

        // Verify it exists now
        if (!fs.existsSync(pythonExec)) {
            throw new Error(`Failed to create venv or find python executable at: ${pythonExec}`);
        }

        // 2. Install requirements using python -m pip (safer than calling pip directly)
        console.log('Installing requirements...');
        await runCommand(pythonExec, ['-m', 'pip', 'install', '-r', requirementsPath], 'Pip Install');

        // 3. Run ingestion script
        console.log('Running ingestion script...');
        await runCommand(pythonExec, [scriptPath], 'Ingest Data');

        console.log('✅ Ingestion complete!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        console.log('Tip: If this persists, try deleting the "venv" folder manually and run again.');
        process.exit(1);
    }
}

main();
