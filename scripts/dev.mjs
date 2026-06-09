import { spawn } from 'node:child_process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 5173;
const MAX_PORT_ATTEMPTS = 20;

function parsePort(value) {
    const port = Number(value);
    return Number.isInteger(port) && port > 0 && port < 65536 ? port : undefined;
}

function isPortInUse(port) {
    const result = spawnSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], {
        encoding: 'utf8',
    });
    if (result.error) {
        throw result.error;
    }
    return result.status === 0;
}

function findAvailablePort(startPort) {
    for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt += 1) {
        const port = startPort + attempt;
        if (!isPortInUse(port)) {
            return port;
        }
    }
    throw new Error(`Unable to find an available port between ${startPort} and ${startPort + MAX_PORT_ATTEMPTS - 1}.`);
}

const host = process.env.HOST || '0.0.0.0';
const requestedPort = parsePort(process.env.PORT) ?? DEFAULT_PORT;
const port = findAvailablePort(requestedPort);

if (port !== requestedPort) {
    console.log(`Port ${requestedPort} unavailable on ${host}; starting Vite on ${port} instead.`);
}

const viteBin = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
const child = spawn(process.execPath, [viteBin, '--host', host, '--port', String(port), ...process.argv.slice(2)], {
    stdio: 'inherit',
});

child.on('exit', (code, signal) => {
    if (signal) {
        process.kill(process.pid, signal);
        return;
    }
    process.exit(code ?? 0);
});
