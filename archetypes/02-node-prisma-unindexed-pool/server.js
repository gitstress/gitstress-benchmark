import http from 'http';

const port = process.env.PORT || 8082;
const isTuned = process.env.GITSTRESS_TUNED === 'true' || process.env.GITSTRESS_TUNED === '1';

// Connection Pool Mock (10 database connections max)
const POOL_CAPACITY = 10;
let activeConnections = 0;
const waitQueue = [];

function acquireConnection() {
  return new Promise((resolve, reject) => {
    if (activeConnections < POOL_CAPACITY) {
      activeConnections++;
      resolve();
    } else {
      // 1500ms connection timeout (Standard Prisma pool timeout is 1500ms)
      const timeoutId = setTimeout(() => {
        const idx = waitQueue.findIndex(item => item.resolve === resolve);
        if (idx !== -1) {
          waitQueue.splice(idx, 1);
          reject(new Error('PrismaClientInitializationError: Timed out waiting for connection from pool (10 connections exhausted)'));
        }
      }, 1500);

      waitQueue.push({
        resolve: () => {
          clearTimeout(timeoutId);
          activeConnections++;
          resolve();
        },
        reject
      });
    }
  });
}

function releaseConnection() {
  activeConnections--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    next.resolve();
  }
}

// Simulated Query Latency:
// Baseline: Sequential Table Scan on 50,000 rows without index (95ms)
// Tuned: B-Tree Index Lookup (2.4ms)
const queryExecutionTimeMs = isTuned ? 2.4 : 95;

const server = http.createServer(async (req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
    return;
  }

  if (req.url === '/api/bookings/sync') {
    try {
      // Acquire slot from pool of 10
      await acquireConnection();

      // Execute SQL query
      await new Promise(r => setTimeout(r, queryExecutionTimeMs));

      releaseConnection();

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'success',
        mode: isTuned ? 'TUNED (B-Tree Index Scan: 2.4ms)' : 'BASELINE (Sequential Scan: 95ms)',
        pool_connections: activeConnections,
        pool_capacity: POOL_CAPACITY
      }));
    } catch (err) {
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        error: 'POOL_EXHAUSTION',
        message: err.message,
        active_connections: activeConnections,
        queue_depth: waitQueue.length
      }));
    }
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(port, () => {
  console.log(`[GitStress Benchmark] Archetype 02 listening on :${port}`);
  console.log(`[GitStress Benchmark] Mode: ${isTuned ? 'TUNED (+17.8x Index Headroom)' : 'BASELINE (Prisma Pool-10 + Table Scan)'}`);
});
