const { execFile } = require('child_process');
const path = require('path');
const fs = require('fs');

const BINARY_NAME = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';

const BINARY_PATH = (() => {
    const candidates = [
        path.join(__dirname, '..', 'node_modules', 'youtube-dl-exec', 'bin', BINARY_NAME),
        path.join(__dirname, '..', 'bin', BINARY_NAME),
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) return p;
    }
    return candidates[0];
})();

function run(url, flags = {}) {
    return new Promise((resolve, reject) => {
        const args = [url];
        for (const [key, val] of Object.entries(flags)) {
            if (val === false || val === null || val === undefined) continue;
            const k = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
            if (val === true) {
                args.push(`--${k}`);
            } else if (Array.isArray(val)) {
                for (const v of val) args.push(`--${k}`, String(v));
            } else {
                args.push(`--${k}`, String(val));
            }
        }

        let stdout = '';
        let stderr = '';
        const proc = execFile(BINARY_PATH, args, { maxBuffer: 10 * 1024 * 1024 });
        proc.stdout.on('data', d => stdout += d);
        proc.stderr.on('data', d => stderr += d);
        proc.on('error', reject);
        proc.on('close', code => {
            if (code === 0) {
                try { resolve(JSON.parse(stdout)); }
                catch { resolve(stdout.trim()); }
            } else {
                const err = new Error(stderr.trim());
                err.stderr = stderr;
                err.stdout = stdout;
                err.code = code;
                reject(err);
            }
        });
    });
}

module.exports = run;
module.exports.binaryPath = BINARY_PATH;
