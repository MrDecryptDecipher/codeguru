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

const pipExec = isWindows
    ? path.join(venvDir, 'Scripts', 'pip.exe')
    : path.join(venvDir, 'bin', 'pip');

const scriptPath = path.join(__dirname, 'ingest_leetcode_data.py');
const requirementsPath = path.join(__dirname, 'requirements.txt');

function runCommand(command, args, name) {
    return new Promise((resolve, reject) => {
        console.log(`[${name}] Running: ${command} ${args.join(' ')}`);

        const proc = spawn(command, args, {
            cwd: rootDir,
            stdio: 'inherit',
            shell: true
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
        // 1. Create venv if it doesn't exist
        if (!fs.existsSync(venvDir)) {
            console.log('Creating virtual environment...');
            const pythonSystem = isWindows ? 'python' : 'python3';
            await runCommand(pythonSystem, ['-m', 'venv', 'venv'], 'Create Venv');
        }

        // 2. Install requirements
        console.log('Installing requirements...');
        await runCommand(pipExec, ['install', '-r', requirementsPath], 'Pip Install');

        // 3. Run ingestion script
        console.log('Running ingestion script...');
        await runCommand(pythonExec, [scriptPath], 'Ingest Data');

        console.log('✅ Ingestion complete!');
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

main();
