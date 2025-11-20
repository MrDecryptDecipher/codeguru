const ffmpeg = require('ffmpeg-static');
const { spawn } = require('child_process');

console.log('Listing audio devices...');
console.log('Look for "DirectShow audio devices" in the output below.\n');

const ffmpegPath = ffmpeg || 'ffmpeg';
const child = spawn(ffmpegPath, ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy']);

child.stderr.on('data', (data) => {
    console.error(data.toString());
});

child.on('close', (code) => {
    console.log(`\nProcess exited with code ${code}`);
});
