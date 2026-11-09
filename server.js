import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 4200;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Global SSE clients
const sseClients = new Set();

function broadcastSSE(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch {
      sseClients.delete(client);
    }
  }
}

let activeBenchmarkProcess = null;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Get Latest Benchmark Results
  if (url.pathname === '/api/results' && req.method === 'GET') {
    const resultsFile = path.join(__dirname, 'results', 'benchmark_results.json');
    if (fs.existsSync(resultsFile)) {
      try {
        const data = fs.readFileSync(resultsFile, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
        return;
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to read results file', message: err.message }));
        return;
      }
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'No benchmark results found. Run benchmarks first.' }));
    return;
  }

  // API: System & Hardware Telemetry
  if (url.pathname === '/api/hardware' && req.method === 'GET') {
    const cpus = os.cpus();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuCount: cpus.length,
      cpuSpeed: cpus[0]?.speed || 0,
      totalMemMB: Math.round(os.totalmem() / 1024 / 1024),
      freeMemMB: Math.round(os.freemem() / 1024 / 1024),
      nodeVersion: process.version,
      uptimeSec: Math.round(os.uptime()),
      isRunning: activeBenchmarkProcess !== null
    }));
    return;
  }

  // API: Server-Sent Events (SSE) Stream
  if (url.pathname === '/api/stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`event: connected\ndata: ${JSON.stringify({ time: new Date().toISOString() })}\n\n`);
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // API: Trigger Benchmark Run
  if (url.pathname === '/api/run' && req.method === 'POST') {
    if (activeBenchmarkProcess !== null) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Benchmark already running' }));
      return;
    }

    const scriptPath = path.join(__dirname, 'scripts', 'run_matrix.js');
    const mode = url.searchParams.get('mode') || 'portable';
    const target = url.searchParams.get('target') || 'all';

    const args = [scriptPath];
    if (mode === 'real') args.push('--real');
    if (target !== 'all') args.push(`--target=${target}`);

    broadcastSSE('start', { mode, target, timestamp: new Date().toISOString() });

    try {
      activeBenchmarkProcess = spawn(process.execPath, args, {
        cwd: __dirname,
        env: { ...process.env, FORCE_COLOR: '0' }
      });

      activeBenchmarkProcess.stdout.on('data', (data) => {
        const text = data.toString();
        process.stdout.write(text);
        broadcastSSE('log', { text, type: 'stdout' });
      });

      activeBenchmarkProcess.stderr.on('data', (data) => {
        const text = data.toString();
        process.stderr.write(text);
        broadcastSSE('log', { text, type: 'stderr' });
      });

      activeBenchmarkProcess.on('close', (code) => {
        activeBenchmarkProcess = null;
        let freshResults = null;
        const resultsFile = path.join(__dirname, 'results', 'benchmark_results.json');
        if (fs.existsSync(resultsFile)) {
          try {
            freshResults = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
          } catch {}
        }
        broadcastSSE('done', { exitCode: code, results: freshResults });
      });

      res.writeHead(202, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'started', mode, target }));
    } catch (err) {
      activeBenchmarkProcess = null;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Static File Serving from public/
  let filePath = path.join(__dirname, 'public', url.pathname === '/' ? 'index.html' : url.pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`======================================================================`);
  console.log(`  GitStress Empirical Benchmark Dashboard (v0.12.0)                   `);
  console.log(`  Interactive Web Software: http://127.0.0.1:${PORT}                  `);
  console.log(`  REST API Endpoints:       http://127.0.0.1:${PORT}/api/results       `);
  console.log(`  SSE Event Stream:         http://127.0.0.1:${PORT}/api/stream        `);
  console.log(`======================================================================\n`);
});
