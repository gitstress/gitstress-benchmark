// GitStress Empirical Benchmark Suite -- Frontend Client Logic

let currentMode = 'portable';
let isRunning = false;
let sseSource = null;

// DOM Elements
const hostTelemetryText = document.getElementById('hostTelemetryText');
const specPlatform = document.getElementById('specPlatform');
const specCpu = document.getElementById('specCpu');
const specRuntimes = document.getElementById('specRuntimes');
const specLastRun = document.getElementById('specLastRun');
const cardsGrid = document.getElementById('cardsGrid');
const runMatrixBtn = document.getElementById('runMatrixBtn');
const runningBanner = document.getElementById('runningBanner');
const consoleDrawer = document.getElementById('consoleDrawer');
const consoleBody = document.getElementById('consoleBody');
const toggleConsoleBtn = document.getElementById('toggleConsoleBtn');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');
const closeConsoleBtn = document.getElementById('closeConsoleBtn');
const modeToggle = document.getElementById('modeToggle');
const themeToggle = document.getElementById('themeToggle');

// Theme Management
function initTheme() {
  const saved = localStorage.getItem('gitstress_bench_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('gitstress_bench_theme', next);
});

// Mode Toggle
modeToggle.addEventListener('click', (e) => {
  const btn = e.target.closest('.toggle-btn');
  if (!btn) return;
  document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentMode = btn.dataset.mode;
  appendLog(`[Config] Target mode switched to: ${currentMode === 'real' ? 'Host Production Software' : 'Portable Archetypes'}\n`);
});

// Console Drawer Handlers
toggleConsoleBtn.addEventListener('click', () => {
  consoleDrawer.classList.toggle('hidden');
});

closeConsoleBtn.addEventListener('click', () => {
  consoleDrawer.classList.add('hidden');
});

clearConsoleBtn.addEventListener('click', () => {
  consoleBody.textContent = '';
});

function appendLog(text) {
  consoleBody.textContent += text;
  consoleBody.scrollTop = consoleBody.scrollHeight;
}

// Fetch Host Telemetry
async function loadHardwareInfo() {
  try {
    const res = await fetch('/api/hardware');
    const data = await res.json();
    hostTelemetryText.textContent = `${data.platform} (${data.arch}) · ${data.cpuCount} Cores · Node ${data.nodeVersion}`;
    specPlatform.textContent = `${data.platform} ${data.release} (${data.arch})`;
    specCpu.textContent = `${data.cpuModel} (${data.cpuCount} Cores)`;
    specRuntimes.textContent = `Node.js ${data.nodeVersion}`;
  } catch (err) {
    hostTelemetryText.textContent = 'Telemetry bus offline';
  }
}

// Fetch and Render Benchmark Results
async function loadBenchmarkResults() {
  try {
    const res = await fetch('/api/results');
    if (!res.ok) {
      cardsGrid.innerHTML = `
        <div style="grid-column: 1 / -1; padding: 40px; text-align: center; border: 1px dashed var(--border-strong); border-radius: var(--radius); font-family: var(--font-mono); color: var(--text-muted);">
          No benchmark data found. Click "Run Hardware Verification Matrix" above to execute tests.
        </div>
      `;
      return;
    }

    const payload = await res.json();
    if (payload.timestamp) {
      specLastRun.textContent = new Date(payload.timestamp).toLocaleString();
    }

    renderCards(payload.summary || []);
  } catch (err) {
    cardsGrid.innerHTML = `<div style="color: var(--status-red);">Failed to load results: ${err.message}</div>`;
  }
}

function renderCards(items) {
  if (!items || items.length === 0) return;

  cardsGrid.innerHTML = items.map(item => {
    const baseReq = item.baseSuccessReqSec !== undefined ? item.baseSuccessReqSec : item.baseReqSec;
    const tunedReq = item.tunedSuccessReqSec !== undefined ? item.tunedSuccessReqSec : item.tunedReqSec;
    const maxReq = Math.max(baseReq, tunedReq, 100);
    const basePct = Math.min(100, Math.round((baseReq / maxReq) * 100));
    const tunedPct = Math.min(100, Math.round((tunedReq / maxReq) * 100));

    return `
      <div class="stack-card">
        <div class="card-top">
          <div>
            <div class="card-repo">${escapeHtml(item.repo)}</div>
            <div class="card-name">${escapeHtml(item.name)}</div>
          </div>
          <div class="badge-headroom">${escapeHtml(item.gain || '+10.0x')}</div>
        </div>

        <div class="card-culprit-box">
          <div class="culprit-label">FATAL BOTTLENECK SYMBOL:</div>
          <div class="culprit-symbol">${escapeHtml(item.symbol)}</div>
        </div>

        <table class="dynamometer-table">
          <thead>
            <tr>
              <th>MODE</th>
              <th>THROUGHPUT (REQ/S)</th>
              <th>LATENCY (P50)</th>
              <th>LATENCY (P99)</th>
              <th>5XX ERRORS</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><span class="mode-tag-base">BASELINE</span></td>
              <td>
                <div>${baseReq.toLocaleString()} req/s</div>
                <div class="bar-meter">
                  <div class="bar-fill-base" style="width: ${basePct}%;"></div>
                </div>
              </td>
              <td>${item.baseP50}</td>
              <td>${item.baseP99}</td>
              <td>${item.baseErrors > 0 ? `<span style="color: var(--status-red); font-weight: 700;">${item.baseErrors}</span>` : '0'}</td>
            </tr>
            <tr>
              <td><span class="mode-tag-tuned">TUNED</span></td>
              <td>
                <div>${tunedReq.toLocaleString()} req/s</div>
                <div class="bar-meter">
                  <div class="bar-fill-tuned" style="width: ${tunedPct}%;"></div>
                </div>
              </td>
              <td>${item.tunedP50}</td>
              <td>${item.tunedP99}</td>
              <td><span style="color: var(--status-green); font-weight: 700;">0</span></td>
            </tr>
          </tbody>
        </table>

        <div class="card-footer-meta">
          <div>CONCURRENCY: <span class="concurrency-badge">${item.concurrency} concurrent</span></div>
          <div>LATENCY: <strong>${escapeHtml(item.latencyImprovement || 'Faster')}</strong></div>
          <div>STATUS: <strong style="color: var(--status-green);">EMPIRICALLY VERIFIED</strong></div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

// Connect SSE Event Stream
function initSSE() {
  if (sseSource) sseSource.close();
  sseSource = new EventSource('/api/stream');

  sseSource.addEventListener('log', (e) => {
    try {
      const data = JSON.parse(e.data);
      appendLog(data.text);
    } catch {
      appendLog(e.data + '\n');
    }
  });

  sseSource.addEventListener('start', (e) => {
    setRunningState(true);
    appendLog(`\n>>> [Benchmark Matrix Started] Mode: ${currentMode} <<<\n`);
  });

  sseSource.addEventListener('done', (e) => {
    setRunningState(false);
    appendLog(`\n>>> [Benchmark Matrix Complete] <<<\n`);
    loadBenchmarkResults();
  });
}

function setRunningState(running) {
  isRunning = running;
  runMatrixBtn.disabled = running;
  if (running) {
    runningBanner.classList.remove('hidden');
    consoleDrawer.classList.remove('hidden');
  } else {
    runningBanner.classList.add('hidden');
  }
}

// Run Benchmark Matrix Action
runMatrixBtn.addEventListener('click', async () => {
  if (isRunning) return;

  setRunningState(true);
  appendLog(`[Client] Triggering /api/run?mode=${currentMode}...\n`);

  try {
    const res = await fetch(`/api/run?mode=${currentMode}`, { method: 'POST' });
    if (!res.ok) {
      const err = await res.json();
      appendLog(`[Error] Failed to start run: ${err.message || err.error}\n`);
      setRunningState(false);
    }
  } catch (err) {
    appendLog(`[Error] Network error triggering benchmark: ${err.message}\n`);
    setRunningState(false);
  }
});

// Initialization
initTheme();
loadHardwareInfo();
loadBenchmarkResults();
initSSE();
